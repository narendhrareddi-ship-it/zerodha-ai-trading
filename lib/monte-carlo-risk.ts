// Monte Carlo Risk Simulation Engine — Phase 7
// Runs N simulations of portfolio outcomes using historical return distributions.
// Outputs VaR, CVaR, max drawdown distribution, and probability of ruin.

export interface MonteCarloConfig {
  simulations: number;        // Default: 1000
  tradingDays: number;        // Forward projection period (default: 30 days)
  initialCapital: number;     // Starting capital
  dailyRiskPercent: number;   // Max % risked per day (default: 1%)
  confidence: number;         // VaR confidence level (default: 0.95)
}

export interface SimulationPath {
  finalEquity: number;
  maxDrawdown: number;
  tradingDays: number;
  ruined: boolean;            // True if equity drops below 30% of start
}

export interface MonteCarloResult {
  config: MonteCarloConfig;
  // Return distribution
  meanReturn: number;
  medianReturn: number;
  p5Return: number;           // 5th percentile (worst 5%)
  p25Return: number;          // 25th percentile
  p75Return: number;
  p95Return: number;          // 95th percentile (best 5%)
  // Risk metrics
  var95: number;              // Value at Risk at 95% confidence (₹)
  cvar95: number;             // Conditional VaR (expected loss beyond VaR)
  maxDrawdownMean: number;
  maxDrawdownWorst: number;   // 95th percentile max drawdown
  // Probability metrics
  probabilityOfProfit: number;  // % simulations ending positive
  probabilityOfRuin: number;    // % simulations dropping below 30%
  probabilityOfDoubling: number; // % simulations 2x or more
  // Path data for visualization
  paths: number[][];           // Sampled equity curves (max 20)
  histogram: { bucket: number; count: number }[];
  timestamp: number;
}

const DEFAULT_CONFIG: MonteCarloConfig = {
  simulations: 1000,
  tradingDays: 30,
  initialCapital: 100000,
  dailyRiskPercent: 1.0,
  confidence: 0.95,
};

/**
 * Fit a distribution to historical returns
 */
function fitDistribution(returns: number[]): { mean: number; std: number; skew: number } {
  if (!returns.length) return { mean: 0, std: 0.01, skew: 0 };
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  const skew = returns.reduce((s, r) => s + Math.pow((r - mean) / (std || 1), 3), 0) / n;
  return { mean, std, skew };
}

/**
 * Sample from a skewed normal distribution (Box-Muller + skewness adjustment)
 */
function sampleReturn(mean: number, std: number, skew: number): number {
  // Box-Muller transform
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);

  // Add fat tails for financial returns
  const fatTailFactor = Math.random() < 0.05 ? 2.5 : 1; // 5% chance of extreme event
  const sample = mean + std * z0 * fatTailFactor;

  // Apply mild skewness correction
  return sample + skew * 0.1 * std;
}

/**
 * Run a single Monte Carlo simulation path
 */
function simulatePath(
  config: MonteCarloConfig,
  mean: number,
  std: number,
  skew: number
): SimulationPath {
  let equity = config.initialCapital;
  let peak = equity;
  let maxDrawdown = 0;
  const ruinThreshold = config.initialCapital * 0.3;

  for (let day = 0; day < config.tradingDays; day++) {
    const dailyReturn = sampleReturn(mean, std, skew);
    const riskCapital = equity * (config.dailyRiskPercent / 100);
    equity += riskCapital * dailyReturn;

    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;

    if (equity <= ruinThreshold) {
      return { finalEquity: equity, maxDrawdown, tradingDays: day + 1, ruined: true };
    }
  }

  return { finalEquity: equity, maxDrawdown, tradingDays: config.tradingDays, ruined: false };
}

/**
 * Run full Monte Carlo simulation engine
 */
