// Historical Data Provider
// Fetches real OHLCV candle data from Fyers API (free) with in-memory caching
// Fallback chain: Fyers → Kite → Synthetic

import { MarketDataPoint } from './strategies';

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalPrices {
  closes: number[];       // Array of close prices (oldest → newest)
  highs: number[];        // Array of high prices
  lows: number[];         // Array of low prices
  volumes: number[];      // Array of volumes
  candles: CandleData[];  // Full candle data
  source: 'fyers' | 'kite' | 'synthetic';
}

// In-memory cache with TTL
const cache = new Map<string, { data: HistoricalPrices; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key: string): HistoricalPrices | null {
  const entry = cache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  if (entry) cache.delete(key);
  return null;
}

function setCache(key: string, data: HistoricalPrices): void {
  // Limit cache size to prevent memory leaks
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

// Fetch historical data from Fyers API
async function fetchFromFyers(
  symbol: string,
  fyersAppId: string,
  fyersToken: string,
  bars: number = 50
): Promise<HistoricalPrices | null> {
  try {
    const { FyersClient } = await import('./fyers');
    const client = new FyersClient({ appId: fyersAppId, accessToken: fyersToken });

    // Format symbol for Fyers: "NSE:RELIANCE" → "NSE:RELIANCE-EQ"
    const cleanSymbol = symbol.replace(/^NSE:/, '').replace(/^BSE:/, '');
    const fyersSymbol = `NSE:${cleanSymbol}-EQ`;

    // Get daily candles for last N trading days
    const now = Math.floor(Date.now() / 1000);
    const daysBack = Math.ceil(bars * 1.5); // Extra days to account for weekends/holidays
    const from = now - daysBack * 86400;

    const result = await client.getHistoricalData(fyersSymbol, 'D', from, now);

    if (!result?.candles?.length) return null;

    const candles: CandleData[] = result.candles
      .slice(-bars)  // Take last N candles
      .map((c: number[]) => ({
        timestamp: c[0] ?? 0,
        open: c[1] ?? 0,
        high: c[2] ?? 0,
        low: c[3] ?? 0,
        close: c[4] ?? 0,
        volume: c[5] ?? 0,
      }));

    if (candles.length < 5) return null; // Need minimum data

    return {
      closes: candles.map(c => c.close),
      highs: candles.map(c => c.high),
      lows: candles.map(c => c.low),
      volumes: candles.map(c => c.volume),
      candles,
      source: 'fyers',
    };
  } catch {
    return null;
  }
}

// Fetch historical data from Kite Connect
async function fetchFromKite(
  symbol: string,
  userId: string,
  bars: number = 50
): Promise<HistoricalPrices | null> {
  try {
    const { getUserKiteClient } = await import('./kite');
    const { client } = await getUserKiteClient(userId);
    if (!client) return null;

    // Kite historical data requires instrument token — complex to resolve
    // For now, skip Kite historical and rely on Fyers or synthetic
    return null;
  } catch {
    return null;
  }
}

// Generate synthetic price history (existing fallback method)
function generateSyntheticHistory(stock: MarketDataPoint, bars: number = 50): HistoricalPrices {
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const volumes: number[] = [];
  const candles: CandleData[] = [];

  const range = (stock?.high ?? 0) - (stock?.low ?? 0);
  const base = stock?.open ?? stock?.close ?? stock?.lastPrice ?? 0;
  const lastPrice = stock?.lastPrice ?? base;
  if (base <= 0) {
    return { closes: [lastPrice], highs: [lastPrice], lows: [lastPrice], volumes: [0], candles: [], source: 'synthetic' };
  }

  // Use deterministic seed based on symbol for consistency
  const symbolSeed = (stock?.symbol ?? '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

  for (let i = 0; i < bars; i++) {
    const factor = i / bars;
    // Deterministic pseudo-random walk based on symbol + bar index
    const seed1 = Math.sin(symbolSeed * 0.1 + i * 1.7) * 0.3;
    const seed2 = Math.cos(symbolSeed * 0.05 + i * 0.9) * 0.2;
    const noise = (seed1 + seed2) * range;

    const close = Math.max(
      stock?.low ?? 0,
      Math.min(stock?.high ?? 0, base + (lastPrice - base) * factor + noise)
    );
    const barRange = range * (0.3 + Math.abs(seed1) * 0.5);
    const high = close + barRange * 0.5;
    const low = close - barRange * 0.5;
    const vol = (stock?.volume ?? 100000) * (0.7 + Math.abs(seed2) * 0.6);

    closes.push(close);
    highs.push(high);
    lows.push(Math.max(0, low));
    volumes.push(Math.round(vol));
    candles.push({
      timestamp: Date.now() - (bars - i) * 86400000,
      open: i > 0 ? closes[i - 1] ?? close : base,
      high, low: Math.max(0, low), close, volume: Math.round(vol),
    });
  }

  // Append current price as last bar
  closes.push(lastPrice);
  highs.push(stock?.high ?? lastPrice);
  lows.push(stock?.low ?? lastPrice);
  volumes.push(stock?.volume ?? 0);

  return { closes, highs, lows, volumes, candles, source: 'synthetic' };
}

// Main function: Get historical prices for a symbol
export async function getHistoricalPrices(
  symbol: string,
  stock: MarketDataPoint,
  config: {
    fyersAppId?: string;
    fyersToken?: string;
    userId?: string;
    brokerType?: string;
  },
  bars: number = 50
): Promise<HistoricalPrices> {
  const cacheKey = `${symbol}:${bars}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // Try Fyers first (free historical data)
  if (config?.fyersAppId && config?.fyersToken) {
    const fyersData = await fetchFromFyers(symbol, config.fyersAppId, config.fyersToken, bars);
    if (fyersData) {
      setCache(cacheKey, fyersData);
      return fyersData;
    }
  }

  // Try Kite if active broker
  if (config?.brokerType === 'kite' && config?.userId) {
    const kiteData = await fetchFromKite(symbol, config.userId, bars);
    if (kiteData) {
      setCache(cacheKey, kiteData);
      return kiteData;
    }
  }

  // Fallback to synthetic
  const synthetic = generateSyntheticHistory(stock, bars);
  setCache(cacheKey, synthetic);
  return synthetic;
}

// Batch fetch historical data for multiple symbols
export async function getBatchHistoricalPrices(
  stocks: MarketDataPoint[],
  config: {
    fyersAppId?: string;
    fyersToken?: string;
    userId?: string;
    brokerType?: string;
  },
  bars: number = 50
): Promise<Map<string, HistoricalPrices>> {
  const result = new Map<string, HistoricalPrices>();

  // Check which symbols need fetching (not cached)
  const toFetch: MarketDataPoint[] = [];
  for (const stock of stocks) {
    const key = `${stock.symbol}:${bars}`;
    const cached = getCached(key);
    if (cached) {
      result.set(stock.symbol, cached);
    } else {
      toFetch.push(stock);
    }
  }

  if (!toFetch.length) return result;

  // Fetch in parallel batches of 5 to respect rate limits
  const batchSize = 5;
  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    const promises = batch.map(stock =>
      getHistoricalPrices(stock.symbol, stock, config, bars)
        .then(data => ({ symbol: stock.symbol, data }))
    );
    const batchResults = await Promise.all(promises);
    for (const { symbol, data } of batchResults) {
      result.set(symbol, data);
    }
  }

  return result;
}

// Utility: Clear cache (useful for testing)
export function clearHistoricalCache(): void {
  cache.clear();
}
