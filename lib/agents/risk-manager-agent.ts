// Risk Manager Agent — Phase 9
// Master risk gatekeeper that reviews every signal before execution.
// Runs portfolio checks, drawdown kill-switch, dynamic sizing, and Monte Carlo.

import { checkDrawdownStatus, logKillSwitchEvent } from '../drawdown-kill-switch';
import { getPortfolioRiskSnapshot, canAddPosition } from '../portfolio-risk-agent';
import { calculateDynamicRiskSize } from '../dynamic-risk-sizer';
import { runMonteCarloSimulation } from '../monte-carlo-risk';
import { estimateSlippage } from '../slippage-model';
import type { AgentSignal } from './signal-agent';
import type { RegimeAgentResult } from './market-regime-agent';
import type { MarketDataPoint } from '../strategies';
import type { FeatureVector } from '../feature-store';
import { prisma } from '../db';

export interface RiskApproval {
  signal: AgentSignal;
  approved: boolean;
  approvedQuantity: number;
  riskAmount: number;
  reason: string;
  warnings: string[];
  sizingDetails: ReturnType<typeof calculateDynamicRiskSize>;
  slippageOk: boolean;
}

export interface RiskManagerResult {
  approvals: RiskApproval[];
  drawdownStatus: Awaited<ReturnType<typeof checkDrawdownStatus>>;
  portfolioSnapshot: Awaited<ReturnType<typeof getPortfolioRiskSnapshot>>;
  sessionAllowed: boolean;
  sessionBlockReason?: string;
  processedSignals: number;
  approvedSignals: number;
  rejectedSignals: number;
  timestamp: number;
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 5) return 0;
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    const xv = xs[i] ?? 0;
    const yv = ys[i] ?? 0;
    sumX += xv;
    sumY += yv;
    sumXY += xv * yv;
    sumX2 += xv * xv;
    sumY2 += yv * yv;
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return num / den;
}

/**
 * Run the Risk Manager Agent
 */
