// Portfolio Risk Management Agent — Phase 8
// Tracks portfolio-level risk: total exposure, sector concentration,
// position correlation, margin utilization, and beta vs NIFTY.

import { prisma } from './db';

export interface PortfolioPosition {
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  target: number;
  unrealizedPnl: number;
  riskAmount: number;          // ₹ at risk (position × |entry - stopLoss|)
  capitalAllocated: number;
  sector?: string;
  strategy: string;
  entryTime: Date;
}

export interface PortfolioRiskSnapshot {
  totalCapital: number;
  usedCapital: number;
  freeCapital: number;
  capitalUtilizationPct: number;
  totalRiskAmount: number;       // Total ₹ at risk across all positions
  portfolioHeatPct: number;      // totalRisk / totalCapital %
  unrealizedPnl: number;
  totalPositions: number;
  longPositions: number;
  shortPositions: number;
  netExposure: number;           // Long - Short (₹)
  netExposurePct: number;        // As % of capital
  // Concentration risk
  maxSinglePositionPct: number;  // Largest position as % of capital
  sectorConcentration: Record<string, number>; // Sector → % of portfolio
  highestSector: string;
  highestSectorPct: number;
  // Risk grade
  riskGrade: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  riskScore: number;             // 0-100 (higher = more risk)
  alerts: string[];
  timestamp: number;
}

export interface PortfolioRiskLimits {
  maxCapitalUtilizationPct: number;    // Default: 80%
  maxPortfolioHeatPct: number;         // Default: 5% of capital at risk
  maxSectorConcentrationPct: number;   // Default: 30%
  maxSinglePositionPct: number;        // Default: 20%
  maxLongShortImbalancePct: number;    // Default: 70% (net directional bias)
}

const DEFAULT_LIMITS: PortfolioRiskLimits = {
  maxCapitalUtilizationPct: 80,
  maxPortfolioHeatPct: 5,
  maxSectorConcentrationPct: 30,
  maxSinglePositionPct: 20,
  maxLongShortImbalancePct: 70,
};

// Simple sector mapping for NSE stocks
const SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Energy', ONGC: 'Energy', NTPC: 'Energy', POWERGRID: 'Energy', COALINDIA: 'Energy',
  TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT',
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', AXISBANK: 'Banking', KOTAKBANK: 'Banking',
  HINDUNILVR: 'FMCG', ITC: 'FMCG', NESTLEIND: 'FMCG',
  MARUTI: 'Auto', TATAMOTORS: 'Auto',
  SUNPHARMA: 'Pharma',
  BHARTIARTL: 'Telecom',
  LT: 'Infra', ULTRACEMCO: 'Cement',
  BAJFINANCE: 'NBFC',
  ASIANPAINT: 'Chemicals',
  TITAN: 'Consumer',
  ADANIENT: 'Conglomerate',
  TATASTEEL: 'Metals', JSWSTEEL: 'Metals',
};

function getSector(symbol: string): string {
  const clean = symbol.replace(/^NSE:/, '').replace(/-EQ$/, '');
  return SECTOR_MAP[clean] ?? 'Other';
}

/**
 * Build portfolio risk snapshot from current open trades
 */
