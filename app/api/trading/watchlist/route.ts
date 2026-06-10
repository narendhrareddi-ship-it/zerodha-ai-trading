export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getUserKiteClient, WATCHLIST_STOCKS } from '@/lib/kite';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Try live data from Kite (per-user)
    const userId = (session.user as any)?.id;
    const { client } = await getUserKiteClient(userId);

    if (client) {
      try {
        const quotes = await client.getQuote(WATCHLIST_STOCKS.slice(0, 15));
        const quoteData = quotes?.data ?? {};

        const watchlist = Object.entries(quoteData ?? {}).map(([key, val]: [string, any]) => ({
          symbol: key?.replace?.('NSE:', '') ?? '',
          exchange: key?.split?.(':')?.[0] ?? 'NSE',
          lastPrice: val?.last_price ?? 0,
          change: val?.net_change ?? 0,
          changePct: val?.ohlc?.close ? ((val.last_price - val.ohlc.close) / val.ohlc.close * 100) : 0,
          open: val?.ohlc?.open ?? 0,
          high: val?.ohlc?.high ?? 0,
          low: val?.ohlc?.low ?? 0,
          close: val?.ohlc?.close ?? 0,
          volume: val?.volume ?? 0,
          isLive: true,
        }));

        return NextResponse.json({ watchlist, isLive: true });
      } catch (err: any) {
        // Expected when Kite token is expired or not available, falls through to simulated data
      }
    }

    // Try real NSE live data (free, no API key)
    try {
      const { getLiveQuotes, NSE_POPULAR_STOCKS } = await import('@/lib/nse-live-api');
      const liveQuotes = await getLiveQuotes(NSE_POPULAR_STOCKS.slice(0, 15));
      if (liveQuotes?.length > 0) {
        return NextResponse.json({ watchlist: liveQuotes, isLive: true, source: 'NSE Direct' });
      }
    } catch (err: any) {
      // NSE API may be rate limited or down, fall through
    }

    // Final fallback: deterministic simulated data
    const { getRealisticMarketData } = await import('@/lib/nse-data');
    const realisticData = getRealisticMarketData();

    const watchlist = realisticData.slice(0, 15).map((d) => ({
      symbol: d.symbol?.replace?.('NSE:', '') ?? '',
      exchange: 'NSE',
      lastPrice: d.lastPrice,
      change: d.change,
      changePct: d.changePct,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: d.volume,
      isLive: false,
    }));

    return NextResponse.json({ watchlist, isLive: false, source: 'Simulated' });
  } catch (err: any) {
    console.error('Watchlist error:', err);
    return NextResponse.json({ error: err?.message ?? 'Watchlist failed' }, { status: 500 });
  }
}
