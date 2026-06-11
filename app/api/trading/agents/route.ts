// Agent Orchestration API Route — Phase 9
// Master pipeline: SignalAgent → RegimeAgent → RiskManagerAgent → ExecutionAgent
// Also handles PortfolioManagerAgent monitoring and SelfLearningAgent (post-market).

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runSignalAgent } from '@/lib/agents/signal-agent';
import { runRegimeAgent } from '@/lib/agents/market-regime-agent';
import { runRiskManagerAgent } from '@/lib/agents/risk-manager-agent';
import { runExecutionAgent } from '@/lib/agents/execution-agent';
import { runPortfolioManagerAgent } from '@/lib/agents/portfolio-manager-agent';
import { runSelfLearningAgent, getStrategyWeightsFromDb } from '@/lib/agents/self-learning-agent';
import { getBatchHistoricalPrices } from '@/lib/historical-data';
import { computeBatchFeatures } from '@/lib/feature-store';
import { runDataGuard } from '@/lib/real-data-guard';
import { isMarketOpen } from '@/lib/trading-engine';
import type { MarketDataPoint } from '@/lib/strategies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const body = await request.json().catch(() => ({}));
    const {
      action = 'full_pipeline',  // 'full_pipeline' | 'monitor' | 'learn' | 'status'
      marketData = [],
      paperTrading = true,
      realDataOnly = false,
      newsHeadlines = [],
    } = body;

    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    if (!config) {
      return NextResponse.json({ error: 'Trading config not found' }, { status: 400 });
    }

    // ─── STATUS CHECK ─────────────────────────────────────────────────────
    if (action === 'status') {
      const openPositions = await prisma.trade.count({ where: { userId, status: 'OPEN' } });
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayTrades = await prisma.trade.findMany({
        where: { userId, exitTime: { gte: todayStart }, status: 'CLOSED' },
      });
      const todayPnl = todayTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);

      return NextResponse.json({
        marketOpen: isMarketOpen(),
        openPositions,
        todayPnl: Math.round(todayPnl * 100) / 100,
        todayTrades: todayTrades.length,
        paperTrading,
      });
    }

    // ─── PORTFOLIO MONITORING ──────────────────────────────────────────────
    if (action === 'monitor') {
      const stocks: MarketDataPoint[] = marketData;
      const currentPrices = new Map<string, number>(stocks.map(s => [s.symbol, s.lastPrice]));

      const monitorResult = await runPortfolioManagerAgent(
        userId,
        currentPrices,
        paperTrading,
        config.stopLossPercent ?? 1.0,
        config.squareOffTime ?? '15:10'
      );

      return NextResponse.json({
        action: 'monitor',
        result: monitorResult,
        durationMs: Date.now() - startTime,
      });
    }

    // ─── SELF-LEARNING ─────────────────────────────────────────────────────
    if (action === 'learn') {
      const learningResult = await runSelfLearningAgent(
        userId,
        config.telegramChatId ?? undefined,
        config.enableTelegram ?? false
      );
      return NextResponse.json({
        action: 'learn',
        result: learningResult,
        durationMs: Date.now() - startTime,
      });
    }

    // ─── FULL AGENT PIPELINE ───────────────────────────────────────────────
    if (action !== 'full_pipeline') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const stocks: MarketDataPoint[] = marketData;
    if (!stocks.length) {
      return NextResponse.json({ error: 'No market data provided' }, { status: 400 });
    }

    // Step 1: Fetch historical data
    const histMap = await getBatchHistoricalPrices(stocks, {
      fyersAppId: config.fyersAppId ?? undefined,
      fyersToken: config.fyersToken ?? undefined,
      userId,
      brokerType: config.brokerType ?? 'kite',
    }, 60);

    // Step 2: Real-data guard
    if (realDataOnly) {
      const guard = runDataGuard(histMap, true);
      if (guard.blocked) {
        return NextResponse.json({
          error: 'Real-data guard blocked execution',
          reason: guard.reason,
          realDataPercent: guard.realDataPercent,
        }, { status: 422 });
      }
    }

    // Step 3: Compute features
    const featuresMap = await computeBatchFeatures(stocks, histMap);

    // Step 4: Run Signal Agent
    const enabledStrategies = {
      momentum: config.enableMomentum,
      rsi: config.enableRSI,
      macd: config.enableMACD,
      bollinger: config.enableBollinger,
      supertrend: config.enableSupertrend,
      vwap: config.enableVWAP,
      emaCross: config.enableEMACross,
    };

    const strategyWeights = await getStrategyWeightsFromDb(userId);

    const signalResult = await runSignalAgent(stocks, histMap, {
      enabledStrategies,
      minVoteCount: 2,
      minConfidenceThreshold: 60,
      enableXGBoost: true,
      enableNewsSentiment: config.enableNewsSentiment,
      newsHeadlines,
      apiKey: process.env.ABACUSAI_API_KEY,
      strategyWeights,
    });

    // Step 5: Run Market Regime Agent
    const regimeResult = await runRegimeAgent(stocks);

    // Step 6: Run Risk Manager Agent
    const currentPrices = new Map<string, number>(stocks.map(s => [s.symbol, s.lastPrice]));

    const riskResult = await runRiskManagerAgent(
      userId,
      signalResult.signals,
      regimeResult,
      featuresMap,
      currentPrices
    );

    if (!riskResult.sessionAllowed) {
      return NextResponse.json({
        action: 'full_pipeline',
        stage: 'risk_blocked',
        reason: riskResult.sessionBlockReason,
        drawdownStatus: riskResult.drawdownStatus,
        portfolioSnapshot: riskResult.portfolioSnapshot,
        signalStats: {
          rawSignals: signalResult.totalRawSignals,
          afterEnsemble: signalResult.afterEnsembleFilter,
          afterConfidence: signalResult.afterConfidenceFilter,
        },
        durationMs: Date.now() - startTime,
      });
    }

    // Step 7: Run Execution Agent (only approved signals)
    const approvedSignals = riskResult.approvals.filter(a => a.approved);
    const executionResult = await runExecutionAgent(userId, approvedSignals, paperTrading);

    // Step 8: Concurrent portfolio monitoring
    const monitorResult = await runPortfolioManagerAgent(
      userId,
      currentPrices,
      paperTrading,
      config.stopLossPercent ?? 1.0,
      config.squareOffTime ?? '15:10'
    );

    // Audit log for full pipeline run
    await prisma.tradingLog.create({
      data: {
        level: 'INFO',
        source: 'AGENT_ORCHESTRATOR',
        message: `Full pipeline: ${signalResult.totalRawSignals} raw → ${signalResult.afterConfidenceFilter} signals → ${riskResult.approvedSignals} approved → ${executionResult.totalExecuted} executed`,
        data: JSON.stringify({
          regime: signalResult.regime.regime,
          paperTrading,
          durationMs: Date.now() - startTime,
        }),
      },
    });

    return NextResponse.json({
      action: 'full_pipeline',
      pipeline: {
        signalAgent: {
          totalRawSignals: signalResult.totalRawSignals,
          afterEnsemble: signalResult.afterEnsembleFilter,
          afterConfidence: signalResult.afterConfidenceFilter,
          topSignals: signalResult.signals.slice(0, 5).map(s => ({
            symbol: s.symbol,
            direction: s.direction,
            confidence: s.confidenceScore,
            grade: s.confidenceGrade,
            strategies: s.votingStrategies,
          })),
          regime: {
            regime: signalResult.regime.regime,
            confidence: signalResult.regime.confidence,
          },
        },
        regimeAgent: {
          regime: regimeResult.enhancedRegime.regime,
          macroSignal: regimeResult.enhancedRegime.macroSignal,
          volatilityRegime: regimeResult.enhancedRegime.volatilityRegime,
          positionSizeMultiplier: regimeResult.positionSizeMultiplier,
          allowLong: regimeResult.allowLongTrades,
          allowShort: regimeResult.allowShortTrades,
          breadthSignal: regimeResult.enhancedRegime.breadth.signal,
          breadthScore: regimeResult.enhancedRegime.breadth.bullishScore,
        },
        riskAgent: {
          sessionAllowed: riskResult.sessionAllowed,
          approvedSignals: riskResult.approvedSignals,
          rejectedSignals: riskResult.rejectedSignals,
          drawdownLevel: riskResult.drawdownStatus.level,
          portfolioHeat: riskResult.portfolioSnapshot.portfolioHeatPct,
          riskGrade: riskResult.portfolioSnapshot.riskGrade,
        },
        executionAgent: {
          executed: executionResult.totalExecuted,
          failed: executionResult.totalFailed,
          capitalDeployed: executionResult.totalCapitalDeployed,
          paperTrading,
        },
        portfolioManager: {
          positionsMonitored: monitorResult.positionsChecked,
          stopsTriggered: monitorResult.stopsTriggered,
          targetsHit: monitorResult.targetsHit,
          squaredOff: monitorResult.squaredOff,
          totalPnl: monitorResult.totalPnl,
        },
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    });

  } catch (err: any) {
    console.error('Agent pipeline error:', err?.message);
    return NextResponse.json(
      { error: 'Agent pipeline failed', details: err?.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const recentLogs = await prisma.tradingLog.findMany({
    where: { source: { in: ['AGENT_ORCHESTRATOR', 'SIGNAL_AGENT', 'EXECUTION_AGENT', 'PORTFOLIO_MANAGER', 'SELF_LEARNING_AGENT'] } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ logs: recentLogs });
}
