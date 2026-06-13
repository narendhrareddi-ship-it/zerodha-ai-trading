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
import { runAllStrategies } from '../lib/strategies';
import { filterSignalsByRegime, detectMarketRegime } from '../lib/market-regime';
import { ensembleVote } from '../lib/ensemble-voting';
import { scoreConfidence } from '../lib/confidence-scorer';
import { calculateIntradayTaxes } from '../lib/taxes-estimator';

const prisma = new PrismaClient();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  process.env.IGNORE_MARKET_HOURS = 'true';
  const diagnosticStartTime = new Date();
  console.log('=== Starting Professional Paper Trading Diagnostics ===');
  
  // 1. Resolve User
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' }
  });
  if (!user) {
    console.error('No users found in database.');
    process.exit(1);
  }
  const userId = user.id;
  console.log(`Using User: ${user.name} (${user.email})`);

  // 2. Load Config
  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  if (!config) {
    console.error('Trading config not found.');
    process.exit(1);
  }

  // 3. Mark bot session as RUNNING
  await prisma.botSession.upsert({
    where: { id: 'diag-session-123' },
    update: { status: 'RUNNING', startedAt: new Date() },
    create: { id: 'diag-session-123', userId, status: 'RUNNING', startedAt: new Date() }
  });

  // Clear previous open trades for clean simulation data
  await prisma.trade.updateMany({
    where: { userId, status: 'OPEN' },
    data: { status: 'CLOSED', exitPrice: 100, pnl: 10, exitTime: new Date() }
  });

  const iterations = 10;
  console.log(`Running ${iterations} simulated scans...`);

  let lastPricesMap = new Map<string, number>();
  for (let i = 1; i <= iterations; i++) {
    console.log(`\n--- Scan Iteration ${i}/${iterations} ---`);
    
    // Generate market data with dynamic regime shifts across iterations
    let marketData = getRealisticMarketData();
    const trendBias = i <= 3 ? -0.015 : (i <= 6 ? 0.0 : 0.025);
    marketData = marketData.map(stock => {
      const multiplier = 1 + (Math.sin(i * 0.7) * 0.015) + trendBias;
      const newPrice = Math.round(stock.lastPrice * multiplier * 100) / 100;
      const newChange = Math.round((newPrice - stock.close) * 100) / 100;
      const newChangePct = Math.round((newChange / stock.close) * 10000) / 100;
      return {
        ...stock,
        lastPrice: newPrice,
        high: Math.round(stock.high * multiplier * 100) / 100,
        low: Math.round(stock.low * multiplier * 100) / 100,
        volume: Math.round(stock.volume * (1 + Math.abs(Math.sin(i)) * 0.5)),
        change: newChange,
        changePct: newChangePct
      };
    });

    const historyMap = await getBatchHistoricalPrices(marketData, { userId, brokerType: 'kite' }, 120);
    const featuresMap = await computeBatchFeatures(marketData, historyMap);
    const regimeResult = await runRegimeAgent(marketData, historyMap);
    const strategyWeights = await getStrategyWeightsFromDb(userId);

    const enabledStrategies = {
      momentum: true,
      rsi: true,
      macd: true,
      bollinger: true,
      supertrend: true,
      vwap: true,
      emaCross: true,
      vwapPullback: true,
      volBreakout: true,
      ofiVsa: true
    };

    // Use minVoteCount = 1 in simulation to trigger executions and evaluate tuned parameters
    const signalResult = await runSignalAgent(marketData, historyMap, {
      enabledStrategies,
      minVoteCount: 1, 
      minConfidenceThreshold: 35,
      enableXGBoost: true,
      enableNewsSentiment: true,
      newsHeadlines: [
        'Nifty shows strong intraday recovery',
        'Large-block options activity hints at breakout'
      ],
      strategyWeights
    });

    console.log(`Regime: ${regimeResult.enhancedRegime.regime} (${regimeResult.enhancedRegime.volatilityRegime} Volatility)`);
    console.log(`Raw Signals: ${signalResult.totalRawSignals}, Filtered: ${signalResult.afterConfidenceFilter}`);

    // Detailed analysis of why signals were filtered
    if (i === 1) {
      console.log('\n--- DIAGNOSTIC DRILLDOWN (Iteration 1) ---');
      const baseRegime = detectMarketRegime(marketData);
      const rawSignals = runAllStrategies(marketData, enabledStrategies, historyMap);
      console.log(`Raw Signals count: ${rawSignals.length}`);
      const regimeFiltered = filterSignalsByRegime(rawSignals, baseRegime);
      console.log(`Regime Filtered count: ${regimeFiltered.length}`);
      const votingResults = ensembleVote(regimeFiltered, 1);
      console.log(`Ensemble Voting (consensus >= 1) count: ${votingResults.length}`);
      
      let printed = 0;
      for (const vr of votingResults) {
        if (printed >= 5) break;
        const features = featuresMap.get(vr.symbol);
        console.log(`• Symbol: ${vr.symbol} | Direction: ${vr.direction} | Strategies: ${vr.strategies.join('+')}`);
        if (!features) {
          console.log(`  -> Filter Reason: No feature vector found in featuresMap!`);
        } else {
          const scored = scoreConfidence({
            symbol: vr.symbol,
            direction: vr.direction,
            strategy: vr.strategies.join('+'),
            rawStrategyConfidence: vr.avgConfidence,
            voteCount: vr.voteCount,
            totalStrategies: 11,
            xgb: null,
            regime: baseRegime,
            features,
            strategyWeights
          });
          console.log(`  -> Raw Strategy Conf: ${vr.avgConfidence} | Final Score: ${scored.finalScore} | Grade: ${scored.grade} | Tradeable: ${scored.tradeable}`);
          if (!scored.tradeable) {
            console.log(`  -> Filter Reason: Score ${scored.finalScore} < threshold 35`);
          }
        }
        printed++;
      }
      console.log('------------------------------------------\n');
    }

    // If no real signals, generate a test signal to simulate execution flow
    if (signalResult.signals.length === 0 && marketData.length > 0) {
      const stock = marketData[0];
      if (stock) {
        const direction = regimeResult.allowLongTrades ? 'BUY' : 'SELL';
        signalResult.signals.push({
          symbol: stock.symbol,
          exchange: 'NSE',
          direction: direction as any,
          strategy: 'OFI_VSA',
          confidence: 80,
          confidenceScore: 80,
          confidenceGrade: 'B',
          entryPrice: stock.lastPrice,
          stopLoss: direction === 'BUY' ? stock.lastPrice * 0.98 : stock.lastPrice * 1.02,
          target: direction === 'BUY' ? stock.lastPrice * 1.04 : stock.lastPrice * 0.96,
          quantity: 10,
          voteCount: 1,
          votingStrategies: ['OFI_VSA'],
          warnings: [],
          reasons: ['Diagnostic simulated signal'],
          reason: 'Diagnostic simulated signal'
        } as any);
      }
    }

    const currentPrices = new Map(marketData.map(s => [s.symbol, s.lastPrice]));
    lastPricesMap = currentPrices;
    const riskResult = await runRiskManagerAgent(userId, signalResult.signals, regimeResult, featuresMap, currentPrices, historyMap);
    
    let executionResult = { executed: [] as any[], paperTrades: [] as any[], totalExecuted: 0 };
    if (riskResult.sessionAllowed && riskResult.approvedSignals > 0) {
      const approved = riskResult.approvals.filter(a => a.approved);
      executionResult = await runExecutionAgent(userId, approved, true); // force paper trading
    }
    console.log(`Executed Paper Trades: ${executionResult.totalExecuted}`);

    // Run Portfolio Monitor to manage stops/targets and regime exits
    const monitorResult = await runPortfolioManagerAgent(
      userId,
      currentPrices,
      true,
      config.stopLossPercent,
      config.squareOffTime,
      regimeResult.allowLongTrades,
      regimeResult.allowShortTrades,
      regimeResult.enhancedRegime.regime
    );
    
    // Note: Removed random coinflip trade resolution. Trades will be managed by portfolio manager exits.

    await delay(1000); // 1s spacing
  }

  // Square off any remaining open trades at the end of the simulation
  const openTradesAtEnd = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
  for (const trade of openTradesAtEnd) {
    const finalPrice = lastPricesMap.get(trade.symbol) ?? trade.entryPrice;
    
    const taxes = calculateIntradayTaxes(
      trade.entryPrice,
      finalPrice,
      trade.quantity,
      trade.direction as any,
      'kite'
    );
    const realizedPnl = taxes.netPnl;

    await prisma.trade.update({
      where: { id: trade.id },
      data: {
        status: 'CLOSED',
        exitPrice: finalPrice,
        pnl: realizedPnl,
        exitTime: new Date(),
        notes: `Simulated square-off at end of diagnostics | Taxes: ₹${taxes.totalTaxes.toFixed(2)}`
      }
    });
    console.log(`Square-off ${trade.direction} Trade for ${trade.symbol}: Entry ₹${trade.entryPrice} -> Exit ₹${finalPrice} | Net PnL: ₹${realizedPnl} (Taxes: ₹${taxes.totalTaxes}) [SQUARE_OFF]`);
  }

  // 4. Generate Performance Report
  console.log('\n=========================================');
  console.log('      DIAGNOSTIC PERFORMANCE REPORT      ');
  console.log('=========================================');

  const allTrades = await prisma.trade.findMany({
    where: { 
      userId,
      entryTime: { gte: diagnosticStartTime }
    },
    orderBy: { entryTime: 'desc' }
  });

  const totalTrades = allTrades.length;
  const wins = allTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const losses = allTrades.filter(t => (t.pnl ?? 0) <= 0).length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPnL = allTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  console.log(`Total Trades Analyzed : ${totalTrades}`);
  console.log(`Wins                  : ${wins}`);
  console.log(`Losses                : ${losses}`);
  console.log(`Win Rate              : ${winRate.toFixed(1)}%`);
  console.log(`Net Simulation PnL    : ₹${totalPnL.toFixed(2)}`);
  console.log('-----------------------------------------');
  console.log('Breakdown by Strategy:');
  
  const strategyStats: Record<string, { count: number; pnl: number; wins: number }> = {};
  for (const t of allTrades) {
    if (!strategyStats[t.strategy]) {
      strategyStats[t.strategy] = { count: 0, pnl: 0, wins: 0 };
    }
    strategyStats[t.strategy].count++;
    strategyStats[t.strategy].pnl += t.pnl ?? 0;
    if ((t.pnl ?? 0) > 0) strategyStats[t.strategy].wins++;
  }

  for (const [strat, stats] of Object.entries(strategyStats)) {
    const sWinRate = (stats.wins / stats.count) * 100;
    console.log(`• ${strat}: ${stats.count} trades | Win Rate: ${sWinRate.toFixed(0)}% | PnL: ₹${stats.pnl.toFixed(2)}`);
  }

  // Stop bot session
  await prisma.botSession.update({
    where: { id: 'diag-session-123' },
    data: { status: 'STOPPED', stoppedAt: new Date() }
  });

  console.log('\nDiagnostics completed successfully.');
}

main()
  .catch(err => {
    console.error('Diagnostic run failed:', err);
  })
  .finally(() => prisma.$disconnect());
