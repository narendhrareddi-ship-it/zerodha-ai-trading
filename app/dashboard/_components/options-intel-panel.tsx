'use client';

import { useState, useCallback } from 'react';
import { Layers, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Target } from 'lucide-react';

interface OptionsData {
  symbol: string;
  expiry: string;
  spotPrice: number;
  putCallRatio: number;
  putCallRatioVolume: number;
  maxPain: number;
  maxPainDistance: number;
  ivRank: number;
  ivSkew: number;
  callOITotal: number;
  putOITotal: number;
  highCallOIStrikes: number[];
  highPutOIStrikes: number[];
  nearestResistance: number;
  nearestSupport: number;
  signal: string;
  signalScore: number;
  description: string;
}

const SIGNAL_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  VERY_BULLISH: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  BULLISH: { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  NEUTRAL: { text: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
  BEARISH: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  VERY_BEARISH: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

function PCRGauge({ pcr }: { pcr: number }) {
  // PCR: < 0.7 = bullish, 0.7-1.2 = neutral, > 1.2 = bearish
  const pct = Math.min(100, Math.max(0, (pcr / 2) * 100));
  const color = pcr < 0.7 ? 'bg-emerald-500' : pcr > 1.5 ? 'bg-red-500' : 'bg-amber-500';
  const label = pcr < 0.7 ? 'Bullish' : pcr > 1.5 ? 'Bearish' : 'Neutral';

  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
        <span>Bullish (low PCR)</span>
        <span>Bearish (high PCR)</span>
      </div>
      <div className="h-2 bg-gray-700/50 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] mt-1">
        <span className="text-gray-500">0</span>
        <span className={`font-semibold ${pcr < 0.7 ? 'text-emerald-400' : pcr > 1.5 ? 'text-red-400' : 'text-amber-400'}`}>
          PCR {pcr.toFixed(2)} — {label}
        </span>
        <span className="text-gray-500">2+</span>
      </div>
    </div>
  );
}

function LevelBar({ level, spot, type }: { level: number; spot: number; type: 'support' | 'resistance' }) {
  const dist = ((level - spot) / spot * 100).toFixed(2);
  const isAbove = level > spot;
  return (
    <div className="flex items-center justify-between px-2 py-1.5 bg-gray-800/40 rounded-lg">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${type === 'resistance' ? 'bg-red-500' : 'bg-emerald-500'}`} />
        <span className="text-xs text-gray-300">₹{level.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      </div>
      <span className={`text-[10px] font-medium ${isAbove ? 'text-red-400' : 'text-emerald-400'}`}>
        {isAbove ? '+' : ''}{dist}%
      </span>
    </div>
  );
}

const POPULAR_STOCKS = ['NIFTY', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY'];

export default function OptionsIntelPanel({ spotPrice = 22000 }: { spotPrice?: number }) {
  const [data, setData] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState('NIFTY');

  const fetch_data = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trading/options-intel?symbol=${symbol}&spot=${spotPrice}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Failed'); return; }
      if (json.error) { setError(json.error); return; }
      setData(json.analysis);
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, [symbol, spotPrice]);

  const colors = data ? (SIGNAL_COLORS[data.signal] ?? SIGNAL_COLORS.NEUTRAL!) : SIGNAL_COLORS.NEUTRAL!;

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700/50 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Layers size={16} className="text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Options Intelligence</h3>
            <p className="text-xs text-gray-500">PCR · Max Pain · IV · OI Levels</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={symbol}
            onChange={e => setSymbol(e.target.value)}
            className="bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded-lg px-2 py-1"
          >
            {POPULAR_STOCKS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={fetch_data}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading...' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
          error.includes('unavailable') ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <AlertTriangle size={12} />
          <span>{error.includes('unavailable') ? 'NSE option chain temporarily unavailable (rate limit)' : error}</span>
        </div>
      )}

      {!data && !loading && !error && (
        <div className="text-center py-8 text-gray-500 text-sm">
          Select a symbol and click Analyze
        </div>
      )}

      {data && (
        <>
          {/* Signal badge */}
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${colors.bg} ${colors.border}`}>
            <div className="flex items-center gap-2">
              {data.signal.includes('BULL') ? <TrendingUp size={14} className={colors.text} /> : <TrendingDown size={14} className={colors.text} />}
              <span className={`text-sm font-bold ${colors.text}`}>{data.signal.replace('_', ' ')}</span>
            </div>
            <div className="text-right">
              <div className={`text-xs font-semibold ${colors.text}`}>{data.signalScore}/100</div>
              <div className="text-[10px] text-gray-500">Composite score</div>
            </div>
          </div>

          {/* PCR Gauge */}
          <div className="bg-gray-800/30 rounded-xl p-3 border border-gray-700/20">
            <p className="text-xs text-gray-400 mb-2">Put-Call Ratio (OI)</p>
            <PCRGauge pcr={data.putCallRatio} />
            <div className="flex justify-between mt-2 text-[10px] text-gray-500">
              <span>Volume PCR: {data.putCallRatioVolume.toFixed(2)}</span>
              <span>Call OI: {(data.callOITotal / 1000).toFixed(0)}K | Put OI: {(data.putOITotal / 1000).toFixed(0)}K</span>
            </div>
          </div>

          {/* Max Pain + IV */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30 col-span-1">
              <p className="text-[10px] text-gray-500 mb-1">Max Pain</p>
              <p className="text-xs font-bold text-amber-400">₹{data.maxPain.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              <p className={`text-[10px] mt-0.5 ${data.maxPainDistance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {data.maxPainDistance > 0 ? '+' : ''}{data.maxPainDistance.toFixed(1)}% from spot
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
              <p className="text-[10px] text-gray-500 mb-1">IV Rank</p>
              <p className={`text-xs font-bold ${data.ivRank > 70 ? 'text-red-400' : data.ivRank < 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {data.ivRank.toFixed(0)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{data.ivRank > 70 ? 'High IV' : data.ivRank < 30 ? 'Low IV' : 'Normal'}</p>
            </div>
            <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
              <p className="text-[10px] text-gray-500 mb-1">IV Skew</p>
              <p className={`text-xs font-bold ${data.ivSkew > 3 ? 'text-red-400' : data.ivSkew < -2 ? 'text-emerald-400' : 'text-gray-300'}`}>
                {data.ivSkew > 0 ? '+' : ''}{data.ivSkew.toFixed(1)}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">{data.ivSkew > 3 ? 'Put fear' : data.ivSkew < -2 ? 'Call demand' : 'Balanced'}</p>
            </div>
          </div>

          {/* OI-based levels */}
          <div className="space-y-2">
            <p className="text-xs text-gray-400 flex items-center gap-1"><Target size={11} /> Key Levels (from OI)</p>
            {data.highCallOIStrikes.slice(0, 3).map(s => (
              <LevelBar key={s} level={s} spot={data.spotPrice} type="resistance" />
            ))}
            {data.highPutOIStrikes.slice(-3).reverse().map(s => (
              <LevelBar key={s} level={s} spot={data.spotPrice} type="support" />
            ))}
          </div>

          <p className="text-[10px] text-gray-600 leading-relaxed">{data.description}</p>
        </>
      )}
    </div>
  );
}
