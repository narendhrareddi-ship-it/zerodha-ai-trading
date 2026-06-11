import { PrismaClient } from '@prisma/client';
import { getRealisticMarketData } from '../lib/nse-data';
import { getBatchHistoricalPrices } from '../lib/historical-data';
import { computeBatchFeatures } from '../lib/feature-store';
import { runSignalAgent } from '../lib/agents/signal-agent';
import { runRegimeAgent } from '../lib/agents/market-regime-agent';
import { runRiskManagerAgent } from '../lib/agents/risk-manager-agent';
import { runExecutionAgent } from '../lib/agents/execution-agent';
import { runPortfolioManagerAgent } from '../lib/agents/portfolio-manager-agent';
import { getStrategyWeightsFromDb } from '../lib/agents/self-learning-agent';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Simulated Scan Integration Test ---');
  
  // 1. Find the test user 'john@doe.com'
  const user = await prisma.user.findUnique({
    where: { email: 'john@doe.com' },
  });
  
  if (!user) {
    console.error('Test user john@doe.com not found. Make sure to run seeding first.');
    process.exit(1);
  }
  const userId = user.id;
  console.log(`Found test user: ${user.name} (${userId})`);

  // 2. Ensure trading config exists
  const config = await prisma.tradingConfig.findUnique({
    where: { userId },
  });
  if (!config) {
    console.error('TradingConfig not found for user.');
    process.exit(1);
  }
  console.log('Loaded trading configuration.');

  // 3. Ensure BotSession exists and is RUNNING
  let botSession = await prisma.botSession.findFirst({
    where: { userId, status: 'RUNNING' },
  });
  if (!botSession) {
    console.log('No active RUNNING BotSession. Creating one...');
    botSession = await prisma.botSession.create({
      data: {
        userId,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });
  }
  console.log(`Active bot session: ${botSession.id}`);

  // 4. Gather Market Data (Synthetic fallback)
  console.log('Generating market data...');
  const marketData = getRealisticMarketData();
  console.log(`Generated ${marketData.length} stock quotes.`);

  // 5. Retrieve historical data
  console.log('Fetching batch historical data (60 bars)...');
  const historyMap = await getBatchHistoricalPrices(marketData, {
    userId,
    brokerType: 'kite',
  }, 60);

  // 6. Compute features
  console.log('Computing technical indicators/features...');
  const featuresMap = await computeBatchFeatures(marketData, historyMap);

  // 7. Run Market Regime Agent
  console.log('Running Regime Agent...');
  const regimeResult = await runRegimeAgent(marketData, historyMap);
  console.log(`Regime: ${regimeResult.enhancedRegime.regime}, Bullish Breadth Score: ${regimeResult.enhancedRegime.breadth.bullishScore}%`);

  // 8. Run Signal Agent (using confidence weights)
  console.log('Loading self-learning strategy weights...');
  const strategyWeights = await getStrategyWeightsFromDb(userId);
  console.log('Loaded weights:', strategyWeights);

  const enabledStrategies = {
    momentum: config.enableMomentum,
    rsi: config.enableRSI,
    macd: config.enableMACD,
    bollinger: config.enableBollinger,
    supertrend: config.enableSupertrend,
    vwap: config.enableVWAP,
    emaCross: config.enableEMACross,
  };

  console.log('Running Close-Loop Signal Agent...');
  const signalResult = await runSignalAgent(marketData, historyMap, {
    enabledStrategies,
    minVoteCount: 2,
    minConfidenceThreshold: 60,
    enableXGBoost: true,
    enableNewsSentiment: true,
    newsHeadlines: [
      'Nifty continues bullish momentum on FII inflows',
      'Banking sector leads gains on credit growth data',
    ],
    apiKey: process.env.ABACUSAI_API_KEY,
    strategyWeights,
  });
  console.log(`Generated ${signalResult.totalRawSignals} raw signals. Passed filters: ${signalResult.afterConfidenceFilter}`);

  // 9. Run Risk Manager Agent
  console.log('Running Risk Manager Agent...');
  const currentPrices = new Map(marketData.map(s => [s.symbol, s.lastPrice]));
  const riskResult = await runRiskManagerAgent(
    userId,
    signalResult.signals,
    regimeResult,
    featuresMap,
    currentPrices
  );
  console.log(`Approved signals: ${riskResult.approvedSignals}, Session allowed: ${riskResult.sessionAllowed}`);

  // 10. Run Execution Agent (Paper Trading)
  console.log('Running Execution Agent...');
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
    executionResult = await runExecutionAgent(userId, approved, true); // force paper trading
  }
  console.log(`Executed trades: ${executionResult.totalExecuted}, Capital deployed: ₹${executionResult.totalCapitalDeployed}`);

  // 11. Run Portfolio Manager Agent
  console.log('Running Portfolio Manager Agent...');
  const monitorResult = await runPortfolioManagerAgent(
    userId,
    currentPrices,
    true, // paper trading
    config.stopLossPercent,
    config.squareOffTime
  );
  console.log(`Portfolio manager actions: ${monitorResult.actions.length}`);

  // 12. Save AgentRun to Database
  console.log('Saving AgentRun record...');
  const runRecord = await prisma.agentRun.create({
    data: {
      userId,
      runId: signalResult.runId,
      action: 'full_pipeline',
      stage: riskResult.sessionAllowed ? 'complete' : 'blocked',
      paperTrading: true,
      totalRawSignals: signalResult.totalRawSignals,
      afterEnsemble: signalResult.afterEnsembleFilter,
      afterConfidence: signalResult.afterConfidenceFilter,
      approvedSignals: riskResult.approvedSignals,
      executedSignals: executionResult.totalExecuted,
      regime: regimeResult.enhancedRegime.regime,
      macroSignal: regimeResult.enhancedRegime.macroSignal,
      portfolioHeat: riskResult.portfolioSnapshot.portfolioHeatPct,
      durationMs: 1200,
      summary: JSON.stringify({
        volatilityRegime: regimeResult.enhancedRegime.volatilityRegime,
        riskGrade: riskResult.portfolioSnapshot.riskGrade,
        capitalDeployed: executionResult.totalCapitalDeployed,
      }),
    },
  });
  console.log(`--> Saved AgentRun: ${runRecord.id}`);

  // 13. Save AgentDecisions (Approvals & Rejections)
  console.log('Saving AgentDecision records...');
  let decisionCount = 0;
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
    });
    decisionCount++;
  }

  // 14. Save Executions
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
    });
    decisionCount++;
  }
  console.log(`--> Saved ${decisionCount} AgentDecision records.`);

  // 15. Save PortfolioSnapshot
  console.log('Saving PortfolioSnapshot record...');
  const snapshotRecord = await prisma.portfolioSnapshot.create({
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
  });
  console.log(`--> Saved PortfolioSnapshot: ${snapshotRecord.id}`);

  console.log('--- Simulated Scan Integration Test Completed Successfully ---');
}

main()
  .catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
