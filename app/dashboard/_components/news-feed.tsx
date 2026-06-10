'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';

interface NewsItem {
  title: string;
  description: string;
  source: string;
  publishedAt: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export function NewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trading/news');
      if (res?.ok) {
        const data = await res.json();
        setNews(data?.news ?? []);
      }
    } catch (err: any) {
      console.error('News fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNews(); }, []);

  const sentimentIcon = (s?: string) => {
    if (s === 'positive') return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    if (s === 'negative') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    return <Minus className="w-3.5 h-3.5 text-yellow-500" />;
  };

  const sentimentColor = (s?: string) => {
    if (s === 'positive') return 'bg-green-500/10 text-green-500 border-green-500/20';
    if (s === 'negative') return 'bg-red-500/10 text-red-500 border-red-500/20';
    return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
  };

  const timeAgo = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            Market News & Sentiment
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchNews} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && news.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading market news...
          </div>
        ) : (news ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No news available</p>
        ) : (
          (news ?? []).map((item, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors space-y-2">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium leading-snug flex-1">{item.title}</h4>
                <Badge variant="outline" className={`shrink-0 text-xs gap-1 ${sentimentColor(item.sentiment)}`}>
                  {sentimentIcon(item.sentiment)}
                  {item.sentiment ?? 'neutral'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
                <span className="font-medium">{item.source}</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeAgo(item.publishedAt)}
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
