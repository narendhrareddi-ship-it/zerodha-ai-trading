// AI Trading Strategies - Full Technical Indicator Suite
// Uses real historical data from Fyers/Kite when available, synthetic fallback
import { TradeSignal } from './trading-engine';
import type { HistoricalPrices } from './historical-data';

export interface MarketDataPoint {
  symbol: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
}

// Helper: Simple Moving Average
function sma(values: number[], period: number): number {
  if (!values?.length || values.length < period) return 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Helper: Exponential Moving Average
function ema(values: number[], period: number): number {
  if (!values?.length || values.length < period) return 0;
  const k = 2 / (period + 1);
  let emVal = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    emVal = (values[i] ?? 0) * k + emVal * (1 - k);
  }
  return emVal;
}

// Helper: Standard Deviation
function stdDev(values: number[], period: number): number {
  if (!values?.length || values.length < period) return 0;
  const slice = values.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / period;
  return Math.sqrt(variance);
}

// Get price history for a stock from pre-fetched historical data or fallback
function getPriceHistory(
  stock: MarketDataPoint,
  historyMap: Map<string, HistoricalPrices> | undefined,
  minBars: number = 20
): number[] {
  // Try real historical data first
  if (historyMap) {
    const hist = historyMap.get(stock.symbol);
    if (hist && hist.closes?.length >= minBars) {
      return hist.closes;
    }
  }

  // Fallback: generate synthetic price history from single OHLC bar
  const prices: number[] = [];
  const range = (stock?.high ?? 0) - (stock?.low ?? 0);
  const base = stock?.open ?? stock?.close ?? stock?.lastPrice ?? 0;
  if (base <= 0) return [];
  // Use deterministic seed for consistency
  const seed = (stock?.symbol ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  for (let i = 0; i < minBars; i++) {
    const factor = i / minBars;
    const noise = (Math.sin(seed * 0.1 + i * 1.7) * 0.3 + Math.cos(seed * 0.05 + i * 0.9) * 0.2) * range;
    const price = base + (stock.lastPrice - base) * factor + noise;
    prices.push(Math.max(stock?.low ?? 0, Math.min(stock?.high ?? 0, price)));
  }
  prices.push(stock?.lastPrice ?? 0);
  return prices;
}

// Get highs/lows history for ATR-based strategies
function getHighLowHistory(
  stock: MarketDataPoint,
  historyMap: Map<string, HistoricalPrices> | undefined,
  minBars: number = 14
): { highs: number[]; lows: number[] } {
  if (historyMap) {
    const hist = historyMap.get(stock.symbol);
    if (hist && hist.highs?.length >= minBars) {
      return { highs: hist.highs, lows: hist.lows };
    }
  }
  // Fallback: approximate from single bar
  const highs: number[] = [];
  const lows: number[] = [];
  const range = (stock?.high ?? 0) - (stock?.low ?? 0);
  const seed = (stock?.symbol ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  for (let i = 0; i < minBars; i++) {
    const noise = Math.sin(seed * 0.1 + i * 1.5) * range * 0.3;
    const mid = stock.lastPrice + noise;
    highs.push(mid + range * 0.4);
    lows.push(mid - range * 0.4);
  }
  return { highs, lows };
}

// Calculate proper RSI from close price series
function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 1) return 50; // neutral default
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate ATR from highs/lows/closes
function calculateATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
  if (highs.length < period + 1) {
    // Fallback: simple high-low range
    const lastHigh = highs[highs.length - 1] ?? 0;
    const lastLow = lows[lows.length - 1] ?? 0;
    return (lastHigh - lastLow) * 0.7;
  }
  let atrSum = 0;
  const start = Math.max(1, highs.length - period);
  for (let i = start; i < highs.length; i++) {
    const tr = Math.max(
      (highs[i] ?? 0) - (lows[i] ?? 0),
      Math.abs((highs[i] ?? 0) - (closes[i - 1] ?? 0)),
      Math.abs((lows[i] ?? 0) - (closes[i - 1] ?? 0))
    );
    atrSum += tr;
  }
  return atrSum / period;
}

