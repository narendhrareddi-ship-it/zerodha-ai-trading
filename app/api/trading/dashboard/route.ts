export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isMarketOpen } from '@/lib/trading-engine';
import { checkDrawdownStatus } from '@/lib/drawdown-kill-switch';
import { getPortfolioRiskSnapshot } from '@/lib/portfolio-risk-agent';
import { detectMarketRegime } from '@/lib/market-regime';
import { getStrategyWeightsFromDb } from '@/lib/agents/self-learning-agent';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const botSession = await prisma.botSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const todayTrades = await prisma.trade.findMany({
      where: { userId, entryTime: { gte: today } },
      orderBy: { entryTime: 'desc' },
    });

    const openTrades = todayTrades?.filter?.((t: any) => t?.status === 'OPEN') ?? [];
    const closedTrades = todayTrades?.filter?.((t: any) => t?.status === 'CLOSED') ?? [];
    const dailyPnl = closedTrades?.reduce?.((sum: number, t: any) => sum + (t?.pnl ?? 0), 0) ?? 0;
    const winTrades = closedTrades?.filter?.((t: any) => (t?.pnl ?? 0) > 0)?.length ?? 0;
    const winRate = closedTrades?.length > 0 ? (winTrades / closedTrades.length) * 100 : 0;

    const recentLogs = await prisma.tradingLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const pnlHistory = await prisma.dailyPnl.findMany({
      orderBy: { date: 'asc' },
      take: 30,
    });
    // Fetch latest market snapshot from NSE (best-effort for panels)
    let marketSnapshot: any[] = [];
    let niftyPrice = 22000;
    let regime = { regime: 'UNKNOWN', confidence: 0, description: '' };
    try {
      const { getLiveQuotes, NSE_POPULAR_STOCKS } = await import('@/lib/nse-live-api');
      const liveQuotes = await getLiveQuotes(NSE_POPULAR_STOCKS.slice(0, 25)).catch(() => []);
      if (liveQuotes?.length) {
        marketSnapshot = liveQuotes.map(q => ({
          symbol: `NSE:${q.symbol}`,
          lastPrice: q.lastPrice,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume,
          change: q.change,
          changePct: q.changePct,
        }));
      }
    } catch { /* non-critical — panels will use stale data */ }

    // Fallback to synthetic data if NSE API returns nothing
    if (!marketSnapshot.length) {
      try {
        const { getRealisticMarketData } = await import('@/lib/nse-data');
        marketSnapshot = getRealisticMarketData();
      } catch { /* fallback */ }
    }

    if (marketSnapshot.length) {
      niftyPrice = marketSnapshot.find(q => q.symbol?.includes('NIFTY 50') || q.symbol === 'NSE:NIFTY 50')?.lastPrice
        ?? marketSnapshot.reduce((s: number, d: any) => s + d.lastPrice, 0) / marketSnapshot.length;
      regime = detectMarketRegime(marketSnapshot) as any;
    }

    const positions = openTrades?.map?.((t: any) => {
      const cleanSymbol = t.symbol.replace(/^NSE:/, '').replace(/-EQ$/, '');
      const liveData = marketSnapshot.find(q => q.symbol === `NSE:${cleanSymbol}` || q.symbol === cleanSymbol);
      const currentPrice = liveData?.lastPrice ?? t.entryPrice ?? 0;

      const isBuy = t.direction === 'BUY';
      const unrealizedPnl = isBuy
        ? (currentPrice - (t.entryPrice ?? 0)) * (t.quantity ?? 0)
        : ((t.entryPrice ?? 0) - currentPrice) * (t.quantity ?? 0);

      return {
        id: t?.id ?? '',
        symbol: t?.symbol ?? '',
        direction: t?.direction ?? '',
        quantity: t?.quantity ?? 0,
        entryPrice: t?.entryPrice ?? 0,
        currentPrice: currentPrice,
        pnl: Math.round(unrealizedPnl * 100) / 100,
        stopLoss: t?.stopLoss ?? 0,
        target: t?.target ?? 0,
        strategy: t?.strategy ?? '',
        entryTime: t?.entryTime?.toISOString?.() ?? '',
      };
    }) ?? [];

    const recentTrades = todayTrades?.map?.((t: any) => ({
      id: t?.id ?? '',
      symbol: t?.symbol ?? '',
      direction: t?.direction ?? '',
      quantity: t?.quantity ?? 0,
      entryPrice: t?.entryPrice ?? 0,
      exitPrice: t?.exitPrice ?? null,
      pnl: t?.pnl ?? null,
      status: t?.status ?? '',
      strategy: t?.strategy ?? '',
      entryTime: t?.entryTime?.toISOString?.() ?? '',
      exitTime: t?.exitTime?.toISOString?.() ?? null,
      notes: t?.notes ?? null,
    })) ?? [];

    const logs = recentLogs?.map?.((l: any) => ({
      id: l?.id ?? '',
      level: l?.level ?? 'INFO',
      source: l?.source ?? '',
      message: l?.message ?? '',
      createdAt: l?.createdAt?.toISOString?.() ?? '',
    })) ?? [];

    // Drawdown + portfolio risk (non-blocking)
    const [drawdownStatus, portfolioRisk] = await Promise.all([
      checkDrawdownStatus(userId).catch(() => null),
      getPortfolioRiskSnapshot(userId).catch(() => null),
    ]);

    // Load strategy weights
    const weights = await getStrategyWeightsFromDb(userId);

    const { getLiveIndices } = await import('@/lib/nse-data');
    const indices = getLiveIndices();

    // Fetch live capital balance if a broker account is connected
    let capital = config?.capitalAmount ?? 10000;
    const realBalance = await getRealBrokerBalance(userId, config);
    if (realBalance !== null && realBalance > 0) {
      capital = realBalance;
    }

    return NextResponse.json({
      botStatus: botSession?.status ?? 'STOPPED',
      dailyPnl,
      indices,
      openPositions: openTrades?.length ?? 0,
      totalTrades: todayTrades?.length ?? 0,
      winRate,
      capital,
      maxDailyLoss: config?.maxDailyLoss ?? 500,
      maxPositions: config?.maxPositions ?? 3,
      isMarketOpen: isMarketOpen(),
      strategies: [
        { name: 'Momentum', enabled: config?.enableMomentum ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'MOMENTUM')?.length ?? 0, weight: weights?.MOMENTUM ?? 1.0 },
        { name: 'RSI', enabled: config?.enableRSI ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'RSI')?.length ?? 0, weight: weights?.RSI ?? 1.0 },
        { name: 'MACD', enabled: config?.enableMACD ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'MACD')?.length ?? 0, weight: weights?.MACD ?? 1.0 },
        { name: 'Bollinger Bands', enabled: config?.enableBollinger ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'BOLLINGER_BANDS' || t?.strategy === 'BOLLINGER')?.length ?? 0, weight: weights?.BOLLINGER ?? 1.0 },
        { name: 'Supertrend', enabled: config?.enableSupertrend ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'SUPERTREND')?.length ?? 0, weight: weights?.SUPERTREND ?? 1.0 },
        { name: 'VWAP', enabled: config?.enableVWAP ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'VWAP')?.length ?? 0, weight: weights?.VWAP ?? 1.0 },
        { name: 'EMA Crossover', enabled: config?.enableEMACross ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'EMA_CROSSOVER' || t?.strategy === 'EMA_CROSS')?.length ?? 0, weight: weights?.EMA_CROSS ?? 1.0 },
        { name: 'VWAP Pullback', enabled: config?.enableVwapPullback ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'VWAP_PULLBACK')?.length ?? 0, weight: weights?.VWAP_PULLBACK ?? 1.0 },
        { name: 'Volume Breakout', enabled: config?.enableVolBreakout ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'VOLUME_BREAKOUT')?.length ?? 0, weight: weights?.VOLUME_BREAKOUT ?? 1.0 },
        { name: 'OFI / VSA', enabled: config?.enableOfiVsa ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'OFI_VSA')?.length ?? 0, weight: weights?.OFI_VSA ?? 1.0 },
        { name: 'News Sentiment', enabled: config?.enableNewsSentiment ?? true, signals: 0, trades: todayTrades?.filter?.((t: any) => t?.strategy === 'NEWS_SENTIMENT')?.length ?? 0, weight: weights?.NEWS_SENTIMENT ?? 1.0 },
        { name: 'XGBoost AI', enabled: true, signals: 0, trades: 0, weight: weights?.XGBOOST ?? 1.0 },
      ],
      positions,
      recentTrades,
      logs,
      pnlHistory: pnlHistory?.map?.((p: any) => ({
        date: p?.date?.toISOString?.()?.split?.('T')?.[0] ?? '',
        pnl: p?.totalPnl ?? 0,
        trades: p?.tradesCount ?? 0,
      })) ?? [],
      // Phase 7-9 additions
      marketSnapshot,
      niftyPrice,
      regime,
      drawdown: drawdownStatus ? {
        level: drawdownStatus.level,
        triggered: drawdownStatus.triggered,
        dailyPnl: drawdownStatus.dailyPnl,
        weeklyPnl: drawdownStatus.weeklyPnl,
        canOpenPositions: drawdownStatus.canOpenNewPositions,
        reason: drawdownStatus.reason,
      } : null,
      portfolioRisk: portfolioRisk ? {
        portfolioHeat: portfolioRisk.portfolioHeatPct,
        riskGrade: portfolioRisk.riskGrade,
        capitalUtilization: portfolioRisk.capitalUtilizationPct,
        totalPositions: portfolioRisk.totalPositions,
        alerts: portfolioRisk.alerts,
      } : null,
    });

  } catch (err: any) {
    console.error('Dashboard error:', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to load dashboard' }, { status: 500 });
  }
}

