'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, TrendingDown, Target, Flame, AlertTriangle, Trophy, RefreshCw, Shield, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';

const EquityChartInner = dynamic(() => import('./equity-chart-inner'), { ssr: false });

interface AnalyticsData {
  overview: {
    totalTrades: number;
    winCount: number;
    lossCount: number;
    breakevenCount: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    winRate: number;
    profitFactor: number;
    largestWin: number;
    largestLoss: number;
    maxWinStreak: number;
    maxLossStreak: number;
    currentStreak: number;
    maxDrawdown: number;
  };
  advancedRisk?: {
    sharpeRatio: number;
    sortinoRatio: number;
    calmarRatio: number;
    valueAtRisk95: number;
    expectedShortfall: number;
    recoveryFactor: number;
    payoffRatio: number;
  };
  timeHeatmap?: { hour: number; label: string; pnl: number; trades: number; avgPnl: number }[];
  equityCurve: { date: string; equity: number }[];
  strategyBreakdown: { name: string; trades: number; wins: number; winRate: number; pnl: number }[];
  topSymbols: { symbol: string; trades: number; pnl: number }[];
}

export function AnalyticsPanel() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trading/analytics?period=${period}`);
      if (res?.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err: any) {
      console.error('Analytics error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period]);

  const o = data?.overview;

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Period:</span>
        {['7', '14', '30', '90'].map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPeriod(p)}
          >
            {p}D
          </Button>
        ))}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={fetchData}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading analytics...
        </div>
      ) : (
        <>
          {/* Overview Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Total P&L</span>
                </div>
                <p className={`font-mono text-xl font-bold ${(o?.totalPnl ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  ₹{(o?.totalPnl ?? 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Win Rate</span>
                </div>
                <p className="font-mono text-xl font-bold">{(o?.winRate ?? 0).toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">{o?.winCount ?? 0}W / {o?.lossCount ?? 0}L</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span className="text-xs text-muted-foreground">Profit Factor</span>
                </div>
                <p className="font-mono text-xl font-bold">{(o?.profitFactor ?? 0).toFixed(2)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-muted-foreground">Max Drawdown</span>
                </div>
                <p className="font-mono text-xl font-bold text-red-400">₹{(o?.maxDrawdown ?? 0).toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Advanced Risk Metrics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" />
                Advanced Risk Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: 'Sharpe Ratio', value: data?.advancedRisk?.sharpeRatio ?? 0, good: 1, desc: 'Risk-adjusted return' },
                  { label: 'Sortino Ratio', value: data?.advancedRisk?.sortinoRatio ?? 0, good: 1.5, desc: 'Downside risk-adjusted' },
                  { label: 'Calmar Ratio', value: data?.advancedRisk?.calmarRatio ?? 0, good: 1, desc: 'Return / drawdown' },
                  { label: 'VaR (95%)', value: data?.advancedRisk?.valueAtRisk95 ?? 0, good: -1, desc: 'Worst daily loss', prefix: '₹' },
                  { label: 'Expected Shortfall', value: data?.advancedRisk?.expectedShortfall ?? 0, good: -1, desc: 'Avg loss beyond VaR', prefix: '₹' },
                  { label: 'Recovery Factor', value: data?.advancedRisk?.recoveryFactor ?? 0, good: 2, desc: 'Net profit / drawdown' },
                  { label: 'Payoff Ratio', value: data?.advancedRisk?.payoffRatio ?? 0, good: 1.5, desc: 'Avg win / avg loss' },
                ].map((m) => (
                  <div key={m.label} className="p-3 rounded-lg bg-muted/30 space-y-1">
                    <p className="text-[10px] text-muted-foreground">{m.label}</p>
                    <p className={`font-mono text-lg font-bold ${
                      m.good > 0 ? (m.value >= m.good ? 'text-emerald-400' : m.value > 0 ? 'text-amber-400' : 'text-red-400')
                      : 'text-foreground'
                    }`}>
                      {m.prefix ?? ''}{m.value.toFixed(2)}
                    </p>
                    <p className="text-[9px] text-muted-foreground/60">{m.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Time-of-Day Heatmap */}
          {(data?.timeHeatmap ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-400" />
                  P&L by Time of Day
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-1 overflow-x-auto pb-2">
                  {(data?.timeHeatmap ?? []).map((h) => {
                    const maxPnl = Math.max(...(data?.timeHeatmap ?? []).map(x => Math.abs(x.pnl)), 1);
                    const intensity = Math.abs(h.pnl) / maxPnl;
                    return (
                      <div key={h.hour} className="flex flex-col items-center gap-1 min-w-[52px]">
                        <div
                          className={`w-full h-12 rounded-md flex items-center justify-center text-xs font-mono font-bold ${
                            h.pnl >= 0
                              ? `bg-emerald-500/${Math.max(10, Math.round(intensity * 40))} text-emerald-400`
                              : `bg-red-500/${Math.max(10, Math.round(intensity * 40))} text-red-400`
                          }`}
                          style={{ opacity: 0.5 + intensity * 0.5 }}
                        >
                          {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toFixed(0)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{h.label}</span>
                        <span className="text-[9px] text-muted-foreground/60">{h.trades}t</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Trades</span>
                  <span className="font-mono font-bold">{o?.totalTrades ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg Win</span>
                  <span className="font-mono text-green-500">₹{(o?.avgWin ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg Loss</span>
                  <span className="font-mono text-red-500">₹{(o?.avgLoss ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Largest Win</span>
                  <span className="font-mono text-green-500">₹{(o?.largestWin ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Largest Loss</span>
                  <span className="font-mono text-red-500">₹{(o?.largestLoss ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Max Win Streak</span>
                  <span className="font-mono text-green-500">{o?.maxWinStreak ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Max Loss Streak</span>
                  <span className="font-mono text-red-500">{o?.maxLossStreak ?? 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Current Streak</span>
                  <span className={`font-mono font-bold ${(o?.currentStreak ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {(o?.currentStreak ?? 0) > 0 ? `+${o?.currentStreak}` : o?.currentStreak ?? 0}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Strategy Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Strategy Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.strategyBreakdown ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No strategy data yet</p>
                )}
                {(data?.strategyBreakdown ?? []).map((s) => (
                  <div key={s.name} className="p-3 rounded-lg bg-muted/30 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className={`font-mono text-sm font-bold ${s.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ₹{s.pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{s.trades} trades</Badge>
                      <Badge variant="outline" className="text-xs">{s.winRate.toFixed(0)}% win</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Equity Curve */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Equity Curve
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.equityCurve ?? []).length > 0 ? (
                <div className="h-64">
                  <EquityChartInner data={data?.equityCurve ?? []} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No equity data yet. Start trading to see your equity curve.</p>
              )}
            </CardContent>
          </Card>

          {/* Top Symbols */}
          {(data?.topSymbols ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Traded Symbols</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {(data?.topSymbols ?? []).map((s) => (
                    <div key={s.symbol} className="p-2 rounded-lg bg-muted/30 text-center">
                      <p className="text-xs font-mono font-bold">{s.symbol?.replace?.('NSE:', '')}</p>
                      <p className={`text-xs font-mono ${s.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ₹{s.pnl.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.trades} trades</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
