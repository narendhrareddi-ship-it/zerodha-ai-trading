// Market Regime Agent — Phase 9
// Enhanced market regime detection using breadth analysis,
// options PCR, and multi-timeframe regime classification.

import { detectMarketRegime, type RegimeAnalysis } from '../market-regime';
import { analyzeMarketBreadth, getBreadthSizingMultiplier, type MarketBreadthData } from '../market-breadth';
import { getOptionChain } from '../nse-live-api';
import { analyzeOptionsChain, type OptionsChainData } from '../options-chain-intelligence';
import type { MarketDataPoint } from '../strategies';

export interface EnhancedRegime extends Omit<RegimeAnalysis, 'breadth'> {
  breadth: MarketBreadthData;
  options?: OptionsChainData;
  positionSizeMultiplier: number;
  macroSignal: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  regimeStrength: number;
  expectedDuration: string;
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  intraRegimePhase: 'EARLY' | 'MID' | 'LATE';
}

export interface RegimeAgentResult {
  enhancedRegime: EnhancedRegime;
  allowLongTrades: boolean;
  allowShortTrades: boolean;
  positionSizeMultiplier: number;
  maxPositions: number;           // Regime-adjusted max positions
  strategyRecommendations: {
    strategy: string;
    weight: number;                // 0-2 (multiplier for strategy allocation)
    reason: string;
  }[];
  timestamp: number;
}

/**
 * Classify volatility regime from breadth data and regime analysis
 */
function classifyVolatility(regime: RegimeAnalysis): EnhancedRegime['volatilityRegime'] {
  if (regime.volatility > 4) return 'EXTREME';
  if (regime.volatility > 2.5) return 'HIGH';
  if (regime.volatility > 1) return 'NORMAL';
  return 'LOW';
}

/**
 * Estimate regime phase (early/mid/late) from trend metrics
 */
function estimateRegimePhase(regime: RegimeAnalysis, breadth: MarketBreadthData): EnhancedRegime['intraRegimePhase'] {
  if (regime.regime === 'TRENDING_UP') {
    if (breadth.percentAboveEMA50 < 60) return 'EARLY';
    if (breadth.mclellanOscillator > 50) return 'MID';
    return 'LATE';
  }
  if (regime.regime === 'TRENDING_DOWN') {
    if (breadth.advanceDeclineRatio > 0.6) return 'EARLY';
    if (breadth.mclellanOscillator < -50) return 'MID';
    return 'LATE';
  }
  return 'MID';
}

/**
 * Determine macro RISK_ON / RISK_OFF signal
 */
function macroSignal(
  regime: RegimeAnalysis,
  breadth: MarketBreadthData,
  options?: OptionsChainData
): EnhancedRegime['macroSignal'] {
  let score = 0;

  // Regime direction
  if (regime.regime === 'TRENDING_UP') score += 2;
  else if (regime.regime === 'TRENDING_DOWN') score -= 2;
  else if (regime.regime === 'VOLATILE') score -= 1;

  // Breadth
  if (breadth.signal === 'BULLISH' || breadth.signal === 'VERY_BULLISH') score += 2;
  else if (breadth.signal === 'BEARISH' || breadth.signal === 'VERY_BEARISH') score -= 2;

  // Options PCR
  if (options) {
    if (options.putCallRatio < 0.7) score += 1;      // Low PCR = bullish
    else if (options.putCallRatio > 1.5) score -= 1;  // High PCR = bearish
  }

  if (score >= 2) return 'RISK_ON';
  if (score <= -2) return 'RISK_OFF';
  return 'NEUTRAL';
}

/**
 * Build strategy weight recommendations based on regime
 */