// ===== Strategy 1: Momentum Trading =====
export function momentumStrategy(data: MarketDataPoint[]): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const changePct = stock?.changePct ?? 0;
    const price = stock?.lastPrice ?? 0;
    const volume = stock?.volume ?? 0;
    if (price <= 0) continue;

    if (changePct > 1.5 && volume > 100000) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'MOMENTUM',
        confidence: Math.min(90, 60 + Math.abs(changePct) * 10),
        entryPrice: price, stopLoss: price * 0.99, target: price * 1.02, quantity: 0,
        reason: `Strong upward momentum: ${changePct?.toFixed?.(2)}% with ${(volume / 1000)?.toFixed?.(0)}K volume`,
      });
    }
    if (changePct < -1.5 && volume > 100000) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'MOMENTUM',
        confidence: Math.min(90, 60 + Math.abs(changePct) * 10),
        entryPrice: price, stopLoss: price * 1.01, target: price * 0.98, quantity: 0,
        reason: `Strong downward momentum: ${changePct?.toFixed?.(2)}% with ${(volume / 1000)?.toFixed?.(0)}K volume`,
      });
    }
  }
  return signals;
}

// ===== Strategy 2: RSI-Based Entries (Real RSI from historical data) =====
export function rsiStrategy(data: MarketDataPoint[], historyMap?: Map<string, HistoricalPrices>): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    const high = stock?.high ?? 0;
    const low = stock?.low ?? 0;
    if (price <= 0 || high <= low) continue;

    // Calculate real RSI from historical close prices
    const closes = getPriceHistory(stock, historyMap, 20);
    const rsi = calculateRSI(closes, 14);

    if (rsi < 30 && price > (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'RSI',
        confidence: Math.min(85, 70 - rsi),
        entryPrice: price, stopLoss: low * 0.995, target: price * 1.015, quantity: 0,
        reason: `Oversold bounce, RSI=${rsi?.toFixed?.(1)}, price recovering from low`,
      });
    }
    if (rsi > 70 && price < (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'RSI',
        confidence: Math.min(85, rsi - 30),
        entryPrice: price, stopLoss: high * 1.005, target: price * 0.985, quantity: 0,
        reason: `Overbought reversal, RSI=${rsi?.toFixed?.(1)}, price declining from high`,
      });
    }
  }
  return signals;
}

// ===== Strategy 3: MACD Crossover (Real historical data) =====
export function macdStrategy(data: MarketDataPoint[], historyMap?: Map<string, HistoricalPrices>): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    if (price <= 0) continue;
    const history = getPriceHistory(stock, historyMap, 30);
    if (history.length < 26) continue;

    const ema12 = ema(history, 12);
    const ema26 = ema(history, 26);
    const macdLine = ema12 - ema26;
    const macdPct = (macdLine / price) * 100;

    // Previous MACD for crossover detection
    const prevHistory = history.slice(0, -1);
    const prevEma12 = ema(prevHistory, 12);
    const prevEma26 = ema(prevHistory, 26);
    const prevMacd = prevEma12 - prevEma26;

    // Bullish crossover: MACD crosses above signal
    if (macdLine > 0 && prevMacd <= 0 && Math.abs(macdPct) > 0.1) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'MACD',
        confidence: Math.min(85, 65 + Math.abs(macdPct) * 15),
        entryPrice: price, stopLoss: price * 0.99, target: price * 1.02, quantity: 0,
        reason: `MACD bullish crossover, MACD: ${macdLine.toFixed(2)}, signal strength: ${macdPct.toFixed(2)}%`,
      });
    }
    // Bearish crossover
    if (macdLine < 0 && prevMacd >= 0 && Math.abs(macdPct) > 0.1) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'MACD',
        confidence: Math.min(85, 65 + Math.abs(macdPct) * 15),
        entryPrice: price, stopLoss: price * 1.01, target: price * 0.98, quantity: 0,
        reason: `MACD bearish crossover, MACD: ${macdLine.toFixed(2)}, signal strength: ${macdPct.toFixed(2)}%`,
      });
    }
  }
  return signals;
}

