// XGBoost-Style Prediction Engine — Phase 7
// Simulates gradient-boosted ensemble prediction using feature vectors.
// Uses AbacusAI LLM with structured feature input to produce calibrated probabilities.

import type { FeatureVector } from './feature-store';

export interface XGBoostPrediction {
  symbol: string;
  direction: 'BUY' | 'SELL' | 'HOLD';
  probability: number;      // 0-1 (probability of predicted direction being correct)
  confidence: number;       // 0-100 (scaled for trading use)
  featureImportance: Record<string, number>;
  rawScore: number;         // Raw model output (-1 to 1)
  reasoning: string;
  timestamp: number;
}

export interface BatchPredictionResult {
  predictions: XGBoostPrediction[];
  modelVersion: string;
  latencyMs: number;
}

// Feature importance weights (simulate trained XGBoost feature importances)
// These are updated by the SelfLearning agent over time
const DEFAULT_FEATURE_WEIGHTS: Record<string, number> = {
  rsi14: 0.18,
  macdHistogram: 0.15,
  bbandsPercentB: 0.12,
  emaTrend: 0.11,
  atrPct: 0.09,
  volumeRatio20d: 0.08,
  adx14: 0.07,
  stochK: 0.06,
  roc5: 0.05,
  vwapDeviation: 0.05,
  priceChange1d: 0.04,
};

// In-memory prediction cache to avoid redundant API calls
const predictionCache = new Map<string, { pred: XGBoostPrediction; expiry: number }>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

function getCachedPrediction(symbol: string): XGBoostPrediction | null {
  const entry = predictionCache.get(symbol);
  if (entry && entry.expiry > Date.now()) return entry.pred;
  if (entry) predictionCache.delete(symbol);
  return null;
}

/**
 * Compute a deterministic local prediction from feature vectors.
 * Used as fallback when LLM is unavailable.
 */
function localXGBoostPredict(features: FeatureVector): XGBoostPrediction {
  const w = DEFAULT_FEATURE_WEIGHTS;

  // Normalize features to [-1, 1] signals
  const rsiSignal = (50 - features.rsi14) / 50;          // +1 = oversold, -1 = overbought
  const macdSignal = Math.tanh(features.macdHistogram / (features.price * 0.001 || 1));
  const bbSignal = 0.5 - features.bbandsPercentB;         // +1 = at lower band
  const emaSignal = Math.tanh(features.emaTrend * 100);
  const volSignal = Math.tanh((features.volumeRatio20d - 1) * 2);
  const adxSignal = features.adx14 > 25 ? Math.sign(emaSignal) : 0; // trend direction
  const stochSignal = (50 - features.stochK) / 50;
  const rocSignal = Math.tanh(features.roc5 / 5);
  const vwapSignal = -Math.tanh(features.vwapDeviation / 2);
  const priceSignal = Math.tanh(features.priceChange1d * 20);

  const rawScore =
    rsiSignal * w.rsi14! +
    macdSignal * w.macdHistogram! +
    bbSignal * w.bbandsPercentB! +
    emaSignal * w.emaTrend! +
    adxSignal * w.adx14! +
    volSignal * w.volumeRatio20d! +
    stochSignal * w.stochK! +
    rocSignal * w.roc5! +
    vwapSignal * w.vwapDeviation! +
    priceSignal * w.priceChange1d!;

  // Sigmoid to probability
  const probability = 1 / (1 + Math.exp(-rawScore * 5));
  const direction: 'BUY' | 'SELL' | 'HOLD' =
    rawScore > 0.1 ? 'BUY' : rawScore < -0.1 ? 'SELL' : 'HOLD';
  const confidence = Math.round(Math.abs(rawScore) * 100);

  return {
    symbol: features.symbol,
    direction,
    probability,
    confidence: Math.min(95, Math.max(5, confidence)),
    rawScore,
    featureImportance: {
      rsi14: Math.abs(rsiSignal * w.rsi14!),
      macdHistogram: Math.abs(macdSignal * w.macdHistogram!),
      bbandsPercentB: Math.abs(bbSignal * w.bbandsPercentB!),
      emaTrend: Math.abs(emaSignal * w.emaTrend!),
      adx14: Math.abs(adxSignal * w.adx14!),
      volumeRatio20d: Math.abs(volSignal * w.volumeRatio20d!),
    },
    reasoning: `Local ensemble: RSI=${features.rsi14.toFixed(1)}, MACD hist=${features.macdHistogram.toFixed(2)}, ` +
      `%B=${features.bbandsPercentB.toFixed(2)}, ADX=${features.adx14.toFixed(1)}, ` +
      `Vol ratio=${features.volumeRatio20d.toFixed(2)}`,
    timestamp: Date.now(),
  };
}

