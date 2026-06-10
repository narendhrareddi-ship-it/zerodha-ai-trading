// Dynamic Risk Sizing Agent — Phase 8
// Replaces static Kelly Criterion with regime-aware, volatility-adjusted sizing
// that adapts to market conditions, portfolio heat, and recent performance.

import type { RegimeAnalysis } from './market-regime';
import type { FeatureVector } from './feature-store';
import type { MarketBreadthData } from './market-breadth';

export interface DynamicSizingParams {
  capital: number;
  entryPrice: number;
  stopLoss: number;
  direction: 'BUY' | 'SELL';
  baseRiskPercent: number;       // Base % of capital to risk per trade (default 1%)
  maxPositionPercent: number;    // Max % of capital in single position (default 15%)
  // Context
  features: FeatureVector;
  regime: RegimeAnalysis;
  breadth: MarketBreadthData;
  // Performance
  recentWinRate?: number;        // Last 20 trades win rate
  consecutiveLosses?: number;    // Streak of losses
  openPositions?: number;        // Currently open positions
  maxPositions?: number;         // Max allowed positions
  portfolioHeat?: number;        // Current % of capital at risk in open positions
}

export interface DynamicSizingResult {
  quantity: number;
  capitalAllocated: number;
  riskAmount: number;
  effectiveRiskPct: number;
  multipliers: {
    base: number;
    regimeMultiplier: number;
    volatilityMultiplier: number;
    breadthMultiplier: number;
    performanceMultiplier: number;
    portfolioHeatMultiplier: number;
  };
  reasoning: string[];
}

const BASE_RISK_PCT = 1.0;
const MAX_POSITION_PCT = 15.0;

/**
 * Compute regime-based sizing multiplier
 */
function regimeMultiplier(regime: RegimeAnalysis, direction: 'BUY' | 'SELL'): number {
  let mult = 1.0;

  // Regime alignment
  if (regime.regime === 'TRENDING_UP' && direction === 'BUY') mult = 1.2;
  else if (regime.regime === 'TRENDING_DOWN' && direction === 'SELL') mult = 1.2;
  else if (regime.regime === 'TRENDING_UP' && direction === 'SELL') mult = 0.5;
  else if (regime.regime === 'TRENDING_DOWN' && direction === 'BUY') mult = 0.5;
  else if (regime.regime === 'SIDEWAYS') mult = 0.8;
  else if (regime.regime === 'VOLATILE') mult = 0.5;

  // Regime confidence adjustment
  if (regime.confidence > 80) mult *= 1.1;
  else if (regime.confidence < 50) mult *= 0.8;

  return Math.min(1.5, Math.max(0.2, mult));
}

/**
 * Compute volatility-based sizing multiplier (higher vol = smaller size)
 */
function volatilityMultiplier(features: FeatureVector): number {
  const atrPct = features.atrPct;
  if (atrPct < 1.0) return 1.3;       // Low vol: slightly larger
  if (atrPct < 1.5) return 1.1;
  if (atrPct < 2.0) return 1.0;
  if (atrPct < 3.0) return 0.8;
  if (atrPct < 4.0) return 0.6;
  return 0.4;                          // Very high vol: much smaller
}

/**
 * Compute market breadth sizing multiplier
 */
function breadthMultiplier(breadth: MarketBreadthData, direction: 'BUY' | 'SELL'): number {
  if (direction === 'BUY') {
    if (breadth.signal === 'VERY_BEARISH') return 0;   // No buys in severe breadth weakness
    if (breadth.signal === 'BEARISH') return 0.5;
    if (breadth.signal === 'NEUTRAL') return 0.85;
    if (breadth.signal === 'BULLISH') return 1.0;
    if (breadth.signal === 'VERY_BULLISH') return 1.15;
  } else {
    if (breadth.signal === 'VERY_BULLISH') return 0;   // No shorts in very bullish breadth
    if (breadth.signal === 'BULLISH') return 0.5;
    if (breadth.signal === 'NEUTRAL') return 0.85;
    if (breadth.signal === 'BEARISH') return 1.0;
    if (breadth.signal === 'VERY_BEARISH') return 1.15;
  }
  return 1.0;
}

/**
 * Compute performance-based sizing multiplier
 */
function performanceMultiplier(
  recentWinRate?: number,
  consecutiveLosses?: number
): number {
  let mult = 1.0;

  // Win rate adjustment
  if (recentWinRate !== undefined) {
    if (recentWinRate > 0.65) mult *= 1.1;
    else if (recentWinRate < 0.40) mult *= 0.7;
    else if (recentWinRate < 0.50) mult *= 0.85;
  }

  // Consecutive loss reduction (anti-martingale)
  if (consecutiveLosses !== undefined && consecutiveLosses > 0) {
    mult *= Math.pow(0.8, Math.min(consecutiveLosses, 4)); // Reduce 20% per loss, max 4x
  }

  return Math.min(1.5, Math.max(0.1, mult));
}