// ===== Strategy 4: Bollinger Bands (Real historical data) =====
export function bollingerBandsStrategy(data: MarketDataPoint[], historyMap?: Map<string, HistoricalPrices>): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    if (price <= 0) continue;
    const history = getPriceHistory(stock, historyMap, 20);
    if (history.length < 20) continue;

    const middle = sma(history, 20);
    const sd = stdDev(history, 20);
    const upper = middle + 2 * sd;
    const lower = middle - 2 * sd;
    const bandwidth = upper - lower;
    if (bandwidth <= 0) continue;

    const percentB = (price - lower) / bandwidth;

    // Price near lower band - potential bounce
    if (percentB < 0.1 && price > (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'BOLLINGER',
        confidence: Math.min(85, 70 + (1 - percentB) * 15),
        entryPrice: price, stopLoss: lower * 0.998, target: middle, quantity: 0,
        reason: `Price near lower Bollinger Band (%B: ${(percentB * 100).toFixed(1)}%), bounce expected to mid: ₹${middle.toFixed(2)}`,
      });
    }
    // Price near upper band - potential reversal
    if (percentB > 0.9 && price < (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'BOLLINGER',
        confidence: Math.min(85, 70 + percentB * 15),
        entryPrice: price, stopLoss: upper * 1.002, target: middle, quantity: 0,
        reason: `Price near upper Bollinger Band (%B: ${(percentB * 100).toFixed(1)}%), reversal to mid: ₹${middle.toFixed(2)}`,
      });
    }
  }
  return signals;
}

// ===== Strategy 5: Supertrend (Real ATR from historical data) =====
export function supertrendStrategy(data: MarketDataPoint[], historyMap?: Map<string, HistoricalPrices>): TradeSignal[] {
  const signals: TradeSignal[] = [];
  const multiplier = 3;

  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    const high = stock?.high ?? 0;
    const low = stock?.low ?? 0;
    if (price <= 0 || high <= low) continue;

    // Calculate real ATR from historical high/low/close data
    const closes = getPriceHistory(stock, historyMap, 20);
    const { highs, lows } = getHighLowHistory(stock, historyMap, 20);
    const atr = calculateATR(highs, lows, closes, 14);
    const hl2 = (high + low) / 2;
    const upperBand = hl2 + multiplier * atr;
    const lowerBand = hl2 - multiplier * atr;

    // Trend determination: price above upper = bullish breakout; below lower = bearish
    const distFromUpper = (upperBand - price) / atr;
    const distFromLower = (price - lowerBand) / atr;

    if (price > hl2 && (stock?.changePct ?? 0) > 0.5 && distFromUpper < 1) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'SUPERTREND',
        confidence: Math.min(80, 60 + (1 - distFromUpper) * 20),
        entryPrice: price, stopLoss: lowerBand, target: price + 1.5 * atr, quantity: 0,
        reason: `Supertrend bullish, price above HL2 (₹${hl2.toFixed(2)}), support at ₹${lowerBand.toFixed(2)}`,
      });
    }
    if (price < hl2 && (stock?.changePct ?? 0) < -0.5 && distFromLower < 1) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'SUPERTREND',
        confidence: Math.min(80, 60 + (1 - distFromLower) * 20),
        entryPrice: price, stopLoss: upperBand, target: price - 1.5 * atr, quantity: 0,
        reason: `Supertrend bearish, price below HL2 (₹${hl2.toFixed(2)}), resistance at ₹${upperBand.toFixed(2)}`,
      });
    }
  }
  return signals;
}

