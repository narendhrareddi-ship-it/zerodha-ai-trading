'use client';

import { useState, useCallback } from 'react';
import { BarChart2, RefreshCw, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';

interface BreadthData {
  advancing: number;
  declining: number;
  unchanged: number;
  total: number;
  advanceDeclineRatio: number;
  upDownVolumeRatio: number;
  new52WHigh: number;
  new52WLow: number;
  mclellanOscillator: number;
  percentAboveEMA20: number;
  percentAboveEMA50: number;
  breadthThrust: boolean;
  bullishScore: number;
  bearishScore: number;
  signal: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH';
  description: string;
}

const SIGNAL_CONFIG = {
  VERY_BULLISH: { label: '🚀 Very Bullish', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: TrendingUp },
  BULLISH: { label: '📈 Bullish', text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: TrendingUp },
  NEUTRAL: { label: '➡️ Neutral', text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', icon: Minus },
  BEARISH: { label: '📉 Bearish', text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: TrendingDown },
  VERY_BEARISH: { label: '🔻 Very Bearish', text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: TrendingDown },
};

function ProgressBar({ value, max, colorClass = 'bg-violet-500' }: { value: number; max: number; colorClass?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 bg-gray-700/50 rounded-full overflow-hidden">
      <div className={`h-full ${colorClass} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ADBar({ advancing, declining, unchanged, total }: { advancing: number; declining: number; unchanged: number; total: number }) {
  const advPct = total > 0 ? (advancing / total) * 100 : 0;
  const decPct = total > 0 ? (declining / total) * 100 : 0;
  const unchPct = 100 - advPct - decPct;

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        <div className="bg-emerald-500 transition-all" style={{ width: `${advPct}%` }} title={`${advancing} advancing`} />
        <div className="bg-gray-600 transition-all" style={{ width: `${unchPct}%` }} title={`${unchanged} unchanged`} />
        <div className="bg-red-500 transition-all" style={{ width: `${decPct}%` }} title={`${declining} declining`} />
      </div>
      <div className="flex justify-between mt-1 text-[10px]">
        <span className="text-emerald-400">▲ {advancing}</span>
        <span className="text-gray-500">— {unchanged}</span>
        <span className="text-red-400">▼ {declining}</span>
      </div>
    </div>
  );
}

function BullishScoreArc({ score }: { score: number }) {
  // Semicircle arc gauge
  const r = 36, cx = 50, cy = 50;
  const startAngle = Math.PI;
  const endAngle = 0;
  const angle = startAngle + (score / 100) * Math.PI;
  const x = cx + r * Math.cos(Math.PI - angle);
  const y = cy - r * Math.sin(Math.PI - angle);
  const color = score >= 60 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

  const fullArcX = cx + r * Math.cos(0);
  const fullArcY = cy - r * Math.sin(0);

  return (
    <svg viewBox="0 0 100 60" className="w-full max-w-[120px]">
      {/* Background arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" strokeLinecap="round"
      />
      {/* Score arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${angle > Math.PI / 2 ? 1 : 0} 1 ${x} ${y}`}
        fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
      />
      {/* Score text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">{score}</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="7">Bullish Score</text>
    </svg>
  );
}

export default function MarketBreadthPanel({ marketData = [] }: { marketData?: any[] }) {
  const [data, setData] = useState<BreadthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    if (!marketData.length) {
      setError('No market data available. Run a scan first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/trading/breadth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketData }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setData(json.breadth);
    } catch (e: any) {
      setError(e?.message);
    } finally {
      setLoading(false);
    }
  }, [marketData]);

  const cfg = data ? (SIGNAL_CONFIG[data.signal] ?? SIGNAL_CONFIG.NEUTRAL!) : SIGNAL_CONFIG.NEUTRAL!;
  const Icon = cfg.icon;

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700/50 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <BarChart2 size={16} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Market Breadth</h3>
            <p className="text-xs text-gray-500">A/D · McClellan · Breadth Thrust</p>
          </div>
        </div>
        <button
          onClick={analyze}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20">{error}</p>}

      {!data && !loading && !error && (
        <div className="text-center py-8 text-gray-500 text-sm">Run a scan, then click Analyze</div>
      )}

      {data && (
        <>
          {/* Signal + Score */}
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${cfg.bg} ${cfg.border}`}>
            <div className="flex items-center gap-2">
              <Icon size={14} className={cfg.text} />
              <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
              {data.breadthThrust && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-violet-500/20 rounded text-[10px] text-violet-400 border border-violet-500/30">
                  <Zap size={9} /> BREADTH THRUST
                </span>
              )}
            </div>
            <BullishScoreArc score={data.bullishScore} />
          </div>

          {/* A/D Bar */}
          <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/20">
            <p className="text-xs text-gray-400 mb-2">Advance / Decline ({data.total} stocks)</p>
            <ADBar advancing={data.advancing} declining={data.declining} unchanged={data.unchanged} total={data.total} />
            <div className="flex justify-between mt-2 text-[10px] text-gray-500">
              <span>A/D Ratio: <span className={`font-semibold ${data.advanceDeclineRatio > 1.5 ? 'text-emerald-400' : data.advanceDeclineRatio < 0.7 ? 'text-red-400' : 'text-amber-400'}`}>{data.advanceDeclineRatio.toFixed(2)}</span></span>
              <span>Vol Ratio: <span className={`font-semibold ${data.upDownVolumeRatio > 1.5 ? 'text-emerald-400' : 'text-red-400'}`}>{data.upDownVolumeRatio.toFixed(2)}x</span></span>
            </div>
          </div>

          {/* EMA Breadth */}
          <div className="space-y-2.5">
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>Above EMA-20</span>
                <span className={`font-medium ${data.percentAboveEMA20 > 60 ? 'text-emerald-400' : 'text-red-400'}`}>{data.percentAboveEMA20}%</span>
              </div>
              <ProgressBar value={data.percentAboveEMA20} max={100}
                colorClass={data.percentAboveEMA20 > 60 ? 'bg-emerald-500' : 'bg-red-500'} />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>Above EMA-50</span>
                <span className={`font-medium ${data.percentAboveEMA50 > 60 ? 'text-emerald-400' : 'text-red-400'}`}>{data.percentAboveEMA50}%</span>
              </div>
              <ProgressBar value={data.percentAboveEMA50} max={100}
                colorClass={data.percentAboveEMA50 > 60 ? 'bg-emerald-500' : 'bg-red-500'} />
            </div>
          </div>

          {/* McClellan + 52W */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
              <p className="text-[10px] text-gray-500 mb-1">McClellan</p>
              <p className={`text-xs font-bold ${data.mclellanOscillator > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {data.mclellanOscillator > 0 ? '+' : ''}{data.mclellanOscillator.toFixed(1)}
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
              <p className="text-[10px] text-gray-500 mb-1">52W Highs</p>
              <p className="text-xs font-bold text-emerald-400">{data.new52WHigh}</p>
            </div>
            <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
              <p className="text-[10px] text-gray-500 mb-1">52W Lows</p>
              <p className="text-xs font-bold text-red-400">{data.new52WLow}</p>
            </div>
          </div>

          <p className="text-[10px] text-gray-600 leading-relaxed">{data.description}</p>
        </>
      )}
    </div>
  );
}
