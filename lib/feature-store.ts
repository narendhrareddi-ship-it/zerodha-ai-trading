// Centralized Feature Store — Phase 7
// Pre-computes and caches all technical indicators for each symbol.
// Avoids redundant computation across strategies and ML models.

import type { HistoricalPrices } from './historical-data';
import type { MarketDataPoint } from './strategies';

export interface FeatureVector {
  symbol: string;
  timestamp: number;
  // Price features
  price: number;
  priceChange1d: number;
  priceChange5d: number;
  // RSI family
  rsi7: number;
  rsi14: number;
  rsi21: number;
  // MACD
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  // Moving averages
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  // Trend signals
  emaTrend: number;        // -1 to 1 (bearish to bullish)
  maCross9_21: number;     // 1 if 9>21 else -1
  maCross21_50: number;    // 1 if 21>50 else -1
  // ATR & volatility
  atr14: number;
  atrPct: number;          // ATR as % of price
  historicalVol20: number; // 20-day realized volatility
  // Bollinger Bands
  bbandsUpper: number;
  bbandsMiddle: number;
  bbandsLower: number;
  bbandsPercentB: number;  // %B (0=lower band, 1=upper band)
  bbandsBandwidth: number;
  // VWAP
  vwapDeviation: number;   // % deviation from VWAP
  // Volume
  volume: number;
  volumeRatio20d: number;  // Current vol / 20d avg vol
  volumeMA20: number;
  // Stochastic
  stochK: number;
  stochD: number;
  // ADX
  adx14: number;
  // Momentum
  roc5: number;            // Rate of change 5d
  roc10: number;           // Rate of change 10d
  roc20: number;           // Rate of change 20d
  // Computed at fetch time
  source: 'real' | 'synthetic';
  isValid: boolean;        // False if insufficient real data
}