export async function runRiskManagerAgent(
  userId: string,
  signals: AgentSignal[],
  regimeResult: RegimeAgentResult,
  featuresMap: Map<string, FeatureVector>,
  currentPrices?: Map<string, number>,
  historyMap?: Map<string, { closes: number[] }>
): Promise<RiskManagerResult> {
  // 1. Check drawdown kill-switch
  const drawdownStatus = await checkDrawdownStatus(userId);
  if (drawdownStatus.triggered) {
    await logKillSwitchEvent(userId, drawdownStatus);
  }

  // 2. Check if we can even open new positions
  if (drawdownStatus.mustPauseFully || !drawdownStatus.canOpenNewPositions) {
    return {
      approvals: [],
      drawdownStatus,
      portfolioSnapshot: await getPortfolioRiskSnapshot(userId, currentPrices),
      sessionAllowed: false,
      sessionBlockReason: drawdownStatus.reason,
      processedSignals: signals.length,
      approvedSignals: 0,
      rejectedSignals: signals.length,
      timestamp: Date.now(),
    };
  }

  // 3. Get portfolio risk snapshot
  const portfolioSnapshot = await getPortfolioRiskSnapshot(userId, currentPrices);

  // 4. Check if portfolio allows new positions
  const { allowed: portfolioAllowed, reason: portfolioReason } = canAddPosition(portfolioSnapshot);
  if (!portfolioAllowed) {
    return {
      approvals: [],
      drawdownStatus,
      portfolioSnapshot,
      sessionAllowed: false,
      sessionBlockReason: portfolioReason,
      processedSignals: signals.length,
      approvedSignals: 0,
      rejectedSignals: signals.length,
      timestamp: Date.now(),
    };
  }

  // 5. Get user performance stats for dynamic sizing
  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  
  let capital = config?.capitalAmount ?? 10000;
  const isLive = await checkIsLive(userId, config);
  if (isLive) {
    const realBalance = await getRealBrokerBalance(userId, config);
    if (realBalance !== null && realBalance > 0) {
      capital = realBalance;
    }
  }

  const recentTrades = await prisma.trade.findMany({
    where: { userId, status: 'CLOSED' },
    orderBy: { exitTime: 'desc' },
    take: 20,
  });

  const recentWinRate = recentTrades.length > 0
    ? recentTrades.filter((t: any) => (t.pnl ?? 0) > 0).length / recentTrades.length
    : 0.5;

  // Count consecutive losses
  let consecutiveLosses = 0;
  for (const t of recentTrades) {
    if ((t.pnl ?? 0) < 0) consecutiveLosses++;
    else break;
  }

  // 6. Get current open positions count and records for correlation checking
  const openTrades = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
  const openPositions = openTrades.length;
  const maxPositions = Math.min(
    config?.maxPositions ?? 3,
    regimeResult.maxPositions
  );

  // 7. Review each signal
  const approvals: RiskApproval[] = [];

  for (const signal of signals) {
    const warnings: string[] = [];

    // Direction filter from regime agent
    if (signal.direction === 'BUY' && !regimeResult.allowLongTrades) {
      approvals.push({
        signal, approved: false, approvedQuantity: 0,
        riskAmount: 0, reason: 'Regime agent: long trades not permitted in current regime',
        warnings, sizingDetails: {} as any, slippageOk: false,
      });
      continue;
    }
    if (signal.direction === 'SELL' && !regimeResult.allowShortTrades) {
      approvals.push({
        signal, approved: false, approvedQuantity: 0,
        riskAmount: 0, reason: 'Regime agent: short trades not permitted in current regime',
        warnings, sizingDetails: {} as any, slippageOk: false,
      });
      continue;
    }

    // Position limit check
    if (openPositions + approvals.filter(a => a.approved).length >= maxPositions) {
      approvals.push({
        signal, approved: false, approvedQuantity: 0,
        riskAmount: 0, reason: `Max positions reached (${maxPositions})`,
        warnings, sizingDetails: {} as any, slippageOk: false,
      });
      continue;
    }

    // Dynamic position sizing
    const features = featuresMap.get(signal.symbol);
    let sizingDetails: ReturnType<typeof calculateDynamicRiskSize>;

    if (features) {
      sizingDetails = calculateDynamicRiskSize({
        capital,
        entryPrice: signal.entryPrice,
        stopLoss: signal.stopLoss,
        direction: signal.direction,
        baseRiskPercent: 1.0,
        maxPositionPercent: 15,
        features,
        regime: regimeResult.enhancedRegime as any,
        breadth: regimeResult.enhancedRegime.breadth,
        recentWinRate,
        consecutiveLosses,
        openPositions: openPositions + approvals.filter(a => a.approved).length,
        maxPositions,
        portfolioHeat: portfolioSnapshot.portfolioHeatPct / 100,
      });

      // Apply regime sizing multiplier
      sizingDetails = {
        ...sizingDetails,
        quantity: Math.max(1, Math.round(sizingDetails.quantity * regimeResult.positionSizeMultiplier)),
      };
    } else {
      // Fallback sizing
      const riskPerShare = Math.abs(signal.entryPrice - signal.stopLoss);
      const qty = riskPerShare > 0 ? Math.max(1, Math.floor((capital * 0.01) / riskPerShare)) : 1;
      sizingDetails = {
        quantity: qty, capitalAllocated: qty * signal.entryPrice,
        riskAmount: qty * riskPerShare, effectiveRiskPct: 1,
        multipliers: { base: 1, regimeMultiplier: 1, volatilityMultiplier: 1, breadthMultiplier: 1, performanceMultiplier: 1, portfolioHeatMultiplier: 1 },
        reasoning: ['Fallback fixed sizing (no feature data)'],
      };
    }

    // Pearson Correlation-Aware Position Sizing Scaling
    let maxCorrelation = 0;
    let correlatedAsset = '';
    
    if (historyMap && openTrades.length > 0) {
      const signalHist = historyMap.get(signal.symbol);
      if (signalHist && signalHist.closes) {
        for (const openTrade of openTrades) {
          const openHist = historyMap.get(openTrade.symbol);
          if (openHist && openHist.closes) {
            const corr = Math.abs(calculatePearsonCorrelation(signalHist.closes, openHist.closes));
            if (corr > maxCorrelation) {
              maxCorrelation = corr;
              correlatedAsset = openTrade.symbol;
            }
          }
        }
      }
    }

    if (maxCorrelation > 0.65) {
      warnings.push(`High correlation (${maxCorrelation.toFixed(2)}) with open position in ${correlatedAsset}. Scaling down quantity by 50% to hedge sector risk.`);
      sizingDetails.quantity = Math.max(1, Math.round(sizingDetails.quantity * 0.5));
      sizingDetails.capitalAllocated = sizingDetails.quantity * signal.entryPrice;
      sizingDetails.riskAmount = sizingDetails.quantity * Math.abs(signal.entryPrice - signal.stopLoss);
    }

    // Volatile market regime protection guard
    if (regimeResult.enhancedRegime.regime === 'VOLATILE') {
      approvals.push({
        signal, approved: false, approvedQuantity: 0,
        riskAmount: 0, reason: 'Risk manager guard: new entries blocked in VOLATILE market regime',
        warnings, sizingDetails: {} as any, slippageOk: false,
      });
      continue;
    }

    // Slippage check
    const stockData = features;
    const slippage = estimateSlippage({
      symbol: signal.symbol,
      entryPrice: signal.entryPrice,
      targetPrice: signal.target,
      stopLoss: signal.stopLoss,
      direction: signal.direction,
      quantity: sizingDetails.quantity,
      avgVolume: stockData?.volumeMA20 ?? 100000,
      currentVolume: stockData?.volume ?? 100000,
      atrPct: stockData?.atrPct ?? 1,
      isLargeCapProxy: signal.entryPrice > 500,
    });

    if (!slippage.tradeable) {
      warnings.push(`Slippage warning: ${slippage.reason}`);
    }

    // Capital check
    const requiredCapital = sizingDetails.quantity * signal.entryPrice;
    if (requiredCapital > portfolioSnapshot.freeCapital) {
      const reducedQty = Math.max(1, Math.floor(portfolioSnapshot.freeCapital / signal.entryPrice));
      if (reducedQty < sizingDetails.quantity) {
        warnings.push(`Capital constraint: quantity reduced from ${sizingDetails.quantity} to ${reducedQty}`);
        sizingDetails = { ...sizingDetails, quantity: reducedQty };
      }
    }

    if (consecutiveLosses >= 3) {
      warnings.push(`${consecutiveLosses} consecutive losses — extra caution`);
    }

    approvals.push({
      signal: { ...signal, quantity: sizingDetails.quantity },
      approved: true,
      approvedQuantity: sizingDetails.quantity,
      riskAmount: sizingDetails.riskAmount,
      reason: `Risk approved: ${sizingDetails.reasoning.join('; ')}`,
      warnings,
      sizingDetails,
      slippageOk: slippage.tradeable,
    });
  }

  return {
    approvals,
    drawdownStatus,
    portfolioSnapshot,
    sessionAllowed: true,
    processedSignals: signals.length,
    approvedSignals: approvals.filter(a => a.approved).length,
    rejectedSignals: approvals.filter(a => !a.approved).length,
    timestamp: Date.now(),
  };
}

