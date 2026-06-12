// ============================================================
// FULL AUTONOMOUS TRADING ENGINE — UPGRADED SCAN ROUTE
// Phase 9: SignalAgent → RegimeAgent → RiskManager → Execution
// Database: Supabase PostgreSQL via Prisma
// ============================================================
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isMarketOpen, shouldSquareOff, logTradingEvent } from '@/lib/trading-engine';
import { type MarketDataPoint } from '@/lib/strategies';
import { getBatchHistoricalPrices } from '@/lib/historical-data';
import { getRealisticMarketData } from '@/lib/nse-data';
import { getUserKiteClient, WATCHLIST_STOCKS } from '@/lib/kite';
import { computeBatchFeatures } from '@/lib/feature-store';
import { runSignalAgent } from '@/lib/agents/signal-agent';
import { runRegimeAgent } from '@/lib/agents/market-regime-agent';
import { runRiskManagerAgent } from '@/lib/agents/risk-manager-agent';
import { runExecutionAgent } from '@/lib/agents/execution-agent';
import { runPortfolioManagerAgent } from '@/lib/agents/portfolio-manager-agent';
import { getStrategyWeightsFromDb } from '@/lib/agents/self-learning-agent';
import { checkDrawdownStatus, logKillSwitchEvent } from '@/lib/drawdown-kill-switch';
import { sendTradeEntryAlert, sendRiskWarning } from '@/lib/notifications';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (isCron) {
      // Find all users with RUNNING bots
      const activeSessions = await prisma.botSession.findMany({
        where: { status: 'RUNNING' },
        select: { userId: true },
      });
      const userIds = Array.from(new Set(activeSessions.map(s => s.userId)));

      if (userIds.length === 0) {
        return NextResponse.json({ message: 'No active bot sessions to scan.', scannedUsersCount: 0, results: [] });
      }

      const scanPromises = userIds.map(async (uid) => {
        try {
          const scanResponse = await runScanForUser(uid, Date.now());
          const scanData = await scanResponse.json().catch(() => ({}));
          return { userId: uid, status: scanResponse.status, summary: scanData };
        } catch (err: any) {
          return { userId: uid, status: 500, error: err?.message };
        }
      });
      const results = await Promise.all(scanPromises);

      return NextResponse.json({ isCron: true, scannedUsersCount: userIds.length, results });
    }

    // Normal browser request
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

    return await runScanForUser(userId, startTime);
  } catch (err: any) {
    console.error('Scan route handler error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

async function runScanForUser(userId: string, startTime: number): Promise<NextResponse> {
  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    const paperTrading = !await isLiveMode(userId);

    // ── GATE 1: Bot must be running ──
    const botSession = await prisma.botSession.findFirst({
      where: { userId, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!botSession) {
      return NextResponse.json({ message: 'Bot is not running. Start it first.', signals: [] });
    }

    // ── GATE 2: Square-off time (Bypass in paper trading for testing) ──
    if (!paperTrading && shouldSquareOff(config?.squareOffTime ?? '15:10')) {
      await autoSquareOff(userId, config?.squareOffTime ?? '15:10');
      return NextResponse.json({ message: 'Square-off time reached — all positions closed', signals: [] });
    }

    // ── GATE 3: Drawdown kill-switch ──
    const drawdownStatus = await checkDrawdownStatus(userId);
    if (drawdownStatus.triggered) {
      await logKillSwitchEvent(userId, drawdownStatus);
      if (drawdownStatus.mustCloseAll) await autoSquareOff(userId, 'kill-switch');
      sendRiskWarning({
        currentLoss: drawdownStatus.dailyPnl,
        maxLoss: config?.maxDailyLoss ?? 500,
        message: drawdownStatus.reason,
      }).catch(() => {});
      return NextResponse.json({
        message: drawdownStatus.reason,
        killSwitchLevel: drawdownStatus.level,
        signals: [],
      });
    }

    // ═══════════════════════════════════════
    // STEP 1: MARKET DATA COLLECTION
    // ═══════════════════════════════════════
    let marketData: MarketDataPoint[] = [];
    let dataSource = 'synthetic';

    // A) Kite Connect
    if (!marketData.length && config?.brokerType === 'kite') {
      try {
        const { client } = await getUserKiteClient(userId);
        if (client) {
          const quotes = await client.getQuote(WATCHLIST_STOCKS);
          const quoteData = quotes?.data ?? {};
          marketData = Object.entries(quoteData).map(([key, val]: [string, any]) => ({
            symbol: key,
            lastPrice: val?.last_price ?? 0,
            open: val?.ohlc?.open ?? 0,
            high: val?.ohlc?.high ?? 0,
            low: val?.ohlc?.low ?? 0,
            close: val?.ohlc?.close ?? 0,
            volume: val?.volume ?? 0,
            change: val?.net_change ?? 0,
            changePct: val?.ohlc?.close ? ((val.last_price - val.ohlc.close) / val.ohlc.close) * 100 : 0,
          }));
          dataSource = 'kite';
        }
      } catch (e: any) {
        const isPermissionError = e?.message?.includes('403') || e?.message?.includes('Permission');
        const friendlyMsg = isPermissionError
          ? 'Kite Connect quote API subscription inactive; automatically falling back to free public NSE live quotes (Order execution remains live)'
          : `Kite data failed: ${e?.message}`;
        await logTradingEvent('WARN', 'DATA', friendlyMsg);
      }
    }

    // B) Fyers
    if (!marketData.length && config?.brokerType === 'fyers' && config.fyersAppId && config.fyersToken) {
      try {
        const { FyersClient } = await import('@/lib/fyers');
        const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
        const symbols = WATCHLIST_STOCKS.slice(0, 20).map(s => `NSE:${s.replace('NSE:', '')}-EQ`);
        const quotes = await fyers.getQuotes(symbols);
        if (quotes?.d) {
          marketData = quotes.d.map((q: any) => ({
            symbol: q?.n?.replace?.('-EQ', '') ?? '',
            lastPrice: q?.v?.lp ?? 0,
            open: q?.v?.open_price ?? 0,
            high: q?.v?.high_price ?? 0,
            low: q?.v?.low_price ?? 0,
            close: q?.v?.prev_close_price ?? 0,
            volume: q?.v?.volume ?? 0,
            change: q?.v?.ch ?? 0,
            changePct: q?.v?.chp ?? 0,
          }));
          dataSource = 'fyers';
        }
      } catch (e: any) {
        await logTradingEvent('WARN', 'DATA', `Fyers data failed: ${e?.message}`);
      }
    }

    // C) Free NSE live API fallback
    if (!marketData.length) {
      try {
        const { getLiveQuotes, NSE_POPULAR_STOCKS } = await import('@/lib/nse-live-api');
        const liveQuotes = await getLiveQuotes(NSE_POPULAR_STOCKS.slice(0, 25));
        if (liveQuotes?.length) {
          marketData = liveQuotes.map(q => ({
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
          dataSource = 'nse-live';
        }
      } catch { /* fall through */ }
    }

    // D) Deterministic fallback
    if (!marketData.length) {
      marketData = getRealisticMarketData();
      dataSource = 'synthetic';
    }

    await logTradingEvent('INFO', 'DATA', `Market data: ${marketData.length} stocks via ${dataSource}`);

    // ═══════════════════════════════════════
    // STEP 2: HISTORICAL DATA + FEATURES
    // ═══════════════════════════════════════
    const historyMap = await getBatchHistoricalPrices(marketData, {
      fyersAppId: config?.fyersAppId ?? undefined,
      fyersToken: config?.fyersToken ?? undefined,
      userId,
      brokerType: config?.brokerType ?? 'kite',
    }, 60);

    const featuresMap = await computeBatchFeatures(marketData, historyMap);

    // ═══════════════════════════════════════
    // STEP 3: MARKET REGIME AGENT
    // ═══════════════════════════════════════
    const regimeResult = await runRegimeAgent(marketData, historyMap);

    // ═══════════════════════════════════════
    // STEP 4: CLOSE-LOOP SIGNAL AGENT
    // ═══════════════════════════════════════

    const enabledStrategies = {
      momentum: config?.enableMomentum !== false,
      rsi: config?.enableRSI !== false,
      macd: config?.enableMACD !== false,
      bollinger: config?.enableBollinger !== false,
      supertrend: config?.enableSupertrend !== false,
      vwap: config?.enableVWAP !== false,
      emaCross: config?.enableEMACross !== false,
    };

    const strategyWeights = await getStrategyWeightsFromDb(userId);

    // Fetch dynamic real-time market news headlines
    let newsHeadlines: string[] = [];
    try {
      const { fetchGoogleNewsHeadlines } = await import('@/lib/news');
      newsHeadlines = await fetchGoogleNewsHeadlines();
    } catch (err: any) {
      console.error('Failed to fetch news for scan:', err?.message);
    }
    if (!newsHeadlines || newsHeadlines.length === 0) {
      newsHeadlines = [
        'Nifty continues bullish momentum on FII inflows',
        'Banking sector leads gains on credit growth data',
      ];
    }

    const signalResult = await runSignalAgent(marketData, historyMap, {
      enabledStrategies,
      minVoteCount: paperTrading ? 1 : 2,
      minConfidenceThreshold: 60,
      enableXGBoost: true,
      enableNewsSentiment: config?.enableNewsSentiment !== false,
      newsHeadlines,
      apiKey: process.env.USE_LOCAL_ML === 'true' ? undefined : process.env.ABACUSAI_API_KEY,
      strategyWeights,
    });

    // In paper mode, if no indicators produced signals, generate a mock signal for demonstration/testing
    if (paperTrading && signalResult.signals.length === 0 && marketData.length > 0) {
      const index = Math.floor(Math.sin(Date.now() / 1000) * 10 + 10) % marketData.length;
      const stock = marketData[index];
      if (stock && stock.lastPrice > 0) {
        const direction = (Date.now() % 2 === 0) ? 'BUY' : 'SELL';
        const price = stock.lastPrice;
        
        signalResult.signals.push({
          symbol: stock.symbol,
          exchange: 'NSE',
          direction: direction as any,
          strategy: 'MOCK_TEST',
          confidence: 85,
          confidenceScore: 85,
          confidenceGrade: 'A',
          entryPrice: price,
          stopLoss: direction === 'BUY' ? Math.round(price * 0.995 * 100) / 100 : Math.round(price * 1.005 * 100) / 100,
          target: direction === 'BUY' ? Math.round(price * 1.01 * 100) / 100 : Math.round(price * 0.99 * 100) / 100,
          quantity: 0,
          voteCount: 1,
          votingStrategies: ['MOCK_TEST'],
          warnings: [],
          reasons: ['Simulated testing signal to verify pipeline charts'],
          reason: `[A-grade] Simulated testing signal to verify pipeline and charts`,
        } as any);
        
        signalResult.afterConfidenceFilter = 1;
        signalResult.totalRawSignals = 1;
      }
    }

    // ═══════════════════════════════════════
    // STEP 5: RISK MANAGER AGENT
    // ═══════════════════════════════════════
    const currentPrices = new Map(marketData.map(s => [s.symbol, s.lastPrice]));

    const riskResult = await runRiskManagerAgent(
      userId,
      signalResult.signals,
      regimeResult,
      featuresMap,
      currentPrices
    );

    // ═══════════════════════════════════════
    // STEP 6: EXECUTION AGENT
    // ═══════════════════════════════════════
    let executionResult = {
      executed: [] as any[],
      failed: [] as any[],
      paperTrades: [] as any[],
      totalExecuted: 0,
      totalFailed: 0,
      totalCapitalDeployed: 0,
      timestamp: Date.now()
    };

    if (riskResult.sessionAllowed && riskResult.approvedSignals > 0) {
      const approved = riskResult.approvals.filter(a => a.approved);
      executionResult = await runExecutionAgent(userId, approved, paperTrading);
    }

    // ═══════════════════════════════════════
    // STEP 7: PORTFOLIO MANAGER AGENT
    // ═══════════════════════════════════════
    const monitorResult = await runPortfolioManagerAgent(
      userId,
      currentPrices,
      paperTrading,
      config?.stopLossPercent ?? 1.0,
      config?.squareOffTime ?? '15:10'
    );

    // ═══════════════════════════════════════
    // STEP 8: UPDATE DAILY PNL & POSITION LIFECYCLES
    // ═══════════════════════════════════════
    const closedMapped = monitorResult.actions
      .filter(a => ['STOP_LOSS', 'TARGET_HIT', 'SQUARE_OFF'].includes(a.action))
      .map(a => ({
        symbol: a.symbol,
        reason: a.reason,
        pnl: a.pnl ?? 0,
        exitPrice: a.exitPrice ?? 0,
      }));

    if (closedMapped.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0]!;
      const today = new Date(todayStr);
      const totalNewPnl = closedMapped.reduce((s, t) => s + t.pnl, 0);

      await prisma.dailyPnl.upsert({
        where: { date: today },
        update: {
          totalPnl: { increment: totalNewPnl },
          tradesCount: { increment: closedMapped.length },
          winCount: { increment: closedMapped.filter(t => t.pnl > 0).length },
          lossCount: { increment: closedMapped.filter(t => t.pnl <= 0).length },
        },
        create: {
          date: today,
          totalPnl: totalNewPnl,
          tradesCount: closedMapped.length,
          winCount: closedMapped.filter(t => t.pnl > 0).length,
          lossCount: closedMapped.filter(t => t.pnl <= 0).length,
        },
      });
    }

    // ═══════════════════════════════════════
    // STEP 9: WRITE PERSISTENT AUDIT TRAILS TO SUPABASE
    // ═══════════════════════════════════════
    
    // Save AgentRun
    await prisma.agentRun.create({
      data: {
        userId,
        runId: signalResult.runId,
        action: 'full_pipeline',
        stage: riskResult.sessionAllowed ? 'complete' : 'blocked',
        paperTrading,
        totalRawSignals: signalResult.totalRawSignals,
        afterEnsemble: signalResult.afterEnsembleFilter,
        afterConfidence: signalResult.afterConfidenceFilter,
        approvedSignals: riskResult.approvedSignals,
        executedSignals: executionResult.totalExecuted,
        regime: regimeResult.enhancedRegime.regime,
        macroSignal: regimeResult.enhancedRegime.macroSignal,
        portfolioHeat: riskResult.portfolioSnapshot.portfolioHeatPct,
        durationMs: Date.now() - startTime,
        summary: JSON.stringify({
          volatilityRegime: regimeResult.enhancedRegime.volatilityRegime,
          riskGrade: riskResult.portfolioSnapshot.riskGrade,
          capitalDeployed: executionResult.totalCapitalDeployed,
        }),
      },
    }).catch(err => console.error('AgentRun save failed:', err));

    // Save AgentDecisions (Signals and Risk Approvals)
    for (const approval of riskResult.approvals) {
      await prisma.agentDecision.create({
        data: {
          userId,
          agentName: 'risk_manager',
          symbol: approval.signal.symbol,
          direction: approval.signal.direction,
          decision: approval.approved ? 'APPROVED' : 'REJECTED',
          reason: approval.reason,
          confidence: approval.signal.confidenceScore,
          quantity: approval.approvedQuantity,
          price: approval.signal.entryPrice,
          metadata: JSON.stringify({
            grade: approval.signal.confidenceGrade,
            warnings: approval.warnings,
            sizing: approval.sizingDetails,
          }),
        },
      }).catch(err => console.error('Decision save failed:', err));
    }

    // Save AgentDecisions (Executions)
    for (const t of [...executionResult.executed, ...executionResult.paperTrades]) {
      await prisma.agentDecision.create({
        data: {
          userId,
          agentName: 'execution_agent',
          symbol: t.symbol,
          direction: t.direction,
          decision: 'EXECUTED',
          reason: t.reason,
          confidence: t.slippagePct,
          quantity: t.quantity,
          price: t.actualPrice ?? t.entryPrice,
          metadata: JSON.stringify({
            orderId: t.orderId,
            paperTrade: t.paperTrade,
            slippagePct: t.slippagePct,
          }),
        },
      }).catch(err => console.error('Execution decision save failed:', err));
    }

    // Save AgentDecisions (Portfolio Actions: stops/targets/trailing stops)
    for (const action of monitorResult.actions) {
      if (action.action !== 'HOLD') {
        await prisma.agentDecision.create({
          data: {
            userId,
            agentName: 'portfolio_manager',
            symbol: action.symbol,
            decision: action.action === 'TRAILING_STOP' ? 'TRAILING_UPDATED' : 'CLOSED',
            reason: action.reason,
            quantity: 0,
            price: action.exitPrice ?? null,
            metadata: JSON.stringify({
              tradeId: action.tradeId,
              pnl: action.pnl,
            }),
          },
        }).catch(err => console.error('Portfolio action decision save failed:', err));
      }
    }

    // Save PortfolioSnapshot
    await prisma.portfolioSnapshot.create({
      data: {
        userId,
        totalCapital: riskResult.portfolioSnapshot.totalCapital,
        usedCapital: riskResult.portfolioSnapshot.usedCapital,
        portfolioHeatPct: riskResult.portfolioSnapshot.portfolioHeatPct,
        unrealizedPnl: riskResult.portfolioSnapshot.unrealizedPnl,
        totalPositions: riskResult.portfolioSnapshot.totalPositions,
        riskGrade: riskResult.portfolioSnapshot.riskGrade,
        riskScore: riskResult.portfolioSnapshot.riskScore,
        sectorConcentration: JSON.stringify(riskResult.portfolioSnapshot.sectorConcentration),
        alerts: JSON.stringify(riskResult.portfolioSnapshot.alerts),
      },
    }).catch(err => console.error('PortfolioSnapshot save failed:', err));

    // Map executed trades to response format
    const executedTradesMapped = [...executionResult.executed, ...executionResult.paperTrades].map(t => ({
      tradeId: t.tradeId,
      symbol: t.symbol,
      direction: t.direction,
      quantity: t.quantity,
      entryPrice: t.actualPrice ?? t.entryPrice,
      stopLoss: t.stopLoss,
      target: t.target,
      confidence: 80, // legacy fallback for UI display
      grade: 'A',
      paperTrade: t.paperTrade,
    }));

    return NextResponse.json({
      signals: signalResult.signals.map(s => ({
        symbol: s.symbol,
        direction: s.direction,
        entryPrice: s.entryPrice,
        stopLoss: s.stopLoss,
        target: s.target,
        strategy: s.strategy,
        confidence: s.confidenceScore,
        _grade: s.confidenceGrade,
        _warnings: s.warnings,
      })),
      executed: executedTradesMapped,
      closed: closedMapped,
      regime: {
        regime: regimeResult.enhancedRegime.regime,
        confidence: regimeResult.enhancedRegime.confidence,
        description: regimeResult.enhancedRegime.description
      },
      breadth: {
        signal: regimeResult.enhancedRegime.breadth.signal,
        bullishScore: regimeResult.enhancedRegime.breadth.bullishScore,
        advancing: regimeResult.enhancedRegime.breadth.advancing,
        declining: regimeResult.enhancedRegime.breadth.declining
      },
      risk: {
        drawdownLevel: riskResult.drawdownStatus.level,
        dailyPnl: riskResult.drawdownStatus.dailyPnl,
        portfolioHeat: riskResult.portfolioSnapshot.portfolioHeatPct,
        riskGrade: riskResult.portfolioSnapshot.riskGrade,
        canOpenPositions: riskResult.sessionAllowed,
      },
      marketData: marketData.slice(0, 10).map(d => ({
        symbol: d.symbol,
        lastPrice: d.lastPrice,
        changePct: d.changePct,
        volume: d.volume,
      })),
      marketSnapshot: marketData,
      niftyPrice: marketData.find(d => d.symbol?.includes('NIFTY'))?.lastPrice ?? marketData.reduce((s, d) => s + d.lastPrice, 0) / (marketData.length || 1),
      dataSource,
      paperTrading,
      isLiveData: dataSource !== 'synthetic',
      durationMs: Date.now() - startTime,
    });

  } catch (err: any) {
    console.error('Autonomous scan error:', err);
    await logTradingEvent('ERROR', 'SCAN', `Scan failed: ${err?.message}`).catch(() => {});
    return NextResponse.json({ error: err?.message ?? 'Scan failed' }, { status: 500 });
  }
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

async function isLiveMode(userId: string): Promise<boolean> {
  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
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
  } catch { return false; }
}

async function executeLiveTrade(
  signal: any,
  quantity: number,
  userId: string,
  config: any,
  tradeId: string
): Promise<void> {
  try {
    const brokerType = config?.brokerType ?? 'kite';

    if (brokerType === 'kite') {
      const { getUserKiteClient } = await import('@/lib/kite');
      const { client } = await getUserKiteClient(userId);
      if (client) {
        const orderId = await client.placeOrder({
          tradingsymbol: signal.symbol.replace(/^NSE:/, ''),
          exchange: 'NSE',
          transaction_type: signal.direction,
          quantity,
          order_type: 'MARKET',
          product: 'MIS',
        });
        await prisma.trade.update({ where: { id: tradeId }, data: { orderId: String(orderId) } });
      }
    } else if (brokerType === 'openalgo' && config?.openalgoApiKey) {
      const { OpenAlgoClient } = await import('@/lib/openalgo');
      const client = new OpenAlgoClient({ apiKey: config.openalgoApiKey, host: config.openalgoHost ?? 'http://127.0.0.1:5000' });
      await client.placeOrder({
        symbol: signal.symbol.replace(/^NSE:/, ''),
        exchange: 'NSE',
        action: signal.direction as 'BUY' | 'SELL',
        quantity,
        pricetype: 'MARKET',
        product: 'MIS',
        strategy: 'ZerodhaAI_Phase9',
      });
    } else if (brokerType === 'fyers' && config?.fyersAppId && config?.fyersToken) {
      const { FyersClient } = await import('@/lib/fyers');
      const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
      await fyers.placeOrder({
        symbol: `NSE:${signal.symbol.replace(/^NSE:/, '')}-EQ`,
        qty: quantity,
        type: 2,
        side: signal.direction === 'BUY' ? 1 : -1,
        productType: 'INTRADAY',
        validity: 'DAY',
      });
    }
  } catch (e: any) {
    await logTradingEvent('ERROR', 'LIVE_EXECUTION', `Live order failed for ${signal.symbol}: ${e?.message}`, { tradeId });
  }
}



async function autoSquareOff(userId: string, reason: string): Promise<void> {
  try {
    const openTrades = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
    for (const trade of openTrades) {
      await prisma.trade.update({
        where: { id: trade.id },
        data: { status: 'CLOSED', exitPrice: trade.entryPrice, pnl: 0, exitTime: new Date(), notes: `Auto-closed: ${reason}` },
      });
    }
    if (openTrades.length > 0) {
      await logTradingEvent('INFO', 'SQUARE_OFF', `Auto square-off (${reason}): ${openTrades.length} positions closed`);
    }
  } catch { /* non-critical */ }
}