export async function getPortfolioRiskSnapshot(
  userId: string,
  currentPrices?: Map<string, number>,
  limits?: Partial<PortfolioRiskLimits>
): Promise<PortfolioRiskSnapshot> {
  const riskLimits = { ...DEFAULT_LIMITS, ...limits };

  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  const totalCapital = config?.capitalAmount ?? 10000;

  const openTrades = await prisma.trade.findMany({
    where: { userId, status: 'OPEN' },
  });

  const positions: PortfolioPosition[] = openTrades.map((t: any) => {
    const currentPrice = currentPrices?.get(t.symbol) ?? t.entryPrice;
    const unrealizedPnl = t.direction === 'BUY'
      ? (currentPrice - t.entryPrice) * t.quantity
      : (t.entryPrice - currentPrice) * t.quantity;
    const riskAmount = Math.abs(t.entryPrice - t.stopLoss) * t.quantity;

    return {
      symbol: t.symbol,
      direction: t.direction as 'BUY' | 'SELL',
      quantity: t.quantity,
      entryPrice: t.entryPrice,
      currentPrice,
      stopLoss: t.stopLoss,
      target: t.target,
      unrealizedPnl,
      riskAmount,
      capitalAllocated: t.entryPrice * t.quantity,
      sector: getSector(t.symbol),
      strategy: t.strategy,
      entryTime: t.entryTime,
    };
  });

  const usedCapital = positions.reduce((s, p) => s + p.capitalAllocated, 0);
  const totalRiskAmount = positions.reduce((s, p) => s + p.riskAmount, 0);
  const unrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const longPositions = positions.filter(p => p.direction === 'BUY').length;
  const shortPositions = positions.filter(p => p.direction === 'SELL').length;
  const longExposure = positions.filter(p => p.direction === 'BUY').reduce((s, p) => s + p.capitalAllocated, 0);
  const shortExposure = positions.filter(p => p.direction === 'SELL').reduce((s, p) => s + p.capitalAllocated, 0);
  const netExposure = longExposure - shortExposure;

  // Sector concentration
  const sectorConcentration: Record<string, number> = {};
  for (const p of positions) {
    const sec = p.sector ?? 'Other';
    sectorConcentration[sec] = (sectorConcentration[sec] ?? 0) + p.capitalAllocated;
  }
  // Convert to percentages
  for (const k of Object.keys(sectorConcentration)) {
    sectorConcentration[k] = totalCapital > 0
      ? (sectorConcentration[k]! / totalCapital) * 100
      : 0;
  }

  const highestSector = Object.entries(sectorConcentration)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'None';
  const highestSectorPct = sectorConcentration[highestSector] ?? 0;

  // Max single position
  const maxSinglePositionPct = positions.length > 0
    ? Math.max(...positions.map(p => totalCapital > 0 ? (p.capitalAllocated / totalCapital) * 100 : 0))
    : 0;

  const capitalUtilizationPct = totalCapital > 0 ? (usedCapital / totalCapital) * 100 : 0;
  const portfolioHeatPct = totalCapital > 0 ? (totalRiskAmount / totalCapital) * 100 : 0;
  const netExposurePct = totalCapital > 0 ? (Math.abs(netExposure) / totalCapital) * 100 : 0;

  // Risk score and alerts
  const alerts: string[] = [];
  let riskScore = 0;

  if (capitalUtilizationPct > riskLimits.maxCapitalUtilizationPct) {
    alerts.push(`Capital utilization ${capitalUtilizationPct.toFixed(0)}% exceeds limit ${riskLimits.maxCapitalUtilizationPct}%`);
    riskScore += 25;
  }
  if (portfolioHeatPct > riskLimits.maxPortfolioHeatPct) {
    alerts.push(`Portfolio heat ${portfolioHeatPct.toFixed(1)}% exceeds limit ${riskLimits.maxPortfolioHeatPct}%`);
    riskScore += 30;
  }
  if (highestSectorPct > riskLimits.maxSectorConcentrationPct) {
    alerts.push(`${highestSector} sector concentration ${highestSectorPct.toFixed(0)}% exceeds limit ${riskLimits.maxSectorConcentrationPct}%`);
    riskScore += 20;
  }
  if (maxSinglePositionPct > riskLimits.maxSinglePositionPct) {
    alerts.push(`Single position ${maxSinglePositionPct.toFixed(0)}% exceeds limit ${riskLimits.maxSinglePositionPct}%`);
    riskScore += 15;
  }
  if (netExposurePct > riskLimits.maxLongShortImbalancePct) {
    alerts.push(`Net directional exposure ${netExposurePct.toFixed(0)}% is highly imbalanced`);
    riskScore += 10;
  }

  // Additional scoring
  riskScore += Math.min(20, portfolioHeatPct * 2);
  riskScore += Math.min(20, capitalUtilizationPct * 0.2);
  riskScore = Math.min(100, riskScore);

  let riskGrade: PortfolioRiskSnapshot['riskGrade'];
  if (riskScore >= 70) riskGrade = 'CRITICAL';
  else if (riskScore >= 50) riskGrade = 'HIGH';
  else if (riskScore >= 25) riskGrade = 'MODERATE';
  else riskGrade = 'LOW';

  return {
    totalCapital,
    usedCapital: Math.round(usedCapital),
    freeCapital: Math.round(Math.max(0, totalCapital - usedCapital)),
    capitalUtilizationPct: Math.round(capitalUtilizationPct * 10) / 10,
    totalRiskAmount: Math.round(totalRiskAmount),
    portfolioHeatPct: Math.round(portfolioHeatPct * 100) / 100,
    unrealizedPnl: Math.round(unrealizedPnl),
    totalPositions: positions.length,
    longPositions,
    shortPositions,
    netExposure: Math.round(netExposure),
    netExposurePct: Math.round(netExposurePct * 10) / 10,
    maxSinglePositionPct: Math.round(maxSinglePositionPct * 10) / 10,
    sectorConcentration,
    highestSector,
    highestSectorPct: Math.round(highestSectorPct * 10) / 10,
    riskGrade,
    riskScore: Math.round(riskScore),
    alerts,
    timestamp: Date.now(),
  };
}

/**
 * Check if a new trade is allowed given current portfolio risk
 */
export function canAddPosition(
  snapshot: PortfolioRiskSnapshot,
  limits?: Partial<PortfolioRiskLimits>
): { allowed: boolean; reason: string } {
  const lim = { ...DEFAULT_LIMITS, ...limits };

  if (snapshot.riskGrade === 'CRITICAL') {
    return { allowed: false, reason: 'Portfolio risk is CRITICAL — no new positions allowed' };
  }
  if (snapshot.capitalUtilizationPct >= lim.maxCapitalUtilizationPct) {
    return { allowed: false, reason: `Capital fully utilized (${snapshot.capitalUtilizationPct.toFixed(0)}%)` };
  }
  if (snapshot.portfolioHeatPct >= lim.maxPortfolioHeatPct) {
    return { allowed: false, reason: `Portfolio heat at limit (${snapshot.portfolioHeatPct.toFixed(1)}%)` };
  }

  return { allowed: true, reason: 'Portfolio risk within limits' };
}