/**
 * Portfolio heat multiplier: reduce size when much capital is at risk
 */
function portfolioHeatMultiplier(
  portfolioHeat?: number,
  openPositions?: number,
  maxPositions?: number
): number {
  // Reduce size as portfolio fills up
  if (portfolioHeat !== undefined) {
    if (portfolioHeat > 0.5) return 0.5;      // >50% at risk: very cautious
    if (portfolioHeat > 0.3) return 0.75;
    if (portfolioHeat > 0.15) return 0.9;
  }

  if (openPositions !== undefined && maxPositions !== undefined) {
    const filledRatio = openPositions / Math.max(1, maxPositions);
    if (filledRatio > 0.8) return 0.7;
    if (filledRatio > 0.6) return 0.85;
  }

  return 1.0;
}

/**
 * Main dynamic risk sizing calculation
 */
export function calculateDynamicRiskSize(params: DynamicSizingParams): DynamicSizingResult {
  const {
    capital, entryPrice, stopLoss, direction,
    baseRiskPercent = BASE_RISK_PCT,
    maxPositionPercent = MAX_POSITION_PCT,
    features, regime, breadth,
    recentWinRate, consecutiveLosses,
    openPositions, maxPositions,
    portfolioHeat,
  } = params;

  const riskPerShare = Math.abs(entryPrice - stopLoss);
  if (riskPerShare <= 0 || entryPrice <= 0 || capital <= 0) {
    return {
      quantity: 1,
      capitalAllocated: entryPrice,
      riskAmount: 0,
      effectiveRiskPct: 0,
      multipliers: {
        base: 1, regimeMultiplier: 1, volatilityMultiplier: 1,
        breadthMultiplier: 1, performanceMultiplier: 1, portfolioHeatMultiplier: 1,
      },
      reasoning: ['Invalid parameters — using minimum quantity'],
    };
  }

  // Calculate all multipliers
  const regMult = regimeMultiplier(regime, direction);
  const volMult = volatilityMultiplier(features);
  const breadthMult = breadthMultiplier(breadth, direction);
  const perfMult = performanceMultiplier(recentWinRate, consecutiveLosses);
  const heatMult = portfolioHeatMultiplier(portfolioHeat, openPositions, maxPositions);

  // Combine multipliers
  const combinedMultiplier = regMult * volMult * breadthMult * perfMult * heatMult;
  const effectiveRiskPct = baseRiskPercent * combinedMultiplier;

  // Calculate quantity
  const riskCapital = capital * (effectiveRiskPct / 100);
  const sharesByRisk = Math.floor(riskCapital / riskPerShare);
  const maxByCapital = Math.floor(capital * (maxPositionPercent / 100) / entryPrice);
  const quantity = Math.max(1, Math.min(sharesByRisk, maxByCapital));

  // Build reasoning
  const reasoning: string[] = [];
  if (regMult < 0.8) reasoning.push(`Regime penalty: ${regime.regime} unfavorable for ${direction}`);
  else if (regMult > 1.1) reasoning.push(`Regime boost: ${regime.regime} aligned with ${direction}`);
  if (volMult < 0.8) reasoning.push(`High volatility (ATR ${features.atrPct.toFixed(1)}%) — reduced size`);
  if (breadthMult < 0.8) reasoning.push(`Weak market breadth — reduced exposure`);
  if (perfMult < 0.8) reasoning.push(`Recent underperformance — conservative sizing`);
  if (consecutiveLosses && consecutiveLosses > 1) reasoning.push(`${consecutiveLosses} consecutive losses — anti-martingale active`);
  if (heatMult < 0.9) reasoning.push(`Portfolio near capacity — reduced new exposure`);
  if (reasoning.length === 0) reasoning.push('Normal market conditions — standard sizing');

  return {
    quantity,
    capitalAllocated: quantity * entryPrice,
    riskAmount: quantity * riskPerShare,
    effectiveRiskPct: Math.round(effectiveRiskPct * 100) / 100,
    multipliers: {
      base: baseRiskPercent,
      regimeMultiplier: Math.round(regMult * 100) / 100,
      volatilityMultiplier: Math.round(volMult * 100) / 100,
      breadthMultiplier: Math.round(breadthMult * 100) / 100,
      performanceMultiplier: Math.round(perfMult * 100) / 100,
      portfolioHeatMultiplier: Math.round(heatMult * 100) / 100,
    },
    reasoning,
  };
}