// In-memory cache with TTL
const featureCache = new Map<string, { data: FeatureVector; expiry: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes during market hours

// ── Indicator helpers ──────────────────────────────────────────────────────

function sma(values: number[], period: number): number {
  if (!values?.length || values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(values: number[], period: number): number {
  if (!values?.length || values.length < period) return values[values.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let val = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    val = (values[i] ?? 0) * k + val * (1 - k);
  }
  return val;
}

function stdDev(values: number[], period: number): number {
  if (!values?.length || values.length < period) return 0;
  const slice = values.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / period;
  return Math.sqrt(variance);
}

function rsi(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < 2) return 0;
  let sum = 0;
  const start = Math.max(1, highs.length - period);
  let count = 0;
  for (let i = start; i < highs.length; i++) {
    const tr = Math.max(
      (highs[i] ?? 0) - (lows[i] ?? 0),
      Math.abs((highs[i] ?? 0) - (closes[i - 1] ?? 0)),
      Math.abs((lows[i] ?? 0) - (closes[i - 1] ?? 0))
    );
    sum += tr;
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function stochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod: number = 14,
  dPeriod: number = 3
): { k: number; d: number } {
  if (closes.length < kPeriod) return { k: 50, d: 50 };
  const recentHighs = highs.slice(-kPeriod);
  const recentLows = lows.slice(-kPeriod);
  const highestHigh = Math.max(...recentHighs);
  const lowestLow = Math.min(...recentLows);
  const lastClose = closes[closes.length - 1] ?? 0;
  const range = highestHigh - lowestLow;
  const k = range > 0 ? ((lastClose - lowestLow) / range) * 100 : 50;

  // Simplified D as SMA of last 3 K values
  const d = k; // Would need K history for proper D — simplified here
  return { k, d };
}

function adx(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (highs.length < period + 1) return 25;
  let plusDM = 0, minusDM = 0, trSum = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    const h = highs[i] ?? 0, ph = highs[i - 1] ?? 0;
    const l = lows[i] ?? 0, pl = lows[i - 1] ?? 0;
    const pc = closes[i - 1] ?? 0;
    const upMove = h - ph;
    const downMove = pl - l;
    plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
    trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  if (trSum === 0) return 25;
  const plusDI = (plusDM / trSum) * 100;
  const minusDI = (minusDM / trSum) * 100;
  const diSum = plusDI + minusDI;
  if (diSum === 0) return 25;
  return (Math.abs(plusDI - minusDI) / diSum) * 100;
}

// ── Feature computation ────────────────────────────────────────────────────

export function computeFeatures(
  stock: MarketDataPoint,
  hist: HistoricalPrices
): FeatureVector {
  const closes = hist.closes;
  const highs = hist.highs;
  const lows = hist.lows;
  const volumes = hist.volumes;
  const price = stock.lastPrice;

  const isReal = hist.source !== 'synthetic';
  const isValid = closes.length >= 20 && isReal;

  // RSI family
  const rsi14 = rsi(closes, 14);
  const rsi7 = rsi(closes, 7);
  const rsi21 = rsi(closes, 21);

  // MACD
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12 - ema26;
  const macdSignal = ema(closes.map((_, i) => {
    const s = closes.slice(0, i + 1);
    return ema(s, 12) - ema(s, 26);
  }), 9);
  const macdHistogram = macdLine - macdSignal;

  // EMAs
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, Math.min(50, closes.length));
  const ema200 = ema(closes, Math.min(200, closes.length));

  // Trend
  const emaTrend = ((ema9 - ema200) / (price || 1));
  const maCross9_21 = ema9 >= ema21 ? 1 : -1;
  const maCross21_50 = ema21 >= ema50 ? 1 : -1;

  // ATR & volatility
  const atr14 = atr(highs, lows, closes, 14);
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0;
  const historicalVol20 = stdDev(closes, Math.min(20, closes.length));

  // Bollinger Bands (20, 2)
  const bbandsMiddle = sma(closes, 20);
  const sd = stdDev(closes, 20);
  const bbandsUpper = bbandsMiddle + 2 * sd;
  const bbandsLower = bbandsMiddle - 2 * sd;
  const bandwidth = bbandsUpper - bbandsLower;
  const bbandsPercentB = bandwidth > 0 ? (price - bbandsLower) / bandwidth : 0.5;
  const bbandsBandwidth = price > 0 ? (bandwidth / price) * 100 : 0;

  // VWAP deviation
  const vwap = (stock.high + stock.low + price) / 3;
  const vwapDeviation = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0;

  // Volume
  const volumeMA20 = volumes.length >= 20 ? sma(volumes, 20) : (stock.volume || 0);
  const volumeRatio20d = volumeMA20 > 0 ? stock.volume / volumeMA20 : 1;

  // Stochastic
  const { k: stochK, d: stochD } = stochastic(highs, lows, closes);

  // ADX
  const adx14 = adx(highs, lows, closes, 14);

  // Rate of change
  const roc = (period: number): number => {
    if (closes.length < period) return 0;
    const past = closes[closes.length - period] ?? 0;
    return past > 0 ? ((price - past) / past) * 100 : 0;
  };

  // Price changes
  const priceChange1d = closes.length >= 2
    ? ((closes[closes.length - 1] ?? 0) - (closes[closes.length - 2] ?? 0)) / ((closes[closes.length - 2] ?? 1))
    : (stock.changePct ?? 0) / 100;
  const priceChange5d = closes.length >= 5
    ? ((closes[closes.length - 1] ?? 0) - (closes[closes.length - 5] ?? 0)) / ((closes[closes.length - 5] ?? 1))
    : priceChange1d * 5;

  return {
    symbol: stock.symbol,
    timestamp: Date.now(),
    price,
    priceChange1d,
    priceChange5d,
    rsi7,
    rsi14,
    rsi21,
    macdLine,
    macdSignal,
    macdHistogram,
    ema9,
    ema21,
    ema50,
    ema200,
    emaTrend,
    maCross9_21,
    maCross21_50,
    atr14,
    atrPct,
    historicalVol20,
    bbandsUpper,
    bbandsMiddle,
    bbandsLower,
    bbandsPercentB,
    bbandsBandwidth,
    vwapDeviation,
    volume: stock.volume,
    volumeRatio20d,
    volumeMA20,
    stochK,
    stochD,
    adx14,
    roc5: roc(5),
    roc10: roc(10),
    roc20: roc(20),
    source: isReal ? 'real' : 'synthetic',
    isValid,
  };
}

// ── Cache management ───────────────────────────────────────────────────────

export function getCachedFeatures(symbol: string): FeatureVector | null {
  const entry = featureCache.get(symbol);
  if (entry && entry.expiry > Date.now()) return entry.data;
  if (entry) featureCache.delete(symbol);
  return null;
}

export function setCachedFeatures(symbol: string, features: FeatureVector): void {
  if (featureCache.size > 500) {
    const oldest = featureCache.keys().next().value;
    if (oldest) featureCache.delete(oldest);
  }
  featureCache.set(symbol, { data: features, expiry: Date.now() + CACHE_TTL });
}

// Batch compute features for all symbols
export async function computeBatchFeatures(
  stocks: MarketDataPoint[],
  histMap: Map<string, HistoricalPrices>
): Promise<Map<string, FeatureVector>> {
  const result = new Map<string, FeatureVector>();
  for (const stock of stocks) {
    const cached = getCachedFeatures(stock.symbol);
    if (cached) {
      result.set(stock.symbol, cached);
      continue;
    }
    const hist = histMap.get(stock.symbol);
    if (!hist) continue;
    const features = computeFeatures(stock, hist);
    setCachedFeatures(stock.symbol, features);
    result.set(stock.symbol, features);
  }
  return result;
}

export function clearFeatureCache(): void {
  featureCache.clear();
}
