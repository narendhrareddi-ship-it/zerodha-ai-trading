// Confidence Scoring System — Phase 7
// Multi-factor confidence scoring that combines all signal sources into a
// single calibrated score with full breakdown for transparency.

import type { XGBoostPrediction } from './xgboost-predictor';
import type { RegimeAnalysis } from './market-regime';
import type { FeatureVector } from './feature-store';

export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ConfidenceBreakdown {
  ensembleScore: number;     // Strategy vote consensus (0-30)
  xgboostScore: number;      // ML model confidence (0-25)
  regimeAlignmentScore: number; // Market regime fit (0-20)
  volumeScore: number;       // Volume confirmation (0-10)
  technicalScore: number;    // Technical indicator alignment (0-10)
  sentimentScore: number;    // News/sentiment alignment (0-5)
}

export interface ConfidenceResult {
  symbol: string;
  direction: 'BUY' | 'SELL';
  finalScore: number;         // 0-100
  grade: ConfidenceGrade;
  breakdown: ConfidenceBreakdown;
  tradeable: boolean;         // true if score >= threshold
  reasons: string[];
  warnings: string[];
}

const TRADEABLE_THRESHOLD = 65;

/**
 * Score regime alignment: does the signal direction match the market regime?
 */
function scoreRegimeAlignment(
  direction: 'BUY' | 'SELL',
  regime: RegimeAnalysis,
  strategy: string
): number {
  let score = 10; // Base score

  // Direction alignment
  if (regime.regime === 'TRENDING_UP' && direction === 'BUY') score += 6;
  if (regime.regime === 'TRENDING_DOWN' && direction === 'SELL') score += 6;
  if (regime.regime === 'TRENDING_UP' && direction === 'SELL') score -= 5;
  if (regime.regime === 'TRENDING_DOWN' && direction === 'BUY') score -= 5;

  // Strategy alignment with regime
  if (regime.recommendedStrategies.includes(strategy.toUpperCase())) score += 4;
  if (regime.disabledStrategies.includes(strategy.toUpperCase())) score -= 6;

  // Regime confidence bonus
  if (regime.confidence > 75) score += 2;

  // Volatile regime penalty
  if (regime.regime === 'VOLATILE') score -= 3;

  return Math.min(20, Math.max(0, score));
}

/**
 * Score volume confirmation: is volume supporting the move?
 */
function scoreVolume(features: FeatureVector): number {
  const ratio = features.volumeRatio20d;
  if (ratio >= 2.0) return 10;
  if (ratio >= 1.5) return 8;
  if (ratio >= 1.2) return 6;
  if (ratio >= 0.8) return 4;
  return 2;
}

/**
 * Score technical indicator alignment with signal direction
 */
function scoreTechnicalAlignment(features: FeatureVector, direction: 'BUY' | 'SELL'): number {
  let score = 0;
  const isBuy = direction === 'BUY';

  // RSI
  if (isBuy && features.rsi14 < 35) score += 2;
  else if (!isBuy && features.rsi14 > 65) score += 2;
  else if (isBuy && features.rsi14 > 65) score -= 2; // overbought for buy = bad
  else if (!isBuy && features.rsi14 < 35) score -= 2;

  // MACD histogram
  if (isBuy && features.macdHistogram > 0) score += 2;
  else if (!isBuy && features.macdHistogram < 0) score += 2;

  // EMA trend
  if (isBuy && features.maCross9_21 === 1) score += 2;
  else if (!isBuy && features.maCross9_21 === -1) score += 2;

  // ADX (trend strength bonus)
  if (features.adx14 > 25) score += 2;

  // Bollinger
  if (isBuy && features.bbandsPercentB < 0.2) score += 2;
  else if (!isBuy && features.bbandsPercentB > 0.8) score += 2;

  return Math.min(10, Math.max(0, score));
}

/**
 * Score XGBoost prediction alignment
 */
function scoreXGBoost(xgb: XGBoostPrediction | null, direction: 'BUY' | 'SELL'): number {
  if (!xgb) return 10; // neutral if not available

  if (xgb.direction === 'HOLD') return 8;

  if (xgb.direction === direction) {
    // Aligned — scale by probability
    return Math.round(xgb.probability * 25);
  } else {
    // Contrary signal — penalize
    return Math.round((1 - xgb.probability) * 10);
  }
}

/**
 * Main confidence scoring function
 */