// ===== Strategy 6: VWAP (Volume Weighted Average Price) =====
export function vwapStrategy(data: MarketDataPoint[]): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    const volume = stock?.volume ?? 0;
    const high = stock?.high ?? 0;
    const low = stock?.low ?? 0;
    if (price <= 0 || volume <= 0) continue;

    // VWAP approximation: typical price (H+L+C)/3 weighted by volume
    const vwap = ((high + low + price) / 3);
    const deviation = ((price - vwap) / vwap) * 100;

    // Price significantly below VWAP - buying opportunity
    if (deviation < -0.5 && volume > 200000 && price > (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'VWAP',
        confidence: Math.min(80, 60 + Math.abs(deviation) * 10),
        entryPrice: price, stopLoss: price * 0.99, target: vwap, quantity: 0,
        reason: `Price ${Math.abs(deviation).toFixed(2)}% below VWAP (₹${vwap.toFixed(2)}), mean reversion expected`,
      });
    }
    // Price significantly above VWAP - shorting opportunity
    if (deviation > 0.5 && volume > 200000 && price < (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'VWAP',
        confidence: Math.min(80, 60 + Math.abs(deviation) * 10),
        entryPrice: price, stopLoss: price * 1.01, target: vwap, quantity: 0,
        reason: `Price ${deviation.toFixed(2)}% above VWAP (₹${vwap.toFixed(2)}), mean reversion expected`,
      });
    }
  }
  return signals;
}

// ===== Strategy 7: EMA Crossover (Real historical data) =====
export function emaCrossoverStrategy(data: MarketDataPoint[], historyMap?: Map<string, HistoricalPrices>): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    if (price <= 0) continue;
    const history = getPriceHistory(stock, historyMap, 25);
    if (history.length < 20) continue;

    const ema9 = ema(history, 9);
    const ema21 = ema(history, 21);
    const crossStrength = ((ema9 - ema21) / price) * 100;

    // Previous values for crossover detection
    const prevHistory = history.slice(0, -1);
    const prevEma9 = ema(prevHistory, 9);
    const prevEma21 = ema(prevHistory, 21);

    // Golden cross: short EMA crosses above long EMA
    if (ema9 > ema21 && prevEma9 <= prevEma21 && crossStrength > 0.05) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'EMA_CROSS',
        confidence: Math.min(85, 65 + crossStrength * 20),
        entryPrice: price, stopLoss: price * 0.99, target: price * 1.02, quantity: 0,
        reason: `EMA 9/21 golden cross, strength: ${crossStrength.toFixed(3)}%, EMA9: ₹${ema9.toFixed(2)}`,
      });
    }
    // Death cross: short EMA crosses below long EMA
    if (ema9 < ema21 && prevEma9 >= prevEma21 && Math.abs(crossStrength) > 0.05) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'EMA_CROSS',
        confidence: Math.min(85, 65 + Math.abs(crossStrength) * 20),
        entryPrice: price, stopLoss: price * 1.01, target: price * 0.98, quantity: 0,
        reason: `EMA 9/21 death cross, strength: ${Math.abs(crossStrength).toFixed(3)}%, EMA9: ₹${ema9.toFixed(2)}`,
      });
    }
  }
  return signals;
}

