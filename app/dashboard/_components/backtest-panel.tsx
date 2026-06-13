'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FlaskConical, 
  Play, 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Clock, 
  Target, 
  AlertTriangle, 
  BrainCircuit, 
  ShieldAlert, 
  History, 
  CheckCircle2, 
  Sliders 
} from 'lucide-react';
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
  sortinoRatio?: number;
  recoveryFactor?: number;
  payoffRatio?: number;
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

const WF_STRATEGIES = [
  { value: 'RSI', label: 'RSI Reversals' },
  { value: 'MACD', label: 'MACD Crossover' },
  { value: 'BOLLINGER', label: 'Bollinger Mean Reversion' },
];

const PERIODS = [
  { value: '1M', label: '1 Month' },
  { value: '3M', label: '3 Months' },
  { value: '6M', label: '6 Months' },
  { value: '1Y', label: '1 Year' },
];

export function BacktestPanel() {
  const [activePanelTab, setActivePanelTab] = useState('backtest');

  // Backtest state
  const [strategy, setStrategy] = useState('MOMENTUM');
  const [period, setPeriod] = useState('3M');
  const [capital, setCapital] = useState(10000);
  const [maxDailyLoss, setMaxDailyLoss] = useState(500);
  const [stopLossPercent, setStopLossPercent] = useState(1.0);
  const [targetPercent, setTargetPercent] = useState(2.0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<BacktestResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Walk-forward state
  const [wfStrategy, setWfStrategy] = useState('RSI');
  const [wfSymbol, setWfSymbol] = useState('NSE:INFY');
  const [inSample, setInSample] = useState('60');
  const [outSample, setOutSample] = useState('20');
  const [wfRunning, setWfRunning] = useState(false);
  const [wfResult, setWfResult] = useState<any>(null);
  const [wfHistory, setWfHistory] = useState<any[]>([]);
  const [loadingWfHistory, setLoadingWfHistory] = useState(true);

  // Fetch Backtest History
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

  // Fetch Walk-Forward History
  const fetchWfHistory = async () => {
    try {
      const res = await fetch('/api/trading/walk-forward');
      if (res?.ok) {
        const data = await res.json();
        setWfHistory(data?.results ?? []);
      }
    } catch (err: any) {
      console.error('Walk-forward history fetch error:', err?.message);
    } finally {
      setLoadingWfHistory(false);
    }
  };

  useEffect(() => {
    if (activePanelTab === 'walk-forward') {
      fetchWfHistory();
    }
  }, [activePanelTab]);

  const runBacktest = async () => {
    setRunning(true);
    try {
      toast.info(`Running ${strategy} backtest for ${period}...`);
      const res = await fetch('/api/trading/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy,
          period,
          capital,
          maxDailyLoss,
          stopLossPercent,
          targetPercent,
        }),
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

  const runWfOptimization = async () => {
    setWfRunning(true);
    try {
      toast.info(`Executing walk-forward search for ${wfSymbol} (${wfStrategy})...`);
      const res = await fetch('/api/trading/walk-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: wfStrategy,
          symbol: wfSymbol,
          inSampleBars: Number(inSample),
          outSampleBars: Number(outSample),
        }),
      });
      const data = await res.json();
      if (res?.ok) {
        setWfResult(data);
        setWfHistory((prev: any[]) => [data, ...(prev ?? [])]);
        toast.success('Walk-forward optimization complete!');
      } else {
        toast.error(data?.error ?? 'Optimization failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Optimization failed');
    } finally {
      setWfRunning(false);
    }
  };

  const formatCurrency = (val: number) => {
    const v = val ?? 0;
    return `${v >= 0 ? '+' : ''}₹${v.toFixed(2)}`;
  };

  return (
    <Tabs value={activePanelTab} onValueChange={setActivePanelTab} className="w-full space-y-6">
      <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
        <TabsTrigger value="backtest">📊 Strategy Backtester</TabsTrigger>
        <TabsTrigger value="walk-forward">⚙️ Walk-Forward Optimizer</TabsTrigger>
      </TabsList>

      {/* BACKTEST TAB */}
      <TabsContent value="backtest" className="space-y-6 mt-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FlaskConical className="w-5 h-5 text-primary" />
              Strategy Backtester
            </CardTitle>
            <CardDescription>Test strategies against historical data to evaluate performance before going live</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
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
              <div className="space-y-1">
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
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Capital (₹)</Label>
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Daily Loss Limit (₹)</Label>
                <input
                  type="number"
                  value={maxDailyLoss}
                  onChange={(e) => setMaxDailyLoss(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Stop Loss (%)</Label>
                <input
                  type="number"
                  step="0.1"
                  value={stopLossPercent}
                  onChange={(e) => setStopLossPercent(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Target (%)</Label>
                <input
                  type="number"
                  step="0.1"
                  value={targetPercent}
                  onChange={(e) => setTargetPercent(Number(e.target.value))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>

            <Button onClick={runBacktest} loading={running} className="w-full gap-2 mt-2">
              <Play className="w-4 h-4" /> Run Backtest Simulation
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="w-5 h-5 text-primary" />
                Backtest Results — {STRATEGIES.find((s) => s.value === result.strategy)?.label ?? result.strategy}
                <Badge variant="outline" className="ml-2">{result.period}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t pt-4">
                <MetricCard
                  icon={<BarChart3 className="w-4 h-4 text-violet-400" />}
                  label="Sortino Ratio"
                  value={result.sortinoRatio != null ? result.sortinoRatio.toFixed(2) : '0.00'}
                  color={result.sortinoRatio != null && result.sortinoRatio >= 1 ? 'text-emerald-500' : 'text-amber-500'}
                />
                <MetricCard
                  icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
                  label="Recovery Factor"
                  value={result.recoveryFactor != null ? result.recoveryFactor.toFixed(2) : '0.00'}
                  color={result.recoveryFactor != null && result.recoveryFactor >= 1.5 ? 'text-emerald-500' : 'text-amber-500'}
                />
                <MetricCard
                  icon={<Target className="w-4 h-4 text-cyan-400" />}
                  label="Payoff Ratio"
                  value={result.payoffRatio != null ? result.payoffRatio.toFixed(2) : '0.00'}
                  color={result.payoffRatio != null && result.payoffRatio >= 1.5 ? 'text-emerald-500' : 'text-amber-500'}
                />
              </div>

              {(result.trades?.length ?? 0) > 0 && (
                <div>
                  <h4 className="font-display font-semibold text-sm mb-3">Trade Log</h4>
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-2 font-medium">Day</th>
                          <th className="p-2 font-medium">Type</th>
                          <th className="p-2 text-right font-medium">Entry</th>
                          <th className="p-2 text-right font-medium">Exit</th>
                          <th className="p-2 text-right font-medium">P&L</th>
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
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 font-medium">Strategy</th>
                      <th className="p-3 font-medium">Period</th>
                      <th className="p-3 text-right font-medium">Trades</th>
                      <th className="p-3 text-right font-medium">Win Rate</th>
                      <th className="p-3 text-right font-medium">P&L</th>
                      <th className="p-3 text-right font-medium">Sharpe</th>
                      <th className="p-3 text-right font-medium">Date</th>
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
                        <td className="p-3 text-right text-muted-foreground text-xs font-mono">
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
      </TabsContent>

      {/* WALK-FORWARD OPTIMIZER TAB */}
      <TabsContent value="walk-forward" className="space-y-6 mt-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BrainCircuit className="w-5 h-5 text-violet-400" />
              Walk-Forward Parameter Optimizer
            </CardTitle>
            <CardDescription>
              Prevent overfitting by optimizing strategy parameters on rolling training windows and validating them on out-of-sample data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Strategy</Label>
                <Select value={wfStrategy} onValueChange={setWfStrategy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WF_STRATEGIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Symbol</Label>
                <input 
                  type="text" 
                  value={wfSymbol} 
                  onChange={(e) => setWfSymbol(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" 
                  placeholder="e.g. NSE:INFY"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">In-Sample (Train) Bars</Label>
                <Select value={inSample} onValueChange={setInSample}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="40">40 Bars</SelectItem>
                    <SelectItem value="60">60 Bars</SelectItem>
                    <SelectItem value="80">80 Bars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Out-of-Sample (Test) Bars</Label>
                <Select value={outSample} onValueChange={setOutSample}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Bars</SelectItem>
                    <SelectItem value="20">20 Bars</SelectItem>
                    <SelectItem value="30">30 Bars</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={runWfOptimization} loading={wfRunning} className="gap-2 bg-violet-600 hover:bg-violet-500 text-white min-w-[140px]">
                <Sliders className="w-4 h-4" /> Optimize Parameters
              </Button>
            </div>
          </CardContent>
        </Card>

        {wfResult && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Overview & Score Card */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Validation Diagnostics</CardTitle>
                <CardDescription>Overfitting protection score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-6 bg-muted/20 rounded-xl border border-dashed flex flex-col items-center justify-center">
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Robustness Score</p>
                  <h3 className={`text-5xl font-mono font-black ${
                    wfResult.robustnessScore >= 70 ? 'text-emerald-400 animate-pulse-green' :
                    wfResult.robustnessScore >= 50 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {wfResult.robustnessScore}
                  </h3>
                  <Badge className="mt-3" variant={wfResult.isRobust ? 'default' : 'destructive'}>
                    {wfResult.isRobust ? 'Robust Configuration' : 'Overfitting Risk'}
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2 text-sm">
                    <span className="text-muted-foreground">Parameter Stability</span>
                    <span className="font-mono font-bold text-cyan-400">{(wfResult.overallStability * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 text-sm">
                    <span className="text-muted-foreground">Test Win Rate (Out-Sample)</span>
                    <span className="font-mono font-bold">{(wfResult.outSampleWinRate * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-2 text-sm">
                    <span className="text-muted-foreground">Test Profit Factor</span>
                    <span className="font-mono font-bold">{wfResult.outSampleProfitFactor?.toFixed(2) ?? '0.00'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Parameter Grid & Rolling Windows */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-semibold">Optimized Recommended Parameters</CardTitle>
                <CardDescription>Grid search results matching recent regime shifts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {wfResult.recommendedParams && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/30 rounded-xl p-3 border">
                    {Object.entries(wfResult.recommendedParams).map(([key, val]: [string, any]) => (
                      <div key={key} className="text-center p-2 bg-background/50 rounded-lg">
                        <p className="text-[10px] text-muted-foreground uppercase">{key.replace(/([A-Z])/g, ' $1')}</p>
                        <p className="text-sm font-mono font-bold text-violet-400 mt-1">{typeof val === 'number' ? val.toFixed(1) : String(val)}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <h4 className="font-display font-semibold text-sm mb-3 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-violet-400" />
                    Rolling Windows Walk-Forward
                  </h4>
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-2.5 font-medium">Window</th>
                          <th className="p-2.5 text-right font-medium">In-Sample WR</th>
                          <th className="p-2.5 text-right font-medium">Out-Sample WR</th>
                          <th className="p-2.5 text-right font-medium">In-Sample Return</th>
                          <th className="p-2.5 text-right font-medium">Out-Sample Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(wfResult.windows ?? []).map((win: any, idx: number) => (
                          <tr key={idx} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="p-2.5 font-mono">W{idx + 1} ({win.inSampleStart}-{win.outSampleEnd})</td>
                            <td className="p-2.5 text-right font-mono text-emerald-400 font-medium">{(win.inSampleMetrics?.winRate * 100).toFixed(0)}%</td>
                            <td className="p-2.5 text-right font-mono text-cyan-400 font-medium">{(win.outSampleMetrics?.winRate * 100).toFixed(0)}%</td>
                            <td className="p-2.5 text-right font-mono">{(win.inSampleMetrics?.totalReturn * 100).toFixed(1)}%</td>
                            <td className={`p-2.5 text-right font-mono font-semibold ${(win.outSampleMetrics?.totalReturn ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                              {(win.outSampleMetrics?.totalReturn * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Walk-forward history */}
        {(wfHistory?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Walk-Forward History Log</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 font-medium">Strategy</th>
                      <th className="p-3 font-medium">Symbol</th>
                      <th className="p-3 text-right font-medium">Robustness</th>
                      <th className="p-3 text-right font-medium">Stability</th>
                      <th className="p-3 text-right font-medium">Out-Sample WR</th>
                      <th className="p-3 text-right font-medium">Status</th>
                      <th className="p-3 text-right font-medium">Optimized Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wfHistory ?? []).slice(0, 10).map((wf: any, i: number) => (
                      <tr
                        key={wf?.id ?? i}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setWfResult(wf)}
                      >
                        <td className="p-3 font-medium">{WF_STRATEGIES.find((s) => s.value === wf?.strategy)?.label ?? wf?.strategy}</td>
                        <td className="p-3 font-mono text-xs">{wf?.symbol}</td>
                        <td className="p-3 text-right font-mono font-bold text-violet-400">{wf?.robustnessScore}</td>
                        <td className="p-3 text-right font-mono">{(wf?.overallStability * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right font-mono">{(wf?.outSampleWinRate * 100).toFixed(1)}%</td>
                        <td className="p-3 text-right">
                          {wf.isRobust ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Robust
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-red-400 font-semibold">
                              <ShieldAlert className="w-3.5 h-3.5" /> Overfit Risk
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right text-muted-foreground text-xs font-mono">
                          {wf?.createdAt ? new Date(wf.createdAt).toLocaleDateString('en-IN') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
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
