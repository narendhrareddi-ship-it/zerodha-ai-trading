// ============================================================
// BOT CONTROL ROUTE — Autonomous Trading Bot
// Manages bot sessions, auto-scan scheduling, and learning
// Database: Supabase PostgreSQL via Prisma
// ============================================================
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logTradingEvent, isMarketOpen } from '@/lib/trading-engine';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    // ── START ──
    if (action === 'start') {
      // Stop any existing running sessions first
      await prisma.botSession.updateMany({
        where: { userId, status: 'RUNNING' },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });

      // Detect broker connection
      const kiteToken = await prisma.kiteToken.findFirst({
        where: { userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      const config = await prisma.tradingConfig.findUnique({ where: { userId } });
      const brokerType = config?.brokerType ?? 'kite';
      let mode = 'PAPER';
      let brokerConnected = false;

      if (kiteToken) { mode = 'LIVE'; brokerConnected = true; }
      else if (brokerType === 'fyers' && config?.fyersAppId && config?.fyersToken) { mode = 'LIVE'; brokerConnected = true; }
      else if (brokerType === 'openalgo' && config?.openalgoApiKey) { mode = 'LIVE'; brokerConnected = true; }

      const botSession = await prisma.botSession.create({
        data: { userId, status: 'RUNNING', startedAt: new Date() },
      });

      await logTradingEvent('INFO', 'BOT', `🚀 Autonomous Trading Bot started`, {
        sessionId: botSession.id,
        mode,
        broker: brokerType,
        brokerConnected,
        marketOpen: isMarketOpen(),
        scanIntervalSec: config?.scanInterval ?? 120,
      });

      return NextResponse.json({
        status: 'RUNNING',
        sessionId: botSession.id,
        mode,
        broker: brokerType,
        brokerConnected,
        message: `Bot started in ${mode} mode via ${brokerType.toUpperCase()}. Scanning every ${config?.scanInterval ?? 120}s.`,
        marketOpen: isMarketOpen(),
        features: [
          'Multi-strategy ensemble (7 strategies)',
          'XGBoost AI predictions (AbacusAI + local fallback)',
          'Market regime detection',
          'Dynamic risk sizing (5 multipliers)',
          'Drawdown kill-switch (3 levels)',
          'Trailing stop-loss management',
          'Auto SL/Target monitoring',
          'Supabase real-time persistence',
        ],
      });
    }

    // ── STOP ──
    if (action === 'stop') {
      const updated = await prisma.botSession.updateMany({
        where: { userId, status: 'RUNNING' },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });

      await logTradingEvent('INFO', 'BOT', `🛑 Trading bot stopped (${updated.count} session(s) closed)`);

      return NextResponse.json({
        status: 'STOPPED',
        message: `Bot stopped. ${updated.count} session(s) closed.`,
      });
    }

    // ── STATUS ──
    if (action === 'status') {
      const botSession = await prisma.botSession.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      const openPositions = await prisma.trade.count({ where: { userId, status: 'OPEN' } });
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayTrades = await prisma.trade.findMany({ where: { userId, entryTime: { gte: today } } });
      const dailyPnl = todayTrades.filter((t: any) => t.status === 'CLOSED').reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);

      const recentLogs = await prisma.tradingLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      return NextResponse.json({
        status: botSession?.status ?? 'STOPPED',
        sessionId: botSession?.id,
        startedAt: botSession?.startedAt,
        openPositions,
        dailyTrades: todayTrades.length,
        dailyPnl,
        marketOpen: isMarketOpen(),
        recentLogs: recentLogs.map((l: any) => ({
          level: l.level,
          source: l.source,
          message: l.message,
          time: l.createdAt?.toISOString(),
        })),
      });
    }

    // ── EMERGENCY STOP ALL ──
    if (action === 'emergency_stop') {
      await prisma.botSession.updateMany({
        where: { userId, status: 'RUNNING' },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });
      // Square off all open positions
      const openTrades = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
      await prisma.trade.updateMany({
        where: { userId, status: 'OPEN' },
        data: { status: 'CLOSED', exitPrice: 0, pnl: 0, exitTime: new Date(), notes: 'Emergency stop' },
      });
      await logTradingEvent('WARN', 'BOT', `🚨 EMERGENCY STOP: Bot halted, ${openTrades.length} positions force-closed`);
      return NextResponse.json({
        status: 'STOPPED',
        positionsClosed: openTrades.length,
        message: `Emergency stop executed. ${openTrades.length} positions closed.`,
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use: start | stop | status | emergency_stop' }, { status: 400 });
  } catch (err: any) {
    console.error('Bot control error:', err);
    return NextResponse.json({ error: err?.message ?? 'Bot control failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  const botSession = await prisma.botSession.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);

  return NextResponse.json({ status: botSession?.status ?? 'STOPPED' });
}