// ===== Strategy 8: News Sentiment (FinBERT + LLM-powered) =====
// Uses FinBERT (Hugging Face) for financial sentiment classification,
// then LLM for symbol-to-signal mapping
export async function newsSentimentStrategy(
  newsHeadlines: string[],
  stockData: MarketDataPoint[]
): Promise<TradeSignal[]> {
  if (!newsHeadlines?.length || !stockData?.length) return [];
  try {
    // Step 1: FinBERT sentiment analysis on all headlines
    const { analyzeFinBERTSentiment } = await import('./finbert');
    const sentimentResults = await analyzeFinBERTSentiment(newsHeadlines);
    
    // Filter headlines with strong sentiment (not neutral)
    const strongSentiments = sentimentResults.filter(
      r => r.label !== 'neutral' && r.score > 0.6
    );
    
    if (!strongSentiments.length) return [];

    // Step 2: Use LLM to map sentiment-tagged headlines to specific stock signals
    const taggedHeadlines = strongSentiments.map(
      s => `[${s.label.toUpperCase()} ${Math.round(s.score * 100)}%] ${s.text}`
    );

    const { getLLMCompletion } = await import('./llm');
    const content = await getLLMCompletion({
      messages: [
        {
          role: 'system',
          content: `You are a financial news analyst for Indian stock markets. Headlines are pre-tagged with FinBERT sentiment [POSITIVE/NEGATIVE XX%]. Map them to trading signals for available stocks. Return JSON only:\n{"signals": [{"symbol": "RELIANCE", "direction": "BUY", "confidence": 75, "reason": "..."}]}\nPOSITIVE sentiment = BUY, NEGATIVE = SELL. Only include signals with confidence > 60. Available stocks: ${stockData?.map?.((s) => s?.symbol)?.join?.(', ')}.\nRespond with raw JSON only, no markdown.`,
        },
        { role: 'user', content: `FinBERT-analyzed headlines:\n${taggedHeadlines?.join?.('\n')}` },
      ],
      maxTokens: 1000,
      jsonMode: true,
    });
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { return []; }
    const signals: TradeSignal[] = [];
    for (const sig of (parsed?.signals ?? [])) {
      const match = stockData?.find?.((s) => s?.symbol?.includes?.(sig?.symbol ?? '__NOMATCH__'));
      if (!match) continue;
      const price = match?.lastPrice ?? 0;
      if (price <= 0) continue;
      const dir = sig?.direction === 'SELL' ? 'SELL' : 'BUY';
      signals.push({
        symbol: `NSE:${sig.symbol}`, exchange: 'NSE', direction: dir, strategy: 'NEWS_SENTIMENT',
        confidence: Math.min(95, Math.max(0, sig?.confidence ?? 0)),
        entryPrice: price,
        stopLoss: dir === 'BUY' ? price * 0.99 : price * 1.01,
        target: dir === 'BUY' ? price * 1.02 : price * 0.98,
        quantity: 0, reason: `[FinBERT] ${sig?.reason ?? 'Sentiment-based signal'}`,
      });
    }
    return signals;
  } catch (err: any) {
    return [];
  }
}

// ===== Strategy 9: Institutional VWAP Pullback =====
export function vwapPullbackStrategy(
  data: MarketDataPoint[],
  historyMap?: Map<string, HistoricalPrices>
): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    const volume = stock?.volume ?? 0;
    const high = stock?.high ?? 0;
    const low = stock?.low ?? 0;
    if (price <= 0 || volume <= 0) continue;

    // Check EMA 9/21 trend (Uptrend if EMA9 > EMA21)
    const history = getPriceHistory(stock, historyMap, 25);
    if (history.length < 21) continue;
    const ema9 = ema(history, 9);
    const ema21 = ema(history, 21);
    const inUptrend = ema9 > ema21;
    const inDowntrend = ema9 < ema21;

    // VWAP approximation
    const vwap = ((high + low + price) / 3);

    // Buy pullbacks: In an uptrend, if price drops near or slightly below VWAP and starts bouncing
    if (inUptrend && price <= vwap * 1.002 && price >= vwap * 0.995 && price > (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'VWAP_PULLBACK',
        confidence: 85, // Highly reliable quant setup
        entryPrice: price, stopLoss: Math.min(low, price * 0.99), target: price * 1.02, quantity: 0,
        reason: `VWAP Pullback: Price pulled back to VWAP (₹${vwap.toFixed(2)}) in strong uptrend (EMA9 > EMA21)`,
      });
    }

    // Sell pullbacks: In a downtrend, if price rallies near or slightly above VWAP and starts reversing
    if (inDowntrend && price >= vwap * 0.998 && price <= vwap * 1.005 && price < (stock?.open ?? 0)) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'VWAP_PULLBACK',
        confidence: 85,
        entryPrice: price, stopLoss: Math.max(high, price * 1.01), target: price * 0.98, quantity: 0,
        reason: `VWAP Pullback: Price rallied to VWAP (₹${vwap.toFixed(2)}) in strong downtrend (EMA9 < EMA21)`,
      });
    }
  }
  return signals;
}

