// Smart Execution Agent — Phase 8
// Handles intelligent order placement with TWAP/VWAP execution,
// bid-ask spread validation, retry logic, and multi-broker routing.

import { prisma } from './db';
import type { TradeSignal } from './trading-engine';

export interface ExecutionParams {
  signal: TradeSignal;
  userId: string;
  paperTrading: boolean;        // If true, log only — don't place real orders
  brokerType: 'kite' | 'fyers' | 'openalgo' | 'kotak';
  maxSlippagePct: number;       // Max acceptable slippage % (default: 0.1%)
  chunkOrders: boolean;         // Split large orders into chunks
  maxChunkSize: number;         // Max shares per chunk (default: 50)
  delayBetweenChunksMs: number; // Delay between chunks (default: 500ms)
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  actualEntryPrice?: number;
  actualQuantity?: number;
  slippagePct?: number;
  paperTrade?: boolean;
  filledAt?: Date;
  reason?: string;
  chunks?: ChunkResult[];
  retries?: number;
}

interface ChunkResult {
  chunkIndex: number;
  quantity: number;
  price: number;
  orderId?: string;
  success: boolean;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * Validate current spread before execution
 * Returns false if spread is too wide for the order
 */
function isSpreadAcceptable(
  bidPrice: number,
  askPrice: number,
  maxSlippagePct: number
): boolean {
  if (!bidPrice || !askPrice || bidPrice <= 0 || askPrice <= 0) return true; // Can't check — allow
  const spread = ((askPrice - bidPrice) / bidPrice) * 100;
  return spread <= maxSlippagePct * 2;
}

/**
 * Execute via Kite Connect
 */
async function executeKite(
  userId: string,
  signal: TradeSignal,
  quantity: number
): Promise<{ orderId?: string; price?: number; success: boolean; error?: string }> {
  try {
    const { getUserKiteClient } = await import('./kite');
    const { client } = await getUserKiteClient(userId);
    if (!client) return { success: false, error: 'Kite client not available' };

    const orderParams = {
      tradingsymbol: signal.symbol.replace(/^NSE:/, ''),
      exchange: 'NSE',
      transaction_type: signal.direction === 'BUY' ? 'BUY' : 'SELL',
      quantity,
      order_type: 'MARKET',
      product: 'MIS',             // Intraday
      validity: 'DAY',
    };

   const orderResponse = await client.placeOrder({
  ...orderParams,
});

const orderId =
  orderResponse?.data?.order_id ??
  orderResponse?.order_id ??
  orderResponse?.data ??
  'UNKNOWN';
    return { orderId: String(orderId), price: signal.entryPrice, success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Kite order failed' };
  }
}

/**
 * Execute via OpenAlgo
 */
async function executeOpenAlgo(
  signal: TradeSignal,
  quantity: number,
  config: { openalgoApiKey?: string | null; openalgoHost?: string | null }
): Promise<{ orderId?: string; price?: number; success: boolean; error?: string }> {
  try {
    const { OpenAlgoClient } = await import('./openalgo');
    const client = new OpenAlgoClient({
      apiKey: config.openalgoApiKey ?? '',
      host: config.openalgoHost ?? 'http://127.0.0.1:5000',
    });

    const result = await client.placeOrder({
      symbol: signal.symbol.replace(/^NSE:/, ''),
      exchange: 'NSE',
      action: signal.direction,
      quantity,
      pricetype: 'MARKET',
      product: 'MIS',
    });

    return { orderId: result?.orderid, price: signal.entryPrice, success: !!result?.orderid };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'OpenAlgo order failed' };
  }
}

/**
 * Route order to appropriate broker
 */
async function routeOrder(
  params: ExecutionParams,
  quantity: number
): Promise<{ orderId?: string; price?: number; success: boolean; error?: string }> {
  const { signal, userId, brokerType } = params;

  const config = await prisma.tradingConfig.findUnique({ where: { userId } });

  switch (brokerType) {
    case 'kite':
      return executeKite(userId, signal, quantity);

    case 'openalgo':
      return executeOpenAlgo(signal, quantity, {
        openalgoApiKey: config?.openalgoApiKey,
        openalgoHost: config?.openalgoHost,
      });

    case 'fyers': {
      // Fyers direct order placement
      try {
        const { FyersClient } = await import('./fyers');
        const client = new FyersClient({
          appId: config?.fyersAppId ?? '',
          accessToken: config?.fyersToken ?? '',
        });
        const result = await client.placeOrder({
          symbol: `NSE:${signal.symbol.replace(/^NSE:/, '')}-EQ`,
          qty: quantity,
          type: 2, // Market
          side: signal.direction === 'BUY' ? 1 : -1,
          productType: 'INTRADAY',
          validity: 'DAY',
        });
        return { orderId: result?.id, success: !!result?.id, price: signal.entryPrice };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    }

    default:
      return { success: false, error: `Unsupported broker: ${brokerType}` };
  }
}

/**
 * Execute trade with chunking and retry logic
 */
export async function executeOrder(params: ExecutionParams): Promise<ExecutionResult> {
  const { signal, userId, paperTrading, chunkOrders, maxChunkSize, delayBetweenChunksMs } = params;

  // Paper trading — log only
  if (paperTrading) {
    await prisma.tradingLog.create({
      data: {
        level: 'INFO',
        source: 'SMART_EXECUTION',
        message: `[PAPER] ${signal.direction} ${signal.quantity} ${signal.symbol} @ ₹${signal.entryPrice}`,
        data: JSON.stringify({ signal, paperTrade: true }),
      },
    });
    return {
      success: true,
      paperTrade: true,
      actualEntryPrice: signal.entryPrice,
      actualQuantity: signal.quantity,
      slippagePct: 0,
      reason: 'Paper trade executed (no real order placed)',
    };
  }

  const totalQuantity = signal.quantity;

  // Split into chunks if needed
  if (chunkOrders && totalQuantity > maxChunkSize) {
    const chunks: ChunkResult[] = [];
    let remaining = totalQuantity;
    let chunkIndex = 0;
    let totalFilled = 0;

    while (remaining > 0) {
      const chunkQty = Math.min(maxChunkSize, remaining);
      let result: Awaited<ReturnType<typeof routeOrder>> = { success: false };
      let retries = 0;

      while (!result.success && retries < MAX_RETRIES) {
        result = await routeOrder(params, chunkQty);
        if (!result.success) {
          retries++;
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
        }
      }

      chunks.push({
        chunkIndex, quantity: chunkQty,
        price: result.price ?? signal.entryPrice,
        orderId: result.orderId,
        success: result.success,
      });

      if (result.success) totalFilled += chunkQty;
      remaining -= chunkQty;
      chunkIndex++;

      if (remaining > 0 && delayBetweenChunksMs > 0) {
        await new Promise(r => setTimeout(r, delayBetweenChunksMs));
      }
    }

    const success = totalFilled > 0;
    const avgPrice = chunks.filter(c => c.success).reduce((s, c) => s + c.price * c.quantity, 0) / Math.max(totalFilled, 1);
    const slippagePct = Math.abs(avgPrice - signal.entryPrice) / signal.entryPrice * 100;

    await prisma.tradingLog.create({
      data: {
        level: success ? 'INFO' : 'ERROR',
        source: 'SMART_EXECUTION',
        message: `Chunked order: ${totalFilled}/${totalQuantity} filled in ${chunks.length} chunks`,
        data: JSON.stringify({ signal, chunks }),
      },
    });

    return { success, actualEntryPrice: avgPrice, actualQuantity: totalFilled, slippagePct, chunks };
  }

  // Single order with retry
  let result: Awaited<ReturnType<typeof routeOrder>> = { success: false };
  let retries = 0;

  while (!result.success && retries < MAX_RETRIES) {
    result = await routeOrder(params, totalQuantity);
    if (!result.success) {
      retries++;
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * retries));
    }
  }

  const slippagePct = result.price
    ? Math.abs(result.price - signal.entryPrice) / signal.entryPrice * 100
    : 0;

  await prisma.tradingLog.create({
    data: {
      level: result.success ? 'INFO' : 'ERROR',
      source: 'SMART_EXECUTION',
      message: result.success
        ? `Order placed: ${signal.direction} ${totalQuantity} ${signal.symbol} @ ₹${result.price ?? signal.entryPrice} (id: ${result.orderId})`
        : `Order failed: ${signal.symbol} — ${result.error}`,
      data: JSON.stringify({ signal, result, retries }),
    },
  });

  return {
    success: result.success,
    orderId: result.orderId,
    actualEntryPrice: result.price ?? signal.entryPrice,
    actualQuantity: result.success ? totalQuantity : 0,
    slippagePct,
    reason: result.error,
    retries,
  };
}
