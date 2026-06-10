// ============================================================
// FULL AUTONOMOUS TRADING ENGINE — UPGRADED SCAN ROUTE
// Phase 9: SignalAgent → RegimeAgent → RiskManager → Execution
// Database: Supabase PostgreSQL via Prisma
// ============================================================
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isMarketOpen, shouldSquareOff, logTradingEvent } from '@/lib/trading-engine';
import { runAllStrategies, newsSentimentStrategy, type MarketDataPoint } from '@/lib/strategies';
import { detectMarketRegime, filterSignalsByRegime } from '@/lib/market-regime';
import { ensembleVote, votingResultsToSignals } from '@/lib/ensemble-voting';
import { getBatchHistoricalPrices } from '@/lib/historical-data';
import { getRealisticMarketData } from '@/lib/nse-data';
import { getUserKiteClient, WATCHLIST_STOCKS } from '@/lib/kite';
import { computeBatchFeatures } from '@/lib/feature-store';
import { batchPredictXGBoost } from '@/lib/xgboost-predictor';
import { scoreConfidence } from '@/lib/confidence-scorer';
import { analyzeMarketBreadth, getBreadthSizingMultiplier } from '@/lib/market-breadth';
import { checkDrawdownStatus, logKillSwitchEvent } from '@/lib/drawdown-kill-switch';
import { getPortfolioRiskSnapshot, canAddPosition } from '@/lib/portfolio-risk-agent';
import { calculateDynamicRiskSize } from '@/lib/dynamic-risk-sizer';
import { estimateSlippage } from '@/lib/slippage-model';
import { calculateTrailingStop } from '@/lib/trailing-stop';
import { sendTradeEntryAlert, sendRiskWarning } from '@/lib/notifications';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  const startTime = Date.now();

  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });

    // ── GATE 1: Bot must be running ──
    const botSession = await prisma.botSession.findFirst({
      where: { userId, status: 'RUNNING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!botSession) {
      return NextResponse.json({ message: 'Bot is not running. Start it first.', signals: [] });
    }

    // ── GATE 2: Square-off time ──
    if (shouldSquareOff(config?.squareOffTime ?? '15:10')) {
      await autoSquareOff(userId, config?.squareOffTime ?? '15:10');
      return NextResponse.json({ message: 'Square-off time reached — all positions closed', signals: [] });
    }

    // ── GATE 3: Drawdown kill-switch ──
    const drawdownStatus = await checkDrawdownStatus(userId);
    if (drawdownStatus.triggered) {
      await logKillSwitchEvent(userId, drawdownStatus);
      if (drawdownStatus.mustCloseAll) await autoSquareOff(userId, 'kill-switch');
      sendRiskWarning({
        currentLoss: drawdownStatus.dailyPnl,
        maxLoss: config?.maxDailyLoss ?? 500,
        message: drawdownStatus.reason,
      }).catch(() => {});
      return NextResponse.json({
        message: drawdownStatus.reason,
        killSwitchLevel: drawdownStatus.level,
        signals: [],
      });
    }

    // ═══════════════════════════════════════
    // STEP 1: MARKET DATA COLLECTION
    // ═══════════════════════════════════════
    let marketData: MarketDataPoint[] = [];
    let dataSource = 'synthetic';

    // A) Kite Connect
    if (!marketData.length && config?.brokerType === 'kite') {
      try {
        const { client } = await getUserKiteClient(userId);
        if (client) {
          const quotes = await client.getQuote(WATCHLIST_STOCKS);
          const quoteData = quotes?.data ?? {};
          marketData = Object.entries(quoteData).map(([key, val]: [string, any]) => ({
            symbol: key,
            lastPrice: val?.last_price ?? 0,
            open: val?.ohlc?.open ?? 0,
            high: val?.ohlc?.high ?? 0,
            low: val?.ohlc?.low ?? 0,
            close: val?.ohlc?.close ?? 0,
            volume: val?.volume ?? 0,
            change: val?.net_change ?? 0,
            changePct: val?.ohlc?.close ? ((val.last_price - val.ohlc.close) / val.ohlc.close) * 100 : 0,
          }));
          dataSource = 'kite';
        }
      } catch (e: any) {
        await logTradingEvent('WARN', 'DATA', `Kite data failed: ${e?.message}`);
      }
    }

    // B) Fyers
    if (!marketData.length && config?.brokerType === 'fyers' && config.fyersAppId && config.fyersToken) {
      try {
        const { FyersClient } = await import('@/lib/fyers');
        const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
        const symbols = WATCHLIST_STOCKS.slice(0, 20).map(s => `NSE:${s.replace('NSE:', '')}-EQ`);
        const quotes = await fyers.getQuotes(symbols);
        if (quotes?.d) {
          marketData = quotes.d.map((q: any) => ({
            symbol: q?.n?.replace?.('-EQ', '') ?? '',
            lastPrice: q?.v?.lp ?? 0,
            open: q?.v?.open_price ?? 0,
            high: q?.v?.high_price ?? 0,
            low: q?.v?.low_price ?? 0,
            close: q?.v?.prev_close_price ?? 0,
            volume: q?.v?.volume ?? 0,
            change: q?.v?.ch ?? 0,
            changePct: q?.v?.chp ?? 0,
          }));
          dataSource = 'fyers';
        }
      } catch (e: any) {
        await logTradingEvent('WARN', 'DATA', `Fyers data failed: ${e?.message}`);
      }
    }

    // C) Free NSE live API fallback
    if (!marketData.length) {
      try {
        const { getLiveQuotes, NSE_POPULAR_STOCKS } = await import('@/lib/nse-live-api');
        const liveQuotes = await getLiveQuotes(NSE_POPULAR_STOCKS.slice(0, 25));
        if (liveQuotes?.length) {
          marketData = liveQuotes.map(q => ({
            symbol: `NSE:${q.symbol}`,
            lastPrice: q.lastPrice,
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.close,
            volume: q.volume,
            change: q.change,
            changePct: q.changePct,
          }));
          dataSource = 'nse-live';
        }
      } catch { /* fall through */ }
    }

    // D) Deterministic fallback
    if (!marketData.length) {
      marketData = getRealisticMarketData();
      dataSource = 'synthetic';
    }

    await logTradingEvent('INFO', 'DATA', `Market data: ${marketData.length} stocks via ${dataSource}`);

    // ═══════════════════════════════════════
    // STEP 2: HISTORICAL DATA + FEATURES
    // ═══════════════════════════════════════
    const historyMap = await getBatchHistoricalPrices(marketData, {
      fyersAppId: config?.fyersAppId ?? undefined,
      fyersToken: config?.fyersToken ?? undefined,
      userId,
      brokerType: config?.brokerType ?? 'kite',
    }, 60);

    const featuresMap = await computeBatchFeatures(marketData, historyMap);

    // ═══════════════════════════════════════
    // STEP 3: REGIME + BREADTH ANALYSIS
    // ═══════════════════════════════════════
    const regime = detectMarketRegime(marketData);
    const breadth = analyzeMarketBreadth(marketData);
    const breadthMult = getBreadthSizingMultiplier(breadth);

    await logTradingEvent('INFO', 'REGIME',
      `Regime: ${regime.regime} (${regime.confidence}%) | Breadth: ${breadth.signal} (${breadth.bullishScore}/100)`
    );

    // ═══════════════════════════════════════
    // STEP 4: SIGNAL GENERATION
    // ═══════════════════════════════════════
    const enabledStrategies = {
      momentum: config?.enableMomentum !== false,
      rsi: config?.enableRSI !== false,
      macd: config?.enableMACD !== false,
      bollinger: config?.enableBollinger !== false,
      supertrend: config?.enableSupertrend !== false,
      vwap: config?.enableVWAP !== false,
      emaCross: config?.enableEMACross !== false,
    };

    let rawSignals = runAllStrategies(marketData, enabledStrategies, historyMap);

    // News sentiment
    if (config?.enableNewsSentiment !== false) {
      try {
        const newsSignals = await newsSentimentStrategy([
          'Nifty continues bullish momentum on FII inflows',
          'Banking sector leads gains on credit growth data',
        ], marketData);
        rawSignals = [...rawSignals, ...(newsSignals ?? [])];
      } catch { /* non-critical */ }
    }

    // Regime filter
    rawSignals = filterSignalsByRegime(rawSignals, regime) as any[];

    // Ensemble voting (min 2 strategies must agree)
    const votingResults = ensembleVote(rawSignals, 2);
    const consensusSignals = votingResultsToSignals(votingResults);
    const signalsToScore = consensusSignals.length > 0 ? consensusSignals : rawSignals.slice(0, 10);

    // ═══════════════════════════════════════
    // STEP 5: XGBOOST + CONFIDENCE SCORING
    // ═══════════════════════════════════════
    const relevantSymbols = new Set(signalsToScore.map(s => s.symbol));
    const relevantFeatures = new Map(
      Array.from(featuresMap.entries()).filter(([k]) => relevantSymbols.has(k))
    );

    // XGBoost predictions (AbacusAI LLM with local fallback)
    const xgbResult = await batchPredictXGBoost(
      relevantFeatures,
      process.env.ABACUSAI_API_KEY,
      5
    ).catch(() => ({ predictions: [], modelVersion: 'fallback', latencyMs: 0 }));

    const xgbMap = new Map(xgbResult.predictions.map(p => [p.symbol, p]));

    // Score confidence for each signal
    const scoredSignals = signalsToScore
      .map(signal => {
        const features = featuresMap.get(signal.symbol);
        const xgb = xgbMap.get(signal.symbol) ?? null;
        if (!features) return null;

        const vr = votingResults.find(v => v.symbol === signal.symbol);
        const scored = scoreConfidence({
          symbol: signal.symbol,
          direction: signal.direction,
          strategy: signal.strategy,
          rawStrategyConfidence: signal.confidence,
          voteCount: vr?.voteCount ?? 1,
          totalStrategies: 8,
          xgb,
          regime,
          features,
        });

        return { ...signal, confidence: scored.finalScore, _grade: scored.grade, _warnings: scored.warnings };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null && s.confidence >= 60)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    // ═══════════════════════════════════════
    // STEP 6: PORTFOLIO RISK CHECK
    // ═══════════════════════════════════════
    const portfolioSnapshot = await getPortfolioRiskSnapshot(userId);
    const { allowed: portfolioAllowed, reason: portfolioReason } = canAddPosition(portfolioSnapshot);

    if (!portfolioAllowed) {
      await logTradingEvent('WARN', 'RISK', `Portfolio risk blocked: ${portfolioReason}`);
    }

    // ═══════════════════════════════════════
    // STEP 7: TRAILING STOP MANAGEMENT
    // ═══════════════════════════════════════
    const currentPriceMap = new Map(marketData.map(s => [s.symbol, s.lastPrice]));
    await updateTrailingStops(userId, currentPriceMap, config);

    // ═══════════════════════════════════════
    // STEP 8: EXECUTE SIGNALS
    // ═══════════════════════════════════════
    const executedTrades: any[] = [];
    const paperTrading = !await isLiveMode(userId);

    if (portfolioAllowed && scoredSignals.length > 0) {
      const capital = config?.capitalAmount ?? 10000;

      // Get performance context for dynamic sizing
      const recentTrades = await prisma.trade.findMany({
        where: { userId, status: 'CLOSED' },
        orderBy: { exitTime: 'desc' },
        take: 20,
      });
      const recentWinRate = recentTrades.length > 0
        ? recentTrades.filter((t: any) => (t.pnl ?? 0) > 0).length / recentTrades.length
        : 0.5;
      let consecutiveLosses = 0;
      for (const t of recentTrades) {
        if ((t.pnl ?? 0) < 0) consecutiveLosses++;
        else break;
      }

      const openCount = await prisma.trade.count({ where: { userId, status: 'OPEN' } });
      const maxPositions = Math.min(config?.maxPositions ?? 3, 5);

      for (const signal of scoredSignals) {
        if (openCount + executedTrades.length >= maxPositions) break;

        const features = featuresMap.get(signal.symbol);
        if (!features) continue;

        // Dynamic risk sizing
        const sizing = calculateDynamicRiskSize({
          capital,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          direction: signal.direction,
          baseRiskPercent: 1.0,
          maxPositionPercent: 15,
          features,
          regime: regime as any,
          breadth,
          recentWinRate,
          consecutiveLosses,
          openPositions: openCount + executedTrades.length,
          maxPositions,
          portfolioHeat: portfolioSnapshot.portfolioHeatPct / 100,
        });

        // Apply breadth multiplier
        const finalQty = Math.max(1, Math.round(sizing.quantity * breadthMult));

        // Slippage check
        const slippage = estimateSlippage({
          symbol: signal.symbol,
          entryPrice: signal.entryPrice,
          targetPrice: signal.target,
          stopLoss: signal.stopLoss,
          direction: signal.direction,
          quantity: finalQty,
          avgVolume: features.volumeMA20 ?? 100000,
          currentVolume: features.volume,
          atrPct: features.atrPct,
          isLargeCapProxy: signal.entryPrice > 500,
        });

        if (!slippage.tradeable) {
          await logTradingEvent('WARN', 'SLIPPAGE', `${signal.symbol}: ${slippage.reason}`);
          continue;
        }

        // Create trade record in Supabase
        const trade = await prisma.trade.create({
          data: {
            userId,
            symbol: signal.symbol,
            exchange: signal.exchange ?? 'NSE',
            segment: 'EQUITY',
            direction: signal.direction,
            quantity: finalQty,
            entryPrice: signal.entryPrice,
            stopLoss: signal.stopLoss,
            target: signal.target,
            strategy: signal.strategy,
            status: 'OPEN',
            notes: paperTrading
              ? `[PAPER] Grade: ${(signal as any)._grade} | Confidence: ${signal.confidence.toFixed(0)}%`
              : `Grade: ${(signal as any)._grade} | Confidence: ${signal.confidence.toFixed(0)}%`,
          },
        });

        // Live broker execution
        if (!paperTrading) {
          await executeLiveTrade(signal, finalQty, userId, config, trade.id);
        }

        executedTrades.push({
          tradeId: trade.id,
          symbol: signal.symbol,
          direction: signal.direction,
          quantity: finalQty,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          target: signal.target,
          confidence: signal.confidence,
          grade: (signal as any)._grade,
          paperTrade: paperTrading,
        });

        await logTradingEvent('INFO', 'EXECUTION',
          `${paperTrading ? '[PAPER] ' : ''}${signal.direction} ${finalQty}x ${signal.symbol} @ ₹${signal.entryPrice} | Grade: ${(signal as any)._grade} | SL: ₹${signal.stopLoss} | T: ₹${signal.target}`,
          { tradeId: trade.id, confidence: signal.confidence, sizing: sizing.reasoning }
        );

        // Send notifications
        sendTradeEntryAlert({
          symbol: signal.symbol,
          direction: signal.direction,
          quantity: finalQty,
          entryPrice: signal.entryPrice,
          stopLoss: signal.stopLoss,
          target: signal.target,
          strategy: signal.strategy,
        }).catch(() => {});
      }
    }

    // ═══════════════════════════════════════
    // STEP 9: CHECK OPEN POSITIONS (SL/Target)
    // ═══════════════════════════════════════
    const closedPositions = await checkAndClosePositions(userId, currentPriceMap, paperTrading);

    // ═══════════════════════════════════════
    // STEP 10: LOG AGENT RUN TO SUPABASE
    // ═══════════════════════════════════════
    await logTradingEvent('INFO', 'AGENT_ORCHESTRATOR',
      `Scan complete: ${rawSignals.length} raw → ${votingResults.length} consensus → ${scoredSignals.length} scored → ${executedTrades.length} executed | ${closedPositions.length} positions closed`,
      {
        regime: regime.regime,
        breadthSignal: breadth.signal,
        dataSource,
        paperTrading,
        durationMs: Date.now() - startTime,
        xgbPredictions: xgbResult.predictions.length,
        killSwitchLevel: drawdownStatus.level,
      }
    );

    return NextResponse.json({
      signals: scoredSignals,
      executed: executedTrades,
      closed: closedPositions,
      regime: { regime: regime.regime, confidence: regime.confidence, description: regime.description },
      breadth: { signal: breadth.signal, bullishScore: breadth.bullishScore, advancing: breadth.advancing, declining: breadth.declining },
      risk: {
        drawdownLevel: drawdownStatus.level,
        dailyPnl: drawdownStatus.dailyPnl,
        portfolioHeat: portfolioSnapshot.portfolioHeatPct,
        riskGrade: portfolioSnapshot.riskGrade,
        canOpenPositions: portfolioAllowed,
      },
      marketData: marketData.slice(0, 10).map(d => ({
        symbol: d.symbol,
        lastPrice: d.lastPrice,
        changePct: d.changePct,
        volume: d.volume,
      })),
      marketSnapshot: marketData, // For breadth/agents panels
      niftyPrice: marketData.find(d => d.symbol?.includes('NIFTY'))?.lastPrice ?? marketData.reduce((s, d) => s + d.lastPrice, 0) / (marketData.length || 1),
      dataSource,
      paperTrading,
      isLiveData: dataSource !== 'synthetic',
      durationMs: Date.now() - startTime,
    });

  } catch (err: any) {
    console.error('Autonomous scan error:', err);
    await logTradingEvent('ERROR', 'SCAN', `Scan failed: ${err?.message}`).catch(() => {});
    return NextResponse.json({ error: err?.message ?? 'Scan failed' }, { status: 500 });
  }
}

// ══════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════

async function isLiveMode(userId: string): Promise<boolean> {
  try {
    const token = await prisma.kiteToken.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    return !!token;
  } catch { return false; }
}

async function executeLiveTrade(
  signal: any,
  quantity: number,
  userId: string,
  config: any,
  tradeId: string
): Promise<void> {
  try {
    const brokerType = config?.brokerType ?? 'kite';

    if (brokerType === 'kite') {
      const { getUserKiteClient } = await import('@/lib/kite');
      const { client } = await getUserKiteClient(userId);
      if (client) {
        const orderId = await client.placeOrder({
          tradingsymbol: signal.symbol.replace(/^NSE:/, ''),
          exchange: 'NSE',
          transaction_type: signal.direction,
          quantity,
          order_type: 'MARKET',
          product: 'MIS',
        });
        await prisma.trade.update({ where: { id: tradeId }, data: { orderId: String(orderId) } });
      }
    } else if (brokerType === 'openalgo' && config?.openalgoApiKey) {
      const { OpenAlgoClient } = await import('@/lib/openalgo');
      const client = new OpenAlgoClient({ apiKey: config.openalgoApiKey, host: config.openalgoHost ?? 'http://127.0.0.1:5000' });
      await client.placeOrder({
        symbol: signal.symbol.replace(/^NSE:/, ''),
        exchange: 'NSE',
        action: signal.direction as 'BUY' | 'SELL',
        quantity,
        pricetype: 'MARKET',
        product: 'MIS',
        strategy: 'ZerodhaAI_Phase9',
      });
    } else if (brokerType === 'fyers' && config?.fyersAppId && config?.fyersToken) {
      const { FyersClient } = await import('@/lib/fyers');
      const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
      await fyers.placeOrder({
        symbol: `NSE:${signal.symbol.replace(/^NSE:/, '')}-EQ`,
        qty: quantity,
        type: 2,
        side: signal.direction === 'BUY' ? 1 : -1,
        productType: 'INTRADAY',
        validity: 'DAY',
      });
    }
  } catch (e: any) {
    await logTradingEvent('ERROR', 'LIVE_EXECUTION', `Live order failed for ${signal.symbol}: ${e?.message}`, { tradeId });
  }
}

async function updateTrailingStops(
  userId: string,
  currentPrices: Map<string, number>,
  config: any
): Promise<void> {
  try {
    const openTrades = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
    for (const trade of openTrades) {
      const currentPrice = currentPrices.get(trade.symbol)
        ?? currentPrices.get(`NSE:${trade.symbol}`)
        ?? currentPrices.get(trade.symbol.replace('NSE:', ''));
      if (!currentPrice) continue;

      const result = calculateTrailingStop({
        initialStopLoss: trade.stopLoss,
        entryPrice: trade.entryPrice,
        direction: trade.direction as 'BUY' | 'SELL',
        currentPrice,
        trailingPercent: config?.stopLossPercent ?? 1.0,
      });

      if (result.updated && result.newStopLoss !== trade.stopLoss) {
        await prisma.trade.update({ where: { id: trade.id }, data: { stopLoss: result.newStopLoss } });
        await logTradingEvent('INFO', 'TRAILING_SL',
          `${trade.symbol}: SL ${trade.direction === 'BUY' ? '↑' : '↓'} ₹${trade.stopLoss.toFixed(2)} → ₹${result.newStopLoss.toFixed(2)} (locked ₹${result.profitLocked.toFixed(2)})`
        );
      }
    }
  } catch { /* non-critical */ }
}

async function checkAndClosePositions(
  userId: string,
  currentPrices: Map<string, number>,
  paperTrading: boolean
): Promise<any[]> {
  const closed: any[] = [];
  try {
    const openTrades = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });

    for (const trade of openTrades) {
      const currentPrice = currentPrices.get(trade.symbol)
        ?? currentPrices.get(`NSE:${trade.symbol}`)
        ?? currentPrices.get(trade.symbol.replace('NSE:', ''));
      if (!currentPrice) continue;

      const isBuy = trade.direction === 'BUY';
      let reason = '';
      let shouldClose = false;

      if (isBuy && currentPrice <= trade.stopLoss) {
        reason = `SL hit @ ₹${trade.stopLoss}`;
        shouldClose = true;
      } else if (!isBuy && currentPrice >= trade.stopLoss) {
        reason = `SL hit @ ₹${trade.stopLoss}`;
        shouldClose = true;
      } else if (isBuy && currentPrice >= trade.target) {
        reason = `Target hit @ ₹${trade.target}`;
        shouldClose = true;
      } else if (!isBuy && currentPrice <= trade.target) {
        reason = `Target hit @ ₹${trade.target}`;
        shouldClose = true;
      }

      if (shouldClose) {
        const pnl = isBuy
          ? (currentPrice - trade.entryPrice) * trade.quantity
          : (trade.entryPrice - currentPrice) * trade.quantity;

        await prisma.trade.update({
          where: { id: trade.id },
          data: { status: 'CLOSED', exitPrice: currentPrice, pnl, exitTime: new Date() },
        });

        await logTradingEvent(pnl >= 0 ? 'INFO' : 'WARN', 'POSITION_CLOSE',
          `${paperTrading ? '[PAPER] ' : ''}${trade.symbol} CLOSED: ${reason} | P&L: ₹${pnl.toFixed(2)}`
        );

        closed.push({ symbol: trade.symbol, reason, pnl, exitPrice: currentPrice });
      }
    }

    // Update daily P&L in Supabase
    if (closed.length > 0) {
      const todayStr = new Date().toISOString().split('T')[0]!;
      const today = new Date(todayStr);
      const totalNewPnl = closed.reduce((s, t) => s + t.pnl, 0);

      await prisma.dailyPnl.upsert({
        where: { date: today },
        update: {
          totalPnl: { increment: totalNewPnl },
          tradesCount: { increment: closed.length },
          winCount: { increment: closed.filter(t => t.pnl > 0).length },
          lossCount: { increment: closed.filter(t => t.pnl <= 0).length },
        },
        create: {
          date: today,
          totalPnl: totalNewPnl,
          tradesCount: closed.length,
          winCount: closed.filter(t => t.pnl > 0).length,
          lossCount: closed.filter(t => t.pnl <= 0).length,
        },
      });
    }
  } catch (e: any) {
    await logTradingEvent('ERROR', 'POSITION_CHECK', `Position check error: ${e?.message}`).catch(() => {});
  }
  return closed;
}

async function autoSquareOff(userId: string, reason: string): Promise<void> {
  try {
    const openTrades = await prisma.trade.findMany({ where: { userId, status: 'OPEN' } });
    for (const trade of openTrades) {
      await prisma.trade.update({
        where: { id: trade.id },
        data: { status: 'CLOSED', exitPrice: trade.entryPrice, pnl: 0, exitTime: new Date(), notes: `Auto-closed: ${reason}` },
      });
    }
    if (openTrades.length > 0) {
      await logTradingEvent('INFO', 'SQUARE_OFF', `Auto square-off (${reason}): ${openTrades.length} positions closed`);
    }
  } catch { /* non-critical */ }
}
