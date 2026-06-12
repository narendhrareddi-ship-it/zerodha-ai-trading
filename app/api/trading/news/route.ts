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
    const today = new Date().toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const { getLLMCompletion } = await import('@/lib/llm');
    const content = await getLLMCompletion({
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
      maxTokens: 2000,
      jsonMode: true,
    });

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
      const liveNews = await getLiveNewsFallback();
      return NextResponse.json({ news: liveNews });
    }
  } catch (err: any) {
    const liveNews = await getLiveNewsFallback();
    return NextResponse.json({ news: liveNews });
  }
}

async function getLiveNewsFallback(): Promise<NewsItem[]> {
  try {
    const { fetchGoogleNewsHeadlines } = await import('@/lib/news');
    const headlines = await fetchGoogleNewsHeadlines();
    if (headlines?.length) {
      return headlines.map((title, idx) => ({
        title,
        description: `Live tracking for: "${title}". Market momentum is actively analyzed by the agent pipeline.`,
        source: 'Live RSS Feed',
        url: '#',
        publishedAt: new Date(Date.now() - idx * 15 * 60 * 1000).toISOString(),
        sentiment: title.toLowerCase().includes('jump') || title.toLowerCase().includes('rally') || title.toLowerCase().includes('gain') || title.toLowerCase().includes('rise')
          ? 'positive'
          : title.toLowerCase().includes('tumble') || title.toLowerCase().includes('fall') || title.toLowerCase().includes('drop') || title.toLowerCase().includes('loss')
          ? 'negative'
          : 'neutral',
      }));
    }
  } catch {}
  return getStaticNews();
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
