// Real NSE Live Data API using stock-nse-india (free, no API key)
// Provides real-time quotes, option chains, market status from NSE directly

let nseModule: any = null;

async function getNseInstance() {
  if (!nseModule) {
    try {
      nseModule = await import('stock-nse-india');
    } catch {
      return null;
    }
  }
  // stock-nse-india exports NseIndia class
  const NseIndia = nseModule?.NseIndia ?? nseModule?.default?.NseIndia ?? nseModule?.default;
  if (!NseIndia) return null;
  return new NseIndia();
}

export interface NSEQuote {
  symbol: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  isLive: boolean;
}

// Fetch live equity quote for a single symbol
export async function getLiveQuote(symbol: string): Promise<NSEQuote | null> {
  try {
    const nse = await getNseInstance();
    if (!nse) return null;
    
    const data = await nse.getEquityDetails(symbol);
    const priceInfo = data?.priceInfo ?? {};
    const lastPrice = priceInfo?.lastPrice ?? priceInfo?.close ?? 0;
    const prevClose = priceInfo?.previousClose ?? priceInfo?.close ?? lastPrice;
    const change = lastPrice - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol,
      lastPrice,
      open: priceInfo?.open ?? lastPrice,
      high: priceInfo?.intraDayHighLow?.max ?? priceInfo?.weekHighLow?.max ?? lastPrice,
      low: priceInfo?.intraDayHighLow?.min ?? priceInfo?.weekHighLow?.min ?? lastPrice,
      close: prevClose,
      volume: data?.securityWiseDP?.quantityTraded ?? data?.preOpenMarket?.totalTradedVolume ?? 0,
      change,
      changePct,
      isLive: true,
    };
  } catch (err: any) {
    // NSE blocks cloud IPs - this is expected, falls back to simulated data
    return null;
  }
}

// Fetch live quotes for multiple symbols (batch)
export async function getLiveQuotes(symbols: string[]): Promise<NSEQuote[]> {
  const results: NSEQuote[] = [];
  // Fetch in batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const promises = batch.map(s => getLiveQuote(s).catch(() => null));
    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }
    // Small delay between batches to respect rate limits
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return results;
}

// Get market status (open/closed)
export async function getMarketStatus(): Promise<{ isOpen: boolean; status: string }> {
  try {
    const nse = await getNseInstance();
    if (!nse) return { isOpen: false, status: 'Unknown' };
    const data = await nse.getDataByEndpoint('/api/marketStatus');
    const marketState = data?.marketState ?? [];
    const equityMarket = marketState?.find?.((m: any) => 
      m?.market?.toLowerCase?.()?.includes?.('capital') || m?.market?.toLowerCase?.()?.includes?.('equity')
    );
    const status = equityMarket?.marketStatus ?? 'Closed';
    return {
      isOpen: status?.toLowerCase?.() === 'open',
      status,
    };
  } catch {
    return { isOpen: false, status: 'Unknown' };
  }
}

// Get top gainers/losers
export async function getMarketMovers(): Promise<{ gainers: NSEQuote[]; losers: NSEQuote[] }> {
  try {
    const nse = await getNseInstance();
    if (!nse) return { gainers: [], losers: [] };
    
    const [gainersData, losersData] = await Promise.all([
      nse.getDataByEndpoint('/api/live-analysis-variations?index=gainers').catch(() => null),
      nse.getDataByEndpoint('/api/live-analysis-variations?index=losers').catch(() => null),
    ]);

    const mapToQuote = (items: any[]): NSEQuote[] => 
      (items ?? []).slice(0, 10).map((item: any) => ({
        symbol: item?.symbol ?? '',
        lastPrice: item?.lastPrice ?? item?.ltp ?? 0,
        open: item?.open ?? 0,
        high: item?.dayHigh ?? 0,
        low: item?.dayLow ?? 0,
        close: item?.previousClose ?? 0,
        volume: item?.totalTradedVolume ?? 0,
        change: item?.change ?? item?.netPrice ?? 0,
        changePct: item?.pChange ?? 0,
        isLive: true,
      }));

    return {
      gainers: mapToQuote(gainersData?.NIFTY?.data ?? gainersData?.data ?? []),
      losers: mapToQuote(losersData?.NIFTY?.data ?? losersData?.data ?? []),
    };
  } catch {
    return { gainers: [], losers: [] };
  }
}

// Get option chain for a symbol
export async function getOptionChain(symbol: string): Promise<any> {
  try {
    const nse = await getNseInstance();
    if (!nse) return null;
    const data = await nse.getEquityStockIndices(symbol).catch(() => null)
      ?? await nse.getDataByEndpoint(`/api/option-chain-equities?symbol=${symbol}`).catch(() => null);
    return data;
  } catch {
    return null;
  }
}

// Popular NSE stocks for watchlist
export const NSE_POPULAR_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'AXISBANK', 'WIPRO', 'ASIANPAINT', 'MARUTI',
  'TATAMOTORS', 'SUNPHARMA', 'NESTLEIND', 'ULTRACEMCO', 'TITAN',
  'BAJFINANCE', 'HCLTECH', 'ADANIENT', 'POWERGRID', 'NTPC',
  'TECHM', 'ONGC', 'TATASTEEL', 'JSWSTEEL', 'COALINDIA',
];
