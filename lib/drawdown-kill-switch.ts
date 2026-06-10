// Drawdown Kill-Switch Agent — Phase 8
// Multi-level automatic halt system to protect capital from catastrophic losses.
// Level 1: Daily loss → halt new entries
// Level 2: Weekly drawdown → close all + halt
// Level 3: Monthly drawdown → full system pause + alert

import { prisma } from './db';

export type KillSwitchLevel = 0 | 1 | 2 | 3; // 0 = OK, 3 = critical

export interface DrawdownStatus {
  level: KillSwitchLevel;
  triggered: boolean;
  dailyPnl: number;
  weeklyPnl: number;
  monthlyPnl: number;
  consecutiveLossDays: number;
  dailyDrawdownPct: number;
  weeklyDrawdownPct: number;
  monthlyDrawdownPct: number;
  capital: number;
  reason: string;
  actions: string[];        // What the system should do
  canOpenNewPositions: boolean;
  mustCloseAll: boolean;
  mustPauseFully: boolean;
}

export interface DrawdownThresholds {
  dailyLossRs: number;       // ₹ daily loss limit
  weeklyLossRs: number;      // ₹ weekly loss limit
  monthlyLossRs: number;     // ₹ monthly loss limit
  dailyLossPct: number;      // % of capital daily loss limit (default 2%)
  weeklyLossPct: number;     // % of capital weekly loss limit (default 5%)
  monthlyLossPct: number;    // % of capital monthly loss limit (default 10%)
  maxConsecutiveLoss: number; // Max consecutive loss days before pause (default 3)
}

const DEFAULT_THRESHOLDS: DrawdownThresholds = {
  dailyLossRs: 500,
  weeklyLossRs: 2000,
  monthlyLossRs: 5000,
  dailyLossPct: 2,
  weeklyLossPct: 5,
  monthlyLossPct: 10,
  maxConsecutiveLoss: 3,
};

/**
 * Check current drawdown status for a user
 */
