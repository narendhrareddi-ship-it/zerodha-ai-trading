// Half-Kelly Criterion Position Sizing
// The Kelly Criterion calculates the optimal bet size to maximize long-term growth.
// We use "Half-Kelly" which is more conservative and reduces drawdowns.

export interface KellyParams {
  winRate: number;       // Historical win probability (0-1)
  avgWin: number;        // Average winning trade amount
  avgLoss: number;       // Average losing trade amount (positive number)
  capital: number;       // Total available capital
  entryPrice: number;    // Current entry price per share
  stopLoss: number;      // Stop-loss price
  maxRiskPercent?: number; // Maximum % of capital to risk (safety cap, default 5%)
}

export interface PositionSizeResult {
  shares: number;
  kellyFraction: number;      // Full Kelly fraction
  halfKellyFraction: number;  // Half-Kelly (what we use)
  capitalAllocated: number;
  riskAmount: number;
  method: string;
}

/**
 * Full Kelly Criterion formula:
 * f* = (p * b - q) / b
 * where:
 *   p = probability of winning
 *   q = probability of losing (1 - p)
 *   b = ratio of average win to average loss (win/loss ratio)
 * 
 * Half-Kelly = f* / 2 (more conservative, widely recommended)
 */
export function calculateKellyFraction(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss <= 0 || winRate <= 0 || winRate >= 1) return 0;
  
  const p = Math.min(Math.max(winRate, 0.01), 0.99);
  const q = 1 - p;
  const b = avgWin / avgLoss; // Win/loss ratio
  
  const kelly = (p * b - q) / b;
  return Math.max(0, kelly); // Never negative
}

/**
 * Calculate position size using Half-Kelly Criterion
 * Falls back to fixed-risk sizing if insufficient historical data
 */
export function halfKellyPositionSize(params: KellyParams): PositionSizeResult {
  const {
    winRate,
    avgWin,
    avgLoss,
    capital,
    entryPrice,
    stopLoss,
    maxRiskPercent = 5,
  } = params;

  const riskPerShare = Math.abs(entryPrice - stopLoss);
  if (riskPerShare <= 0 || capital <= 0 || entryPrice <= 0) {
    return {
      shares: 1,
      kellyFraction: 0,
      halfKellyFraction: 0,
      capitalAllocated: entryPrice,
      riskAmount: riskPerShare,
      method: 'minimum',
    };
  }

  // Calculate full Kelly fraction
  const kellyFraction = calculateKellyFraction(winRate, avgWin, avgLoss);
  
  // Use Half-Kelly for safety
  const halfKelly = kellyFraction / 2;
  
  // Cap at max risk percent
  const maxRiskFraction = maxRiskPercent / 100;
  const usedFraction = Math.min(halfKelly, maxRiskFraction);
  
  // Calculate capital to allocate
  const capitalToRisk = capital * usedFraction;
  
  // Calculate shares based on risk per share
  const sharesByRisk = Math.floor(capitalToRisk / riskPerShare);
  const sharesByCapital = Math.floor(capital / entryPrice);
  
  // Take the minimum of risk-based and capital-based limits
  const shares = Math.max(1, Math.min(sharesByRisk, sharesByCapital));
  
  return {
    shares,
    kellyFraction,
    halfKellyFraction: halfKelly,
    capitalAllocated: shares * entryPrice,
    riskAmount: shares * riskPerShare,
    method: halfKelly > 0 ? 'half-kelly' : 'fixed-risk',
  };
}

/**
 * Fixed-risk fallback when no historical data available
 * Risks a fixed amount per trade (default ₹100 or 1% of capital)
 */
export function fixedRiskPositionSize(
  capital: number,
  entryPrice: number,
  stopLoss: number,
  maxRiskPerTrade: number = 100
): PositionSizeResult {
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  if (riskPerShare <= 0) {
    return {
      shares: 1,
      kellyFraction: 0,
      halfKellyFraction: 0,
      capitalAllocated: entryPrice,
      riskAmount: 0,
      method: 'fixed-risk',
    };
  }
  
  const shares = Math.floor(maxRiskPerTrade / riskPerShare);
  const maxByCapital = Math.floor(capital / entryPrice);
  const finalShares = Math.max(1, Math.min(shares, maxByCapital));
  
  return {
    shares: finalShares,
    kellyFraction: 0,
    halfKellyFraction: 0,
    capitalAllocated: finalShares * entryPrice,
    riskAmount: finalShares * riskPerShare,
    method: 'fixed-risk',
  };
}
