import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runWalkForwardOptimization } from '@/lib/walk-forward-optimizer';
import { getHistoricalPrices } from '@/lib/historical-data';
import type { MarketDataPoint } from '@/lib/strategies';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const {
      strategy = 'RSI',
      symbol = 'NSE:INFY',
      inSampleBars = 60,
      outSampleBars = 20,
    } = body;

    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    if (!config) return NextResponse.json({ error: 'Trading config not found' }, { status: 400 });

    // Construct dummy stock details to pass to historical data fallback
    const dummyStock: MarketDataPoint = {
      symbol,
      lastPrice: 1500,
      open: 1500,
      high: 1515,
      low: 1485,
      close: 1500,
      volume: 400000,
      change: 0,
      changePct: 0,
    };

    // Retrieve historical candle data (requires more bars to do walk-forward splits)
    const totalBarsNeeded = inSampleBars + outSampleBars * 3; // 120 bars
    const historyData = await getHistoricalPrices(
      symbol,
      dummyStock,
      {
        fyersAppId: config.fyersAppId ?? undefined,
        fyersToken: config.fyersToken ?? undefined,
        userId,
        brokerType: config.brokerType ?? 'kite',
      },
      totalBarsNeeded
    );

    if (!historyData?.candles?.length || historyData.candles.length < (inSampleBars + outSampleBars)) {
      return NextResponse.json({
        error: 'Insufficient historical candles available for walk-forward splits.',
        availableBars: historyData?.candles?.length ?? 0,
        requiredBars: inSampleBars + outSampleBars,
      }, { status: 422 });
    }

    // Run walk-forward optimization search
    const optimizationResult = runWalkForwardOptimization(
      symbol,
      strategy.toLowerCase(),
      historyData.candles,
      inSampleBars,
      outSampleBars
    );

    // Save walk-forward result to PostgreSQL via Prisma
    const saved = await prisma.walkForwardResult.create({
      data: {
        userId,
        symbol,
        strategy: strategy.toUpperCase(),
        overallStability: optimizationResult.overallStability,
        robustnessScore: optimizationResult.robustnessScore,
        outSampleWinRate: optimizationResult.outSampleWinRate,
        outSampleProfitFactor: optimizationResult.outSampleProfitFactor,
        isRobust: optimizationResult.isRobust,
        recommendedParams: JSON.stringify(optimizationResult.recommendedParams),
        windowsData: JSON.stringify(optimizationResult.windows),
      },
    });

    return NextResponse.json({
      id: saved.id,
      ...optimizationResult,
      createdAt: saved.createdAt,
    });
  } catch (err: any) {
    console.error('Walk forward optimization failed:', err);
    return NextResponse.json({ error: err?.message ?? 'Optimization execution failed' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const results = await prisma.walkForwardResult.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const formatted = results.map(r => ({
      id: r.id,
      symbol: r.symbol,
      strategy: r.strategy,
      overallStability: r.overallStability,
      robustnessScore: r.robustnessScore,
      outSampleWinRate: r.outSampleWinRate,
      outSampleProfitFactor: r.outSampleProfitFactor,
      isRobust: r.isRobust,
      recommendedParams: r.recommendedParams ? JSON.parse(r.recommendedParams) : null,
      windows: r.windowsData ? JSON.parse(r.windowsData) : [],
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ results: formatted });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to retrieve walk-forward results' }, { status: 500 });
  }
}
