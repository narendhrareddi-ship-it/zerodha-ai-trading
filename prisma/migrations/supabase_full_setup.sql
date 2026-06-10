-- ============================================================
-- FULL DATABASE SETUP FOR ZERODHA AI TRADING SYSTEM
-- Run this ONCE in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS "User" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ACCOUNTS (NextAuth OAuth)
CREATE TABLE IF NOT EXISTS "Account" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  UNIQUE(provider, "providerAccountId")
);

-- SESSIONS (NextAuth)
CREATE TABLE IF NOT EXISTS "Session" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

-- VERIFICATION TOKENS (NextAuth)
CREATE TABLE IF NOT EXISTS "VerificationToken" (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  UNIQUE(identifier, token)
);

-- TRADING CONFIG
CREATE TABLE IF NOT EXISTS "TradingConfig" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT UNIQUE NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "maxDailyLoss" FLOAT DEFAULT 500,
  "maxPositions" INTEGER DEFAULT 3,
  "capitalAmount" FLOAT DEFAULT 10000,
  "squareOffTime" TEXT DEFAULT '15:10',
  "enableEquity" BOOLEAN DEFAULT TRUE,
  "enableFnO" BOOLEAN DEFAULT TRUE,
  "scanInterval" INTEGER DEFAULT 120,
  "enableMomentum" BOOLEAN DEFAULT TRUE,
  "enableRSI" BOOLEAN DEFAULT TRUE,
  "enableNewsSentiment" BOOLEAN DEFAULT TRUE,
  "enableMACD" BOOLEAN DEFAULT TRUE,
  "enableBollinger" BOOLEAN DEFAULT TRUE,
  "enableSupertrend" BOOLEAN DEFAULT TRUE,
  "enableVWAP" BOOLEAN DEFAULT TRUE,
  "enableEMACross" BOOLEAN DEFAULT TRUE,
  "telegramChatId" TEXT DEFAULT '',
  "enableTelegram" BOOLEAN DEFAULT FALSE,
  "kiteApiKey" TEXT DEFAULT '',
  "kiteApiSecret" TEXT DEFAULT '',
  "stopLossPercent" FLOAT DEFAULT 1.0,
  "targetPercent" FLOAT DEFAULT 2.0,
  "brokerType" TEXT DEFAULT 'kite',
  "openalgoApiKey" TEXT DEFAULT '',
  "openalgoHost" TEXT DEFAULT 'http://127.0.0.1:5000',
  "fyersAppId" TEXT DEFAULT '',
  "fyersToken" TEXT DEFAULT '',
  "kotakConsumerKey" TEXT DEFAULT '',
  "kotakToken" TEXT DEFAULT '',
  "positionSizing" TEXT DEFAULT 'half-kelly',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- TRADES
CREATE TABLE IF NOT EXISTS "Trade" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  exchange TEXT DEFAULT 'NSE',
  segment TEXT DEFAULT 'EQUITY',
  direction TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  "entryPrice" FLOAT NOT NULL,
  "exitPrice" FLOAT,
  "stopLoss" FLOAT NOT NULL,
  target FLOAT NOT NULL,
  pnl FLOAT,
  status TEXT DEFAULT 'OPEN',
  strategy TEXT NOT NULL,
  "orderId" TEXT,
  "exitOrderId" TEXT,
  "entryTime" TIMESTAMPTZ DEFAULT NOW(),
  "exitTime" TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_trade_user_status ON "Trade"("userId", status);
CREATE INDEX IF NOT EXISTS idx_trade_user_entry ON "Trade"("userId", "entryTime");

-- BOT SESSIONS
CREATE TABLE IF NOT EXISTS "BotSession" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'STOPPED',
  "startedAt" TIMESTAMPTZ,
  "stoppedAt" TIMESTAMPTZ,
  "dailyPnl" FLOAT DEFAULT 0,
  "tradesCount" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_botsession_user_status ON "BotSession"("userId", status);

-- TRADING LOGS
CREATE TABLE IF NOT EXISTS "TradingLog" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  level TEXT DEFAULT 'INFO',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tradinglog_created ON "TradingLog"("createdAt");
CREATE INDEX IF NOT EXISTS idx_tradinglog_level ON "TradingLog"(level);

-- KITE TOKENS
CREATE TABLE IF NOT EXISTS "KiteToken" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT DEFAULT '',
  "accessToken" TEXT NOT NULL,
  "requestToken" TEXT,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- MARKET DATA
CREATE TABLE IF NOT EXISTS "MarketData" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  symbol TEXT NOT NULL,
  exchange TEXT DEFAULT 'NSE',
  "lastPrice" FLOAT NOT NULL,
  open FLOAT,
  high FLOAT,
  low FLOAT,
  close FLOAT,
  volume INTEGER,
  change FLOAT,
  "changePct" FLOAT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketdata_symbol ON "MarketData"(symbol, timestamp);

-- TRADE JOURNAL
CREATE TABLE IF NOT EXISTS "TradeJournal" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "tradeId" TEXT,
  symbol TEXT,
  direction TEXT,
  "entryPrice" FLOAT,
  "exitPrice" FLOAT,
  pnl FLOAT,
  strategy TEXT,
  emotion TEXT DEFAULT 'neutral',
  notes TEXT,
  "aiInsight" TEXT,
  tags TEXT DEFAULT '',
  rating INTEGER DEFAULT 3,
  "lessonsLearned" TEXT,
  "marketCondition" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_user_created ON "TradeJournal"("userId", "createdAt");

