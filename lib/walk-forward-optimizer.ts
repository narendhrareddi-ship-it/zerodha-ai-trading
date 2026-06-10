// Walk-Forward Optimization Engine — Phase 7
// Splits historical data into rolling in-sample/out-of-sample windows,
// optimizes strategy parameters on training data, validates on test data
// to produce overfitting-resistant strategy configurations.

import type { CandleData } from './historical-data';

export interface StrategyParams {
  rsiOversold: number;      // Default: 30
  rsiOverbought: number;    // Default: 70
  rsiPeriod: number;        // Default: 14
  macdFast: number;         // Default: 12
  macdSlow: number;         // Default: 26
  macdSignal: number;       // Default: 9
  bbPeriod: number;         // Default: 20
  bbDeviation: number;      // Default: 2.0
  atrMultiplier: number;    // Default: 3.0 (Supertrend)
  minVolumeRatio: number;   // Default: 1.0
  minConfidence: number;    // Default: 65
}

export interface WalkForwardWindow {
  inSampleStart: number;    // index into candles array
  inSampleEnd: number;
  outSampleStart: number;
  outSampleEnd: number;
  optimizedParams: StrategyParams;
  inSampleMetrics: WalkForwardMetrics;
  outSampleMetrics: WalkForwardMetrics;
}

export interface WalkForwardMetrics {
  totalTrades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalReturn: number;
  avgTradeReturn: number;
}

export interface WalkForwardResult {
  symbol: string;
  strategy: string;
  windows: WalkForwardWindow[];
  overallStability: number;       // 0-1 (consistency of out-of-sample vs in-sample)
  robustnessScore: number;        // 0-100
  recommendedParams: StrategyParams;
  outSampleWinRate: number;       // Average across all windows
  outSampleProfitFactor: number;
  isRobust: boolean;              // true if stability > 0.6
}

const DEFAULT_PARAMS: StrategyParams = {
  rsiOversold: 30,
  rsiOverbought: 70,
  rsiPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  bbPeriod: 20,
  bbDeviation: 2.0,
  atrMultiplier: 3.0,
  minVolumeRatio: 1.0,
  minConfidence: 65,
};

// Parameter grid for optimization
const PARAM_GRID: Partial<Record<keyof StrategyParams, number[]>> = {
  rsiOversold: [25, 30, 35],
  rsiOverbought: [65, 70, 75],
  rsiPeriod: [10, 14, 21],
  bbDeviation: [1.5, 2.0, 2.5],
  atrMultiplier: [2.0, 2.5, 3.0],
};

