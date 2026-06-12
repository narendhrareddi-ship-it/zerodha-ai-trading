// Trading Engine - Core logic for autonomous trading
import { prisma } from '@/lib/db';
import { KiteClient, WATCHLIST_STOCKS } from '@/lib/kite';

export interface TradeSignal {
  symbol: string;
  exchange: string;
  direction: 'BUY' | 'SELL';
  strategy: string;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  target: number;
  quantity: number;
  reason: string;
}

export interface RiskCheck {
  allowed: boolean;
  reason: string;
  currentDailyPnl: number;
  openPositions: number;
  availableCapital: number;
}

export async function checkRisk(userId: string): Promise<RiskCheck> {
  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  const maxLoss = config?.maxDailyLoss ?? 500;
  const maxPositions = config?.maxPositions ?? 3;
  const capital = config?.capitalAmount ?? 10000;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayTrades = await prisma.trade.findMany({
    where: {
      userId,
      entryTime: { gte: today },
    },
  });

  const realizedPnl = todayTrades
    ?.filter?.((t: any) => t?.status === 'CLOSED' && t?.pnl != null)
    ?.reduce?.((sum: number, t: any) => sum + (t?.pnl ?? 0), 0) ?? 0;

  const openPositions = todayTrades?.filter?.((t: any) => t?.status === 'OPEN')?.length ?? 0;

  if (realizedPnl <= -maxLoss) {
    return {
      allowed: false,
      reason: `Daily loss limit reached: ₹${Math.abs(realizedPnl).toFixed(2)} / ₹${maxLoss}`,
      currentDailyPnl: realizedPnl,
      openPositions,
      availableCapital: capital,
    };
  }

  if (openPositions >= maxPositions) {
    return {
      allowed: false,
      reason: `Max positions reached: ${openPositions}/${maxPositions}`,
      currentDailyPnl: realizedPnl,
      openPositions,
      availableCapital: capital,
    };
  }

  const usedCapital = todayTrades
    ?.filter?.((t: any) => t?.status === 'OPEN')
    ?.reduce?.((sum: number, t: any) => sum + ((t?.entryPrice ?? 0) * (t?.quantity ?? 0)), 0) ?? 0;

  return {
    allowed: true,
    reason: 'Risk check passed',
    currentDailyPnl: realizedPnl,
    openPositions,
    availableCapital: capital - usedCapital,
  };
}

export async function calculatePositionSize(
  capital: number,
  entryPrice: number,
  stopLoss: number,
  maxRiskPerTrade: number = 100,
  userId?: string,
  sizingMethod: string = 'half-kelly'
): Promise<number> {
  // Half-Kelly Criterion sizing with historical performance data
  if (sizingMethod === 'half-kelly' && userId) {
    try {
      const { halfKellyPositionSize, fixedRiskPositionSize } = await import('@/lib/kelly-criterion');
      
      // Fetch historical trade performance for this user
      const closedTrades = await prisma.trade.findMany({
        where: { userId, status: 'CLOSED', pnl: { not: null } },
        orderBy: { exitTime: 'desc' },
        take: 50, // Last 50 trades for statistics
      });

      if (closedTrades.length >= 10) {
        const wins = closedTrades.filter((t: any) => (t?.pnl ?? 0) > 0);
        const losses = closedTrades.filter((t: any) => (t?.pnl ?? 0) <= 0);
        const winRate = wins.length / closedTrades.length;
        const avgWin = wins.length > 0
          ? wins.reduce((s: number, t: any) => s + (t?.pnl ?? 0), 0) / wins.length
          : 0;
        const avgLoss = losses.length > 0
          ? Math.abs(losses.reduce((s: number, t: any) => s + (t?.pnl ?? 0), 0) / losses.length)
          : 1;

        const result = halfKellyPositionSize({
          winRate,
          avgWin,
          avgLoss,
          capital,
          entryPrice,
          stopLoss,
        });

        return result.shares;
      }

      // Not enough data — use fixed risk fallback
      const result = fixedRiskPositionSize(capital, entryPrice, stopLoss, maxRiskPerTrade);
      return result.shares;
    } catch (err) {
      // Fallback on any error
    }
  }

  // Legacy fixed-risk sizing
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  if (riskPerShare <= 0) return 1;
  const shares = Math.floor(maxRiskPerTrade / riskPerShare);
  const maxByCapital = Math.floor(capital / entryPrice);
  return Math.max(1, Math.min(shares, maxByCapital));
}

export async function logTradingEvent(
  level: string,
  source: string,
  message: string,
  data?: any
): Promise<void> {
  try {
    await prisma.tradingLog.create({
      data: {
        level,
        source,
        message,
        data: data ? JSON.stringify(data) : null,
      },
    });
  } catch (err: any) {
    console.error('Failed to log trading event:', err?.message);
  }
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istString);
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const day = istDate.getDay();

  // Weekend check
  if (day === 0 || day === 6) return false;

  // Market hours: 9:15 AM to 3:30 PM IST
  const marketStart = 9 * 60 + 15;
  const marketEnd = 15 * 60 + 30;
  const currentMinutes = hours * 60 + minutes;

  return currentMinutes >= marketStart && currentMinutes <= marketEnd;
}

export function shouldSquareOff(squareOffTime: string = '15:10'): boolean {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const istDate = new Date(istString);
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const [sqHours, sqMinutes] = (squareOffTime ?? '15:10').split(':').map(Number);
  const currentMinutes = hours * 60 + minutes;
  const squareOffMinutes = (sqHours ?? 15) * 60 + (sqMinutes ?? 10);
  return currentMinutes >= squareOffMinutes;
}
