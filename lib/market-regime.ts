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
  const advancing = changes.filter(c => c > 0.3).length;
  const declining = changes.filter(c => c < -0.3).length;
  const breadth = data.length > 0 ? Math.max(advancing, declining) / data.length : 0;

  // Calculate volatility (std deviation of changes)
  const variance = changes.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / changes.length;
  const volatility = Math.sqrt(variance);

  // Calculate average volume strength
  const avgVolume = data.reduce((s, d) => s + (d?.volume ?? 0), 0) / data.length;
  const highVolumeCount = data.filter(d => (d?.volume ?? 0) > avgVolume * 1.3).length;
  const volumeStrength = highVolumeCount / data.length;

  // Regime classification
  let regime: MarketRegime;
  let confidence: number;
  let description: string;
  let recommendedStrategies: string[];
  let disabledStrategies: string[];

  if (volatility > 2.5) {
    // High volatility regime
    regime = 'VOLATILE';
    confidence = Math.min(90, 60 + volatility * 8);
    description = `High volatility (${volatility.toFixed(1)}%), wide price swings. Reduce position sizes, use wider stops.`;
    recommendedStrategies = ['BOLLINGER', 'SUPERTREND', 'RSI'];
    disabledStrategies = ['MOMENTUM', 'EMA_CROSS', 'VWAP'];
  } else if (avgChange > 0.8 && breadth > 0.6) {
    // Strong uptrend
    regime = 'TRENDING_UP';
    confidence = Math.min(90, 60 + avgChange * 15 + breadth * 20);
    description = `Bullish trend, ${(breadth * 100).toFixed(0)}% stocks advancing. Favor long positions.`;
    recommendedStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS', 'MACD'];
    disabledStrategies = ['BOLLINGER', 'VWAP']; // Mean reversion fails in trends
  } else if (avgChange < -0.8 && breadth > 0.6) {
    // Strong downtrend
    regime = 'TRENDING_DOWN';
    confidence = Math.min(90, 60 + Math.abs(avgChange) * 15 + breadth * 20);
    description = `Bearish trend, ${(breadth * 100).toFixed(0)}% stocks declining. Favor short positions or stay cash.`;
    recommendedStrategies = ['MOMENTUM', 'SUPERTREND', 'EMA_CROSS', 'MACD'];
    disabledStrategies = ['BOLLINGER', 'VWAP'];
  } else {
    // Sideways/range-bound
    regime = 'SIDEWAYS';
    confidence = Math.min(85, 55 + (1 - Math.abs(avgChange)) * 20);
    description = `Range-bound market, avg change ${avgChange.toFixed(2)}%. Mean reversion strategies work best.`;
    recommendedStrategies = ['RSI', 'BOLLINGER', 'VWAP'];
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