function buildStrategyRecommendations(regime: RegimeAnalysis): RegimeAgentResult['strategyRecommendations'] {
  const recs: RegimeAgentResult['strategyRecommendations'] = [];

  const strategyWeights: Record<string, Record<string, number>> = {
    TRENDING_UP:   { MOMENTUM: 1.8, EMA_CROSS: 1.5, MACD: 1.5, SUPERTREND: 1.5, RSI: 0.7, BOLLINGER: 0.5, VWAP: 0.7 },
    TRENDING_DOWN: { MOMENTUM: 1.8, EMA_CROSS: 1.5, MACD: 1.5, SUPERTREND: 1.5, RSI: 0.7, BOLLINGER: 0.5, VWAP: 0.7 },
    SIDEWAYS:      { RSI: 1.8, BOLLINGER: 1.8, VWAP: 1.5, MACD: 0.7, MOMENTUM: 0.5, EMA_CROSS: 0.6, SUPERTREND: 0.5 },
    VOLATILE:      { BOLLINGER: 1.5, RSI: 1.3, SUPERTREND: 1.2, MOMENTUM: 0.5, EMA_CROSS: 0.5, MACD: 0.7, VWAP: 0.8 },
  };

  const weights = strategyWeights[regime.regime] ?? {};
  const reasons: Record<string, string> = {
    MOMENTUM: regime.regime.includes('TRENDING') ? 'Strong trend environment' : 'Low priority in ranging market',
    RSI: regime.regime === 'SIDEWAYS' ? 'Ideal for range-bound oscillations' : 'Less reliable in trending market',
    MACD: 'MACD performs well in trending environments',
    BOLLINGER: regime.regime === 'VOLATILE' ? 'Wide bands capture extreme moves' : 'Mean reversion signal',
    SUPERTREND: 'ATR-based trailing works in trending/volatile markets',
    VWAP: 'VWAP mean reversion in range-bound conditions',
    EMA_CROSS: 'Trend-following crossovers in directional markets',
  };

  for (const [strategy, weight] of Object.entries(weights)) {
    recs.push({ strategy, weight: weight ?? 1, reason: reasons[strategy] ?? '' });
  }

  return recs.sort((a, b) => b.weight - a.weight);
}

/**
 * Run the Market Regime Agent
 */
export async function runRegimeAgent(
  stocks: MarketDataPoint[],
  histMap?: Map<string, { closes: number[]; volumes: number[] }>,
  indexSymbol: string = 'NIFTY'
): Promise<RegimeAgentResult> {
  // 1. Basic regime detection
  const regime = detectMarketRegime(stocks);

  // 2. Market breadth analysis
  const breadth = analyzeMarketBreadth(stocks, histMap);

  // 3. Options chain for NIFTY (best effort)
  let options: OptionsChainData | undefined;
  try {
    const rawOptionData = await getOptionChain(indexSymbol);
    if (rawOptionData) {
      const spotPrice = stocks.find(s => s.symbol.includes('NIFTY'))?.lastPrice ??
        stocks.reduce((s, st) => s + st.lastPrice, 0) / stocks.length;
      options = analyzeOptionsChain(indexSymbol, rawOptionData, spotPrice);
    }
  } catch { /* options data is best-effort */ }

  const volatilityRegime = classifyVolatility(regime);
  const phase = estimateRegimePhase(regime, breadth);
  const macro = macroSignal(regime, breadth, options);
  const breadthSizeMult = getBreadthSizingMultiplier(breadth);

  // Combined position size multiplier
  let sizeMult = breadthSizeMult;
  if (volatilityRegime === 'EXTREME') sizeMult *= 0.3;
  else if (volatilityRegime === 'HIGH') sizeMult *= 0.6;
  else if (volatilityRegime === 'LOW') sizeMult *= 1.1;
  if (phase === 'LATE') sizeMult *= 0.85; // Reduce late in regime
  sizeMult = Math.min(1.5, Math.max(0, sizeMult));

  // Max positions based on regime
  const baseMaxPositions = 5;
  let maxPositions = baseMaxPositions;
  if (regime.regime === 'VOLATILE') maxPositions = 2;
  else if (volatilityRegime === 'HIGH') maxPositions = 3;
  else if (macro === 'RISK_OFF') maxPositions = 2;

  // Allow/block trade directions
  const allowLongTrades = macro !== 'RISK_OFF' && regime.regime !== 'TRENDING_DOWN';
  const allowShortTrades = macro !== 'RISK_ON' || regime.regime === 'TRENDING_DOWN' || regime.regime === 'VOLATILE';

  // Regime strength
  const regimeStrength = Math.round(
    regime.confidence * 0.5 +
    breadth.bullishScore * 0.3 +
    (options?.signalScore ?? 50) * 0.2
  );

  const expectedDuration =
    phase === 'EARLY' ? '2-5 days' :
    phase === 'MID' ? '3-7 days' :
    '1-3 days (late phase)';

  const enhancedRegime: EnhancedRegime = {
    ...regime,
    breadth,
    options,
    positionSizeMultiplier: Math.round(sizeMult * 100) / 100,
    macroSignal: macro,
    regimeStrength,
    expectedDuration,
    volatilityRegime,
    intraRegimePhase: phase,
  };

  return {
    enhancedRegime,
    allowLongTrades,
    allowShortTrades,
    positionSizeMultiplier: Math.round(sizeMult * 100) / 100,
    maxPositions,
    strategyRecommendations: buildStrategyRecommendations(regime),
    timestamp: Date.now(),
  };
}
