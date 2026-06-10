import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { analyzeMarketBreadth } from '@/lib/market-breadth';
import type { MarketDataPoint } from '@/lib/strategies';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { marketData = [] }: { marketData: MarketDataPoint[] } = body;

    if (!marketData.length) {
      return NextResponse.json({ error: 'No market data provided' }, { status: 400 });
    }

    const breadth = analyzeMarketBreadth(marketData);
    return NextResponse.json({ breadth });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