// ─── HELPERS FOR LIVE CAPITAL BALANCE ───
async function checkIsLive(userId: string, config: any): Promise<boolean> {
  try {
    if (!config) return false;
    const brokerType = config.brokerType ?? 'kite';
    if (brokerType === 'kite') {
      const token = await prisma.kiteToken.findFirst({
        where: { userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      return !!token;
    }
    if (brokerType === 'fyers') {
      return !!(config.fyersAppId && config.fyersToken);
    }
    if (brokerType === 'kotak') {
      return !!(config.kotakConsumerKey && config.kotakToken);
    }
    if (brokerType === 'openalgo') {
      return !!config.openalgoApiKey;
    }
    return false;
  } catch {
    return false;
  }
}

async function getRealBrokerBalance(userId: string, config: any): Promise<number | null> {
  try {
    const brokerType = config?.brokerType ?? 'kite';
    if (brokerType === 'kite') {
      const { getUserKiteClient } = await import('@/lib/kite');
      const { client } = await getUserKiteClient(userId);
      if (client) {
        const margins = await client.getMargins();
        const equityCash = margins?.data?.equity?.available?.cash ?? margins?.data?.equity?.net ?? null;
        if (equityCash !== null) return Number(equityCash);
      }
    }
    if (brokerType === 'fyers' && config.fyersAppId && config.fyersToken) {
      const { FyersClient } = await import('@/lib/fyers');
      const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
      const funds = await fyers.getFunds();
      if (funds?.fund_limit?.length) {
        const totalBalance = funds.fund_limit.find((item: any) => 
          item?.title?.toLowerCase()?.includes('total') || 
          item?.title?.toLowerCase()?.includes('available') ||
          item?.id === 1 || item?.id === 10
        );
        const amt = totalBalance?.equityAmount ?? funds.fund_limit[0]?.equityAmount;
        if (amt !== undefined && amt !== null) return Number(amt);
      }
    }
    if (brokerType === 'kotak' && config.kotakConsumerKey && config.kotakToken) {
      const { KotakNeoClient } = await import('@/lib/kotak-neo');
      const kotak = new KotakNeoClient({ consumerKey: config.kotakConsumerKey, accessToken: config.kotakToken, sessionToken: config.kotakToken });
      const funds = await kotak.getFunds();
      const availableMargin = funds?.availableLimit ?? funds?.gpayInBalance ?? null;
      if (availableMargin !== null) return Number(availableMargin);
    }
    return null;
  } catch (e) {
    console.error('Failed to fetch real broker balance for dashboard:', e);
    return null;
  }
}
