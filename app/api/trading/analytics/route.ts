export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') ?? '30'; // days
    const daysAgo = parseInt(period, 10) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    startDate.setHours(0, 0, 0, 0);

    // Get all closed trades in period
    const trades = await prisma.trade.findMany({
      where: {
        userId,
        status: 'CLOSED',
        exitTime: { gte: startDate },
      },
      orderBy: { exitTime: 'asc' },
    });

    // Get daily PnL history
    const dailyPnl = await prisma.dailyPnl.findMany({
      where: { date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    // Calculate analytics
    const totalTrades = trades?.length ?? 0;
    const wins = trades?.filter?.((t: any) => (t?.pnl ?? 0) > 0) ?? [];
    const losses = trades?.filter?.((t: any) => (t?.pnl ?? 0) < 0) ?? [];
    const breakeven = trades?.filter?.((t: any) => (t?.pnl ?? 0) === 0) ?? [];

    const totalPnl = trades?.reduce?.((sum: number, t: any) => sum + (t?.pnl ?? 0), 0) ?? 0;
    const avgWin = wins?.length ? wins.reduce((s: number, t: any) => s + (t?.pnl ?? 0), 0) / wins.length : 0;
    const avgLoss = losses?.length ? losses.reduce((s: number, t: any) => s + (t?.pnl ?? 0), 0) / losses.length : 0;
    const winRate = totalTrades > 0 ? (wins.length / totalTrades) * 100 : 0;
    const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin / avgLoss) : 0;

    // Largest win/loss
    const largestWin = wins?.length ? Math.max(...wins.map((t: any) => t?.pnl ?? 0)) : 0;
    const largestLoss = losses?.length ? Math.min(...losses.map((t: any) => t?.pnl ?? 0)) : 0;

    // Streak calculation
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let tempWin = 0;
    let tempLoss = 0;

    for (const trade of (trades ?? [])) {
      if ((trade?.pnl ?? 0) > 0) {
        tempWin++;
        tempLoss = 0;
        maxWinStreak = Math.max(maxWinStreak, tempWin);
      } else if ((trade?.pnl ?? 0) < 0) {
        tempLoss++;
        tempWin = 0;
        maxLossStreak = Math.max(maxLossStreak, tempLoss);
      }
    }

    if (trades?.length) {
      const lastTrade = trades[trades.length - 1];
      if ((lastTrade?.pnl ?? 0) > 0) currentStreak = tempWin;
      else if ((lastTrade?.pnl ?? 0) < 0) currentStreak = -tempLoss;
    }

    // Max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnl = 0;
    const equityCurve: { date: string; equity: number }[] = [];

    for (const trade of (trades ?? [])) {
      runningPnl += trade?.pnl ?? 0;
      peak = Math.max(peak, runningPnl);
      const dd = peak - runningPnl;
      maxDrawdown = Math.max(maxDrawdown, dd);
      equityCurve.push({
        date: trade?.exitTime ? new Date(trade.exitTime).toLocaleDateString('en-IN') : '',
        equity: runningPnl,
      });
    }

    // Strategy breakdown
    const strategyMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
    for (const trade of (trades ?? [])) {
      const strat = trade?.strategy ?? 'UNKNOWN';
      if (!strategyMap[strat]) strategyMap[strat] = { trades: 0, wins: 0, pnl: 0 };
      strategyMap[strat].trades++;
      if ((trade?.pnl ?? 0) > 0) strategyMap[strat].wins++;
      strategyMap[strat].pnl += trade?.pnl ?? 0;
    }

    const strategyBreakdown = Object.entries(strategyMap).map(([name, data]) => ({
      name,
      trades: data.trades,
      wins: data.wins,
      winRate: data.trades > 0 ? ((data.wins / data.trades) * 100) : 0,
      pnl: data.pnl,
    }));

    // Top traded symbols
    const symbolMap: Record<string, { trades: number; pnl: number }> = {};
    for (const trade of (trades ?? [])) {
      const sym = trade?.symbol ?? '';
      if (!symbolMap[sym]) symbolMap[sym] = { trades: 0, pnl: 0 };
      symbolMap[sym].trades++;
      symbolMap[sym].pnl += trade?.pnl ?? 0;
    }

    const topSymbols = Object.entries(symbolMap)
      .map(([symbol, data]) => ({ symbol, ...data }))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 10);

    // === Advanced Risk Metrics ===
    
    // Sortino Ratio (only penalizes downside volatility)
    const dailyReturns = trades.map((t: any) => t?.pnl ?? 0);
    const avgReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a: number, b: number) => a + b, 0) / dailyReturns.length : 0;
    const downsideReturns = dailyReturns.filter((r: number) => r < 0);
    const downsideDeviation = downsideReturns.length > 0
      ? Math.sqrt(downsideReturns.reduce((sum: number, r: number) => sum + r * r, 0) / downsideReturns.length)
      : 1;
    const sortinoRatio = downsideDeviation > 0 ? (avgReturn / downsideDeviation) * Math.sqrt(252) : 0;

    // Calmar Ratio (return / max drawdown)
    const annualizedReturn = totalTrades > 0 ? (totalPnl / daysAgo) * 365 : 0;
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    // Value at Risk (95% confidence)
    const sortedReturns = [...dailyReturns].sort((a, b) => a - b);
    const var95Index = Math.floor(sortedReturns.length * 0.05);
    const valueAtRisk95 = sortedReturns.length > 0 ? Math.abs(sortedReturns[var95Index] ?? 0) : 0;

    // Expected Shortfall (avg loss beyond VaR)
    const worstReturns = sortedReturns.slice(0, Math.max(1, var95Index));
    const expectedShortfall = worstReturns.length > 0
      ? Math.abs(worstReturns.reduce((a: number, b: number) => a + b, 0) / worstReturns.length)
      : 0;

    // Sharpe Ratio
    const stdDevReturns = dailyReturns.length > 1
      ? Math.sqrt(dailyReturns.reduce((sum: number, r: number) => sum + Math.pow(r - avgReturn, 2), 0) / (dailyReturns.length - 1))
      : 1;
    const sharpeRatio = stdDevReturns > 0 ? (avgReturn / stdDevReturns) * Math.sqrt(252) : 0;

    // Recovery Factor
    const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : 0;

    // Payoff Ratio
    const payoffRatio = Math.abs(avgLoss) > 0 ? avgWin / Math.abs(avgLoss) : 0;

    // Strategy-Time Heatmap (hour of day performance)
    const hourlyPnl: Record<number, { pnl: number; trades: number }> = {};
    for (const trade of (trades ?? [])) {
      const hour = trade?.entryTime ? new Date(trade.entryTime).getHours() : 10;
      if (!hourlyPnl[hour]) hourlyPnl[hour] = { pnl: 0, trades: 0 };
      hourlyPnl[hour].pnl += trade?.pnl ?? 0;
      hourlyPnl[hour].trades++;
    }
    const timeHeatmap = Object.entries(hourlyPnl).map(([hour, data]) => ({
      hour: Number(hour),
      label: `${hour}:00`,
      pnl: Math.round((data.pnl) * 100) / 100,
      trades: data.trades,
      avgPnl: data.trades > 0 ? Math.round((data.pnl / data.trades) * 100) / 100 : 0,
    })).sort((a, b) => a.hour - b.hour);

    // Daily P&L for chart
    const pnlHistory = dailyPnl?.map?.((d: any) => ({
      date: d?.date ? new Date(d.date).toLocaleDateString('en-IN') : '',
      pnl: d?.totalPnl ?? 0,
      trades: d?.tradesCount ?? 0,
      winRate: d?.tradesCount > 0 ? ((d?.winCount ?? 0) / d.tradesCount * 100) : 0,
    })) ?? [];

    return NextResponse.json({
      period: daysAgo,
      overview: {
        totalTrades,
        winCount: wins.length,
        lossCount: losses.length,
        breakevenCount: breakeven.length,
        totalPnl,
        avgWin,
        avgLoss,
        winRate,
        profitFactor,
        largestWin,
        largestLoss,
        maxWinStreak,
        maxLossStreak,
        currentStreak,
        maxDrawdown,
      },
      advancedRisk: {
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        sortinoRatio: Math.round(sortinoRatio * 100) / 100,
        calmarRatio: Math.round(calmarRatio * 100) / 100,
        valueAtRisk95: Math.round(valueAtRisk95 * 100) / 100,
        expectedShortfall: Math.round(expectedShortfall * 100) / 100,
        recoveryFactor: Math.round(recoveryFactor * 100) / 100,
        payoffRatio: Math.round(payoffRatio * 100) / 100,
      },
      timeHeatmap,
      equityCurve,
      strategyBreakdown,
      topSymbols,
      pnlHistory,
    });
  } catch (err: any) {
    console.error('Analytics error:', err);
    return NextResponse.json({ error: err?.message ?? 'Analytics failed' }, { status: 500 });
  }
}
