// Market Breadth Analysis Engine — Phase 8
// Analyzes market-wide internals: advance/decline, volume breadth,
// McClellan Oscillator, and breadth thrust to determine macro market health.

import type { MarketDataPoint } from './strategies';

export interface MarketBreadthData {
  advancing: number;
  declining: number;
  unchanged: number;
  total: number;
  advanceDeclineRatio: number;
  advanceDeclineLine: number;    // Cumulative A-D line
  upVolume: number;
  downVolume: number;
  upDownVolumeRatio: number;
  new52WHigh: number;
  new52WLow: number;
  // McClellan
  mclellanOscillator: number;
  mclellanSummationIndex: number;
  // Breadth momentum
  percentAboveEMA20: number;
  percentAboveEMA50: number;
  breadthThrust: boolean;        // 10-day breadth > 0.615 = momentum explosion
  // Composite score
  bullishScore: number;          // 0-100
  bearishScore: number;
  signal: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH';
  description: string;
}

// In-memory state for cumulative indicators
const breadthState = {
  adLine: 0,
  mclellanSummation: 0,
  ema19Issues: 0,   // 19-period EMA of A-D net
  ema39Issues: 0,   // 39-period EMA of A-D net
  lastUpdate: 0,
  breadthHistory: [] as number[], // Last 10 days of (advances/total)
};

function updateEMA(prev: number, current: number, period: number): number {
  const k = 2 / (period + 1);
  return current * k + prev * (1 - k);
}

/**
 * Analyze market breadth from current market data
 */
export function analyzeMarketBreadth(
  stocks: MarketDataPoint[],
  priceHistory?: Map<string, { closes: number[]; volumes: number[] }>
): MarketBreadthData {
  if (!stocks.length) {
    return createNeutralBreadth();
  }

  // Advance/Decline calculation
  let advancing = 0, declining = 0, unchanged = 0;
  let upVolume = 0, downVolume = 0;
  let new52WHigh = 0, new52WLow = 0;
  let aboveEMA20 = 0, aboveEMA50 = 0;

  for (const stock of stocks) {
    const chg = stock.changePct ?? 0;
    const vol = stock.volume ?? 0;

    if (chg > 0.2) {
      advancing++;
      upVolume += vol;
    } else if (chg < -0.2) {
      declining++;
      downVolume += vol;
    } else {
      unchanged++;
    }

    // Historical checks if price history available
    if (priceHistory) {
      const hist = priceHistory.get(stock.symbol);
      if (hist && hist.closes.length >= 50) {
        const ema20 = computeEMA(hist.closes, 20);
        const ema50 = computeEMA(hist.closes, 50);
        if (stock.lastPrice > ema20) aboveEMA20++;
        if (stock.lastPrice > ema50) aboveEMA50++;

        // 52-week high/low (approximate from available history)
        const high52w = Math.max(...hist.closes.slice(-252));
        const low52w = Math.min(...hist.closes.slice(-252));
        const threshold = 0.02; // Within 2% counts
        if (stock.lastPrice >= high52w * (1 - threshold)) new52WHigh++;
        if (stock.lastPrice <= low52w * (1 + threshold)) new52WLow++;
      }
    }
  }

  const total = stocks.length;
  const adNet = advancing - declining;
  const adRatio = declining > 0 ? advancing / declining : advancing > 0 ? 99 : 1;

  // Update cumulative A-D line
  breadthState.adLine += adNet;

  // McClellan Oscillator (10% trend & 5% trend of A-D net)
  breadthState.ema19Issues = updateEMA(breadthState.ema19Issues, adNet, 19);
  breadthState.ema39Issues = updateEMA(breadthState.ema39Issues, adNet, 39);
  const mclellanOscillator = breadthState.ema19Issues - breadthState.ema39Issues;
  breadthState.mclellanSummation += mclellanOscillator;

  // Breadth thrust check (Zweig)
  const advanceRatio = total > 0 ? advancing / total : 0;
  breadthState.breadthHistory = [...breadthState.breadthHistory.slice(-9), advanceRatio];
  const breadthThrust = breadthState.breadthHistory.length >= 10 &&
    breadthState.breadthHistory.every(r => r > 0) &&
    (breadthState.breadthHistory.reduce((a, b) => a + b, 0) / breadthState.breadthHistory.length) > 0.615;

  // Computed percentages
  const percentAboveEMA20 = total > 0 ? (aboveEMA20 / total) * 100 : 50;
  const percentAboveEMA50 = total > 0 ? (aboveEMA50 / total) * 100 : 50;
  const upDownVolumeRatio = downVolume > 0 ? upVolume / downVolume : upVolume > 0 ? 99 : 1;

  // Composite bullish score (0-100)
  let bullishScore = 50;
  bullishScore += Math.min(20, (adRatio - 1) * 10);                    // A/D ratio
  bullishScore += Math.min(15, upDownVolumeRatio * 3);                  // Volume ratio
  bullishScore += (percentAboveEMA20 - 50) * 0.3;                       // EMA breadth
  bullishScore += mclellanOscillator > 0 ? 10 : -10;                    // McClellan
  bullishScore += new52WHigh > new52WLow ? 5 : -5;                      // 52W H/L
  if (breadthThrust) bullishScore += 15;
  bullishScore = Math.min(100, Math.max(0, bullishScore));
  const bearishScore = 100 - bullishScore;

  // Signal classification
  let signal: MarketBreadthData['signal'];
  if (bullishScore >= 75) signal = 'VERY_BULLISH';
  else if (bullishScore >= 60) signal = 'BULLISH';
  else if (bullishScore >= 40) signal = 'NEUTRAL';
  else if (bullishScore >= 25) signal = 'BEARISH';
  else signal = 'VERY_BEARISH';

  const description = buildBreadthDescription(signal, advancing, declining, adRatio, upDownVolumeRatio, new52WHigh, new52WLow, breadthThrust);

  breadthState.lastUpdate = Date.now();

  return {
    advancing, declining, unchanged, total,
    advanceDeclineRatio: Math.round(adRatio * 100) / 100,
    advanceDeclineLine: Math.round(breadthState.adLine),
    upVolume, downVolume,
    upDownVolumeRatio: Math.round(upDownVolumeRatio * 100) / 100,
    new52WHigh, new52WLow,
    mclellanOscillator: Math.round(mclellanOscillator * 10) / 10,
    mclellanSummationIndex: Math.round(breadthState.mclellanSummation * 10) / 10,
    percentAboveEMA20: Math.round(percentAboveEMA20),
    percentAboveEMA50: Math.round(percentAboveEMA50),
    breadthThrust,
    bullishScore: Math.round(bullishScore),
    bearishScore: Math.round(bearishScore),
    signal,
    description,
  };
}

