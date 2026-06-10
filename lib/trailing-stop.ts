// Trailing Stop-Loss System
// Dynamically moves stop-loss as price moves in favor of the trade
// Locks in profits automatically

export interface TrailingStopConfig {
  initialStopLoss: number;
  entryPrice: number;
  direction: 'BUY' | 'SELL';
  currentPrice: number;
  trailingPercent?: number; // Default 1%
  stepPercent?: number;     // Minimum move to update SL (default 0.3%)
  highestPrice?: number;    // Highest price since entry (for BUY)
  lowestPrice?: number;     // Lowest price since entry (for SELL)
}

export interface TrailingStopResult {
  newStopLoss: number;
  updated: boolean;
  highestPrice: number;
  lowestPrice: number;
  profitLocked: number;
  trailingDistance: number;
}

/**
 * Calculate trailing stop-loss
 * For BUY trades: SL moves up as price increases
 * For SELL trades: SL moves down as price decreases
 */
export function calculateTrailingStop(config: TrailingStopConfig): TrailingStopResult {
  const {
    initialStopLoss,
    entryPrice,
    direction,
    currentPrice,
    trailingPercent = 1.0,
    stepPercent = 0.3,
    highestPrice: prevHighest,
    lowestPrice: prevLowest,
  } = config;

  if (direction === 'BUY') {
    const highest = Math.max(prevHighest ?? entryPrice, currentPrice);
    const trailingStop = highest * (1 - trailingPercent / 100);
    const newSL = Math.max(initialStopLoss, trailingStop);

    // Only update if moved significantly
    const movePercent = ((newSL - initialStopLoss) / entryPrice) * 100;
    const updated = movePercent >= stepPercent && newSL > initialStopLoss;

    return {
      newStopLoss: Math.round(newSL * 100) / 100,
      updated,
      highestPrice: highest,
      lowestPrice: prevLowest ?? currentPrice,
      profitLocked: Math.max(0, newSL - entryPrice),
      trailingDistance: highest - newSL,
    };
  } else {
    // SELL direction
    const lowest = Math.min(prevLowest ?? entryPrice, currentPrice);
    const trailingStop = lowest * (1 + trailingPercent / 100);
    const newSL = Math.min(initialStopLoss, trailingStop);

    const movePercent = ((initialStopLoss - newSL) / entryPrice) * 100;
    const updated = movePercent >= stepPercent && newSL < initialStopLoss;

    return {
      newStopLoss: Math.round(newSL * 100) / 100,
      updated,
      highestPrice: prevHighest ?? currentPrice,
      lowestPrice: lowest,
      profitLocked: Math.max(0, entryPrice - newSL),
      trailingDistance: newSL - lowest,
    };
  }
}

/**
 * Check if trailing stop has been hit
 */
export function isTrailingStopHit(
  direction: 'BUY' | 'SELL',
  currentPrice: number,
  stopLoss: number
): boolean {
  if (direction === 'BUY') return currentPrice <= stopLoss;
  return currentPrice >= stopLoss;
}
