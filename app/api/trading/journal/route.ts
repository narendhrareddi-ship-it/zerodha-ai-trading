export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET: Fetch journal entries
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);
  const symbol = searchParams.get('symbol');

  try {
    const where: any = { userId };
    if (symbol) where.symbol = symbol;

    const entries = await prisma.tradeJournal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Stats
    const allEntries = await prisma.tradeJournal.findMany({ where: { userId } });
    const avgRating = allEntries.length > 0
      ? allEntries.reduce((s: number, e: any) => s + (e?.rating ?? 3), 0) / allEntries.length
      : 0;
    const emotionCounts: Record<string, number> = {};
    allEntries.forEach((e: any) => {
      const em = e?.emotion ?? 'neutral';
      emotionCounts[em] = (emotionCounts[em] ?? 0) + 1;
    });

    return NextResponse.json({
      entries,
      stats: {
        total: allEntries.length,
        avgRating: Math.round(avgRating * 10) / 10,
        emotionBreakdown: emotionCounts,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch journal' }, { status: 500 });
  }
}

// POST: Create or auto-journal a trade with AI insight
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  try {
    const body = await request.json();

    // If tradeId provided, auto-populate from trade data
    let tradeData: any = {};
    if (body?.tradeId) {
      const trade = await prisma.trade.findFirst({
        where: { id: body.tradeId, userId },
      });
      if (trade) {
        tradeData = {
          symbol: trade.symbol,
          direction: trade.direction,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          pnl: trade.pnl,
          strategy: trade.strategy,
        };
      }
    }

    // Generate AI insight if trade data available
    let aiInsight = body?.aiInsight ?? null;
    if (!aiInsight && (tradeData?.pnl != null || body?.pnl != null)) {
      try {
        aiInsight = await generateAIInsight({
          ...tradeData,
          ...body,
          notes: body?.notes,
          emotion: body?.emotion,
        });
      } catch {
        // AI insight is optional
      }
    }

    const entry = await prisma.tradeJournal.create({
      data: {
        userId,
        tradeId: body?.tradeId ?? null,
        symbol: body?.symbol ?? tradeData?.symbol ?? null,
        direction: body?.direction ?? tradeData?.direction ?? null,
        entryPrice: body?.entryPrice ?? tradeData?.entryPrice ?? null,
        exitPrice: body?.exitPrice ?? tradeData?.exitPrice ?? null,
        pnl: body?.pnl ?? tradeData?.pnl ?? null,
        strategy: body?.strategy ?? tradeData?.strategy ?? null,
        emotion: body?.emotion ?? 'neutral',
        notes: body?.notes ?? null,
        aiInsight,
        tags: body?.tags ?? '',
        rating: body?.rating ?? 3,
        lessonsLearned: body?.lessonsLearned ?? null,
        marketCondition: body?.marketCondition ?? null,
      },
    });

    return NextResponse.json(entry);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to create journal entry' }, { status: 500 });
  }
}

async function generateAIInsight(tradeData: any): Promise<string> {
  const apiKey = process.env.ABACUSAI_API_KEY;
  if (!apiKey) return '';

  const prompt = `Analyze this trade and provide a brief 2-3 sentence insight:
Symbol: ${tradeData?.symbol ?? 'N/A'}
Direction: ${tradeData?.direction ?? 'N/A'}
Entry: ₹${tradeData?.entryPrice ?? 'N/A'} → Exit: ₹${tradeData?.exitPrice ?? 'N/A'}
P&L: ₹${tradeData?.pnl ?? 'N/A'}
Strategy: ${tradeData?.strategy ?? 'N/A'}
Trader Notes: ${tradeData?.notes ?? 'None'}
Trader Emotion: ${tradeData?.emotion ?? 'neutral'}

Provide: 1) What went right/wrong, 2) Key lesson, 3) Improvement suggestion. Be specific and actionable.`;

  const res = await fetch('https://api.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
      messages: [
        { role: 'system', content: 'You are a professional trading coach. Provide concise, actionable trade analysis.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!res?.ok) return '';
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}
