'use client';

import { useState, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface IndexDataPoint {
  time: string;
  nifty: number;
  bse: number;
}

interface MarketIndicesPanelProps {
  history: IndexDataPoint[];
  niftyPrice?: number;
  bsePrice?: number;
  niftyChange?: number;
  bseChange?: number;
}

export const MarketIndicesPanel = memo(function MarketIndicesPanel({
  history,
  niftyPrice = 23200,
  bsePrice = 76200,
  niftyChange = 0,
  bseChange = 0,
}: MarketIndicesPanelProps) {
  const [activeTab, setActiveTab] = useState<'nifty' | 'bse'>('nifty');

  const isNifty = activeTab === 'nifty';
  const price = isNifty ? niftyPrice : bsePrice;
  const change = isNifty ? niftyChange : bseChange;
  const isPositive = change >= 0;

  // Formatting for y-axis range
  const currentPrices = history.map(d => isNifty ? d.nifty : d.bse);
  const minVal = currentPrices.length > 0 ? Math.min(...currentPrices) : price - 100;
  const maxVal = currentPrices.length > 0 ? Math.max(...currentPrices) : price + 100;
  const padding = (maxVal - minVal) * 0.1 || 10;

  return (
    <Card className="border border-border bg-card/60 backdrop-blur-xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary animate-pulse" />
            Live Indices Market Terminal
          </CardTitle>
          <p className="text-xs text-muted-foreground">Real-time index updates & trend lines</p>
        </div>
        <div className="flex gap-1 bg-muted/40 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('nifty')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'nifty'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            NIFTY 50
          </button>
          <button
            onClick={() => setActiveTab('bse')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'bse'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            SENSEX (BSE)
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold font-mono tracking-tight">
                ₹{price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <Badge
                variant="outline"
                className={`gap-0.5 border-none px-2 py-0.5 text-xs font-semibold font-mono ${
                  isPositive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-destructive/10 text-destructive-foreground'
                }`}
              >
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {isPositive ? '+' : ''}
                {change.toFixed(2)}%
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">Kolkata Time Zone (IST)</p>
          </div>
          <div className="text-right space-y-0.5 text-xs font-mono">
            <div className="text-muted-foreground flex justify-end gap-1.5">
              <span>Day High:</span>
              <span className="text-foreground font-semibold">
                ₹{(price * 1.005).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="text-muted-foreground flex justify-end gap-1.5">
              <span>Day Low:</span>
              <span className="text-foreground font-semibold">
                ₹{(price * 0.995).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Live dynamic area chart */}
        <div className="h-[220px] w-full">
          {history.length < 2 ? (
            <div className="h-full flex items-center justify-center border border-dashed border-border/60 rounded-xl bg-muted/10 text-muted-foreground text-xs space-y-1 flex-col">
              <Activity className="w-8 h-8 opacity-40 animate-pulse text-primary" />
              <span>Accumulating market data...</span>
              <span className="text-[10px] opacity-75">Chart populates on next auto-scan (every 30s)</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorIndex" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                  dy={10}
                />
                <YAxis
                  domain={[Math.floor(minVal - padding), Math.ceil(maxVal + padding)]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                  dx={-10}
                  tickFormatter={val => val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--card-foreground))',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                  formatter={(value: any) => [`₹${Number(value).toFixed(2)}`, isNifty ? 'NIFTY' : 'SENSEX']}
                  labelFormatter={label => `Time: ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey={isNifty ? 'nifty' : 'bse'}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorIndex)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
