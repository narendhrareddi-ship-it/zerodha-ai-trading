// Utility to fetch real-time financial news headlines from Google News RSS feed for free

export interface NewsHeadline {
  title: string;
  link?: string;
  pubDate?: string;
  source?: string;
}

/**
 * Fetch top news headlines relating to the Indian stock market/Nifty from Google News RSS
 */
export async function fetchGoogleNewsHeadlines(): Promise<string[]> {
  try {
    // Search query for Indian stock market news over the last 24 hours
    const query = encodeURIComponent('NSE OR BSE OR "stock market" OR "nifty" OR "sensex" when:1d');
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      next: { revalidate: 300 }, // Cache for 5 minutes in Next.js
    } as any);

    if (!response.ok) {
      console.warn(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
      return [];
    }

    const xml = await response.text();

    const items: string[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>([\s\S]*?)<\/title>/;

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      const titleMatch = titleRegex.exec(itemContent);
      if (titleMatch && titleMatch[1]) {
        let title = titleMatch[1]
          .replace(/<!\[CDATA\[/, '')
          .replace(/\]\]>/, '')
          .trim();
        
        // Decode HTML entities
        title = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'");

        // Clean up title (remove trailing source like " - Economic Times")
        const cleanTitle = title.replace(/\s+-\s+[^ -]+$/, '').trim();
        if (cleanTitle) {
          items.push(cleanTitle);
        }
      }
    }

    return items.slice(0, 15); // Return top 15 news headlines
  } catch (err: any) {
    console.error('[News API] Error fetching Google News RSS:', err?.message);
    return [];
  }
}

/**
 * Fetch stock-specific news headlines
 */
export async function fetchStockSpecificHeadlines(symbol: string): Promise<string[]> {
  try {
    const cleanSymbol = symbol.replace(/^NSE:/, '').replace(/-EQ$/, '');
    const query = encodeURIComponent(`"${cleanSymbol}" AND (stock OR shares OR deal OR buyout OR earnings OR dividend OR profit) when:7d`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const items: string[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>([\s\S]*?)<\/title>/;

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      const titleMatch = titleRegex.exec(itemContent);
      if (titleMatch && titleMatch[1]) {
        let title = titleMatch[1]
          .replace(/<!\[CDATA\[/, '')
          .replace(/\]\]>/, '')
          .trim();
        
        title = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");

        const cleanTitle = title.replace(/\s+-\s+[^ -]+$/, '').trim();
        if (cleanTitle) {
          items.push(cleanTitle);
        }
      }
    }

    return items.slice(0, 5); // Return top 5 stock-specific news headlines
  } catch (err: any) {
    console.error(`[News API] Error fetching news for ${symbol}:`, err?.message);
    return [];
  }
}
