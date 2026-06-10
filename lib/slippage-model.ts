// Slippage Modeling Engine — Phase 8
// Estimates expected slippage, tracks actual vs estimated, and adjusts
// profit targets to ensure realistic P&L calculations.

export interface SlippageEstimate {
  symbol: string;
  entrySlippagePct: number;     // % slippage on entry
  exitSlippagePct: number;      // % slippage on exit
  totalSlippagePct: number;     // Combined round-trip slippage
  entrySlippageRs: number;      // ₹ slippage on entry (per share)
  exitSlippageRs: number;
  adjustedTarget: number;       // Original target adjusted for slippage
  adjustedStopLoss: number;     // SL adjusted for slippage (more conservative)
  tradeable: boolean;           // False if slippage > 50% of expected profit
  reason: string;
}

export interface SlippageRecord {
  symbol: string;
  direction: 'BUY' | 'SELL';
  estimatedEntry: number;
  actualEntry: number;
  estimatedExit: number;
  actualExit: number;
  estimatedSlippage: number;
  actualSlippage: number;
  quantity: number;
  timestamp: number;
}

export interface SlippageStats {
  symbol: string;
  avgActualSlippagePct: number;
  avgEstimatedSlippagePct: number;
  accuracy: number;             // How accurate our estimates are (0-1)
  totalTrades: number;
  totalSlippageCost: number;    // Total ₹ lost to slippage
}

// Historical slippage records for calibration
const slippageRecords: SlippageRecord[] = [];
const slippageStats = new Map<string, SlippageStats>();

/**
 * Estimate slippage based on:
 * - Market cap proxy (from price range)
 * - Volume
 * - Order size relative to average volume
 * - Bid-ask spread proxy
 */
export function estimateSlippage(params: {
  symbol: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  direction: 'BUY' | 'SELL';
  quantity: number;
  avgVolume: number;           // 20-day avg volume
  currentVolume: number;
  atrPct: number;              // ATR as % of price
  isLargeCapProxy: boolean;    // High price stocks (>500) assumed liquid
}): SlippageEstimate {
  const {
    symbol, entryPrice, targetPrice, stopLoss,
    direction, quantity, avgVolume, currentVolume, atrPct, isLargeCapProxy
  } = params;

  // Base spread estimate from ATR (liquid stocks have tighter spreads)
  const baseSpreadPct = isLargeCapProxy
    ? Math.min(0.05, atrPct * 0.05)   // 0.02-0.05% for large caps
    : Math.min(0.15, atrPct * 0.1);    // 0.05-0.15% for smaller stocks

  // Market impact from order size relative to volume
  const orderSizeRatio = avgVolume > 0 ? (quantity * entryPrice) / (avgVolume * entryPrice * 0.1) : 0;
  const marketImpactPct = Math.min(0.2, orderSizeRatio * 0.02);

  // Intraday volatility adjustment
  const volatilityAdj = atrPct * 0.02;

  // Total entry slippage
  const entrySlippagePct = baseSpreadPct + marketImpactPct + volatilityAdj;
  const exitSlippagePct = entrySlippagePct * 0.8; // Exit usually slightly better (limit orders)

  const entrySlippageRs = entryPrice * entrySlippagePct / 100;
  const exitSlippageRs = (direction === 'BUY' ? targetPrice : entryPrice) * exitSlippagePct / 100;
  const totalSlippagePct = entrySlippagePct + exitSlippagePct;

  // Adjust target and stop loss for slippage
  let adjustedTarget: number;
  let adjustedStopLoss: number;

  if (direction === 'BUY') {
    // Entry higher due to slippage, target unchanged, stop loss tighter
    const effectiveEntry = entryPrice * (1 + entrySlippagePct / 100);
    adjustedTarget = targetPrice; // Keep original target
    adjustedStopLoss = stopLoss * (1 - exitSlippagePct / 200); // Slightly tighter
    const expectedProfit = (targetPrice - effectiveEntry) / effectiveEntry * 100;
    const slippageCost = totalSlippagePct;
    const tradeable = slippageCost < expectedProfit * 0.5; // Slippage < 50% of profit

    const reason = tradeable
      ? `Slippage (${totalSlippagePct.toFixed(2)}%) acceptable vs expected profit (${expectedProfit.toFixed(2)}%)`
      : `HIGH SLIPPAGE: ${totalSlippagePct.toFixed(2)}% may consume ${(slippageCost / expectedProfit * 100).toFixed(0)}% of profit`;

    return {
      symbol, entrySlippagePct, exitSlippagePct, totalSlippagePct,
      entrySlippageRs, exitSlippageRs, adjustedTarget, adjustedStopLoss,
      tradeable, reason,
    };
  } else {
    const effectiveEntry = entryPrice * (1 - entrySlippagePct / 100);
    adjustedTarget = targetPrice;
    adjustedStopLoss = stopLoss * (1 + exitSlippagePct / 200);
    const expectedProfit = (effectiveEntry - targetPrice) / effectiveEntry * 100;
    const slippageCost = totalSlippagePct;
    const tradeable = slippageCost < expectedProfit * 0.5;

    const reason = tradeable
      ? `Slippage (${totalSlippagePct.toFixed(2)}%) acceptable`
      : `HIGH SLIPPAGE: ${totalSlippagePct.toFixed(2)}% may consume profit`;

    return {
      symbol, entrySlippagePct, exitSlippagePct, totalSlippagePct,
      entrySlippageRs, exitSlippageRs, adjustedTarget, adjustedStopLoss,
      tradeable, reason,
    };
  }
}

