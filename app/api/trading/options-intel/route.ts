import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOptionChain } from '@/lib/nse-live-api';
import { analyzeOptionsChain } from '@/lib/options-chain-intelligence';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') ?? 'NIFTY';
    const spotPrice = parseFloat(searchParams.get('spot') ?? '0');

    const rawData = await getOptionChain(symbol);

    if (!rawData) {
      return NextResponse.json({
        symbol,
        error: 'Option chain data unavailable',
        data: null,
      });
    }

    const analysis = analyzeOptionsChain(symbol, rawData, spotPrice || 22000);
    return NextResponse.json({ symbol, analysis, raw: null });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
