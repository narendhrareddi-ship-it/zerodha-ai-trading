'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FlaskConical, Play, TrendingUp, TrendingDown, BarChart3, Clock, Target, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface BacktestResult {
  id: string;
  strategy: string;
  period: string;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  maxDrawdown: number;
  sharpeRatio: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: any[];
  createdAt: string;
}

const STRATEGIES = [
  { value: 'MOMENTUM', label: 'Momentum' },
  { value: 'RSI', label: 'RSI' },
  { value: 'MACD', label: 'MACD' },
  { value: 'BOLLINGER_BANDS', label: 'Bollinger Bands' },
  { value: 'SUPERTREND', label: 'Supertrend' },
  { value: 'VWAP', label: 'VWAP' },
  { value: 'EMA_CROSSOVER', label: 'EMA Crossover' },
];

const PERIODS = [
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
  { value: '6M', label: '6 Months' },
  { value: '1Y', label: '1 Year' },
];

export function BacktestPanel() {
  const [strategy, setStrategy] = useState('MOMENTUM');
  const [period, setPeriod] = useState('3M');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<BacktestResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/trading/backtest');
        if (res?.ok) {
          const data = await res.json();
          setHistory(data?.results ?? []);
        }
      } catch (err: any) {
        console.error('Backtest history fetch error:', err?.message);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, []);

  const runBacktest = async () => {
    setRunning(true);
    try {
      toast.info(`Running ${strategy} backtest for ${period}...`);
      const res = await fetch('/api/trading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, period }),
      });
      const data = await res.json();
      if (res?.ok) {
        setResult(data);
        setHistory((prev: BacktestResult[]) => [data, ...(prev ?? [])]);
        toast.success('Backtest complete!');
      } else {
        toast.error(data?.error ?? 'Backtest failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Backtest failed');
    } finally {
      setRunning(false);
    }
  };

  const formatCurrency = (val: number) => {
    const v = val ?? 0;
    return `${v >= 0 ? '+' : ''}₹${v.toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="w-5 h-5 text-primary" />
            Strategy Backtester
          </CardTitle>
          <CardDescription>Test strategies against historical data to evaluate performance before going live</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runBacktest} loading={running} className="gap-2 min-w-[140px]">
              <Play className="w-4 h-4" /> Run Backtest
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
              Backtest Results — {STRATEGIES.find((s) => s.value === result.strategy)?.label ?? result.strategy}
              <Badge variant="outline" className="ml-2">{result.period}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <MetricCard
                icon={<Target className="w-4 h-4" />}
                label="Win Rate"
                value={`${(result.winRate ?? 0).toFixed(1)}%`}
                color={(result.winRate ?? 0) >= 50 ? 'text-emerald-500' : 'text-red-500'}
              />
              <MetricCard
                icon={(result.totalPnl ?? 0) >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                label="Total P&L"
                value={formatCurrency(result.totalPnl ?? 0)}
                color={(result.totalPnl ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}
              />
              <MetricCard
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Max Drawdown"
                value={formatCurrency(result.maxDrawdown ?? 0)}
                color="text-amber-500"
              />
              <MetricCard
                icon={<BarChart3 className="w-4 h-4" />}
                label="Sharpe Ratio"
                value={(result.sharpeRatio ?? 0).toFixed(2)}
                color={(result.sharpeRatio ?? 0) >= 1 ? 'text-emerald-500' : 'text-amber-500'}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <MetricCard
                icon={<Clock className="w-4 h-4" />}
                label="Total Trades"
                value={String(result.totalTrades ?? 0)}
                color="text-foreground"
              />
              <MetricCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Avg Win"
                value={formatCurrency(result.avgWin ?? 0)}
                color="text-emerald-500"
              />
              <MetricCard
                icon={<TrendingDown className="w-4 h-4" />}
                label="Avg Loss"
                value={formatCurrency(result.avgLoss ?? 0)}
                color="text-red-500"
              />
              <MetricCard
                icon={<Target className="w-4 h-4" />}
                label="Profit Factor"
                value={(result.profitFactor ?? 0).toFixed(2)}
                color={(result.profitFactor ?? 0) >= 1 ? 'text-emerald-500' : 'text-red-500'}
              />
            </div>

            {/* Trade Log */}
            {(result.trades?.length ?? 0) > 0 && (
              <div>
                <h4 className="font-display font-semibold text-sm mb-3">Trade Log</h4>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Day</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-right p-2 font-medium">Entry</th>
                        <th className="text-right p-2 font-medium">Exit</th>
                        <th className="text-right p-2 font-medium">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.trades ?? []).slice(0, 20).map((trade: any, i: number) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 font-mono">{trade?.day ?? '-'}</td>
                          <td className="p-2">
                            <Badge variant={(trade?.type ?? '') === 'BUY' ? 'default' : 'secondary'} className="text-xs">
                              {trade?.type ?? '-'}
                            </Badge>
                          </td>
                          <td className="p-2 text-right font-mono">₹{(trade?.entry ?? 0).toFixed(2)}</td>
                          <td className="p-2 text-right font-mono">₹{(trade?.exit ?? 0).toFixed(2)}</td>
                          <td className={`p-2 text-right font-mono font-bold ${(trade?.pnl ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {formatCurrency(trade?.pnl ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(result.trades?.length ?? 0) > 20 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Showing 20 of {result.trades?.length ?? 0} trades
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {(history?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Past Backtests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">Strategy</th>
                    <th className="text-left p-3 font-medium">Period</th>
                    <th className="text-right p-3 font-medium">Trades</th>
                    <th className="text-right p-3 font-medium">Win Rate</th>
                    <th className="text-right p-3 font-medium">P&L</th>
                    <th className="text-right p-3 font-medium">Sharpe</th>
                    <th className="text-right p-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(history ?? []).slice(0, 10).map((bt: BacktestResult, i: number) => (
                    <tr
                      key={bt?.id ?? i}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => setResult(bt)}
                    >
                      <td className="p-3 font-medium">{STRATEGIES.find((s) => s.value === bt?.strategy)?.label ?? bt?.strategy}</td>
                      <td className="p-3">{bt?.period}</td>
                      <td className="p-3 text-right font-mono">{bt?.totalTrades ?? 0}</td>
                      <td className="p-3 text-right font-mono">{(bt?.winRate ?? 0).toFixed(1)}%</td>
                      <td className={`p-3 text-right font-mono font-bold ${(bt?.totalPnl ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {formatCurrency(bt?.totalPnl ?? 0)}
                      </td>
                      <td className="p-3 text-right font-mono">{(bt?.sharpeRatio ?? 0).toFixed(2)}</td>
                      <td className="p-3 text-right text-muted-foreground text-xs">
                        {bt?.createdAt ? new Date(bt.createdAt).toLocaleDateString('en-IN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-mono font-bold ${color}`}>{value}</p>
    </div>
  );
}