export async function checkDrawdownStatus(
  userId: string,
  thresholds?: Partial<DrawdownThresholds>
): Promise<DrawdownStatus> {
  const limits = { ...DEFAULT_THRESHOLDS, ...thresholds };

  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    const capital = config?.capitalAmount ?? 10000;

    // Override with config values if available
    limits.dailyLossRs = config?.maxDailyLoss ?? limits.dailyLossRs;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch closed trades for each period
    const [todayTrades, weekTrades, monthTrades] = await Promise.all([
      prisma.trade.findMany({
        where: { userId, status: 'CLOSED', exitTime: { gte: todayStart } },
      }),
      prisma.trade.findMany({
        where: { userId, status: 'CLOSED', exitTime: { gte: weekStart } },
      }),
      prisma.trade.findMany({
        where: { userId, status: 'CLOSED', exitTime: { gte: monthStart } },
      }),
    ]);

    const dailyPnl = todayTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
    const weeklyPnl = weekTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);
    const monthlyPnl = monthTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);

    // Count consecutive loss days
    let consecutiveLossDays = 0;
    const dailyPnlMap = new Map<string, number>();
    for (const t of monthTrades) {
      const date = new Date(t.exitTime ?? t.entryTime).toISOString().split('T')[0] ?? '';
      dailyPnlMap.set(date, (dailyPnlMap.get(date) ?? 0) + (t.pnl ?? 0));
    }
    const sortedDates = Array.from(dailyPnlMap.keys()).sort().reverse();
    for (const date of sortedDates) {
      if ((dailyPnlMap.get(date) ?? 0) < 0) consecutiveLossDays++;
      else break;
    }

    const dailyDrawdownPct = capital > 0 ? (Math.abs(Math.min(0, dailyPnl)) / capital) * 100 : 0;
    const weeklyDrawdownPct = capital > 0 ? (Math.abs(Math.min(0, weeklyPnl)) / capital) * 100 : 0;
    const monthlyDrawdownPct = capital > 0 ? (Math.abs(Math.min(0, monthlyPnl)) / capital) * 100 : 0;

    // Determine kill-switch level
    let level: KillSwitchLevel = 0;
    const actions: string[] = [];
    let reason = 'All clear — trading permitted';

    // Level 1: Daily limit breached
    if (dailyPnl <= -limits.dailyLossRs || dailyDrawdownPct >= limits.dailyLossPct) {
      level = Math.max(level, 1) as KillSwitchLevel;
      reason = `Daily loss limit reached: ₹${Math.abs(dailyPnl).toFixed(0)} (${dailyDrawdownPct.toFixed(1)}% of capital)`;
      actions.push('HALT_NEW_ENTRIES');
    }

    if (consecutiveLossDays >= limits.maxConsecutiveLoss) {
      level = Math.max(level, 1) as KillSwitchLevel;
      reason = `${consecutiveLossDays} consecutive losing days`;
      actions.push('HALT_NEW_ENTRIES');
    }

    // Level 2: Weekly limit breached
    if (weeklyPnl <= -limits.weeklyLossRs || weeklyDrawdownPct >= limits.weeklyLossPct) {
      level = 2;
      reason = `Weekly drawdown limit reached: ₹${Math.abs(weeklyPnl).toFixed(0)} (${weeklyDrawdownPct.toFixed(1)}% of capital)`;
      actions.push('CLOSE_ALL_POSITIONS', 'HALT_SYSTEM');
    }

    // Level 3: Monthly limit breached
    if (monthlyPnl <= -limits.monthlyLossRs || monthlyDrawdownPct >= limits.monthlyLossPct) {
      level = 3;
      reason = `CRITICAL: Monthly drawdown limit reached: ₹${Math.abs(monthlyPnl).toFixed(0)} (${monthlyDrawdownPct.toFixed(1)}% of capital)`;
      actions.push('CLOSE_ALL_POSITIONS', 'HALT_SYSTEM', 'SEND_ALERT', 'REQUIRE_MANUAL_RESTART');
    }

    return {
      level,
      triggered: level > 0,
      dailyPnl: Math.round(dailyPnl),
      weeklyPnl: Math.round(weeklyPnl),
      monthlyPnl: Math.round(monthlyPnl),
      consecutiveLossDays,
      dailyDrawdownPct: Math.round(dailyDrawdownPct * 100) / 100,
      weeklyDrawdownPct: Math.round(weeklyDrawdownPct * 100) / 100,
      monthlyDrawdownPct: Math.round(monthlyDrawdownPct * 100) / 100,
      capital,
      reason,
      actions,
      canOpenNewPositions: level === 0,
      mustCloseAll: level >= 2,
      mustPauseFully: level >= 3,
    };
  } catch (err: any) {
    console.error('DrawdownKillSwitch error:', err?.message);
    // Fail-safe: block trading on error
    return {
      level: 1, triggered: true,
      dailyPnl: 0, weeklyPnl: 0, monthlyPnl: 0,
      consecutiveLossDays: 0,
      dailyDrawdownPct: 0, weeklyDrawdownPct: 0, monthlyDrawdownPct: 0,
      capital: 0,
      reason: `Kill-switch check failed: ${err?.message ?? 'Unknown error'} — trading halted for safety`,
      actions: ['HALT_NEW_ENTRIES'],
      canOpenNewPositions: false,
      mustCloseAll: false,
      mustPauseFully: false,
    };
  }
}

/**
 * Log kill-switch activation event
 */
export async function logKillSwitchEvent(
  userId: string,
  status: DrawdownStatus
): Promise<void> {
  if (!status.triggered) return;
  try {
    await prisma.tradingLog.create({
      data: {
        level: status.level >= 3 ? 'CRITICAL' : status.level >= 2 ? 'ERROR' : 'WARN',
        source: 'DRAWDOWN_KILL_SWITCH',
        message: `Kill-switch Level ${status.level}: ${status.reason}`,
        data: JSON.stringify({
          userId, level: status.level,
          dailyPnl: status.dailyPnl,
          weeklyPnl: status.weeklyPnl,
          monthlyPnl: status.monthlyPnl,
          actions: status.actions,
        }),
      },
    });
  } catch { /* non-critical */ }
}
