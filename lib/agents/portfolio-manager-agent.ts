// Portfolio Manager Agent — Phase 9
// Monitors open positions, manages trailing stops, handles EOD square-off,
// and produces P&L attribution per strategy and agent.

import { prisma } from '../db';
import { shouldSquareOff, isMarketOpen } from '../trading-engine';
import { calculateIntradayTaxes } from '../taxes-estimator';

export interface PositionMonitorResult {
  positionsChecked: number;
  stopsTriggered: number;
  targetsHit: number;
  trailingStopUpdated: number;
  squaredOff: number;
  totalPnl: number;
  actions: PositionAction[];
  timestamp: number;
}

export interface PositionAction {
  tradeId: string;
  symbol: string;
  action: 'STOP_LOSS' | 'TARGET_HIT' | 'TRAILING_STOP' | 'SQUARE_OFF' | 'HOLD';
  reason: string;
  pnl?: number;
  exitPrice?: number;
}

export interface PnlAttribution {
  byStrategy: Record<string, { trades: number; wins: number; pnl: number; winRate: number }>;
  totalPnl: number;
  totalTrades: number;
  totalWins: number;
  overallWinRate: number;
  bestStrategy: string;
  worstStrategy: string;
}

/**
 * Monitor open positions and take action on stops/targets/trailing
 */
export async function runPortfolioManagerAgent(
  userId: string,
  currentPrices: Map<string, number>,
  paperTrading: boolean,
  trailingStopPct: number = 1.0,
  squareOffTime: string = '15:10',
  allowLongTrades: boolean = true,
  allowShortTrades: boolean = true,
  currentRegime?: string
): Promise<PositionMonitorResult> {
  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  const brokerType = (config?.brokerType ?? 'kite') as any;

  const openTrades = await prisma.trade.findMany({
    where: { userId, status: 'OPEN' },
  });

  const actions: PositionAction[] = [];
  let stopsTriggered = 0;
  let targetsHit = 0;
  let trailingStopUpdated = 0;
  let squaredOff = 0;
  let totalPnl = 0;

  const forceSquareOff = !isMarketOpen() || shouldSquareOff(squareOffTime);

  for (const trade of openTrades) {
    const currentPrice = currentPrices.get(trade.symbol)
      ?? currentPrices.get(trade.symbol.replace('NSE:', ''))
      ?? trade.entryPrice;

    const isBuy = trade.direction === 'BUY';
    const unrealizedPnl = isBuy
      ? (currentPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - currentPrice) * trade.quantity;

    let action: PositionAction['action'] = 'HOLD';
    let exitReason = '';
    let shouldExit = false;

    // Force square-off
    if (forceSquareOff) {
      action = 'SQUARE_OFF';
      exitReason = 'EOD square-off';
      shouldExit = true;
      squaredOff++;
    }
    // Regime filter early square-off
    else if (isBuy && !allowLongTrades) {
      action = 'SQUARE_OFF';
      exitReason = `Regime shift: Longs restricted under ${currentRegime || 'bearish'} regime`;
      shouldExit = true;
      squaredOff++;
    }
    else if (!isBuy && !allowShortTrades) {
      action = 'SQUARE_OFF';
      exitReason = `Regime shift: Shorts restricted under ${currentRegime || 'bullish'} regime`;
      shouldExit = true;
      squaredOff++;
    }
    // Stop loss hit
    else if (isBuy && currentPrice <= trade.stopLoss) {
      action = 'STOP_LOSS';
      exitReason = `Stop loss hit: ₹${trade.stopLoss.toFixed(2)}`;
      shouldExit = true;
      stopsTriggered++;
    }
    else if (!isBuy && currentPrice >= trade.stopLoss) {
      action = 'STOP_LOSS';
      exitReason = `Stop loss hit: ₹${trade.stopLoss.toFixed(2)}`;
      shouldExit = true;
      stopsTriggered++;
    }
    // Target hit
    else if (isBuy && currentPrice >= trade.target) {
      action = 'TARGET_HIT';
      exitReason = `Target reached: ₹${trade.target.toFixed(2)}`;
      shouldExit = true;
      targetsHit++;
    }
    else if (!isBuy && currentPrice <= trade.target) {
      action = 'TARGET_HIT';
      exitReason = `Target reached: ₹${trade.target.toFixed(2)}`;
      shouldExit = true;
      targetsHit++;
    }
    // Trailing stop update (only when in profit)
    else if (unrealizedPnl > 0) {
      const trailingPct = trailingStopPct / 100;
      const newStop = isBuy
        ? currentPrice * (1 - trailingPct)
        : currentPrice * (1 + trailingPct);

      const improvedStop = isBuy
        ? newStop > trade.stopLoss
        : newStop < trade.stopLoss;

      if (improvedStop) {
        trailingStopUpdated++;
        action = 'TRAILING_STOP';
        exitReason = `Trailing stop updated to ₹${newStop.toFixed(2)}`;

        if (!paperTrading) {
          await prisma.trade.update({
            where: { id: trade.id },
            data: { stopLoss: newStop },
          });
        }

        actions.push({
          tradeId: trade.id, symbol: trade.symbol,
          action, reason: exitReason,
        });
        continue;
      }
    }

    if (shouldExit) {
      const taxes = calculateIntradayTaxes(
        trade.entryPrice,
        currentPrice,
        trade.quantity,
        trade.direction as any,
        brokerType
      );
      const realizedPnl = taxes.netPnl;
      totalPnl += realizedPnl;

      const taxNotes = `Taxes: ₹${taxes.totalTaxes.toFixed(2)} (STT: ₹${taxes.stt.toFixed(2)}, Brokerage: ₹${taxes.brokerage.toFixed(2)}, Exch: ₹${taxes.exchangeCharges.toFixed(2)})`;
      const noteMessage = paperTrading
        ? `[PAPER] ${action}: ${exitReason} | ${taxNotes}`
        : `${action}: ${exitReason} | ${taxNotes}`;

      // Close the trade
      if (!paperTrading) {
        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            status: 'CLOSED',
            exitPrice: currentPrice,
            pnl: realizedPnl,
            exitTime: new Date(),
            notes: noteMessage,
          },
        });

        // Execute exit order
        try {
          const { getUserKiteClient } = await import('../kite');
          const { client } = await getUserKiteClient(userId);
          if (client) {
   await client.placeOrder({
  exchange: 'NSE',
  tradingsymbol: trade.symbol.replace(/^NSE:/, ''),
  transaction_type: isBuy ? 'SELL' : 'BUY',
  quantity: trade.quantity,
  product: 'MIS',
  order_type: 'MARKET',
  tag: 'PORTFOLIO_MANAGER_EXIT',
});
          }
        } catch { /* Exit order failure — log but don't crash */ }
      } else {
        // Paper trading — just update DB
        await prisma.trade.update({
          where: { id: trade.id },
          data: {
            status: 'CLOSED',
            exitPrice: currentPrice,
            pnl: realizedPnl,
            exitTime: new Date(),
            notes: noteMessage,
          },
        });
      }

      await prisma.tradingLog.create({
        data: {
          level: realizedPnl >= 0 ? 'INFO' : 'WARN',
          source: 'PORTFOLIO_MANAGER',
          message: `${paperTrading ? '[PAPER] ' : ''}${action}: ${trade.symbol} @ ₹${currentPrice.toFixed(2)} | P&L: ₹${realizedPnl.toFixed(2)} | ${exitReason}`,
          data: JSON.stringify({ tradeId: trade.id, realizedPnl, currentPrice, action }),
        },
      });

      actions.push({
        tradeId: trade.id, symbol: trade.symbol,
        action, reason: exitReason,
        pnl: realizedPnl, exitPrice: currentPrice,
      });
    }
  }

  return {
    positionsChecked: openTrades.length,
    stopsTriggered,
    targetsHit,
    trailingStopUpdated,
    squaredOff,
    totalPnl: Math.round(totalPnl * 100) / 100,
    actions,
    timestamp: Date.now(),
  };
}

