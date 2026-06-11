import { PrismaClient } from '@prisma/client';
import { runMonteCarloSimulation } from '../lib/monte-carlo-risk';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Monte Carlo Integration Test ---');

  // 1. Get the test user
  const user = await prisma.user.findUnique({
    where: { email: 'john@doe.com' },
  });
  if (!user) {
    console.error('Test user john@doe.com not found. Run seeding first.');
    process.exit(1);
  }
  const userId = user.id;

  // 2. Get trading config or capital
  const config = await prisma.tradingConfig.findUnique({
    where: { userId },
  });
  const capital = config?.capitalAmount ?? 10000;

  // 3. Define dummy returns for the distribution
  const dummyReturns = [0.015, -0.005, 0.02, -0.01, 0.005, 0.03, -0.02, 0.012, -0.008, 0.022];

  // 4. Run Monte Carlo Simulation
  console.log(`Running simulation with 1000 iterations for capital ₹${capital}...`);
  const result = runMonteCarloSimulation(dummyReturns, {
    simulations: 1000,
    tradingDays: 30,
    initialCapital: capital,
    dailyRiskPercent: 1.0,
    confidence: 0.95,
  });

  console.log('Simulation complete. Results:');
  console.log(`- Mean Return: ${(result.meanReturn * 100).toFixed(2)}%`);
  console.log(`- Median Return: ${(result.medianReturn * 100).toFixed(2)}%`);
  console.log(`- 95% VaR (Value at Risk): ₹${result.var95.toFixed(2)}`);
  console.log(`- Expected Tail Loss (95% CVaR): ₹${result.cvar95.toFixed(2)}`);
  console.log(`- Prob of Profit: ${(result.probabilityOfProfit * 100).toFixed(1)}%`);
  console.log(`- Prob of Ruin: ${(result.probabilityOfRuin * 100).toFixed(1)}%`);

  // 5. Save results to database
  console.log('Saving MonteCarloResult record to Supabase...');
  const saved = await prisma.monteCarloResult.create({
    data: {
      userId,
      simulations: 1000,
      tradingDays: 30,
      initialCapital: capital,
      meanReturn: result.meanReturn,
      medianReturn: result.medianReturn,
      p5Return: result.p5Return,
      p95Return: result.p95Return,
      var95: result.var95,
      cvar95: result.cvar95,
      maxDrawdownMean: result.maxDrawdownMean,
      maxDrawdownWorst: result.maxDrawdownWorst,
      probabilityOfProfit: result.probabilityOfProfit,
      probabilityOfRuin: result.probabilityOfRuin,
      probabilityOfDoubling: result.probabilityOfDoubling,
    },
  });

  console.log(`--> Saved MonteCarloResult ID: ${saved.id}`);
  console.log('--- Monte Carlo Integration Test Completed Successfully ---');
}

main()
  .catch((err) => {
    console.error('Test run failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
