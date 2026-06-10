'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, Brain, Shield, Zap, TrendingUp, RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentStatus {
  name: string;
  icon: React.ReactNode;
  color: string;
  status: 'running' | 'idle' | 'error' | 'blocked';
  metric?: string;
  detail?: string;
}

interface PipelineResult {
  signalAgent?: { totalRawSignals: number; afterEnsemble: number; afterConfidence: number; topSignals: any[]; regime: any };
  regimeAgent?: { regime: string; macroSignal: string; volatilityRegime: string; positionSizeMultiplier: number; allowLong: boolean; allowShort: boolean; breadthSignal: string; breadthScore: number };
  riskAgent?: { sessionAllowed: boolean; approvedSignals: number; rejectedSignals: number; drawdownLevel: number; portfolioHeat: number; riskGrade: string };
  executionAgent?: { executed: number; failed: number; capitalDeployed: number; paperTrading: boolean };
  portfolioManager?: { positionsMonitored: number; stopsTriggered: number; targetsHit: number; squaredOff: number; totalPnl: number };
}

const REGIME_COLORS: Record<string, string> = {
  TRENDING_UP: 'text-emerald-400',
  TRENDING_DOWN: 'text-red-400',
  SIDEWAYS: 'text-amber-400',
  VOLATILE: 'text-orange-400',
};

const MACRO_COLORS: Record<string, string> = {
  RISK_ON: 'text-emerald-400',
  RISK_OFF: 'text-red-400',
  NEUTRAL: 'text-gray-400',
};

const GRADE_COLORS: Record<string, string> = {
  LOW: 'text-emerald-400',
  MODERATE: 'text-amber-400',
  HIGH: 'text-orange-400',
  CRITICAL: 'text-red-400',
};