-- DAILY PNL
CREATE TABLE IF NOT EXISTS "DailyPnl" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date TIMESTAMPTZ NOT NULL UNIQUE,
  "totalPnl" FLOAT DEFAULT 0,
  "tradesCount" INTEGER DEFAULT 0,
  "winCount" INTEGER DEFAULT 0,
  "lossCount" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- BACKTEST RESULTS
CREATE TABLE IF NOT EXISTS "BacktestResult" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "strategyName" TEXT NOT NULL,
  symbol TEXT,
  period INTEGER DEFAULT 30,
  "totalTrades" INTEGER DEFAULT 0,
  "winCount" INTEGER DEFAULT 0,
  "lossCount" INTEGER DEFAULT 0,
  "totalPnl" FLOAT DEFAULT 0,
  "winRate" FLOAT DEFAULT 0,
  "maxDrawdown" FLOAT DEFAULT 0,
  "sharpeRatio" FLOAT DEFAULT 0,
  "profitFactor" FLOAT DEFAULT 0,
  "avgWin" FLOAT DEFAULT 0,
  "avgLoss" FLOAT DEFAULT 0,
  "tradesData" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_backtest_user_created ON "BacktestResult"("userId", "createdAt");

-- PHASE 7: WALK-FORWARD
CREATE TABLE IF NOT EXISTS "WalkForwardResult" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  "overallStability" FLOAT DEFAULT 0,
  "robustnessScore" FLOAT DEFAULT 0,
  "outSampleWinRate" FLOAT DEFAULT 0,
  "outSampleProfitFactor" FLOAT DEFAULT 0,
  "isRobust" BOOLEAN DEFAULT FALSE,
  "recommendedParams" TEXT,
  "windowsData" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 7: MONTE CARLO
CREATE TABLE IF NOT EXISTS "MonteCarloResult" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  simulations INTEGER DEFAULT 1000,
  "tradingDays" INTEGER DEFAULT 30,
  "initialCapital" FLOAT NOT NULL,
  "meanReturn" FLOAT DEFAULT 0,
  "medianReturn" FLOAT DEFAULT 0,
  "p5Return" FLOAT DEFAULT 0,
  "p95Return" FLOAT DEFAULT 0,
  var95 FLOAT DEFAULT 0,
  cvar95 FLOAT DEFAULT 0,
  "maxDrawdownMean" FLOAT DEFAULT 0,
  "maxDrawdownWorst" FLOAT DEFAULT 0,
  "probabilityOfProfit" FLOAT DEFAULT 0,
  "probabilityOfRuin" FLOAT DEFAULT 0,
  "probabilityOfDoubling" FLOAT DEFAULT 0,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 7: XGBOOST PREDICTIONS
CREATE TABLE IF NOT EXISTS "XGBoostPrediction" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  probability FLOAT NOT NULL,
  confidence FLOAT NOT NULL,
  "rawScore" FLOAT NOT NULL,
  "featureImportance" TEXT,
  reasoning TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 9: AGENT RUNS
CREATE TABLE IF NOT EXISTS "AgentRun" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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
  "portfolioHeat" FLOAT DEFAULT 0,
  "durationMs" INTEGER DEFAULT 0,
  summary TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 9: AGENT DECISIONS
CREATE TABLE IF NOT EXISTS "AgentDecision" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "agentName" TEXT NOT NULL,
  symbol TEXT,
  direction TEXT,
  decision TEXT NOT NULL,
  reason TEXT,
  confidence FLOAT,
  quantity INTEGER,
  price FLOAT,
  metadata TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 9: LEARNING EVENTS
CREATE TABLE IF NOT EXISTS "LearningEvent" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  date TEXT NOT NULL,
  "totalTradesAnalyzed" INTEGER DEFAULT 0,
  "dailyPnl" FLOAT DEFAULT 0,
  "winRate" FLOAT DEFAULT 0,
  "weightUpdates" TEXT,
  insights TEXT,
  "walkForwardTriggered" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 9: CONFIDENCE WEIGHTS
CREATE TABLE IF NOT EXISTS "ConfidenceWeights" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT UNIQUE NOT NULL,
  weights TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- PHASE 8: PORTFOLIO SNAPSHOTS
CREATE TABLE IF NOT EXISTS "PortfolioSnapshot" (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "totalCapital" FLOAT NOT NULL,
  "usedCapital" FLOAT DEFAULT 0,
  "portfolioHeatPct" FLOAT DEFAULT 0,
  "unrealizedPnl" FLOAT DEFAULT 0,
  "totalPositions" INTEGER DEFAULT 0,
  "riskGrade" TEXT DEFAULT 'LOW',
  "riskScore" FLOAT DEFAULT 0,
  "sectorConcentration" TEXT,
  alerts TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional, for production)
-- ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "TradingConfig" ENABLE ROW LEVEL SECURITY;

SELECT 'Database setup complete! All tables created.' AS result;
