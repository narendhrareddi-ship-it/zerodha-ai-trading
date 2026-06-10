export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  momentumStrategy, rsiStrategy, macdStrategy, bollingerBandsStrategy,
  supertrendStrategy, vwapStrategy, emaCrossoverStrategy,
  MarketDataPoint
} from '@/lib/strategies';
import { WATCHLIST_STOCKS } from '@/lib/kite';

interface BacktestTrade {
  day: number;
  symbol: string;
  direction: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  strategy: string;
  reason: string;
}

// Generate realistic simulated daily market data for backtesting
function generateHistoricalData(days: number): MarketDataPoint[][] {
  const stocks = [
    { symbol: 'NSE:RELIANCE', base: 2950 }, { symbol: 'NSE:TCS', base: 3800 },
    { symbol: 'NSE:HDFCBANK', base: 1680 }, { symbol: 'NSE:INFY', base: 1520 },
    { symbol: 'NSE:ICICIBANK', base: 1240 }, { symbol: 'NSE:SBIN', base: 830 },
    { symbol: 'NSE:BHARTIARTL', base: 1680 }, { symbol: 'NSE:ITC', base: 450 },
    { symbol: 'NSE:KOTAKBANK', base: 1780 }, { symbol: 'NSE:LT', base: 3450 },
    { symbol: 'NSE:AXISBANK', base: 1170 }, { symbol: 'NSE:TATAMOTORS', base: 990 },
    { symbol: 'NSE:TATASTEEL', base: 165 }, { symbol: 'NSE:BAJFINANCE', base: 7100 },
    { symbol: 'NSE:WIPRO', base: 475 },
  ];

  const allDays: MarketDataPoint[][] = [];
  const prices: Record<string, number> = {};
  stocks.forEach(s => { prices[s.symbol] = s.base; });

  // Use seeded pseudo-random for reproducibility
  let seed = 42;
  const random = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

  for (let d = 0; d < days; d++) {
    const dayData: MarketDataPoint[] = [];
    for (const stock of stocks) {
      const prevPrice = prices[stock.symbol] ?? stock.base;
      const trend = (random() - 0.48) * 3; // slight positive bias
      const volatility = 0.5 + random() * 2;
      const changePct = trend + (random() - 0.5) * volatility;
      const lastPrice = prevPrice * (1 + changePct / 100);
      const high = lastPrice * (1 + random() * 0.015);
      const low = lastPrice * (1 - random() * 0.015);
      const open = prevPrice * (1 + (random() - 0.5) * 0.005);
      const volume = Math.floor(100000 + random() * 2000000);

      prices[stock.symbol] = lastPrice;
      dayData.push({
        symbol: stock.symbol,
        lastPrice: Math.round(lastPrice * 100) / 100,
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(prevPrice * 100) / 100,
        volume,
        change: Math.round((lastPrice - prevPrice) * 100) / 100,
        changePct: Math.round(changePct * 100) / 100,
      });
    }
    allDays.push(dayData);
  }
  return allDays;
}