// ─── HELPERS FOR LIVE CAPITAL BALANCE ───
async function checkIsLive(userId: string, config: any): Promise<boolean> {
  try {
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
  } catch {
    return false;
  }
}

async function getRealBrokerBalance(userId: string, config: any): Promise<number | null> {
  try {
    const brokerType = config?.brokerType ?? 'kite';
    if (brokerType === 'kite') {
      const { getUserKiteClient } = await import('../kite');
      const { client } = await getUserKiteClient(userId);
      if (client) {
        const margins = await client.getMargins();
        const equityCash = margins?.data?.equity?.available?.cash ?? margins?.data?.equity?.net ?? null;
        if (equityCash !== null) return Number(equityCash);
      }
    }
    if (brokerType === 'fyers' && config.fyersAppId && config.fyersToken) {
      const { FyersClient } = await import('../fyers');
      const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
      const funds = await fyers.getFunds();
      if (funds?.fund_limit?.length) {
        const totalBalance = funds.fund_limit.find((item: any) => 
          item?.title?.toLowerCase()?.includes('total') || 
          item?.title?.toLowerCase()?.includes('available') ||
          item?.id === 1 || item?.id === 10
        );
        const amt = totalBalance?.equityAmount ?? funds.fund_limit[0]?.equityAmount;
        if (amt !== undefined && amt !== null) return Number(amt);
      }
    }
    if (brokerType === 'kotak' && config.kotakConsumerKey && config.kotakToken) {
      const { KotakNeoClient } = await import('../kotak-neo');
      const kotak = new KotakNeoClient({ consumerKey: config.kotakConsumerKey, accessToken: config.kotakToken, sessionToken: config.kotakToken });
      const funds = await kotak.getFunds();
      const availableMargin = funds?.availableLimit ?? funds?.gpayInBalance ?? null;
      if (availableMargin !== null) return Number(availableMargin);
    }
    return null;
  } catch (e) {
    console.error('Failed to fetch real broker balance for risk agent:', e);
    return null;
  }
}