/**
 * Generate P&L attribution report by strategy
 */
export async function getPnlAttribution(userId: string, days: number = 30): Promise<PnlAttribution> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const trades = await prisma.trade.findMany({
    where: { userId, status: 'CLOSED', exitTime: { gte: since } },
  });

  const byStrategy: Record<string, { trades: number; wins: number; pnl: number; winRate: number }> = {};

  for (const t of trades) {
    const strat = t.strategy ?? 'UNKNOWN';
    if (!byStrategy[strat]) {
      byStrategy[strat] = { trades: 0, wins: 0, pnl: 0, winRate: 0 };
    }
    byStrategy[strat]!.trades++;
    byStrategy[strat]!.pnl += t.pnl ?? 0;
    if ((t.pnl ?? 0) > 0) byStrategy[strat]!.wins++;
  }

  for (const s of Object.values(byStrategy)) {
    s.winRate = s.trades > 0 ? s.wins / s.trades : 0;
  }

  const totalPnl = Object.values(byStrategy).reduce((s, v) => s + v.pnl, 0);
  const totalTrades = trades.length;
  const totalWins = trades.filter((t: any) => (t.pnl ?? 0) > 0).length;

  const sortedByPnl = Object.entries(byStrategy).sort(([, a], [, b]) => b.pnl - a.pnl);
  const bestStrategy = sortedByPnl[0]?.[0] ?? 'N/A';
  const worstStrategy = sortedByPnl[sortedByPnl.length - 1]?.[0] ?? 'N/A';

  return {
    byStrategy,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalTrades,
    totalWins,
    overallWinRate: totalTrades > 0 ? totalWins / totalTrades : 0,
    bestStrategy,
    worstStrategy,
  };
}