function createNeutralBreadth(): MarketBreadthData {
  return {
    advancing: 0, declining: 0, unchanged: 0, total: 0,
    advanceDeclineRatio: 1, advanceDeclineLine: 0,
    upVolume: 0, downVolume: 0, upDownVolumeRatio: 1,
    new52WHigh: 0, new52WLow: 0,
    mclellanOscillator: 0, mclellanSummationIndex: 0,
    percentAboveEMA20: 50, percentAboveEMA50: 50,
    breadthThrust: false,
    bullishScore: 50, bearishScore: 50,
    signal: 'NEUTRAL',
    description: 'Insufficient data for breadth analysis',
  };
}

function buildBreadthDescription(
  signal: string, advancing: number, declining: number,
  adRatio: number, uvRatio: number, high52w: number, low52w: number, thrust: boolean
): string {
  const parts: string[] = [];
  parts.push(`${advancing} advancing vs ${declining} declining (A/D ${adRatio.toFixed(2)})`);
  parts.push(`Up/Down volume ${uvRatio.toFixed(2)}x`);
  if (high52w > 0 || low52w > 0) parts.push(`${high52w} new highs, ${low52w} new lows`);
  if (thrust) parts.push('⚡ BREADTH THRUST detected — strong momentum signal!');
  parts.push(`Signal: ${signal}`);
  return parts.join(' | ');
}

function computeEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let val = closes[0] ?? 0;
  for (let i = 1; i < closes.length; i++) {
    val = (closes[i] ?? 0) * k + val * (1 - k);
  }
  return val;
}

/**
 * Get position size multiplier based on breadth
 */
export function getBreadthSizingMultiplier(breadth: MarketBreadthData): number {
  if (breadth.signal === 'VERY_BEARISH') return 0;        // No new positions
  if (breadth.signal === 'BEARISH') return 0.5;           // Half size
  if (breadth.signal === 'NEUTRAL') return 0.75;          // Slightly reduced
  if (breadth.signal === 'BULLISH') return 1.0;           // Normal
  if (breadth.signal === 'VERY_BULLISH') return 1.25;     // Slightly increased (capped by other controls)
  return 1.0;
}
