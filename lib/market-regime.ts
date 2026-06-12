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

export function detectMarketRegime(data: MarketDataPoint[]): RegimeAnalysis {
  if (!data?.length) {
    return {
      regime: 'SIDEWAYS', confidence: 50, avgChangePct: 0, volatility: 0, breadth: 0,
      description: 'No market data available',
      recommendedStrategies: ['RSI', 'BOLLINGER', 'VWAP'],
      disabledStrategies: [],
    };
  }

  // Calculate market breadth and direction
  const changes = data.map(d => d?.changePct ?? 0);
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const advancing = changes.filter(c => c > 0.25).length;
  const declining = changes.filter(c => c < -0.25).length;
  const breadth = data.length > 0 ? Math.max(advancing, declining) / data.length : 0;

  // Calculate volatility (standard deviation of changes)
  const variance = changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / changes.length;
  const volatility = Math.sqrt(variance);

  // Classification using statistical boundaries
  let regime: MarketRegime;
  let confidence: number;
  let description: string;
  let recommendedStrategies: string[];
  let disabledStrategies: string[];

  // 1. Extreme Volatility / Churn check (Z-Score of standard deviation > 2.2)
  if (volatility > 2.2 && Math.abs(avgChange) < 0.4) {
    regime = 'VOLATILE';
    confidence = Math.min(95, 60 + (volatility - 2.2) * 15);
    description = `Volatile Range-bound: High intraday dispersion (${volatility.toFixed(2)}%) but no market direction. Reduce position sizing and avoid momentum.`;
    recommendedStrategies = ['BOLLINGER', 'RSI', 'SUPERTREND'];
    disabledStrategies = ['MOMENTUM', 'EMA_CROSS', 'VWAP'];
  }
  // 2. Bullish Trend check (positive change with high consensus breadth)
  else if (avgChange > 0.45 && breadth > 0.55) {
    regime = 'TRENDING_UP';
    confidence = Math.min(95, 50 + (avgChange * 20) + (breadth * 30));
    description = `Bullish Trend: Market advancing with ${(breadth * 100).toFixed(0)}% asset alignment. Sizing is optimized for Long momentum entries.`;
    recommendedStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS', 'MACD', 'VWAP_PULLBACK', 'VOLUME_BREAKOUT'];
    disabledStrategies = ['BOLLINGER', 'VWAP']; // Mean reversion fails in strong trends
  }
  // 3. Bearish Trend check (negative change with high consensus breadth)
  else if (avgChange < -0.45 && breadth > 0.55) {
    regime = 'TRENDING_DOWN';
    confidence = Math.min(95, 50 + (Math.abs(avgChange) * 20) + (breadth * 30));
    description = `Bearish Trend: Market declining with ${(breadth * 100).toFixed(0)}% asset alignment. Long entries are restricted.`;
    recommendedStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS', 'MACD', 'VWAP_PULLBACK', 'VOLUME_BREAKOUT'];
    disabledStrategies = ['BOLLINGER', 'VWAP'];
  }
  // 4. Default: Sideways / Quiet Range-bound
  else {
    regime = 'SIDEWAYS';
    const quietFactor = Math.max(0, 1.5 - volatility);
    confidence = Math.min(90, 50 + quietFactor * 25 + (1 - Math.abs(avgChange)) * 15);
    description = `Sideways Quiet: Range-bound consolidation. Ideal setup for mean reversion (RSI, Bollinger Bands, and VWAP).`;
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

    if (regime.recommendedStrategies.includes(s.strategy)) {
      adjusted.confidence = Math.min(95, (s.confidence ?? 50) + 10);
    }

    if (regime.disabledStrategies.includes(s.strategy)) {
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
