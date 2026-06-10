// Execution Agent — Phase 9
// Handles all order placement with full state machine, multi-broker routing,
// paper trading mode, and complete audit trail for every decision.

import { executeOrder } from '../smart-execution-agent';
import { prisma } from '../db';
import type { RiskApproval } from './risk-manager-agent';

export type OrderState = 'PENDING' | 'PLACED' | 'FILLED' | 'PARTIAL' | 'FAILED' | 'REJECTED';

export interface ExecutionRecord {
  tradeId?: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  actualPrice?: number;
  stopLoss: number;
  target: number;
  strategy: string;
  orderId?: string;
  state: OrderState;
  paperTrade: boolean;
  slippagePct?: number;
  reason: string;
  timestamp: number;
}

export interface ExecutionAgentResult {
  executed: ExecutionRecord[];
  failed: ExecutionRecord[];
  paperTrades: ExecutionRecord[];
  totalExecuted: number;
  totalFailed: number;
  totalCapitalDeployed: number;
  timestamp: number;
}

/**
 * Run the Execution Agent on approved signals
 */
export async function runExecutionAgent(
  userId: string,
  approvals: RiskApproval[],
  paperTrading: boolean
): Promise<ExecutionAgentResult> {
  const executed: ExecutionRecord[] = [];
  const failed: ExecutionRecord[] = [];
  const paperTrades: ExecutionRecord[] = [];

  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  const brokerType = (config?.brokerType ?? 'kite') as 'kite' | 'fyers' | 'openalgo' | 'kotak';

  for (const approval of approvals) {
    if (!approval.approved) continue;

    const { signal } = approval;
    const record: ExecutionRecord = {
      symbol: signal.symbol,
      direction: signal.direction,
      quantity: approval.approvedQuantity,
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      target: signal.target,
      strategy: signal.strategy,
      state: 'PENDING',
      paperTrade: paperTrading,
      reason: approval.reason,
      timestamp: Date.now(),
    };

    try {
      // Execute via Smart Execution Agent
      const result = await executeOrder({
        signal: { ...signal, quantity: approval.approvedQuantity },
        userId,
        paperTrading,
        brokerType,
        maxSlippagePct: 0.15,
        chunkOrders: approval.approvedQuantity > 50,
        maxChunkSize: 50,
        delayBetweenChunksMs: 500,
      });

      if (result.success) {
        record.state = 'FILLED';
        record.orderId = result.orderId;
        record.actualPrice = result.actualEntryPrice ?? signal.entryPrice;
        record.slippagePct = result.slippagePct;

        // Persist trade to database
        const trade = await prisma.trade.create({
          data: {
            userId,
            symbol: signal.symbol,
            exchange: signal.exchange ?? 'NSE',
            segment: 'EQUITY',
            direction: signal.direction,
            quantity: approval.approvedQuantity,
            entryPrice: record.actualPrice ?? signal.entryPrice,
            stopLoss: signal.stopLoss,
            target: signal.target,
            strategy: signal.strategy,
            orderId: result.orderId ?? null,
            status: 'OPEN',
            notes: paperTrading ? '[PAPER TRADE]' : null,
          },
        });

        record.tradeId = trade.id;
        (paperTrading ? paperTrades : executed).push(record);

        // Audit log
        await prisma.tradingLog.create({
          data: {
            level: 'INFO',
            source: 'EXECUTION_AGENT',
            message: `${paperTrading ? '[PAPER] ' : ''}${signal.direction} ${approval.approvedQuantity}x ${signal.symbol} @ ₹${record.actualPrice?.toFixed(2)} | SL: ₹${signal.stopLoss.toFixed(2)} | Target: ₹${signal.target.toFixed(2)}`,
            data: JSON.stringify({
              tradeId: trade.id, orderId: result.orderId,
              slippagePct: result.slippagePct,
              confidenceScore: signal.confidenceScore,
              votingStrategies: signal.votingStrategies,
              warnings: approval.warnings,
            }),
          },
        });
      } else {
        record.state = 'FAILED';
        record.reason = result.reason ?? 'Execution failed';
        failed.push(record);

        await prisma.tradingLog.create({
          data: {
            level: 'ERROR',
            source: 'EXECUTION_AGENT',
            message: `Order FAILED: ${signal.direction} ${approval.approvedQuantity}x ${signal.symbol} — ${result.reason}`,
            data: JSON.stringify({ signal, result }),
          },
        });
      }
    } catch (err: any) {
      record.state = 'FAILED';
      record.reason = err?.message ?? 'Unknown execution error';
      failed.push(record);

      await prisma.tradingLog.create({
        data: {
          level: 'ERROR',
          source: 'EXECUTION_AGENT',
          message: `Execution exception for ${signal.symbol}: ${err?.message}`,
          data: JSON.stringify({ signal, error: err?.message }),
        },
      });
    }
  }

  const totalCapitalDeployed = [...executed, ...paperTrades]
    .reduce((s, r) => s + r.quantity * (r.actualPrice ?? r.entryPrice), 0);

  return {
    executed,
    failed,
    paperTrades,
    totalExecuted: executed.length + paperTrades.length,
    totalFailed: failed.length,
    totalCapitalDeployed,
    timestamp: Date.now(),
  };
}