const STRATEGY_RUNNERS: Record<string, (data: MarketDataPoint[]) => any[]> = {
  MOMENTUM: momentumStrategy,
  RSI: rsiStrategy,
  MACD: macdStrategy,
  BOLLINGER: bollingerBandsStrategy,
  SUPERTREND: supertrendStrategy,
  VWAP: vwapStrategy,
  EMA_CROSS: emaCrossoverStrategy,
};

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  try {
    const body = await request.json();
    const strategyName = body?.strategy ?? 'MOMENTUM';
    const period = Math.min(90, Math.max(7, body?.period ?? 30));
    const capital = body?.capital ?? 10000;
    const maxDailyLoss = body?.maxDailyLoss ?? 500;
    const stopLossPct = body?.stopLossPercent ?? 1.0;
    const targetPct = body?.targetPercent ?? 2.0;

    const runner = STRATEGY_RUNNERS[strategyName];
    if (!runner) {
      return NextResponse.json({ error: `Unknown strategy: ${strategyName}` }, { status: 400 });
    }

    // Generate historical data
    const historicalData = generateHistoricalData(period);
    const trades: BacktestTrade[] = [];
    let runningCapital = capital;
    let peakCapital = capital;
    let maxDrawdown = 0;
    const dailyPnls: number[] = [];

    for (let day = 0; day < historicalData.length; day++) {
      const dayData = historicalData[day] ?? [];
      const signals = runner(dayData);
      let dailyPnl = 0;

      // Take top signal per day (most confident)
      const topSignals = (signals ?? [])
        .filter((s: any) => (s?.confidence ?? 0) >= 65)
        .sort((a: any, b: any) => (b?.confidence ?? 0) - (a?.confidence ?? 0))
        .slice(0, 2);

      for (const signal of topSignals) {
        if (!signal?.entryPrice || signal.entryPrice <= 0) continue;

        const maxQty = Math.floor(Math.min(runningCapital * 0.3, capital * 0.3) / signal.entryPrice);
        if (maxQty <= 0) continue;

        const slPrice = signal.direction === 'BUY'
          ? signal.entryPrice * (1 - stopLossPct / 100)
          : signal.entryPrice * (1 + stopLossPct / 100);
        const tgtPrice = signal.direction === 'BUY'
          ? signal.entryPrice * (1 + targetPct / 100)
          : signal.entryPrice * (1 - targetPct / 100);

        // Simulate outcome: use day's high/low to check if SL or target hit
        const matchStock = dayData.find((d: any) => d?.symbol === signal.symbol);
        let exitPrice = signal.entryPrice;
        let hit = '';

        if (signal.direction === 'BUY') {
          if ((matchStock?.low ?? signal.entryPrice) <= slPrice) {
            exitPrice = slPrice; hit = 'SL';
          } else if ((matchStock?.high ?? signal.entryPrice) >= tgtPrice) {
            exitPrice = tgtPrice; hit = 'TGT';
          } else {
            exitPrice = matchStock?.lastPrice ?? signal.entryPrice; hit = 'EOD';
          }
        } else {
          if ((matchStock?.high ?? signal.entryPrice) >= slPrice) {
            exitPrice = slPrice; hit = 'SL';
          } else if ((matchStock?.low ?? signal.entryPrice) <= tgtPrice) {
            exitPrice = tgtPrice; hit = 'TGT';
          } else {
            exitPrice = matchStock?.lastPrice ?? signal.entryPrice; hit = 'EOD';
          }
        }

        const pnl = signal.direction === 'BUY'
          ? (exitPrice - signal.entryPrice) * maxQty
          : (signal.entryPrice - exitPrice) * maxQty;

        runningCapital += pnl;
        dailyPnl += pnl;

        trades.push({
          day, symbol: signal.symbol ?? '', direction: signal.direction,
          entryPrice: signal.entryPrice, exitPrice: Math.round(exitPrice * 100) / 100,
          pnl: Math.round(pnl * 100) / 100,
          strategy: strategyName, reason: `${signal.reason ?? ''} [${hit}]`,
        });

        // Check daily loss limit
        if (dailyPnl <= -maxDailyLoss) break;
      }

      dailyPnls.push(dailyPnl);
      peakCapital = Math.max(peakCapital, runningCapital);
      const dd = peakCapital - runningCapital;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }

    // Calculate results
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
    const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
    const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin / avgLoss) : 0;

    // Sharpe ratio approximation
    const avgDailyPnl = dailyPnls.length > 0 ? dailyPnls.reduce((a, b) => a + b, 0) / dailyPnls.length : 0;
    const dailyStdDev = dailyPnls.length > 1
      ? Math.sqrt(dailyPnls.reduce((s, p) => s + Math.pow(p - avgDailyPnl, 2), 0) / (dailyPnls.length - 1))
      : 1;
    const sharpeRatio = dailyStdDev > 0 ? (avgDailyPnl / dailyStdDev) * Math.sqrt(252) : 0;

    // Save to DB
    const result = await prisma.backtestResult.create({
      data: {
        userId,
        strategyName,
        period,
        totalTrades: trades.length,
        winCount: wins.length,
        lossCount: losses.length,
        totalPnl: Math.round(totalPnl * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        tradesData: JSON.stringify(trades.slice(0, 50)),
      },
    });

    // Build equity curve
    let equity = capital;
    const equityCurve = trades.map((t, i) => {
      equity += t.pnl;
      return { trade: i + 1, equity: Math.round(equity * 100) / 100, pnl: t.pnl };
    });

    return NextResponse.json({
      id: result.id,
      strategy: strategyName,
      period,
      capital,
      finalCapital: Math.round(runningCapital * 100) / 100,
      totalReturn: Math.round(((runningCapital - capital) / capital * 100) * 100) / 100,
      overview: {
        totalTrades: trades.length,
        winCount: wins.length,
        lossCount: losses.length,
        totalPnl: Math.round(totalPnl * 100) / 100,
        winRate: Math.round(winRate * 100) / 100,
        avgWin: Math.round(avgWin * 100) / 100,
        avgLoss: Math.round(avgLoss * 100) / 100,
        maxDrawdown: Math.round(maxDrawdown * 100) / 100,
        sharpeRatio: Math.round(sharpeRatio * 100) / 100,
        profitFactor: Math.round(profitFactor * 100) / 100,
      },
      equityCurve,
      trades: trades.slice(0, 30),
    });
  } catch (err: any) {
    console.error('Backtest error:', err);
    return NextResponse.json({ error: err?.message ?? 'Backtest failed' }, { status: 500 });
  }
}

// GET: Fetch past backtest results
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  const results = await prisma.backtestResult.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true, strategyName: true, period: true, totalTrades: true,
      winCount: true, lossCount: true, totalPnl: true, winRate: true,
      maxDrawdown: true, sharpeRatio: true, profitFactor: true, createdAt: true,
    },
  });

  return NextResponse.json({ results });
}