// Simulate strategy performance on a candle window
function simulateStrategy(
  candles: CandleData[],
  params: StrategyParams,
  strategy: string
): WalkForwardMetrics {
  if (candles.length < 30) {
    return { totalTrades: 0, winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0, totalReturn: 0, avgTradeReturn: 0 };
  }

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  const trades: { pnl: number }[] = [];
  let peakEquity = 1;
  let equity = 1;
  let maxDrawdown = 0;

  // Simple backtesting loop
  for (let i = Math.max(params.rsiPeriod + 1, params.macdSlow + 1, params.bbPeriod); i < closes.length - 1; i++) {
    const slice = closes.slice(0, i + 1);
    const vol = volumes[i] ?? 0;
    const avgVol = volumes.slice(Math.max(0, i - 20), i).reduce((a, b) => a + b, 0) / 20;
    const volRatio = avgVol > 0 ? vol / avgVol : 1;

    if (volRatio < params.minVolumeRatio) continue;

    // RSI
    let gains = 0, losses = 0;
    for (let j = i - params.rsiPeriod + 1; j <= i; j++) {
      const ch = (closes[j] ?? 0) - (closes[j - 1] ?? 0);
      if (ch > 0) gains += ch; else losses += Math.abs(ch);
    }
    const avgGain = gains / params.rsiPeriod;
    const avgLoss = losses / params.rsiPeriod;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    // EMA for MACD
    const k12 = 2 / (params.macdFast + 1);
    const k26 = 2 / (params.macdSlow + 1);
    let ema12 = closes[0] ?? 0, ema26 = closes[0] ?? 0;
    for (let j = 1; j <= i; j++) {
      ema12 = (closes[j] ?? 0) * k12 + ema12 * (1 - k12);
      ema26 = (closes[j] ?? 0) * k26 + ema26 * (1 - k26);
    }
    const macdVal = ema12 - ema26;

    // Bollinger
    const bbSlice = closes.slice(Math.max(0, i - params.bbPeriod + 1), i + 1);
    const bbMid = bbSlice.reduce((a, b) => a + b, 0) / bbSlice.length;
    const bbSd = Math.sqrt(bbSlice.reduce((s, v) => s + Math.pow(v - bbMid, 2), 0) / bbSlice.length);
    const bbLower = bbMid - params.bbDeviation * bbSd;
    const bbUpper = bbMid + params.bbDeviation * bbSd;

    const price = closes[i] ?? 0;
    const nextPrice = closes[i + 1] ?? price;
    let signal: 'BUY' | 'SELL' | null = null;

    if (strategy === 'rsi' && rsi < params.rsiOversold) signal = 'BUY';
    if (strategy === 'rsi' && rsi > params.rsiOverbought) signal = 'SELL';
    if (strategy === 'macd' && macdVal > 0) signal = 'BUY';
    if (strategy === 'macd' && macdVal < 0) signal = 'SELL';
    if (strategy === 'bollinger' && price < bbLower) signal = 'BUY';
    if (strategy === 'bollinger' && price > bbUpper) signal = 'SELL';

    if (signal && price > 0) {
      const returnPct = signal === 'BUY'
        ? (nextPrice - price) / price
        : (price - nextPrice) / price;
      trades.push({ pnl: returnPct });
      equity *= (1 + returnPct);
      peakEquity = Math.max(peakEquity, equity);
      const dd = (peakEquity - equity) / peakEquity;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }
  }

  if (trades.length === 0) {
    return { totalTrades: 0, winRate: 0, profitFactor: 0, sharpeRatio: 0, maxDrawdown: 0, totalReturn: 0, avgTradeReturn: 0 };
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses_arr = trades.filter(t => t.pnl <= 0);
  const winRate = wins.length / trades.length;
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses_arr.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgReturn = trades.reduce((s, t) => s + t.pnl, 0) / trades.length;
  const retStd = Math.sqrt(trades.reduce((s, t) => s + Math.pow(t.pnl - avgReturn, 2), 0) / trades.length);
  const sharpeRatio = retStd > 0 ? (avgReturn / retStd) * Math.sqrt(252) : 0;

  return {
    totalTrades: trades.length,
    winRate,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    totalReturn: equity - 1,
    avgTradeReturn: avgReturn,
  };
}

// Grid search optimization on in-sample window
function optimizeParams(
  candles: CandleData[],
  strategy: string
): { params: StrategyParams; metrics: WalkForwardMetrics } {
  let bestParams = { ...DEFAULT_PARAMS };
  let bestScore = -Infinity;
  let bestMetrics: WalkForwardMetrics = simulateStrategy(candles, DEFAULT_PARAMS, strategy);

  // Simplified grid search (RSI params only for speed)
  for (const rsiOversold of (PARAM_GRID.rsiOversold ?? [30])) {
    for (const rsiOverbought of (PARAM_GRID.rsiOverbought ?? [70])) {
      for (const bbDeviation of (PARAM_GRID.bbDeviation ?? [2.0])) {
        const params = { ...DEFAULT_PARAMS, rsiOversold, rsiOverbought, bbDeviation };
        const metrics = simulateStrategy(candles, params, strategy);
        if (metrics.totalTrades < 3) continue;

        // Composite score: sharpe + profitFactor - maxDrawdown penalty
        const score = metrics.sharpeRatio + metrics.profitFactor * 0.5 - metrics.maxDrawdown * 2;
        if (score > bestScore) {
          bestScore = score;
          bestParams = params;
          bestMetrics = metrics;
        }
      }
    }
  }

  return { params: bestParams, metrics: bestMetrics };
}

/**
 * Run walk-forward optimization for a symbol and strategy.
 */
export function runWalkForwardOptimization(
  symbol: string,
  strategy: string,
  candles: CandleData[],
  inSampleBars: number = 60,
  outSampleBars: number = 20
): WalkForwardResult {
  const windows: WalkForwardWindow[] = [];
  const windowStep = outSampleBars;
  const minBars = inSampleBars + outSampleBars;

  if (candles.length < minBars) {
    return {
      symbol, strategy, windows: [],
      overallStability: 0, robustnessScore: 0,
      recommendedParams: DEFAULT_PARAMS,
      outSampleWinRate: 0, outSampleProfitFactor: 0,
      isRobust: false,
    };
  }

  // Sliding window walk-forward
  let windowStart = 0;
  while (windowStart + minBars <= candles.length) {
    const inSampleEnd = windowStart + inSampleBars;
    const outSampleEnd = Math.min(inSampleEnd + outSampleBars, candles.length);

    const inSampleCandles = candles.slice(windowStart, inSampleEnd);
    const outSampleCandles = candles.slice(inSampleEnd, outSampleEnd);

    const { params, metrics: inSampleMetrics } = optimizeParams(inSampleCandles, strategy);
    const outSampleMetrics = simulateStrategy(outSampleCandles, params, strategy);

    windows.push({
      inSampleStart: windowStart,
      inSampleEnd,
      outSampleStart: inSampleEnd,
      outSampleEnd,
      optimizedParams: params,
      inSampleMetrics,
      outSampleMetrics,
    });

    windowStart += windowStep;
  }

  if (!windows.length) {
    return {
      symbol, strategy, windows,
      overallStability: 0, robustnessScore: 0,
      recommendedParams: DEFAULT_PARAMS,
      outSampleWinRate: 0, outSampleProfitFactor: 0,
      isRobust: false,
    };
  }

  // Calculate stability: ratio of out-sample to in-sample performance
  const validWindows = windows.filter(w => w.inSampleMetrics.totalTrades > 0);
  const stabilityScores = validWindows.map(w => {
    if (w.inSampleMetrics.winRate === 0) return 0;
    return Math.min(1, w.outSampleMetrics.winRate / w.inSampleMetrics.winRate);
  });
  const overallStability = stabilityScores.length > 0
    ? stabilityScores.reduce((a, b) => a + b, 0) / stabilityScores.length
    : 0;

  const outSampleWinRate = windows
    .filter(w => w.outSampleMetrics.totalTrades > 0)
    .reduce((s, w) => s + w.outSampleMetrics.winRate, 0) / Math.max(1, windows.length);

  const outSampleProfitFactor = windows
    .filter(w => w.outSampleMetrics.totalTrades > 0)
    .reduce((s, w) => s + w.outSampleMetrics.profitFactor, 0) / Math.max(1, windows.length);

  const robustnessScore = Math.round(
    overallStability * 40 +
    Math.min(1, outSampleWinRate * 1.5) * 30 +
    Math.min(1, outSampleProfitFactor / 2) * 30
  );

  // Use last window's optimized params as recommended
  const lastWindow = windows[windows.length - 1];
  const recommendedParams = lastWindow?.optimizedParams ?? DEFAULT_PARAMS;

  return {
    symbol, strategy, windows,
    overallStability,
    robustnessScore,
    recommendedParams,
    outSampleWinRate,
    outSampleProfitFactor,
    isRobust: overallStability > 0.6 && outSampleWinRate > 0.5,
  };
}
