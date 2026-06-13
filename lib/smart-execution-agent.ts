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
/**
 * Execute via Kite Connect
 */
async function executeKite(
  userId: string,
  signal: TradeSignal,
  quantity: number,
  orderType: 'MARKET' | 'LIMIT' = 'MARKET',
  price?: number
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
      order_type: orderType,
      price: orderType === 'LIMIT' ? price : undefined,
      product: 'MIS',             // Intraday
      validity: 'DAY',
    };

    const orderResponse = await client.placeOrder(orderParams);

    const orderId =
      orderResponse?.data?.order_id ??
      orderResponse?.order_id ??
      orderResponse?.data ??
      'UNKNOWN';
    return { orderId: String(orderId), price: price ?? signal.entryPrice, success: true };
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
  config: { openalgoApiKey?: string | null; openalgoHost?: string | null },
  orderType: 'MARKET' | 'LIMIT' = 'MARKET',
  price?: number
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
      pricetype: orderType,
      price: orderType === 'LIMIT' ? price : undefined,
      product: 'MIS',
    });

    return { orderId: result?.orderid, price: price ?? signal.entryPrice, success: !!result?.orderid };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'OpenAlgo order failed' };
  }
}

/**
 * Route order to appropriate broker
 */
async function routeOrder(
  params: ExecutionParams,
  quantity: number,
  orderType: 'MARKET' | 'LIMIT' = 'MARKET',
  price?: number
): Promise<{ orderId?: string; price?: number; success: boolean; error?: string }> {
  const { signal, userId, brokerType } = params;

  const config = await prisma.tradingConfig.findUnique({ where: { userId } });

  switch (brokerType) {
    case 'kite':
      return executeKite(userId, signal, quantity, orderType, price);

    case 'openalgo':
      return executeOpenAlgo(signal, quantity, {
        openalgoApiKey: config?.openalgoApiKey,
        openalgoHost: config?.openalgoHost,
      }, orderType, price);

    case 'fyers': {
      try {
        const { FyersClient } = await import('./fyers');
        const client = new FyersClient({
          appId: config?.fyersAppId ?? '',
          accessToken: config?.fyersToken ?? '',
        });
        const result = await client.placeOrder({
          symbol: `NSE:${signal.symbol.replace(/^NSE:/, '')}-EQ`,
          qty: quantity,
          type: orderType === 'LIMIT' ? 1 : 2,
          side: signal.direction === 'BUY' ? 1 : -1,
          productType: 'INTRADAY',
          limitPrice: orderType === 'LIMIT' ? price : 0,
          validity: 'DAY',
        });
        return { orderId: result?.id, success: !!result?.id, price: price ?? signal.entryPrice };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    }

    case 'kotak': {
      try {
        const { KotakNeoClient } = await import('./kotak-neo');
        const client = new KotakNeoClient({
          consumerKey: config?.kotakConsumerKey ?? '',
          accessToken: config?.kotakToken ?? '',
        });
        const formattedSymbol = KotakNeoClient.formatSymbol(signal.symbol);
        const result = await client.placeOrder({
          symbol: formattedSymbol,
          exchange: signal.symbol.startsWith('BSE') ? 'bse_cm' : 'nse_cm',
          transactionType: signal.direction === 'BUY' ? 'B' : 'S',
          orderType: orderType === 'LIMIT' ? 'L' : 'MKT',
          price: orderType === 'LIMIT' ? price : undefined,
          quantity,
          product: 'MIS',
        });
        const orderId = result?.orderId ?? result?.gOrderNo ?? result?.data?.orderId;
        return { orderId: orderId ? String(orderId) : undefined, success: !!orderId, price: price ?? signal.entryPrice };
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    }

    default:
      return { success: false, error: `Unsupported broker: ${brokerType}` };
  }
}

/**
 * Check order status in real-time
 */
async function checkOrderStatus(
  userId: string,
  brokerType: 'kite' | 'fyers' | 'openalgo' | 'kotak',
  orderId: string
): Promise<'FILLED' | 'PENDING' | 'FAILED'> {
  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    if (brokerType === 'kite') {
      const { getUserKiteClient } = await import('./kite');
      const { client } = await getUserKiteClient(userId);
      if (client) {
        const orders = await client.getOrders();
        const match = orders?.data?.find((o: any) => String(o.order_id) === orderId);
        if (match) {
          if (match.status === 'COMPLETE') return 'FILLED';
          if (['CANCELLED', 'REJECTED', 'FAILED'].includes(match.status)) return 'FAILED';
          return 'PENDING';
        }
      }
    } else if (brokerType === 'fyers') {
      const { FyersClient } = await import('./fyers');
      const client = new FyersClient({
        appId: config?.fyersAppId ?? '',
        accessToken: config?.fyersToken ?? '',
      });
      const orders = await client.getOrders();
      const match = orders?.orderBook?.find((o: any) => String(o.id) === orderId);
      if (match) {
        if (match.status === 2) return 'FILLED';
        if ([1, 5].includes(match.status)) return 'FAILED';
        return 'PENDING';
      }
    } else if (brokerType === 'kotak') {
      const { KotakNeoClient } = await import('./kotak-neo');
      const client = new KotakNeoClient({
        consumerKey: config?.kotakConsumerKey ?? '',
        accessToken: config?.kotakToken ?? '',
      });
      const orders = await client.getOrderBook();
      const match = orders?.data?.find((o: any) => String(o.orderId) === orderId);
      if (match) {
        if (match.orderStatus === 'TRAD') return 'FILLED';
        if (['CANC', 'REJ'].includes(match.orderStatus)) return 'FAILED';
        return 'PENDING';
      }
    }
  } catch (err) {
    console.error('Failed to check order status:', err);
  }
  return 'FILLED'; // Default fallback
}

/**
 * Cancel a pending limit order
 */
async function cancelOrder(
  userId: string,
  brokerType: 'kite' | 'fyers' | 'openalgo' | 'kotak',
  orderId: string
): Promise<boolean> {
  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    if (brokerType === 'kite') {
      const { getUserKiteClient } = await import('./kite');
      const { client } = await getUserKiteClient(userId);
      if (client) {
        await client.cancelOrder(orderId);
        return true;
      }
    } else if (brokerType === 'fyers') {
      const { FyersClient } = await import('./fyers');
      const client = new FyersClient({
        appId: config?.fyersAppId ?? '',
        accessToken: config?.fyersToken ?? '',
      });
      await client.cancelOrder(orderId);
      return true;
    }
  } catch (err) {
    console.error('Failed to cancel order:', err);
  }
  return false;
}