/**
 * LLM-powered XGBoost prediction using AbacusAI.
 * Sends feature vector as structured JSON prompt.
 */
async function llmXGBoostPredict(
  features: FeatureVector,
  apiKey: string
): Promise<XGBoostPrediction> {
  const featurePayload = {
    symbol: features.symbol,
    price: features.price,
    rsi7: +features.rsi7.toFixed(2),
    rsi14: +features.rsi14.toFixed(2),
    rsi21: +features.rsi21.toFixed(2),
    macdHistogram: +features.macdHistogram.toFixed(4),
    emaTrend: +features.emaTrend.toFixed(4),
    bbandsPercentB: +features.bbandsPercentB.toFixed(3),
    bbandsBandwidth: +features.bbandsBandwidth.toFixed(3),
    atrPct: +features.atrPct.toFixed(3),
    volumeRatio20d: +features.volumeRatio20d.toFixed(2),
    adx14: +features.adx14.toFixed(2),
    stochK: +features.stochK.toFixed(2),
    roc5: +features.roc5.toFixed(3),
    roc10: +features.roc10.toFixed(3),
    vwapDeviation: +features.vwapDeviation.toFixed(3),
    maCross9_21: features.maCross9_21,
    maCross21_50: features.maCross21_50,
  };

  const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: `You are an XGBoost ensemble model for NSE stock trading. Given a feature vector, predict trading direction using gradient-boosted tree logic. Consider feature interactions. Return JSON only:
{
  "direction": "BUY"|"SELL"|"HOLD",
  "probability": 0.0-1.0,
  "confidence": 0-100,
  "rawScore": -1.0 to 1.0,
  "featureImportance": {"feature_name": 0.0-1.0},
  "reasoning": "brief explanation of key features driving prediction"
}
Rules: probability > 0.65 for BUY/SELL signals. Consider RSI divergence, MACD momentum, Bollinger squeeze, volume confirmation. NSE intraday context.`,
        },
        {
          role: 'user',
          content: `Feature vector for ${features.symbol}:\n${JSON.stringify(featurePayload, null, 2)}`,
        },
      ],
      max_tokens: 400,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) throw new Error(`LLM API error: ${response.status}`);
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content);

  return {
    symbol: features.symbol,
    direction: parsed.direction ?? 'HOLD',
    probability: Math.min(1, Math.max(0, parsed.probability ?? 0.5)),
    confidence: Math.min(95, Math.max(5, parsed.confidence ?? 50)),
    rawScore: Math.min(1, Math.max(-1, parsed.rawScore ?? 0)),
    featureImportance: parsed.featureImportance ?? {},
    reasoning: parsed.reasoning ?? 'No reasoning provided',
    timestamp: Date.now(),
  };
}

/**
 * Get XGBoost prediction for a single symbol.
 * Tries LLM first, falls back to local computation.
 */
export async function predictXGBoost(
  features: FeatureVector,
  apiKey?: string
): Promise<XGBoostPrediction> {
  const cached = getCachedPrediction(features.symbol);
  if (cached) return cached;

  let prediction: XGBoostPrediction;

  if (apiKey) {
    try {
      prediction = await llmXGBoostPredict(features, apiKey);
    } catch {
      prediction = localXGBoostPredict(features);
    }
  } else {
    prediction = localXGBoostPredict(features);
  }

  predictionCache.set(features.symbol, { pred: prediction, expiry: Date.now() + CACHE_TTL });
  return prediction;
}

/**
 * Batch predict for multiple symbols.
 * Uses parallel LLM calls with concurrency limit.
 */
export async function batchPredictXGBoost(
  featuresMap: Map<string, FeatureVector>,
  apiKey?: string,
  concurrency: number = 5
): Promise<BatchPredictionResult> {
  const start = Date.now();
  const symbols = Array.from(featuresMap.keys());
  const predictions: XGBoostPrediction[] = [];

  // Process in parallel batches
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(sym => {
        const feat = featuresMap.get(sym)!;
        return predictXGBoost(feat, apiKey);
      })
    );
    predictions.push(...results);
  }

  return {
    predictions,
    modelVersion: 'xgb-v1.0-nse',
    latencyMs: Date.now() - start,
  };
}

export function clearPredictionCache(): void {
  predictionCache.clear();
}