export function runMonteCarloSimulation(
  historicalReturns: number[],
  config: Partial<MonteCarloConfig> = {}
): MonteCarloResult {
  const cfg: MonteCarloConfig = { ...DEFAULT_CONFIG, ...config };

  // Fit distribution to historical returns
  const { mean, std, skew } = fitDistribution(
    historicalReturns.length > 0 ? historicalReturns : [0.001, -0.001, 0.002]
  );

  // Run simulations
  const paths: SimulationPath[] = [];
  const samplePaths: number[][] = [];

  for (let i = 0; i < cfg.simulations; i++) {
    const path = simulatePath(cfg, mean, std, skew);
    paths.push(path);

    // Store first 20 equity curves for visualization
    if (i < 20) {
      const curve: number[] = [cfg.initialCapital];
      let eq = cfg.initialCapital;
      for (let day = 0; day < cfg.tradingDays; day++) {
        const ret = sampleReturn(mean, std, skew);
        const risk = eq * (cfg.dailyRiskPercent / 100);
        eq = Math.max(0, eq + risk * ret);
        curve.push(eq);
      }
      samplePaths.push(curve);
    }
  }

  // Sort final equities for percentile calculation
  const finalEquities = paths.map(p => p.finalEquity).sort((a, b) => a - b);
  const returns = paths.map(p => (p.finalEquity - cfg.initialCapital) / cfg.initialCapital);
  const sortedReturns = [...returns].sort((a, b) => a - b);

  const n = paths.length;
  const percentile = (arr: number[], pct: number) => arr[Math.floor(arr.length * pct)] ?? arr[0] ?? 0;

  // VaR and CVaR
  const varIdx = Math.floor(n * (1 - cfg.confidence));
  const varReturn = sortedReturns[varIdx] ?? 0;
  const var95 = Math.abs(varReturn * cfg.initialCapital);
  const cvarReturns = sortedReturns.slice(0, varIdx);
  const cvar95 = cvarReturns.length > 0
    ? Math.abs(cvarReturns.reduce((a, b) => a + b, 0) / cvarReturns.length * cfg.initialCapital)
    : var95;

  // Drawdown stats
  const drawdowns = paths.map(p => p.maxDrawdown).sort((a, b) => a - b);
  const meanReturn = returns.reduce((a, b) => a + b, 0) / n;

  // Histogram (20 buckets)
  const minRet = sortedReturns[0] ?? -0.5;
  const maxRet = sortedReturns[n - 1] ?? 0.5;
  const bucketSize = (maxRet - minRet) / 20;
  const histogram = Array.from({ length: 20 }, (_, i) => ({
    bucket: minRet + i * bucketSize,
    count: 0,
  }));
  for (const r of returns) {
    const idx = Math.min(19, Math.floor((r - minRet) / (bucketSize || 0.01)));
    histogram[Math.max(0, idx)]!.count++;
  }

  return {
    config: cfg,
    meanReturn,
    medianReturn: percentile(sortedReturns, 0.5),
    p5Return: percentile(sortedReturns, 0.05),
    p25Return: percentile(sortedReturns, 0.25),
    p75Return: percentile(sortedReturns, 0.75),
    p95Return: percentile(sortedReturns, 0.95),
    var95,
    cvar95,
    maxDrawdownMean: drawdowns.reduce((a, b) => a + b, 0) / n,
    maxDrawdownWorst: percentile(drawdowns, 0.95),
    probabilityOfProfit: returns.filter(r => r > 0).length / n,
    probabilityOfRuin: paths.filter(p => p.ruined).length / n,
    probabilityOfDoubling: returns.filter(r => r >= 1).length / n,
    paths: samplePaths,
    histogram,
    timestamp: Date.now(),
  };
}

/**
 * Extract daily returns from trade history
 */
export function extractDailyReturns(
  trades: { pnl: number; entryPrice: number; quantity: number; entryTime: Date }[],
  capital: number
): number[] {
  // Group by date, sum P&L, compute daily return %
  const byDate = new Map<string, number>();
  for (const t of trades) {
    const date = new Date(t.entryTime).toISOString().split('T')[0] ?? '';
    byDate.set(date, (byDate.get(date) ?? 0) + (t.pnl ?? 0));
  }
  return Array.from(byDate.values()).map(pnl => capital > 0 ? pnl / capital : 0);
}
