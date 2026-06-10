-- Phase 7-9 Supabase Migration
-- Run this in Supabase SQL Editor if Prisma migrate dev is not available

-- Walk-Forward Results
CREATE TABLE IF NOT EXISTS "WalkForwardResult" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  "overallStability" DOUBLE PRECISION DEFAULT 0,
  "robustnessScore" DOUBLE PRECISION DEFAULT 0,
  "outSampleWinRate" DOUBLE PRECISION DEFAULT 0,
  "outSampleProfitFactor" DOUBLE PRECISION DEFAULT 0,
  "isRobust" BOOLEAN DEFAULT FALSE,
  "recommendedParams" TEXT,
  "windowsData" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wfr_user_strategy ON "WalkForwardResult"("userId", strategy);

-- Monte Carlo Results  
CREATE TABLE IF NOT EXISTS "MonteCarloResult" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  simulations INTEGER DEFAULT 1000,
  "tradingDays" INTEGER DEFAULT 30,
  "initialCapital" DOUBLE PRECISION NOT NULL,
  "meanReturn" DOUBLE PRECISION DEFAULT 0,
  "medianReturn" DOUBLE PRECISION DEFAULT 0,
  "p5Return" DOUBLE PRECISION DEFAULT 0,
  "p95Return" DOUBLE PRECISION DEFAULT 0,
  var95 DOUBLE PRECISION DEFAULT 0,
  cvar95 DOUBLE PRECISION DEFAULT 0,
  "maxDrawdownMean" DOUBLE PRECISION DEFAULT 0,
  "maxDrawdownWorst" DOUBLE PRECISION DEFAULT 0,
  "probabilityOfProfit" DOUBLE PRECISION DEFAULT 0,
  "probabilityOfRuin" DOUBLE PRECISION DEFAULT 0,
  "probabilityOfDoubling" DOUBLE PRECISION DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mc_user_date ON "MonteCarloResult"("userId", "createdAt");

-- XGBoost Predictions
CREATE TABLE IF NOT EXISTS "XGBoostPrediction" (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  probability DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION NOT NULL,
  "rawScore" DOUBLE PRECISION NOT NULL,
  "featureImportance" TEXT,
  reasoning TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xgb_symbol_date ON "XGBoostPrediction"(symbol, "createdAt");

-- Agent Runs
CREATE TABLE IF NOT EXISTS "AgentRun" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "runId" TEXT UNIQUE NOT NULL,
  action TEXT NOT NULL,
  stage TEXT NOT NULL,
  "paperTrading" BOOLEAN DEFAULT TRUE,
  "totalRawSignals" INTEGER DEFAULT 0,
  "afterEnsemble" INTEGER DEFAULT 0,
  "afterConfidence" INTEGER DEFAULT 0,
  "approvedSignals" INTEGER DEFAULT 0,
  "executedSignals" INTEGER DEFAULT 0,
  regime TEXT,
  "macroSignal" TEXT,
  "portfolioHeat" DOUBLE PRECISION DEFAULT 0,
  "durationMs" INTEGER DEFAULT 0,
  summary TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ar_user_date ON "AgentRun"("userId", "createdAt");

-- Agent Decisions
CREATE TABLE IF NOT EXISTS "AgentDecision" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  symbol TEXT,
  direction TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  confidence DOUBLE PRECISION,
  quantity INTEGER,
  price DOUBLE PRECISION,
  metadata TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_user_agent ON "AgentDecision"("userId", "agentName", "createdAt");

-- Learning Events
CREATE TABLE IF NOT EXISTS "LearningEvent" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  date TEXT NOT NULL,
  "totalTradesAnalyzed" INTEGER DEFAULT 0,
  "dailyPnl" DOUBLE PRECISION DEFAULT 0,
  "winRate" DOUBLE PRECISION DEFAULT 0,
  "weightUpdates" TEXT,
  insights TEXT,
  "walkForwardTriggered" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_le_user_date ON "LearningEvent"("userId", date);

-- Confidence Weights
CREATE TABLE IF NOT EXISTS "ConfidenceWeights" (
  id TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  weights TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio Snapshots
CREATE TABLE IF NOT EXISTS "PortfolioSnapshot" (
  id TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "totalCapital" DOUBLE PRECISION NOT NULL,
  "usedCapital" DOUBLE PRECISION DEFAULT 0,
  "portfolioHeatPct" DOUBLE PRECISION DEFAULT 0,
  "unrealizedPnl" DOUBLE PRECISION DEFAULT 0,
  "totalPositions" INTEGER DEFAULT 0,
  "riskGrade" TEXT DEFAULT 'LOW',
  "riskScore" DOUBLE PRECISION DEFAULT 0,
  "sectorConcentration" TEXT,
  alerts TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ps_user_date ON "PortfolioSnapshot"("userId", "createdAt");
