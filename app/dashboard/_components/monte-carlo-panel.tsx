'use client';

import { useState, useCallback } from 'react';
import { LineChart, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Shield } from 'lucide-react';

interface MonteCarloResult {
  config: { simulations: number; tradingDays: number; initialCapital: number };
  meanReturn: number;
  medianReturn: number;
  p5Return: number;
  p95Return: number;
  var95: number;
  cvar95: number;
  maxDrawdownMean: number;
  maxDrawdownWorst: number;
  probabilityOfProfit: number;
  probabilityOfRuin: number;
  probabilityOfDoubling: number;
  paths: number[][];
  histogram: { bucket: number; count: number }[];
}

const SIMULATIONS = 1000;
const TRADING_DAYS = 30;

function MetricCard({ label, value, sub, color = 'text-gray-200' }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-3 border border-gray-700/30">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function FanChart({ paths, capital }: { paths: number[][]; capital: number }) {
  if (!paths.length || !paths[0]?.length) return null;
  const days = paths[0].length;
  const W = 300, H = 120;
  const maxVal = Math.max(...paths.flat());
  const minVal = Math.min(...paths.flat());
  const range = maxVal - minVal || 1;

  const toX = (i: number) => (i / (days - 1)) * W;
  const toY = (v: number) => H - ((v - minVal) / range) * H;

  const midPath = paths[Math.floor(paths.length / 2)]!;
  const bestPath = [...paths].sort((a, b) => (b[b.length - 1]! - a[a.length - 1]!))[0]!;
  const worstPath = [...paths].sort((a, b) => (a[a.length - 1]! - b[b.length - 1]!))[0]!;

  const pathStr = (p: number[]) => p.map((v, i) => `${toX(i)},${toY(v)}`).join(' L ');

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="mt-2">
      {/* Fan paths */}
      {paths.map((p, i) => (
        <polyline key={i} points={p.map((v, j) => `${toX(j)},${toY(v)}`).join(' ')}
          fill="none" stroke="rgba(139,92,246,0.08)" strokeWidth="0.8" />
      ))}
      {/* Best path */}
      <polyline points={bestPath.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')}
        fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="1.5" strokeDasharray="4,2" />
      {/* Worst path */}
      <polyline points={worstPath.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')}
        fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="1.5" strokeDasharray="4,2" />
      {/* Median path */}
      <polyline points={midPath.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')}
        fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="2" />
      {/* Baseline */}
      <line x1={0} y1={toY(capital)} x2={W} y2={toY(capital)}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
    </svg>
  );
}

function Histogram({ data, var95 }: { data: { bucket: number; count: number }[]; var95: number }) {
  if (!data.length) return null;
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((s, d) => s + d.count, 0);
  const H = 60;

  return (
    <div className="flex items-end gap-0.5 h-16 mt-2">
      {data.map((d, i) => {
        const isLoss = d.bucket < 0;
        const height = (d.count / maxCount) * H;
        const pct = ((d.count / total) * 100).toFixed(1);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${(d.bucket * 100).toFixed(1)}% return: ${pct}%`}>
            <div
              style={{ height: `${height}px` }}
              className={`w-full rounded-sm transition-all ${isLoss ? 'bg-red-500/60' : 'bg-emerald-500/60'}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function MonteCarloPanel() {
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(TRADING_DAYS);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trading/monte-carlo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulations: SIMULATIONS, tradingDays: days, dailyRiskPercent: 1.0 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(data.result);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700/50 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <LineChart size={16} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Monte Carlo Risk</h3>
            <p className="text-xs text-gray-500">{SIMULATIONS.toLocaleString()} simulations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded-lg px-2 py-1"
          >
            <option value={10}>10 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            onClick={runSimulation}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Running...' : 'Simulate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          <AlertTriangle size={12} /> {error}
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-8 text-gray-500 text-sm">
          Run simulation to see risk projections
        </div>
      )}

      {result && (
        <>
          {/* Fan Chart */}
          <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400">Portfolio Outcome Scenarios</span>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-emerald-500 inline-block" /> Best</span>
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-violet-500 inline-block" /> Median</span>
                <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500 inline-block" /> Worst</span>
              </div>
            </div>
            <FanChart paths={result.paths} capital={result.config.initialCapital} />
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="VaR (95%)"
              value={`₹${result.var95.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub="Max expected loss at 95% confidence"
              color="text-red-400"
            />
            <MetricCard
              label="CVaR (95%)"
              value={`₹${result.cvar95.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
              sub="Expected loss beyond VaR"
              color="text-orange-400"
            />
            <MetricCard
              label="Prob. of Profit"
              value={`${(result.probabilityOfProfit * 100).toFixed(1)}%`}
              sub={`Median return: ${(result.medianReturn * 100).toFixed(1)}%`}
              color="text-emerald-400"
            />
            <MetricCard
              label="Prob. of Ruin"
              value={`${(result.probabilityOfRuin * 100).toFixed(1)}%`}
              sub="Equity drops below 30% of capital"
              color={result.probabilityOfRuin > 0.05 ? 'text-red-400' : 'text-emerald-400'}
            />
          </div>

          {/* Drawdown stats */}
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800/30 rounded-xl border border-gray-700/20">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Shield size={12} />
              <span>Max Drawdown</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs">Avg: <span className="text-amber-400 font-semibold">{(result.maxDrawdownMean * 100).toFixed(1)}%</span></span>
              <span className="text-xs">Worst 5%: <span className="text-red-400 font-semibold">{(result.maxDrawdownWorst * 100).toFixed(1)}%</span></span>
            </div>
          </div>

          {/* Return histogram */}
          <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/20">
            <p className="text-xs text-gray-400 mb-1">Return Distribution</p>
            <Histogram data={result.histogram} var95={result.var95} />
            <div className="flex justify-between mt-1 text-[10px] text-gray-600">
              <span>{(result.p5Return * 100).toFixed(0)}% (P5)</span>
              <span>{(result.meanReturn * 100).toFixed(1)}% (Mean)</span>
              <span>{(result.p95Return * 100).toFixed(0)}% (P95)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
