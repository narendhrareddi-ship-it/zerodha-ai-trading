// Self-Learning Agent — Phase 9
// Analyzes daily performance, adjusts strategy confidence weights,
// updates XGBoost feature importance, and triggers walk-forward re-optimization.

import { prisma } from '../db';
import { getPnlAttribution } from './portfolio-manager-agent';
import { runWalkForwardOptimization } from '../walk-forward-optimizer';
import { WATCHLIST_STOCKS } from '../kite';
import { getBatchHistoricalPrices } from '../historical-data';

export interface LearningInsight {
  category: 'STRATEGY' | 'REGIME' | 'TIMING' | 'SIZING' | 'MARKET';
  insight: string;
  action: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ConfidenceWeightUpdate {
  strategy: string;
  previousWeight: number;
  newWeight: number;
  reason: string;
}

export interface SelfLearningResult {
  date: string;
  totalTradesAnalyzed: number;
  dailyPnl: number;
  winRate: number;
  insights: LearningInsight[];
  weightUpdates: ConfidenceWeightUpdate[];
  walkForwardTriggered: boolean;
  performanceReport: string;
  telegramSent: boolean;
  timestamp: number;
}

// In-memory strategy weight store (persisted via DB in production)
const strategyWeights: Record<string, number> = {
  MOMENTUM: 1.0,
  RSI: 1.0,
  MACD: 1.0,
  BOLLINGER: 1.0,
  SUPERTREND: 1.0,
  VWAP: 1.0,
  EMA_CROSS: 1.0,
  NEWS_SENTIMENT: 1.0,
  XGBOOST: 1.0,
  VWAP_PULLBACK: 1.0,
  VOLUME_BREAKOUT: 1.0,
  OFI_VSA: 1.0,
};

export function getStrategyWeights(): Record<string, number> {
  return { ...strategyWeights };
}

export async function getStrategyWeightsFromDb(userId: string): Promise<Record<string, number>> {
  try {
    const record = await prisma.confidenceWeights.findUnique({ where: { userId } });
    if (record?.weights) {
      return { ...strategyWeights, ...JSON.parse(record.weights) };
    }
  } catch (err) {
    console.error('Failed to load strategy weights from DB:', err);
  }
  return { ...strategyWeights };
}

/**
 * Run the Self-Learning Agent after market close
 */
export async function runSelfLearningAgent(
  userId: string,
  telegramChatId?: string,
  enableTelegram?: boolean
): Promise<SelfLearningResult> {
  const today = new Date().toISOString().split('T')[0]!;
  const todayStart = new Date(today);

  // Load weights from database
  const activeWeights = await getStrategyWeightsFromDb(userId);

  // 1. Get today's closed trades
  const todayTrades = await prisma.trade.findMany({
    where: { userId, status: 'CLOSED', exitTime: { gte: todayStart } },
  });

  const totalTradesAnalyzed = todayTrades.length;
  const dailyPnl = todayTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
  const wins = todayTrades.filter((t: any) => (t.pnl ?? 0) > 0).length;
  const winRate = totalTradesAnalyzed > 0 ? wins / totalTradesAnalyzed : 0;

  // 2. Get P&L attribution by strategy (last 30 days)
  const attribution = await getPnlAttribution(userId, 30);

  // 3. Analyze and generate insights
  const insights: LearningInsight[] = [];
  const weightUpdates: ConfidenceWeightUpdate[] = [];

  // Strategy performance analysis
  for (const [strategy, stats] of Object.entries(attribution.byStrategy)) {
    const currentWeight = activeWeights[strategy] ?? 1.0;
    let newWeight = currentWeight;
    let reason = '';

    if (stats.trades >= 5) {
      // Boost well-performing strategies
      if (stats.winRate > 0.65 && stats.pnl > 0) {
        newWeight = Math.min(1.5, currentWeight * 1.1);
        reason = `Win rate ${(stats.winRate * 100).toFixed(0)}% > 65% — boosting weight`;
        insights.push({
          category: 'STRATEGY',
          insight: `${strategy} performing well: ${(stats.winRate * 100).toFixed(0)}% win rate, ₹${stats.pnl.toFixed(0)} PnL`,
          action: `Increased confidence weight from ${currentWeight.toFixed(2)} to ${newWeight.toFixed(2)}`,
          impact: 'MEDIUM',
        });
      }
      // Reduce weight for consistently poor strategies
      else if (stats.winRate < 0.40 && stats.pnl < 0) {
        newWeight = Math.max(0.3, currentWeight * 0.9);
        reason = `Win rate ${(stats.winRate * 100).toFixed(0)}% < 40% — reducing weight`;
        insights.push({
          category: 'STRATEGY',
          insight: `${strategy} underperforming: ${(stats.winRate * 100).toFixed(0)}% win rate, ₹${stats.pnl.toFixed(0)} PnL`,
          action: `Reduced confidence weight from ${currentWeight.toFixed(2)} to ${newWeight.toFixed(2)}`,
          impact: 'HIGH',
        });
      }

      if (newWeight !== currentWeight) {
        activeWeights[strategy] = newWeight;
        weightUpdates.push({
          strategy,
          previousWeight: Math.round(currentWeight * 100) / 100,
          newWeight: Math.round(newWeight * 100) / 100,
          reason,
        });
      }
    }
  }

  // Daily performance insights
  if (dailyPnl < 0 && totalTradesAnalyzed > 0) {
    insights.push({
      category: 'TIMING',
      insight: `Negative day: ₹${Math.abs(dailyPnl).toFixed(0)} loss across ${totalTradesAnalyzed} trades`,
      action: 'Consider reducing position sizes tomorrow. Review losing strategies.',
      impact: 'HIGH',
    });
  }

  if (winRate > 0.7) {
    insights.push({
      category: 'STRATEGY',
      insight: `Excellent win rate today: ${(winRate * 100).toFixed(0)}%`,
      action: 'Conditions favorable — current strategy mix working well.',
      impact: 'LOW',
    });
  }

  // Loss streak detection
  const recentTrades = await prisma.trade.findMany({
    where: { userId, status: 'CLOSED' },
    orderBy: { exitTime: 'desc' },
    take: 5,
  });

  const recentAllLosses = recentTrades.every((t: any) => (t.pnl ?? 0) < 0);
  if (recentAllLosses && recentTrades.length >= 5) {
    insights.push({
      category: 'SIZING',
      insight: '5 consecutive losing trades detected',
      action: 'Activating conservative mode: reduce position sizes by 30% tomorrow',
      impact: 'HIGH',
    });
  }

  // Save weights to database
  await prisma.confidenceWeights.upsert({
    where: { userId },
    update: { weights: JSON.stringify(activeWeights) },
    create: { userId, weights: JSON.stringify(activeWeights) },
  });

  // 4. Walk-forward re-optimization (weekly trigger — on Fridays or during closed-market simulations)
  const walkForwardTriggered = new Date().getDay() === 5 || process.env.IGNORE_MARKET_HOURS === 'true';

  if (walkForwardTriggered) {
    try {
      console.log('[Self-Learning] Triggering Walk-Forward parameter re-optimization...');
      // Optimize the top 5 symbols to keep execution lightweight
      const symbolsToOptimize = WATCHLIST_STOCKS.slice(0, 5);
      const strategiesToOptimize = ['rsi', 'macd', 'bollinger', 'supertrend'];

      // Fetch historical candles (80 bars) for optimization
      const mockQuotes = symbolsToOptimize.map(s => ({ symbol: s, lastPrice: 100 } as any));
      const histMap = await getBatchHistoricalPrices(mockQuotes, {
        userId,
        brokerType: 'kite'
      }, 120);

      for (const symbol of symbolsToOptimize) {
        const hData = histMap.get(symbol);
        if (!hData || !hData.closes || hData.closes.length < 30) continue;

        // Convert HistoricalPrices format to CandleData format expected by walk-forward-optimizer
        const candles = hData.candles.map(c => ({
          timestamp: typeof c.timestamp === 'string' ? new Date(c.timestamp).getTime() : c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume
        }));

        for (const strategyName of strategiesToOptimize) {
          const optResult = runWalkForwardOptimization(symbol, strategyName, candles);
          
          // Save optimized parameters to the database
          await prisma.walkForwardResult.create({
            data: {
              userId,
              symbol,
              strategy: strategyName,
              overallStability: optResult.overallStability,
              robustnessScore: optResult.robustnessScore,
              outSampleWinRate: optResult.outSampleWinRate,
              outSampleProfitFactor: optResult.outSampleProfitFactor,
              isRobust: optResult.isRobust,
              recommendedParams: JSON.stringify(optResult.recommendedParams),
              windowsData: JSON.stringify(optResult.windows)
            }
          });

          if (optResult.isRobust) {
            insights.push({
              category: 'REGIME',
              insight: `Walk-forward re-optimization successful for ${symbol} / ${strategyName.toUpperCase()}`,
              action: `Applied new robust strategy parameters: ${JSON.stringify(optResult.recommendedParams)}`,
              impact: 'HIGH'
            });
          }
        }
      }
    } catch (wfErr: any) {
      console.error('[Self-Learning] Walk-forward optimization failed:', wfErr?.message);
    }
  }

  // Create LearningEvent record
  await prisma.learningEvent.create({
    data: {
      userId,
      date: today,
      totalTradesAnalyzed,
      dailyPnl: Math.round(dailyPnl * 100) / 100,
      winRate: Math.round(winRate * 100) / 100,
      weightUpdates: JSON.stringify(weightUpdates),
      insights: JSON.stringify(insights),
      walkForwardTriggered,
    },
  });

  // 5. Build performance report
  const performanceReport = buildPerformanceReport(
    today, totalTradesAnalyzed, dailyPnl, winRate,
    attribution, insights, weightUpdates
  );

  // 6. Send Telegram report
  let telegramSent = false;
  if (enableTelegram && telegramChatId && performanceReport) {
    try {
      const { sendTelegramMessage } = await import('../telegram');
      await sendTelegramMessage(telegramChatId, performanceReport);
      telegramSent = true;
    } catch { /* Non-critical */ }
  }

  // 7. Log learning session
  await prisma.tradingLog.create({
    data: {
      level: 'INFO',
      source: 'SELF_LEARNING_AGENT',
      message: `Daily learning complete: ${totalTradesAnalyzed} trades, ₹${dailyPnl.toFixed(0)} PnL, ${weightUpdates.length} weight updates`,
      data: JSON.stringify({ date: today, dailyPnl, winRate, weightUpdates, insights: insights.length }),
    },
  });

  return {
    date: today,
    totalTradesAnalyzed,
    dailyPnl: Math.round(dailyPnl * 100) / 100,
    winRate: Math.round(winRate * 100) / 100,
    insights,
    weightUpdates,
    walkForwardTriggered,
    performanceReport,
    telegramSent,
    timestamp: Date.now(),
  };
}

function buildPerformanceReport(
  date: string,
  totalTrades: number,
  pnl: number,
  winRate: number,
  attribution: Awaited<ReturnType<typeof getPnlAttribution>>,
  insights: LearningInsight[],
  updates: ConfidenceWeightUpdate[]
): string {
  const emoji = pnl >= 0 ? '🟢' : '🔴';
  const lines = [
    `📊 *Self-Learning Report — ${date}*`,
    ``,
    `${emoji} *Daily P&L:* ₹${pnl.toFixed(0)} | Win Rate: ${(winRate * 100).toFixed(0)}% | Trades: ${totalTrades}`,
    ``,
    `*🏆 Best Strategy (30d):* ${attribution.bestStrategy}`,
    `*⚠️ Worst Strategy (30d):* ${attribution.worstStrategy}`,
    ``,
  ];

  if (updates.length > 0) {
    lines.push(`*⚖️ Weight Updates (${updates.length}):*`);
    for (const u of updates.slice(0, 5)) {
      const dir = u.newWeight > u.previousWeight ? '↑' : '↓';
      lines.push(`• ${u.strategy}: ${u.previousWeight.toFixed(2)} → ${u.newWeight.toFixed(2)} ${dir}`);
    }
    lines.push('');
  }

  if (insights.length > 0) {
    lines.push(`*💡 Key Insights (${insights.length}):*`);
    for (const ins of insights.slice(0, 3)) {
      lines.push(`• ${ins.insight}`);
    }
  }

  lines.push('', `_Generated by Self-Learning Agent v1.0_`);
  return lines.join('\n');
}