export function scoreConfidence(params: {
  symbol: string;
  direction: 'BUY' | 'SELL';
  strategy: string;
  rawStrategyConfidence: number;  // 0-100 from individual strategy
  voteCount: number;              // How many strategies agree
  totalStrategies: number;
  xgb: XGBoostPrediction | null;
  regime: RegimeAnalysis;
  features: FeatureVector;
  newsSentimentScore?: number;    // -1 to 1 (negative=bearish, positive=bullish)
  strategyWeights?: Record<string, number>;
}): ConfidenceResult {
  const {
    symbol, direction, strategy, rawStrategyConfidence,
    voteCount, totalStrategies, xgb, regime, features, newsSentimentScore, strategyWeights
  } = params;

  // Apply learned strategy weights if available
  let weightMultiplier = 1.0;
  if (strategyWeights) {
    const parts = strategy.split('+');
    let totalWeight = 0;
    let counted = 0;
    for (const p of parts) {
      const cleanPart = p.toUpperCase().replace(/[\s_]+/g, '_');
      const w = strategyWeights[cleanPart] ?? strategyWeights[p.toUpperCase()] ?? 1.0;
      totalWeight += w;
      counted++;
    }
    if (counted > 0) {
      weightMultiplier = totalWeight / counted;
    }
  }

  const scaledStrategyConfidence = Math.min(100, Math.max(0, rawStrategyConfidence * weightMultiplier));

  // 1. Ensemble score (0-30) — based on vote consensus
  const voteRatio = voteCount / Math.max(1, totalStrategies);
  const ensembleScore = Math.min(30, Math.round(
    (scaledStrategyConfidence / 100) * 15 + voteRatio * 15
  ));

  // 2. XGBoost score (0-25)
  const xgboostScore = scoreXGBoost(xgb, direction);

  // 3. Regime alignment score (0-20)
  const regimeAlignmentScore = scoreRegimeAlignment(direction, regime, strategy);

  // 4. Volume score (0-10)
  const volumeScore = scoreVolume(features);

  // 5. Technical alignment score (0-10)
  const technicalScore = scoreTechnicalAlignment(features, direction);

  // 6. Sentiment score (0-5)
  let sentimentScore = 2; // neutral default
  if (newsSentimentScore !== undefined) {
    const aligned = direction === 'BUY' ? newsSentimentScore > 0 : newsSentimentScore < 0;
    sentimentScore = aligned
      ? Math.round(2 + Math.abs(newsSentimentScore) * 3)
      : Math.round(2 - Math.abs(newsSentimentScore) * 2);
    sentimentScore = Math.min(5, Math.max(0, sentimentScore));
  }

  const breakdown: ConfidenceBreakdown = {
    ensembleScore,
    xgboostScore,
    regimeAlignmentScore,
    volumeScore,
    technicalScore,
    sentimentScore,
  };

  const finalScore = Math.min(100,
    ensembleScore + xgboostScore + regimeAlignmentScore +
    volumeScore + technicalScore + sentimentScore
  );

  // Grade
  let grade: ConfidenceGrade;
  if (finalScore >= 85) grade = 'A';
  else if (finalScore >= 70) grade = 'B';
  else if (finalScore >= 55) grade = 'C';
  else if (finalScore >= 40) grade = 'D';
  else grade = 'F';

  const tradeable = finalScore >= TRADEABLE_THRESHOLD;

  // Build human-readable reasons
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (ensembleScore > 20) reasons.push(`Strong strategy consensus (${voteCount}/${totalStrategies})`);
  if (xgboostScore > 18) reasons.push(`ML model aligned (${xgb?.probability ? (xgb.probability * 100).toFixed(0) : '?'}% probability)`);
  if (regimeAlignmentScore > 14) reasons.push(`Market regime supports ${direction}`);
  if (volumeScore >= 8) reasons.push(`Volume confirmation (${features.volumeRatio20d.toFixed(1)}x avg)`);
  if (technicalScore >= 7) reasons.push(`Technical indicators aligned`);

  if (features.adx14 < 20) warnings.push('Weak trend (ADX < 20)');
  if (features.atrPct > 3) warnings.push('High volatility (ATR > 3%)');
  if (!features.isValid) warnings.push('Limited real data available');
  if (regime.regime === 'VOLATILE') warnings.push('Volatile market regime');
  if (xgb?.direction && xgb.direction !== direction && xgb.direction !== 'HOLD') {
    warnings.push(`ML model suggests ${xgb.direction} (contrary signal)`);
  }

  return {
    symbol,
    direction,
    finalScore: Math.round(finalScore),
    grade,
    breakdown,
    tradeable,
    reasons,
    warnings,
  };
}

/**
 * Quick check: is a score tradeable?
 */
export function isTradeable(score: number): boolean {
  return score >= TRADEABLE_THRESHOLD;
}

export { TRADEABLE_THRESHOLD };
