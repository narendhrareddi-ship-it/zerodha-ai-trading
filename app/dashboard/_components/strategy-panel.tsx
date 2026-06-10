'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, TrendingUp, BarChart2, Newspaper, Zap, Activity, LineChart, ArrowUpDown, BarChart3, Waves } from 'lucide-react';

interface Strategy {
  name: string;
  enabled: boolean;
  signals: number;
  trades: number;
}

const strategyIcons: Record<string, any> = {
  'Momentum': TrendingUp,
  'RSI': BarChart2,
  'MACD': Activity,
  'Bollinger Bands': LineChart,
  'Supertrend': ArrowUpDown,
  'VWAP': BarChart3,
  'EMA Crossover': Waves,
  'News Sentiment': Newspaper,
};

const strategyDescriptions: Record<string, string> = {
  'Momentum': 'Detects strong price movements with volume confirmation for trend-following entries',
  'RSI': 'Identifies oversold bounces and overbought reversals using relative strength analysis',
  'MACD': 'Uses moving average convergence/divergence crossovers with histogram confirmation',
  'Bollinger Bands': 'Identifies breakouts and mean-reversion when price touches upper/lower bands',
  'Supertrend': 'ATR-based trend indicator for directional trades with dynamic stop levels',
  'VWAP': 'Volume-weighted average price strategy for institutional-level entry timing',
  'EMA Crossover': 'Fast/slow EMA crossover signals for trend detection with momentum filter',
  'News Sentiment': 'Uses AI to analyze market news and generate sentiment-based trading signals',
};

export function StrategyPanel({ strategies }: { strategies: Strategy[] }) {
  const safeStrategies = strategies ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="w-5 h-5 text-primary" />
          Active Strategies
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {safeStrategies.map((strategy: Strategy, i: number) => {
            const IconComponent = strategyIcons[strategy?.name ?? ''] ?? Zap;
            return (
              <Card key={i} className={`transition-all duration-normal hover:shadow-md ${strategy?.enabled ? '' : 'opacity-50'}`}>
                <CardContent className="pt-4 pb-4 px-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconComponent className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-display font-semibold text-sm">{strategy?.name ?? 'Unknown'}</span>
                    </div>
                    <Badge variant={strategy?.enabled ? 'default' : 'secondary'} className="text-xs">
                      {strategy?.enabled ? 'Active' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {strategyDescriptions[strategy?.name ?? ''] ?? 'Trading strategy'}
                  </p>
                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground">Signals: </span>
                      <span className="font-mono font-bold">{strategy?.signals ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Trades: </span>
                      <span className="font-mono font-bold">{strategy?.trades ?? 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
