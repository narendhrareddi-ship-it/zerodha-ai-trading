export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const query = body?.query ?? 'Analyze current market conditions for intraday trading';

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert Indian stock market analyst specializing in intraday trading. Provide concise, actionable analysis for NSE/BSE stocks. Focus on technical levels, momentum, and risk management. Be brief and data-driven.',
          },
          { role: 'user', content: query },
        ],
        stream: true,
        max_tokens: 1500,
      }),
    });

    if (!response?.ok) {
      const errorText = await response?.text?.().catch(() => 'LLM API error');
      return NextResponse.json({ error: `AI analysis failed: ${errorText}` }, { status: 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response?.body?.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        try {
          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            const chunk = decoder.decode(value);
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (error: any) {
          console.error('Stream error:', error);
          controller.error(error);
        } finally {
          controller.close();
        }
      },
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
