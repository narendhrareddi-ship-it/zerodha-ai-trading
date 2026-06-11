import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runMonteCarloSimulation, extractDailyReturns } from '@/lib/monte-carlo-risk';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const {
      simulations = 1000,
      tradingDays = 30,
      dailyRiskPercent = 1.0,
    } = body;

    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    const capital = config?.capitalAmount ?? 10000;

    // Get historical trades for return distribution
    const closedTrades = await prisma.trade.findMany({
      where: { userId, status: 'CLOSED', pnl: { not: null } },
      orderBy: { exitTime: 'desc' },
      take: 200,
    });

    const historicalReturns = extractDailyReturns(
      closedTrades.map((t: any) => ({
        pnl: t.pnl ?? 0,
        entryPrice: t.entryPrice,
        quantity: t.quantity,
        entryTime: t.entryTime,
      })),
      capital
    );

    const result = runMonteCarloSimulation(historicalReturns, {
      simulations,
      tradingDays,
      initialCapital: capital,
      dailyRiskPercent,
      confidence: 0.95,
    });

    // Save simulation results to database
    await prisma.monteCarloResult.create({
      data: {
        userId,
        simulations,
        tradingDays,
        initialCapital: capital,
        meanReturn: result.meanReturn,
        medianReturn: result.medianReturn,
        p5Return: result.p5Return,
        p95Return: result.p95Return,
        var95: result.var95,
        cvar95: result.cvar95,
        maxDrawdownMean: result.maxDrawdownMean,
        maxDrawdownWorst: result.maxDrawdownWorst,
        probabilityOfProfit: result.probabilityOfProfit,
        probabilityOfRuin: result.probabilityOfRuin,
        probabilityOfDoubling: result.probabilityOfDoubling,
      },
    }).catch(err => console.error('Failed to save MonteCarloResult:', err));

    return NextResponse.json({ result, historicalTradesUsed: closedTrades.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
