'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, RefreshCw, TrendingUp, TrendingDown, Wifi, WifiOff } from 'lucide-react';

interface StockData {
  symbol: string;
  exchange: string;
  lastPrice: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isLive: boolean;
}

export function WatchlistPanel() {
  const [watchlist, setWatchlist] = useState<StockData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [sortBy, setSortBy] = useState<'symbol' | 'changePct' | 'volume'>('changePct');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/trading/watchlist');
      if (res?.ok) {
        const data = await res.json();
        setWatchlist(data?.watchlist ?? []);
        setIsLive(data?.isLive ?? false);
      }
    } catch (err: any) {
      console.error('Watchlist error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...(watchlist ?? [])].sort((a, b) => {
    if (sortBy === 'symbol') return (a?.symbol ?? '').localeCompare(b?.symbol ?? '');
    if (sortBy === 'changePct') return Math.abs(b?.changePct ?? 0) - Math.abs(a?.changePct ?? 0);
    return (b?.volume ?? 0) - (a?.volume ?? 0);
  });

  const gainers = sorted.filter((s) => (s?.changePct ?? 0) > 0);
  const losers = sorted.filter((s) => (s?.changePct ?? 0) < 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isLive ? 'default' : 'outline'} className="gap-1">
            {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isLive ? 'Live Data' : 'Simulated'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort:</span>
          {(['changePct', 'volume', 'symbol'] as const).map((s) => (
            <Button
              key={s}
              variant={sortBy === s ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setSortBy(s)}
            >
              {s === 'changePct' ? 'Change' : s === 'volume' ? 'Volume' : 'Name'}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="h-7" onClick={fetchData}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Gainers & Losers Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-green-500/20">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium text-green-500">Gainers</span>
              <Badge variant="outline" className="ml-auto text-green-500 border-green-500/30">{gainers.length}</Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/20">
          <CardContent className="pt-3 pb-3 px-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-sm font-medium text-red-500">Losers</span>
              <Badge variant="outline" className="ml-auto text-red-500 border-red-500/30">{losers.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stock List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Market Watchlist ({sorted.length} stocks)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
            </div>
          ) : (
            <div className="space-y-1">
              {sorted.map((stock) => {
                const isUp = (stock?.changePct ?? 0) >= 0;
                return (
                  <div
                    key={stock.symbol}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-8 rounded-full ${isUp ? 'bg-green-500' : 'bg-red-500'}`} />
                      <div>
                        <p className="text-sm font-mono font-bold">{stock.symbol}</p>
                        <p className="text-xs text-muted-foreground">{stock.exchange}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold">₹{(stock?.lastPrice ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className={`text-xs font-mono ${isUp ? 'text-green-500' : 'text-red-500'}`}>
                        {isUp ? '+' : ''}{(stock?.changePct ?? 0).toFixed(2)}%
                        <span className="text-muted-foreground ml-2">
                          Vol: {((stock?.volume ?? 0) / 1000000).toFixed(1)}M
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
