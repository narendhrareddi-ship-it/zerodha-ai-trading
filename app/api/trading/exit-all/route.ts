export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logTradingEvent } from '@/lib/trading-engine';
import { sendTradeExitAlert, sendDailyPnlSummary } from '@/lib/notifications';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  try {
    const openTrades = await prisma.trade.findMany({
      where: { userId, status: 'OPEN' },
    });

    let closedCount = 0;
    let totalPnl = 0;

    for (const trade of (openTrades ?? [])) {
      const exitPrice = trade?.entryPrice ?? 0;
      const pnl = trade?.direction === 'BUY'
        ? ((exitPrice - (trade?.entryPrice ?? 0)) * (trade?.quantity ?? 0))
        : (((trade?.entryPrice ?? 0) - exitPrice) * (trade?.quantity ?? 0));

      await prisma.trade.update({
        where: { id: trade?.id },
        data: {
          status: 'CLOSED',
          exitPrice,
          exitTime: new Date(),
          pnl,
          notes: (trade?.notes ?? '') + ' | Emergency exit',
        },
      });

      totalPnl += pnl;
      closedCount++;
    }

    // Stop the bot
    const botSession = await prisma.botSession.findFirst({
      where: { userId, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
    });

    if (botSession) {
      await prisma.botSession.update({
        where: { id: botSession.id },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });
    }

    await logTradingEvent('WARN', 'EMERGENCY', `Emergency exit: ${closedCount} positions closed, PnL: ${totalPnl?.toFixed?.(2) ?? '0'}`);

    // Send notifications for each closed trade
    for (const trade of (openTrades ?? [])) {
      sendTradeExitAlert({
        symbol: trade?.symbol ?? '',
        direction: trade?.direction ?? 'BUY',
        entryPrice: trade?.entryPrice ?? 0,
        exitPrice: trade?.entryPrice ?? 0,
        quantity: trade?.quantity ?? 0,
        pnl: 0,
        reason: 'Emergency exit',
      }).catch(() => {});
    }

    // Send summary
    sendDailyPnlSummary({
      totalPnl,
      tradesCount: closedCount,
      winCount: 0,
      lossCount: 0,
      trades: openTrades?.map?.((t: any) => ({ symbol: t?.symbol ?? '', pnl: 0, strategy: t?.strategy ?? '' })) ?? [],
    }).catch(() => {});

    return NextResponse.json({
      message: `Emergency exit complete: ${closedCount} positions closed`,
      closedCount,
      totalPnl,
    });
  } catch (err: any) {
    console.error('Exit all error:', err);
    return NextResponse.json({ error: err?.message ?? 'Emergency exit failed' }, { status: 500 });
  }
}