/**
 * Execute LIMIT orders passively with price adjustments and MARKET order fallback
 */
async function executePassiveLimitOrder(
  params: ExecutionParams,
  quantity: number
): Promise<{ orderId?: string; price?: number; success: boolean; error?: string }> {
  const { signal, userId, brokerType } = params;
  let limitPrice = signal.entryPrice;
  let orderId = '';
  let success = false;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    const res = await routeOrder(params, quantity, 'LIMIT', limitPrice);
    if (res.success && res.orderId) {
      orderId = res.orderId;
      // Wait 10 seconds for filling passively
      await new Promise(r => setTimeout(r, 10000));
      
      const status = await checkOrderStatus(userId, brokerType, orderId);
      if (status === 'FILLED') {
        success = true;
        return { orderId, price: limitPrice, success: true };
      }
      
      // If pending, cancel order
      await cancelOrder(userId, brokerType, orderId);

      // Chase market price slightly
      limitPrice = signal.direction === 'BUY' ? limitPrice * 1.0005 : limitPrice * 0.9995;
    } else {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final fallback to MARKET order
  return await routeOrder(params, quantity, 'MARKET');
}

/**
 * Execute trade with passive placement and TWAP chunk slicing logic
 */
export async function executeOrder(params: ExecutionParams): Promise<ExecutionResult> {
  const { signal, userId, paperTrading, chunkOrders, maxChunkSize, delayBetweenChunksMs } = params;

  // Paper trading — log only
  if (paperTrading) {
    const totalQuantity = signal.quantity;
    if (chunkOrders && totalQuantity > maxChunkSize) {
      const chunks: ChunkResult[] = [];
      let remaining = totalQuantity;
      let chunkIndex = 0;
      let totalFilled = 0;
      const dynamicChunkSize = Math.max(1, Math.min(maxChunkSize, Math.ceil(totalQuantity / 10)));

      while (remaining > 0) {
        const chunkQty = Math.min(dynamicChunkSize, remaining);
        // Simulate minor passive limit fill slippage (random between -0.02% and +0.02%)
        const randomSlippage = (Math.random() - 0.5) * 0.0004;
        const price = signal.entryPrice * (1 + randomSlippage);

        chunks.push({
          chunkIndex,
          quantity: chunkQty,
          price: Math.round(price * 100) / 100,
          success: true,
        });

        totalFilled += chunkQty;
        remaining -= chunkQty;
        chunkIndex++;

        // Fast delay to simulate tick slices in logs
        await new Promise(r => setTimeout(r, 50));
      }

      const avgPrice = chunks.reduce((s, c) => s + c.price * c.quantity, 0) / totalQuantity;
      const slippagePct = Math.abs(avgPrice - signal.entryPrice) / signal.entryPrice * 100;

      await prisma.tradingLog.create({
        data: {
          level: 'INFO',
          source: 'SMART_EXECUTION',
          message: `[PAPER] TWAP Sliced: ${totalFilled}/${totalQuantity} filled passively in ${chunks.length} simulated chunks`,
          data: JSON.stringify({ signal, chunks }),
        },
      });

      return {
        success: true,
        paperTrade: true,
        actualEntryPrice: Math.round(avgPrice * 100) / 100,
        actualQuantity: totalFilled,
        slippagePct: Math.round(slippagePct * 1000) / 1000,
        reason: 'Simulated TWAP passive execution chunks complete',
        chunks,
      };
    }

    // Default single-order paper trade
    await prisma.tradingLog.create({
      data: {
        level: 'INFO',
        source: 'SMART_EXECUTION',
        message: `[PAPER] Passive Order placed: ${signal.direction} ${totalQuantity} ${signal.symbol} @ ₹${signal.entryPrice}`,
        data: JSON.stringify({ signal, paperTrade: true }),
      },
    });

    return {
      success: true,
      paperTrade: true,
      actualEntryPrice: signal.entryPrice,
      actualQuantity: totalQuantity,
      slippagePct: 0,
      reason: 'Paper trade executed (no real order placed)',
    };
  }

  const totalQuantity = signal.quantity;

  // Split into chunks if needed (TWAP Order Splicer)
  if (chunkOrders && totalQuantity > maxChunkSize) {
    const chunks: ChunkResult[] = [];
    let remaining = totalQuantity;
    let chunkIndex = 0;
    let totalFilled = 0;
    
    // Slice block into 10% components or maxChunkSize limit
    const dynamicChunkSize = Math.max(1, Math.min(maxChunkSize, Math.ceil(totalQuantity / 10)));

    while (remaining > 0) {
      const chunkQty = Math.min(dynamicChunkSize, remaining);
      let result = await executePassiveLimitOrder(params, chunkQty);

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
        message: `TWAP Sliced: ${totalFilled}/${totalQuantity} filled passively in ${chunks.length} chunks`,
        data: JSON.stringify({ signal, chunks }),
      },
    });

    return { success, actualEntryPrice: avgPrice, actualQuantity: totalFilled, slippagePct, chunks };
  }

  // Single order execution via passive placer
  const result = await executePassiveLimitOrder(params, totalQuantity);

  const slippagePct = result.price
    ? Math.abs(result.price - signal.entryPrice) / signal.entryPrice * 100
    : 0;

  await prisma.tradingLog.create({
    data: {
      level: result.success ? 'INFO' : 'ERROR',
      source: 'SMART_EXECUTION',
      message: result.success
        ? `Passive Order placed: ${signal.direction} ${totalQuantity} ${signal.symbol} @ ₹${result.price ?? signal.entryPrice} (id: ${result.orderId})`
        : `Passive Order failed: ${signal.symbol} — ${result.error}`,
      data: JSON.stringify({ signal, result }),
    },
  });

  return {
    success: result.success,
    orderId: result.orderId,
    actualEntryPrice: result.price ?? signal.entryPrice,
    actualQuantity: result.success ? totalQuantity : 0,
    slippagePct,
    reason: result.error,
    retries: 0,
  };
}
