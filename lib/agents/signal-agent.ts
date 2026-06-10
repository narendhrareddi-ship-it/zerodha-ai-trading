// Signal Agent — Phase 9
// Aggregates signals from all strategies + XGBoost + FinBERT sentiment.
// Acts as the primary signal broker, deduplicates and ranks signals,
// and passes only high-confidence signals to the Market Regime Agent.

import { runAllStrategies, type MarketDataPoint } from '../strategies';
import { ensembleVote } from '../ensemble-voting';
import { computeBatchFeatures } from '../feature-store';
import { batchPredictXGBoost } from '../xgboost-predictor';
import { scoreConfidence, TRADEABLE_THRESHOLD } from '../confidence-scorer';
import { detectMarketRegime, filterSignalsByRegime } from '../market-regime';
import type { HistoricalPrices } from '../historical-data';
import type { TradeSignal } from '../trading-engine';

export interface SignalAgentConfig {
  enabledStrategies: Record<string, boolean>;
  minVoteCount: number;         // Minimum strategies agreeing (default: 2)
  minConfidenceThreshold: number; // Minimum confidence to pass signal forward
  enableXGBoost: boolean;
  enableNewsSentiment: boolean;
  newsHeadlines?: string[];
  apiKey?: string;
}

export interface AgentSignal extends TradeSignal {
  confidenceScore: number;
  confidenceGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  xgboostProbability?: number;
  voteCount: number;
  votingStrategies: string[];
  warnings: string[];
  reasons: string[];
}

export interface SignalAgentResult {
  signals: AgentSignal[];
  totalRawSignals: number;
  afterEnsembleFilter: number;
  afterConfidenceFilter: number;
  regime: ReturnType<typeof detectMarketRegime>;
  runId: string;
  durationMs: number;
  timestamp: number;
}

/**
 * Run the Signal Agent pipeline
 */
export async function runSignalAgent(
  stocks: MarketDataPoint[],
  historyMap: Map<string, HistoricalPrices>,
  config: SignalAgentConfig
): Promise<SignalAgentResult> {
  const startTime = Date.now();
  const runId = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // 1. Detect market regime
  const regime = detectMarketRegime(stocks);

  // 2. Run all indicator strategies
  const rawSignals = runAllStrategies(stocks, config.enabledStrategies, historyMap);

  // 3. Run FinBERT news sentiment if enabled
  let sentimentSignals: TradeSignal[] = [];
  if (config.enableNewsSentiment && config.newsHeadlines?.length && stocks.length) {
    try {
      const { newsSentimentStrategy } = await import('../strategies');
      sentimentSignals = await newsSentimentStrategy(config.newsHeadlines, stocks);
    } catch { /* non-critical */ }
  }

  const allRawSignals = [...rawSignals, ...sentimentSignals];
  const totalRawSignals = allRawSignals.length;

  // 4. Apply regime filter (adjusts confidence values)
  const regimeFiltered = filterSignalsByRegime(allRawSignals, regime);

  // 5. Ensemble voting — require minimum strategy consensus
  const votingResults = ensembleVote(regimeFiltered, config.minVoteCount);
  const afterEnsembleFilter = votingResults.length;

  if (!votingResults.length) {
    return {
      signals: [],
      totalRawSignals,
      afterEnsembleFilter: 0,
      afterConfidenceFilter: 0,
      regime,
      runId,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  // 6. Compute features for all relevant symbols
  const relevantSymbols = votingResults.map(v => v.symbol);
  const relevantStocks = stocks.filter(s => relevantSymbols.includes(s.symbol));
  const featuresMap = await computeBatchFeatures(relevantStocks, historyMap);

  // 7. XGBoost predictions (if enabled)
  let xgbMap = new Map<string, Awaited<ReturnType<typeof batchPredictXGBoost>>['predictions'][0]>();
  if (config.enableXGBoost && featuresMap.size > 0) {
    try {
      const { predictions } = await batchPredictXGBoost(featuresMap, config.apiKey, 5);
      for (const pred of predictions) {
        xgbMap.set(pred.symbol, pred);
      }
    } catch { /* non-critical — continue without XGBoost */ }
  }

  // 8. Score confidence for each voting result
  const agentSignals: AgentSignal[] = [];

  for (const vr of votingResults) {
    const features = featuresMap.get(vr.symbol);
    const xgb = xgbMap.get(vr.symbol) ?? null;

    if (!features) continue;

    const scored = scoreConfidence({
      symbol: vr.symbol,
      direction: vr.direction,
      strategy: vr.strategies.join('+'),
      rawStrategyConfidence: vr.avgConfidence,
      voteCount: vr.voteCount,
      totalStrategies: 8,
      xgb,
      regime,
      features,
    });

    if (scored.finalScore < config.minConfidenceThreshold) continue;

    agentSignals.push({
      ...vr.bestSignal,
      confidence: scored.finalScore,
      confidenceScore: scored.finalScore,
      confidenceGrade: scored.grade,
      xgboostProbability: xgb?.probability,
      voteCount: vr.voteCount,
      votingStrategies: vr.strategies,
      warnings: scored.warnings,
      reasons: scored.reasons,
      reason: `[${scored.grade}-grade, ${vr.voteCount} strategies] ${vr.bestSignal.reason}`,
    });
  }

  // Sort by confidence score descending
  agentSignals.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return {
    signals: agentSignals,
    totalRawSignals,
    afterEnsembleFilter,
    afterConfidenceFilter: agentSignals.length,
    regime,
    runId,
    durationMs: Date.now() - startTime,
    timestamp: Date.now(),
  };
}
