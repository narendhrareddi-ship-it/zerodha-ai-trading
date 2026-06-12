export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const query = body?.query ?? 'Analyze current market conditions for intraday trading';

    const { getLLMCompletion } = await import('@/lib/llm');
    const text = await getLLMCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are an expert Indian stock market analyst specializing in intraday trading. Provide concise, actionable analysis for NSE/BSE stocks. Focus on technical levels, momentum, and risk management. Be brief and data-driven.',
        },
        { role: 'user', content: query },
      ],
      maxTokens: 1500,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify({
          choices: [{
            delta: { content: text },
            finish_reason: 'stop',
            index: 0
          }]
        }) + '\n')); // format as JSON chunk to match event-stream or simple parser
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    console.error('Analyze error:', err);
    return NextResponse.json({ error: err?.message ?? 'Analysis failed' }, { status: 500 });
  }
}
