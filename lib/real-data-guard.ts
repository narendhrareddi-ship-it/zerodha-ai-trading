// Real-Data Guard — Phase 7
// Enforces REAL_DATA_ONLY mode: blocks trades if synthetic data is detected.
// Provides a typed guard result for every data validation checkpoint.

import type { HistoricalPrices } from './historical-data';

export interface DataGuardResult {
  isReal: boolean;
  source: string;
  blocked: boolean;
  reason: string;
  symbolsBlocked: string[];
  symbolsAllowed: string[];
  realDataPercent: number;
}

export interface DataQualityReport {
  totalSymbols: number;
  realDataSymbols: number;
  syntheticSymbols: string[];
  realDataPercent: number;
  sufficientBars: boolean;
  minBarsRequired: number;
  oldestData: number | null; // epoch ms
  qualityGrade: 'A' | 'B' | 'C' | 'F';
}

// Minimum bars required for institutional-grade analysis
const MIN_BARS_REQUIRED = 30;
const MIN_REAL_DATA_PCT = 60; // At least 60% of symbols must have real data

/**
 * Validate a single symbol's data quality
 */
export function validateSymbolData(
  symbol: string,
  hist: HistoricalPrices,
  realDataOnly: boolean = false
): { allowed: boolean; reason: string } {
  if (hist.source === 'synthetic') {
    if (realDataOnly) {
      return { allowed: false, reason: `${symbol}: Synthetic data blocked in REAL_DATA_ONLY mode` };
    }
    return { allowed: true, reason: `${symbol}: Synthetic data (fallback mode)` };
  }

  if (hist.closes.length < MIN_BARS_REQUIRED) {
    return {
      allowed: !realDataOnly,
      reason: `${symbol}: Insufficient bars (${hist.closes.length}/${MIN_BARS_REQUIRED} required)`,
    };
  }

  return { allowed: true, reason: `${symbol}: Real data OK (${hist.closes.length} bars, source: ${hist.source})` };
}

/**
 * Run the data guard on a full batch of symbols
 */
export function runDataGuard(
  histMap: Map<string, HistoricalPrices>,
  realDataOnly: boolean = false
): DataGuardResult {
  const symbolsAllowed: string[] = [];
  const symbolsBlocked: string[] = [];
  const reasons: string[] = [];

  let realCount = 0;
  const total = histMap.size;

  for (const [symbol, hist] of histMap.entries()) {
    const { allowed, reason } = validateSymbolData(symbol, hist, realDataOnly);
    if (hist.source !== 'synthetic') realCount++;

    if (allowed) {
      symbolsAllowed.push(symbol);
    } else {
      symbolsBlocked.push(symbol);
      reasons.push(reason);
    }
  }

  const realDataPercent = total > 0 ? (realCount / total) * 100 : 0;
  const isReal = realDataPercent >= MIN_REAL_DATA_PCT;

  // Block entire session if real data % is below threshold in strict mode
  const sessionBlocked = realDataOnly && !isReal;

  return {
    isReal,
    source: isReal ? 'real' : 'synthetic/mixed',
    blocked: sessionBlocked,
    reason: sessionBlocked
      ? `Real data below threshold: ${realDataPercent.toFixed(0)}% (need ${MIN_REAL_DATA_PCT}%)`
      : `Data guard passed: ${realDataPercent.toFixed(0)}% real data`,
    symbolsBlocked,
    symbolsAllowed,
    realDataPercent,
  };
}

/**
 * Generate a data quality report for the dashboard
 */
export function generateDataQualityReport(
  histMap: Map<string, HistoricalPrices>
): DataQualityReport {
  const syntheticSymbols: string[] = [];
  let realCount = 0;
  let minBars = Infinity;
  let oldestData: number | null = null;

  for (const [symbol, hist] of histMap.entries()) {
    if (hist.source === 'synthetic') {
      syntheticSymbols.push(symbol);
    } else {
      realCount++;
      if (hist.closes.length < minBars) minBars = hist.closes.length;
      // Try to get oldest candle timestamp
      const firstCandle = hist.candles[0];
      if (firstCandle && (oldestData === null || firstCandle.timestamp < oldestData)) {
        oldestData = firstCandle.timestamp;
      }
    }
  }

  const total = histMap.size;
  const realDataPercent = total > 0 ? (realCount / total) * 100 : 0;
  const sufficientBars = minBars !== Infinity && minBars >= MIN_BARS_REQUIRED;

  let qualityGrade: 'A' | 'B' | 'C' | 'F';
  if (realDataPercent >= 90 && sufficientBars) qualityGrade = 'A';
  else if (realDataPercent >= 70) qualityGrade = 'B';
  else if (realDataPercent >= 50) qualityGrade = 'C';
  else qualityGrade = 'F';

  return {
    totalSymbols: total,
    realDataSymbols: realCount,
    syntheticSymbols,
    realDataPercent,
    sufficientBars,
    minBarsRequired: MIN_BARS_REQUIRED,
    oldestData,
    qualityGrade,
  };
}

/**
 * Check if the trading session should proceed based on data quality
 */
export function shouldBlockTrading(
  histMap: Map<string, HistoricalPrices>,
  realDataOnly: boolean
): { blocked: boolean; reason: string } {
  if (!realDataOnly) return { blocked: false, reason: 'Real-data-only mode is disabled' };

  const guard = runDataGuard(histMap, true);
  if (guard.blocked) {
    return { blocked: true, reason: guard.reason };
  }
  return { blocked: false, reason: guard.reason };
}
