// Market Regime Detection
// Classifies market as TRENDING_UP, TRENDING_DOWN, SIDEWAYS, or VOLATILE
// Used to auto-enable/disable strategies based on market conditions

import { MarketDataPoint } from './strategies';

export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'SIDEWAYS' | 'VOLATILE';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number;
  avgChangePct: number;
  volatility: number;
  breadth: number; // % of stocks moving in same direction
  description: string;
  recommendedStrategies: string[];
  disabledStrategies: string[];
}

function gaussianLogPdf(x: number, mean: number, std: number): number {
  if (std <= 0) return -100;
  const variance = std * std;
  return -0.5 * Math.log(2 * Math.PI * variance) - Math.pow(x - mean, 2) / (2 * variance);
}

const HMM_STATES: {
  name: MarketRegime;
  meanReturn: number;
  stdReturn: number;
  meanVol: number;
  stdVol: number;
  prior: number;
}[] = [
  { name: 'TRENDING_UP', meanReturn: 0.6, stdReturn: 0.4, meanVol: 0.8, stdVol: 0.4, prior: 0.25 },
  { name: 'TRENDING_DOWN', meanReturn: -0.6, stdReturn: 0.4, meanVol: 0.8, stdVol: 0.4, prior: 0.25 },
  { name: 'SIDEWAYS', meanReturn: 0.0, stdReturn: 0.25, meanVol: 0.4, stdVol: 0.2, prior: 0.35 },
  { name: 'VOLATILE', meanReturn: 0.0, stdReturn: 0.8, meanVol: 1.8, stdVol: 0.8, prior: 0.15 }
];

export function detectMarketRegime(data: MarketDataPoint[]): RegimeAnalysis {
  if (!data?.length) {
    return {
      regime: 'SIDEWAYS', confidence: 50, avgChangePct: 0, volatility: 0, breadth: 0,
      description: 'No market data available',
      recommendedStrategies: ['RSI', 'BOLLINGER', 'VWAP'],
      disabledStrategies: [],
    };
  }

  // Calculate market breadth and direction metrics
  const changes = data.map(d => d?.changePct ?? 0);
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const advancing = changes.filter(c => c > 0.25).length;
  const declining = changes.filter(c => c < -0.25).length;
  const breadth = data.length > 0 ? Math.max(advancing, declining) / data.length : 0;
  const variance = changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / changes.length;
  const volatility = Math.sqrt(variance);

  // Evaluate HMM Log-Likelihoods for the market average observations
  const logLikelihoods = HMM_STATES.map(state => {
    let logProb = Math.log(state.prior);
    logProb += gaussianLogPdf(avgChange, state.meanReturn, state.stdReturn);
    logProb += gaussianLogPdf(volatility, state.meanVol, state.stdVol);
    return logProb;
  });

  // Log-Sum-Exp normalization to obtain posterior state probabilities
  const maxLog = Math.max(...logLikelihoods);
  const exps = logLikelihoods.map(l => Math.exp(l - maxLog));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  const posteriors = exps.map(e => e / (sumExps || 1));

  let bestStateIndex = 0;
  let maxPosterior = 0;
  for (let i = 0; i < posteriors.length; i++) {
    const post = posteriors[i] ?? 0;
    if (post > maxPosterior) {
      maxPosterior = post;
      bestStateIndex = i;
    }
  }

  const bestState = HMM_STATES[bestStateIndex] ?? HMM_STATES[2]!;
  const regime = bestState.name;
  const confidence = Math.round(maxPosterior * 100);

  let description = '';
  let recommendedStrategies: string[] = [];
  let disabledStrategies: string[] = [];

  switch (regime) {
    case 'VOLATILE':
      description = `HMM Volatile State: High intraday dispersion (${volatility.toFixed(2)}%) but no clear direction. Reduce sizing.`;
      recommendedStrategies = ['BOLLINGER', 'RSI', 'SUPERTREND'];
      disabledStrategies = ['MOMENTUM', 'EMA_CROSS', 'VWAP'];
      break;
    case 'TRENDING_UP':
      description = `HMM Bullish Trend State: Market advancing with ${(breadth * 100).toFixed(0)}% asset alignment. Long bias active.`;
      recommendedStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS', 'MACD', 'VWAP_PULLBACK', 'VOLUME_BREAKOUT'];
      disabledStrategies = ['BOLLINGER', 'VWAP'];
      break;
    case 'TRENDING_DOWN':
      description = `HMM Bearish Trend State: Market declining with ${(breadth * 100).toFixed(0)}% asset alignment. Long entries blocked.`;
      recommendedStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS', 'MACD', 'VWAP_PULLBACK', 'VOLUME_BREAKOUT'];
      disabledStrategies = ['BOLLINGER', 'VWAP'];
      break;
    default:
      description = `HMM Sideways State: Range-bound consolidation. Ideal setup for mean reversion strategies.`;
      recommendedStrategies = ['RSI', 'BOLLINGER', 'VWAP', 'OFI_VSA'];
      disabledStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS'];
  }

  return {
    regime,
    confidence,
    avgChangePct: Math.round(avgChange * 100) / 100,
    volatility: Math.round(volatility * 100) / 100,
    breadth: Math.round(breadth * 100) / 100,
    description,
    recommendedStrategies,
    disabledStrategies,
  };
}

// Filter signals based on market regime
import type { TradeSignal } from './trading-engine';

export function filterSignalsByRegime(
  signals: TradeSignal[],
  regime: RegimeAnalysis
): TradeSignal[] {
  return signals.map((s) => {
    const adjusted = { ...s };

    const strat = s.strategy;
    const isTrending = regime.regime === 'TRENDING_UP' || regime.regime === 'TRENDING_DOWN';
    const isMeanReversion = strat === 'RSI' || strat === 'BOLLINGER' || strat === 'BOLLINGER_BANDS' || strat === 'VWAP';
    const isTrendFollowing = strat === 'MOMENTUM' || strat === 'EMA_CROSS' || strat === 'EMA_CROSSOVER' || strat === 'MACD' || strat === 'SUPERTREND';

    // Strict multi-regime strategy mapping exclusions:
    // 1. Block mean reversion strategies in strong trending structures (catch no falling knives)
    if (isTrending && isMeanReversion) {
      adjusted.confidence = 0;
      return adjusted;
    }

    // 2. Block trend-following breakout strategies in sideways ranging consolidation (avoid choppy churn)
    if (!isTrending && isTrendFollowing) {
      adjusted.confidence = 0;
      return adjusted;
    }

    // Standard adjustments for active strategies:
    if (regime.recommendedStrategies.includes(strat)) {
      adjusted.confidence = Math.min(95, (s.confidence ?? 50) + 10);
    }

    if (regime.disabledStrategies.includes(strat)) {
      adjusted.confidence = Math.max(0, (adjusted.confidence ?? 50) - 20);
    }

    if (regime.regime === 'TRENDING_DOWN' && s.direction === 'BUY') {
      adjusted.confidence = Math.max(0, (adjusted.confidence ?? 50) - 10);
    }

    if (regime.regime === 'TRENDING_UP' && s.direction === 'SELL') {
      adjusted.confidence = Math.max(0, (adjusted.confidence ?? 50) - 10);
    }

    return adjusted;
  });
}