// ===== Strategy 10: Institutional Volume Breakout (VSA) =====
export function volumeBreakoutStrategy(
  data: MarketDataPoint[],
  historyMap?: Map<string, HistoricalPrices>
): TradeSignal[] {
  const signals: TradeSignal[] = [];
  for (const stock of (data ?? [])) {
    const price = stock?.lastPrice ?? 0;
    const volume = stock?.volume ?? 0;
    if (price <= 0 || volume <= 0) continue;

    if (!historyMap) continue;
    const hist = historyMap.get(stock.symbol);
    if (!hist || hist.closes?.length < 20 || !hist.volumes) continue;

    const avgVolume = sma(hist.volumes, 20);
    const maxClose = Math.max(...hist.closes.slice(-20, -1)); // 20-period resistance
    const minClose = Math.min(...hist.closes.slice(-20, -1)); // 20-period support

    const isUnusualVolume = volume > avgVolume * 2.5;

    if (isUnusualVolume && price > maxClose) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'BUY', strategy: 'VOLUME_BREAKOUT',
        confidence: 90, // Institutional breakout
        entryPrice: price, stopLoss: price * 0.985, target: price * 1.03, quantity: 0,
        reason: `Volume Breakout: Price broke above 20-day resistance (₹${maxClose.toFixed(2)}) on volume ${(volume / avgVolume).toFixed(1)}x average`,
      });
    }

    if (isUnusualVolume && price < minClose) {
      signals.push({
        symbol: stock?.symbol ?? '', exchange: 'NSE', direction: 'SELL', strategy: 'VOLUME_BREAKOUT',
        confidence: 90,
        entryPrice: price, stopLoss: price * 1.015, target: price * 0.97, quantity: 0,
        reason: `Volume Breakdown: Price broke below 20-day support (₹${minClose.toFixed(2)}) on volume ${(volume / avgVolume).toFixed(1)}x average`,
      });
    }
  }
  return signals;
}

// ===== Export all strategy runner =====
export function runAllStrategies(
  data: MarketDataPoint[],
  enabledStrategies: Record<string, boolean>,
  historyMap?: Map<string, HistoricalPrices>
): TradeSignal[] {
  let signals: TradeSignal[] = [];
  if (enabledStrategies?.momentum !== false) signals = [...signals, ...momentumStrategy(data)];
  if (enabledStrategies?.rsi !== false) signals = [...signals, ...rsiStrategy(data, historyMap)];
  if (enabledStrategies?.macd !== false) signals = [...signals, ...macdStrategy(data, historyMap)];
  if (enabledStrategies?.bollinger !== false) signals = [...signals, ...bollingerBandsStrategy(data, historyMap)];
  if (enabledStrategies?.supertrend !== false) signals = [...signals, ...supertrendStrategy(data, historyMap)];
  if (enabledStrategies?.vwap !== false) signals = [...signals, ...vwapStrategy(data)];
  if (enabledStrategies?.emaCross !== false) signals = [...signals, ...emaCrossoverStrategy(data, historyMap)];
  if (enabledStrategies?.vwapPullback !== false) signals = [...signals, ...vwapPullbackStrategy(data, historyMap)];
  if (enabledStrategies?.volBreakout !== false) signals = [...signals, ...volumeBreakoutStrategy(data, historyMap)];
  return signals;
}

// ===== All strategy names for UI =====
export const ALL_STRATEGIES = [
  { key: 'momentum', name: 'Momentum', desc: 'Trades strong price moves with high volume' },
  { key: 'rsi', name: 'RSI', desc: 'Oversold/overbought reversal signals' },
  { key: 'macd', name: 'MACD', desc: 'Moving average convergence/divergence crossovers' },
  { key: 'bollinger', name: 'Bollinger Bands', desc: 'Price touching band extremes' },
  { key: 'supertrend', name: 'Supertrend', desc: 'ATR-based trend following indicator' },
  { key: 'vwap', name: 'VWAP', desc: 'Volume-weighted average price mean reversion' },
  { key: 'emaCross', name: 'EMA Crossover', desc: 'EMA 9/21 golden/death cross signals' },
  { key: 'vwapPullback', name: 'VWAP Pullback', desc: 'VWAP pullbacks in strong EMA trends (Quant Favorite)' },
  { key: 'volBreakout', name: 'Volume Breakout', desc: 'Volume-spread breakouts of 20-day high/low range (Institutional)' },
  { key: 'newsSentiment', name: 'News Sentiment', desc: 'AI-powered news analysis for trading signals' },
];
