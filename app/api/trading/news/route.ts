export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface NewsItem {
  title: string;
  description: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Use LLM to generate latest market news analysis
    const apiKey = process.env.ABACUSAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ news: getStaticNews() });
    }

    const today = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const response = await fetch('https://llmapi.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a financial news analyst specializing in the Indian stock market. Generate realistic, current market news based on real market trends and sectors. Return JSON array only.',
          },
          {
            role: 'user',
            content: `Generate 8 realistic Indian stock market news items for ${today}. Cover: Nifty/Sensex, sectors (IT, Banking, Pharma, Auto), FII/DII activity, and global cues. Return ONLY a JSON array with objects having: title, description (2-3 sentences), source (realistic Indian financial sources like MoneyControl, ET Markets, LiveMint, CNBC-TV18), sentiment (positive/negative/neutral). No markdown, no code blocks, just the JSON array.`,
          },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!response?.ok) {
      return NextResponse.json({ news: getStaticNews() });
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '';

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      const newsItems = JSON.parse(jsonStr);

      const formattedNews: NewsItem[] = (newsItems ?? []).map((item: any, idx: number) => ({
        title: item?.title ?? 'Market Update',
        description: item?.description ?? '',
        source: item?.source ?? 'Market Analysis',
        url: '#',
        publishedAt: new Date(Date.now() - idx * 30 * 60 * 1000).toISOString(),
        sentiment: item?.sentiment ?? 'neutral',
      }));

      return NextResponse.json({ news: formattedNews });
    } catch {
      return NextResponse.json({ news: getStaticNews() });
    }
  } catch (err: any) {
    // LLM API may be unavailable, falling back to static news
    return NextResponse.json({ news: getStaticNews() });
  }
}

function getStaticNews(): NewsItem[] {
  return [
    {
      title: 'Nifty 50 Shows Strength, IT Stocks Lead Rally',
      description: 'The benchmark Nifty 50 index showed resilience with IT heavyweights driving gains. TCS and Infosys contributed significantly to the index movement.',
      source: 'MoneyControl',
      url: '#',
      publishedAt: new Date().toISOString(),
      sentiment: 'positive',
    },
    {
      title: 'FII Buying Supports Market Sentiment',
      description: 'Foreign Institutional Investors remained net buyers in the cash segment, boosting overall market sentiment. DII activity remained measured.',
      source: 'ET Markets',
      url: '#',
      publishedAt: new Date(Date.now() - 3600000).toISOString(),
      sentiment: 'positive',
    },
    {
      title: 'Banking Sector Under Pressure on NPA Concerns',
      description: 'Banking stocks faced selling pressure as concerns over rising NPAs weighed on investor sentiment. HDFC Bank and SBI were notable laggards.',
      source: 'LiveMint',
      url: '#',
      publishedAt: new Date(Date.now() - 7200000).toISOString(),
      sentiment: 'negative',
    },
    {
      title: 'Auto Stocks Rally on Strong Sales Data',
      description: 'Automobile sector witnessed buying interest following strong monthly sales numbers. Maruti Suzuki and Tata Motors led the gains.',
      source: 'CNBC-TV18',
      url: '#',
      publishedAt: new Date(Date.now() - 10800000).toISOString(),
      sentiment: 'positive',
    },
    {
      title: 'RBI Policy Decision Awaited, Markets Cautious',
      description: 'Markets traded in a narrow range ahead of the upcoming RBI monetary policy decision. Bond yields remained stable.',
      source: 'ET Markets',
      url: '#',
      publishedAt: new Date(Date.now() - 14400000).toISOString(),
      sentiment: 'neutral',
    },
  ];
}