/**
 * Record actual slippage after trade execution for model calibration
 */
export function recordActualSlippage(record: SlippageRecord): void {
  slippageRecords.push(record);

  // Update stats for this symbol
  const symbolRecords = slippageRecords.filter(r => r.symbol === record.symbol);
  const avgActual = symbolRecords.reduce((s, r) => s + r.actualSlippage, 0) / symbolRecords.length;
  const avgEstimated = symbolRecords.reduce((s, r) => s + r.estimatedSlippage, 0) / symbolRecords.length;
  const totalCost = symbolRecords.reduce((s, r) => s + Math.abs(r.actualSlippage - r.estimatedSlippage) * r.quantity, 0);

  const accuracy = avgEstimated > 0
    ? Math.max(0, 1 - Math.abs(avgActual - avgEstimated) / avgEstimated)
    : 0.5;

  slippageStats.set(record.symbol, {
    symbol: record.symbol,
    avgActualSlippagePct: avgActual,
    avgEstimatedSlippagePct: avgEstimated,
    accuracy,
    totalTrades: symbolRecords.length,
    totalSlippageCost: totalCost,
  });
}

/**
 * Get calibrated slippage stats for a symbol
 */
export function getSlippageStats(symbol: string): SlippageStats | null {
  return slippageStats.get(symbol) ?? null;
}

/**
 * Get aggregate slippage report across all symbols
 */
export function getSlippageReport(): {
  totalSymbols: number;
  avgSlippagePct: number;
  totalSlippageCost: number;
  bestSymbols: string[];
  worstSymbols: string[];
} {
  const stats = Array.from(slippageStats.values());
  if (!stats.length) {
    return { totalSymbols: 0, avgSlippagePct: 0, totalSlippageCost: 0, bestSymbols: [], worstSymbols: [] };
  }

  const avgSlippagePct = stats.reduce((s, r) => s + r.avgActualSlippagePct, 0) / stats.length;
  const totalSlippageCost = stats.reduce((s, r) => s + r.totalSlippageCost, 0);

  const sorted = [...stats].sort((a, b) => a.avgActualSlippagePct - b.avgActualSlippagePct);
  return {
    totalSymbols: stats.length,
    avgSlippagePct,
    totalSlippageCost,
    bestSymbols: sorted.slice(0, 5).map(s => s.symbol),
    worstSymbols: sorted.slice(-5).map(s => s.symbol),
  };
}
