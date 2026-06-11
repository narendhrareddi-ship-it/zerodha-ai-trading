import { PrismaClient } from '@prisma/client';
import { runWalkForwardOptimization } from '../lib/walk-forward-optimizer';
import { getHistoricalPrices } from '../lib/historical-data';
import type { MarketDataPoint } from '../lib/strategies';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Walk-Forward Optimization Integration Test ---');

  // 1. Get the test user
  const user = await prisma.user.findUnique({
    where: { email: 'john@doe.com' },
  });
  if (!user) {
    console.error('Test user john@doe.com not found. Run seeding first.');
    process.exit(1);
  }
  const userId = user.id;

  // 2. Get trading config
  const config = await prisma.tradingConfig.findUnique({
    where: { userId },
  });
  if (!config) {
    console.error('TradingConfig not found for user.');
    process.exit(1);
  }

  // 3. Define params
  const symbol = 'NSE:INFY';
  const strategy = 'RSI';
  const inSampleBars = 60;
  const outSampleBars = 20;

  const dummyStock: MarketDataPoint = {
    symbol,
    lastPrice: 1500,
    open: 1500,
    high: 1515,
    low: 1485,
    close: 1500,
    volume: 400000,
    change: 0,
    changePct: 0,
  };

  const totalBarsNeeded = inSampleBars + outSampleBars * 3; // 120 bars

  // 4. Retrieve historical price candles
  console.log(`Retrieving ${totalBarsNeeded} historical price candles for ${symbol}...`);
  const historyData = await getHistoricalPrices(
    symbol,
    dummyStock,
    {
      userId,
      brokerType: 'kite',
    },
    totalBarsNeeded
  );

  if (!historyData?.candles?.length || historyData.candles.length < (inSampleBars + outSampleBars)) {
    console.error(`Insufficient candles. Available: ${historyData?.candles?.length ?? 0}, Needed: ${inSampleBars + outSampleBars}`);
    process.exit(1);
  }
  console.log(`Successfully fetched ${historyData.candles.length} candles.`);

  // 5. Execute optimization search
  console.log('Running rolling-window grid search and out-of-sample validation...');
  const optimizationResult = runWalkForwardOptimization(
    symbol,
    strategy.toLowerCase(),
    historyData.candles,
    inSampleBars,
    outSampleBars
  );

  console.log(`Optimization Output:`);
  console.log(`- Robustness Score: ${optimizationResult.robustnessScore}/100`);
  console.log(`- Parameter Stability: ${(optimizationResult.overallStability * 100).toFixed(1)}%`);
  console.log(`- Out-Sample Win Rate: ${(optimizationResult.outSampleWinRate * 100).toFixed(1)}%`);
  console.log(`- Out-Sample Profit Factor: ${optimizationResult.outSampleProfitFactor.toFixed(2)}`);
  console.log(`- Recommended Parameters:`, optimizationResult.recommendedParams);
  console.log(`- Rolling Windows Evaluated: ${optimizationResult.windows.length}`);

  // 6. Save walk-forward result to Database
  console.log('Saving WalkForwardResult record to Supabase...');
  const saved = await prisma.walkForwardResult.create({
    data: {
      userId,
      symbol,
      strategy: strategy.toUpperCase(),
      overallStability: optimizationResult.overallStability,
      robustnessScore: optimizationResult.robustnessScore,
      outSampleWinRate: optimizationResult.outSampleWinRate,
      outSampleProfitFactor: optimizationResult.outSampleProfitFactor,
      isRobust: optimizationResult.isRobust,
      recommendedParams: JSON.stringify(optimizationResult.recommendedParams),
      windowsData: JSON.stringify(optimizationResult.windows),
    },
  });

  console.log(`--> Saved WalkForwardResult ID: ${saved.id}`);
  console.log('--- Walk-Forward Optimization Integration Test Completed Successfully ---');
}

main()
  .catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