export default function AgentsPanel({ marketData = [] }: { marketData?: any[] }) {
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperTrading, setPaperTrading] = useState(true);
  const [expandedSignals, setExpandedSignals] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [stage, setStage] = useState<string>('idle');

  const runPipeline = useCallback(async () => {
    if (!marketData.length) {
      setError('No market data available. Start a scan first.');
      return;
    }
    setLoading(true);
    setError(null);
    setStage('running');

    try {
      const res = await fetch('/api/trading/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'full_pipeline',
          marketData,
          paperTrading,
          realDataOnly: false,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Pipeline failed');
        setStage('error');
        return;
      }

      if (data.stage === 'risk_blocked') {
        setError(`Risk blocked: ${data.reason}`);
        setStage('blocked');
        setPipeline(null);
        return;
      }

      setPipeline(data.pipeline);
      setLastRun(new Date());
      setStage('complete');
    } catch (e: any) {
      setError(e?.message ?? 'Network error');
      setStage('error');
    } finally {
      setLoading(false);
    }
  }, [marketData, paperTrading]);

  const agents: AgentStatus[] = [
    {
      name: 'Signal Agent',
      icon: <Brain size={16} />,
      color: 'text-violet-400',
      status: pipeline ? 'idle' : 'idle',
      metric: pipeline?.signalAgent ? `${pipeline.signalAgent.afterConfidence} signals` : '—',
      detail: pipeline?.signalAgent ? `${pipeline.signalAgent.totalRawSignals} raw → ${pipeline.signalAgent.afterEnsemble} ensemble` : undefined,
    },
    {
      name: 'Regime Agent',
      icon: <Activity size={16} />,
      color: 'text-blue-400',
      status: 'idle',
      metric: pipeline?.regimeAgent?.regime ?? '—',
      detail: pipeline?.regimeAgent ? `Macro: ${pipeline.regimeAgent.macroSignal} | Vol: ${pipeline.regimeAgent.volatilityRegime}` : undefined,
    },
    {
      name: 'Risk Manager',
      icon: <Shield size={16} />,
      color: 'text-amber-400',
      status: pipeline?.riskAgent?.sessionAllowed === false ? 'blocked' : 'idle',
      metric: pipeline?.riskAgent ? `${pipeline.riskAgent.approvedSignals} approved` : '—',
      detail: pipeline?.riskAgent ? `Heat: ${pipeline.riskAgent.portfolioHeat?.toFixed(1)}% | Grade: ${pipeline.riskAgent.riskGrade}` : undefined,
    },
    {
      name: 'Execution Agent',
      icon: <Zap size={16} />,
      color: 'text-emerald-400',
      status: 'idle',
      metric: pipeline?.executionAgent ? `${pipeline.executionAgent.executed} executed` : '—',
      detail: pipeline?.executionAgent ? `₹${(pipeline.executionAgent.capitalDeployed ?? 0).toLocaleString()} deployed${pipeline.executionAgent.paperTrading ? ' [PAPER]' : ''}` : undefined,
    },
    {
      name: 'Portfolio Manager',
      icon: <TrendingUp size={16} />,
      color: 'text-cyan-400',
      status: 'idle',
      metric: pipeline?.portfolioManager ? `${pipeline.portfolioManager.positionsMonitored} positions` : '—',
      detail: pipeline?.portfolioManager ? `SL: ${pipeline.portfolioManager.stopsTriggered} | Target: ${pipeline.portfolioManager.targetsHit} | P&L: ₹${pipeline.portfolioManager.totalPnl?.toFixed(0)}` : undefined,
    },
  ];

  return (
    <div className="bg-gray-900/80 backdrop-blur border border-gray-700/50 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center">
            <Bot size={16} className="text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Agent Pipeline</h3>
            <p className="text-xs text-gray-500">Phase 9 — Institutional AI</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Paper trading toggle */}
          <button
            onClick={() => setPaperTrading(p => !p)}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${
              paperTrading
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {paperTrading ? '📋 PAPER' : '⚡ LIVE'}
          </button>
          <button
            onClick={runPipeline}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Running...' : 'Run Pipeline'}
          </button>
        </div>
      </div>

      {/* Stage indicator */}
      {stage !== 'idle' && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
          stage === 'running' ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' :
          stage === 'complete' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
          stage === 'blocked' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
          'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {stage === 'running' && <RefreshCw size={12} className="animate-spin" />}
          {stage === 'complete' && <CheckCircle size={12} />}
          {stage === 'blocked' && <AlertTriangle size={12} />}
          {stage === 'error' && <XCircle size={12} />}
          <span>
            {stage === 'running' ? 'Pipeline executing...' :
             stage === 'complete' ? `Pipeline complete${lastRun ? ` • ${lastRun.toLocaleTimeString()}` : ''}` :
             stage === 'blocked' ? 'Risk Manager blocked execution' :
             error ?? 'Pipeline error'}
          </span>
        </div>
      )}

      {/* Agent status grid */}
      <div className="grid grid-cols-1 gap-2">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className="flex items-center justify-between px-3 py-2.5 bg-gray-800/50 rounded-xl border border-gray-700/30 hover:border-gray-600/50 transition-all"
          >
            <div className="flex items-center gap-2.5">
              <div className={`${agent.color}`}>{agent.icon}</div>
              <div>
                <p className="text-xs font-medium text-gray-200">{agent.name}</p>
                {agent.detail && <p className="text-[10px] text-gray-500 mt-0.5">{agent.detail}</p>}
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs font-semibold ${agent.color}`}>{agent.metric}</span>
              {agent.status === 'blocked' && (
                <div className="flex items-center gap-1 mt-0.5 justify-end">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <span className="text-[10px] text-red-400">Blocked</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Regime + Breadth mini-cards */}
      {pipeline?.regimeAgent && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
            <p className="text-[10px] text-gray-500 mb-1">Regime</p>
            <p className={`text-xs font-bold ${REGIME_COLORS[pipeline.regimeAgent.regime] ?? 'text-gray-300'}`}>
              {pipeline.regimeAgent.regime?.replace('_', ' ')}
            </p>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
            <p className="text-[10px] text-gray-500 mb-1">Macro</p>
            <p className={`text-xs font-bold ${MACRO_COLORS[pipeline.regimeAgent.macroSignal] ?? 'text-gray-300'}`}>
              {pipeline.regimeAgent.macroSignal?.replace('_', ' ')}
            </p>
          </div>
          <div className="bg-gray-800/40 rounded-xl p-2.5 border border-gray-700/30">
            <p className="text-[10px] text-gray-500 mb-1">Size Mult</p>
            <p className="text-xs font-bold text-cyan-400">
              {pipeline.regimeAgent.positionSizeMultiplier?.toFixed(2)}×
            </p>
          </div>
        </div>
      )}

      {/* Top signals */}
      {(pipeline?.signalAgent?.topSignals?.length ?? 0) > 0 && (
        <div>
          <button
            onClick={() => setExpandedSignals(e => !e)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors mb-2"
          >
            {expandedSignals ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Top Signals ({(pipeline?.signalAgent?.topSignals || []).length})
          </button>
          {expandedSignals && (
            <div className="space-y-1.5">
              {(pipeline?.signalAgent?.topSignals || []).map((sig: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-2.5 py-2 bg-gray-800/40 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      sig.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>{sig.direction}</span>
                    <span className="text-xs text-gray-200">{sig.symbol?.replace('NSE:', '')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      sig.grade === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                      sig.grade === 'B' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-amber-500/20 text-amber-400'
                    }`}>{sig.grade}</span>
                    <span className="text-xs text-gray-400">{sig.confidence?.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Risk summary */}
      {pipeline?.riskAgent && (
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800/30 rounded-xl border border-gray-700/20">
          <span className="text-xs text-gray-400">Portfolio Risk</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-300">Heat: <span className="text-amber-400 font-semibold">{pipeline.riskAgent.portfolioHeat?.toFixed(1)}%</span></span>
            <span className={`text-xs font-bold ${GRADE_COLORS[pipeline.riskAgent.riskGrade] ?? 'text-gray-400'}`}>
              {pipeline.riskAgent.riskGrade}
            </span>
            {pipeline.riskAgent.drawdownLevel > 0 && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle size={10} /> KS-{pipeline.riskAgent.drawdownLevel}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
