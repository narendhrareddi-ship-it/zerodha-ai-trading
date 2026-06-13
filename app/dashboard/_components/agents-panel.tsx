'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bot, Brain, Shield, Zap, TrendingUp, RefreshCw, Activity, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, Network, Radio } from 'lucide-react';

interface AgentStatus {
  name: string;
  icon: React.ReactNode;
  color: string;
  glowClass: string;
  status: 'running' | 'idle' | 'error' | 'blocked';
  metric?: string;
  detail?: string;
  role: string;
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
  TRENDING_DOWN: 'text-rose-400',
  SIDEWAYS: 'text-cyan-400',
  VOLATILE: 'text-amber-400',
};

const MACRO_COLORS: Record<string, string> = {
  RISK_ON: 'text-emerald-400',
  RISK_OFF: 'text-rose-400',
  NEUTRAL: 'text-gray-400',
};

const GRADE_COLORS: Record<string, string> = {
  LOW: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5',
  MODERATE: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
  HIGH: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
  CRITICAL: 'text-rose-400 border-rose-500/30 bg-rose-500/5',
};

export function AgentsPanel({ marketData = [] }: { marketData?: any[] }) {
  const [pipeline, setPipeline] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paperTrading, setPaperTrading] = useState(true);
  const [expandedSignals, setExpandedSignals] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [stage, setStage] = useState<string>('idle');

  // Simulated node state pulsing
  const [activePulseNode, setActivePulseNode] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePulseNode(prev => (prev + 1) % 5);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

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
      name: 'Signal Synthesis Agent',
      role: 'ALPHA SCANNER',
      icon: <Brain size={15} />,
      color: 'text-violet-400',
      glowClass: 'glow-violet border-violet-500/20 bg-violet-950/10',
      status: loading && activePulseNode === 0 ? 'running' : 'idle',
      metric: pipeline?.signalAgent ? `${pipeline.signalAgent.afterConfidence} signals` : '—',
      detail: pipeline?.signalAgent ? `${pipeline.signalAgent.totalRawSignals} raw → ${pipeline.signalAgent.afterEnsemble} ensemble` : 'Monitoring indicators & social sentiments',
    },
    {
      name: 'Regime Classifier',
      role: 'HMM ANALYZER',
      icon: <Activity size={15} />,
      color: 'text-blue-400',
      glowClass: 'glow-cyan border-cyan-500/20 bg-cyan-950/10',
      status: loading && activePulseNode === 1 ? 'running' : 'idle',
      metric: pipeline?.regimeAgent?.regime ?? '—',
      detail: pipeline?.regimeAgent ? `Macro: ${pipeline.regimeAgent.macroSignal} | Vol: ${pipeline.regimeAgent.volatilityRegime}` : 'Classifying multi-dimensional Markov states',
    },
    {
      name: 'Tactical Risk Safeguard',
      role: 'COVARIANCE LIMITER',
      icon: <Shield size={15} />,
      color: 'text-amber-400',
      glowClass: pipeline?.riskAgent?.sessionAllowed === false ? 'glow-rose border-rose-500/30 bg-rose-950/15' : 'glow-rose border-amber-500/20 bg-amber-950/10',
      status: pipeline?.riskAgent?.sessionAllowed === false ? 'blocked' : loading && activePulseNode === 2 ? 'running' : 'idle',
      metric: pipeline?.riskAgent ? `${pipeline.riskAgent.approvedSignals} approved` : '—',
      detail: pipeline?.riskAgent ? `Heat: ${pipeline.riskAgent.portfolioHeat?.toFixed(1)}% | Grade: ${pipeline.riskAgent.riskGrade}` : 'Applying half-kelly sizing & correlation parity',
    },
    {
      name: 'Execution Broker Agent',
      role: 'SLICED ROUTER',
      icon: <Zap size={15} />,
      color: 'text-emerald-400',
      glowClass: 'glow-emerald border-emerald-500/20 bg-emerald-950/10',
      status: loading && activePulseNode === 3 ? 'running' : 'idle',
      metric: pipeline?.executionAgent ? `${pipeline.executionAgent.executed} executed` : '—',
      detail: pipeline?.executionAgent ? `₹${(pipeline.executionAgent.capitalDeployed ?? 0).toLocaleString()} deployed${pipeline.executionAgent.paperTrading ? ' [PAPER]' : ''}` : 'Slicing orders with passive slippage targets',
    },
    {
      name: 'Portfolio Monitor Agent',
      role: 'ATR TRACKER',
      icon: <TrendingUp size={15} />,
      color: 'text-cyan-400',
      glowClass: 'glow-cyan border-cyan-500/20 bg-cyan-950/10',
      status: loading && activePulseNode === 4 ? 'running' : 'idle',
      metric: pipeline?.portfolioManager ? `${pipeline.portfolioManager.positionsMonitored} positions` : '—',
      detail: pipeline?.portfolioManager ? `SL: ${pipeline.portfolioManager.stopsTriggered} | Target: ${pipeline.portfolioManager.targetsHit} | P&L: ₹${pipeline.portfolioManager.totalPnl?.toFixed(0)}` : 'Managing trailing exits & multi-level drawdown thresholds',
    },
  ];

  return (
    <div className="relative overflow-hidden border border-cyan-500/20 bg-[#060c1a]/80 backdrop-blur-md rounded-2xl p-6 glow-cyan">
      <div className="absolute inset-0 cyber-grid opacity-[0.08] pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10 border-b border-cyan-500/10 pb-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center glow-cyan">
            <Network size={20} className="text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h3 className="font-display font-black text-base text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400 tracking-wider">
              J.A.R.V.I.S. AGENCY NETWORK
            </h3>
            <p className="text-[10px] font-mono text-cyan-400/70 tracking-widest uppercase">Decentralized Cognitive Intelligence Core</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Paper trading toggle */}
          <button
            onClick={() => setPaperTrading(p => !p)}
            className={`h-8 px-3 rounded font-mono text-[10px] font-bold tracking-widest transition-all ${
              paperTrading
                ? 'bg-amber-950/20 text-amber-400 border border-amber-500/40 glow-rose'
                : 'bg-rose-950/30 text-rose-400 border border-rose-500/40 glow-rose animate-pulse'
            }`}
          >
            {paperTrading ? '🛡️ PROTOCOL: SIMULATION' : '⚡ PROTOCOL: REALIZED LIVE'}
          </button>
          
          <button
            onClick={runPipeline}
            disabled={loading}
            className="flex items-center gap-2 h-8 px-4 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-400 hover:to-violet-400 text-black text-[10px] font-mono font-bold tracking-wider rounded transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'SYNCHRONIZING...' : 'SYNC ALL AGENTS'}
          </button>
        </div>
      </div>

      {/* Stage indicator */}
      {stage !== 'idle' && (
        <div className={`flex items-center gap-2.5 px-4 py-3 rounded-lg text-xs font-mono border relative z-10 ${
          stage === 'running' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 glow-cyan animate-pulse' :
          stage === 'complete' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 glow-emerald' :
          stage === 'blocked' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 glow-rose' :
          'bg-rose-500/10 text-rose-400 border-rose-500/30 glow-rose'
        }`}>
          {stage === 'running' && <RefreshCw size={12} className="animate-spin text-cyan-400" />}
          {stage === 'complete' && <CheckCircle size={12} className="text-emerald-400" />}
          {stage === 'blocked' && <AlertTriangle size={12} className="text-amber-400" />}
          {stage === 'error' && <XCircle size={12} className="text-rose-400" />}
          <span>
            {stage === 'running' ? 'INTELLIGENCE CYCLING ACTIVE: Syncing nodes in cascade...' :
             stage === 'complete' ? `NETWORK SYNCHRONIZED SUCCESSFULLY${lastRun ? ` · TIMESTAMP: ${lastRun.toLocaleTimeString()}` : ''}` :
             stage === 'blocked' ? 'CRITICAL AVOIDANCE: Risk manager halted routing pipeline' :
             `COMM ERROR: ${error ?? 'Unknown stack failure'}`}
          </span>
        </div>
      )}

      {/* Holographic SVG Node Network Visual Map */}
      <div className="relative h-24 border border-cyan-500/10 rounded-xl bg-cyan-950/5 flex items-center justify-center overflow-hidden my-4">
        <div className="absolute inset-0 cyber-grid opacity-[0.05]" />
        
        {/* Connection paths */}
        <svg className="absolute inset-0 w-full h-full" style={{ minWidth: '400px' }}>
          {/* Animated line pulses */}
          <line x1="10%" y1="50%" x2="30%" y2="50%" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="2" />
          <line x1="30%" y1="50%" x2="50%" y2="50%" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="2" />
          <line x1="50%" y1="50%" x2="70%" y2="50%" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="2" />
          <line x1="70%" y1="50%" x2="90%" y2="50%" stroke="rgba(6, 182, 212, 0.2)" strokeWidth="2" />

          {/* Glowing pulse dots along connections */}
          {loading && (
            <>
              <circle r="3" fill="#06b6d4" className="animate-ping" style={{ animationDelay: '0s', offsetPath: "path('M 40,60 L 120,60')", motionPath: "path('M 40,60 L 120,60')" }} />
              <circle r="3" fill="#8b5cf6" className="animate-ping" style={{ animationDelay: '0.4s', offsetPath: "path('M 120,60 L 200,60')", motionPath: "path('M 120,60 L 200,60')" }} />
            </>
          )}
        </svg>

        {/* Node Labels */}
        <div className="flex justify-between items-center w-full px-[8%] relative z-10">
          {agents.map((ag, index) => {
            const isPulse = activePulseNode === index;
            return (
              <div key={index} className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                  isPulse 
                    ? 'border-cyan-400 bg-cyan-950/80 text-cyan-400 scale-110 shadow-[0_0_12px_rgba(6,182,212,0.8)]' 
                    : 'border-cyan-500/20 bg-slate-950 text-cyan-400/60'
                }`}>
                  {ag.icon}
                </div>
                <span className={`text-[8px] font-mono tracking-widest font-black ${isPulse ? 'text-cyan-400' : 'text-cyan-400/40'}`}>
                  {ag.role}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent status grid */}
      <div className="grid grid-cols-1 gap-3 relative z-10">
        {agents.map((agent) => (
          <div
            key={agent.name}
            className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all duration-300 hover:translate-x-1 ${agent.glowClass}`}
          >
            <div className="flex items-center gap-3.5 mb-2 sm:mb-0">
              <div className={`w-8 h-8 rounded bg-[#060c1a] border border-cyan-500/20 flex items-center justify-center ${agent.color}`}>
                {agent.icon}
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-mono font-bold text-gray-200">{agent.name}</p>
                  <span className="text-[8px] font-mono px-1 py-0.2 border border-cyan-500/20 rounded bg-cyan-950/20 text-cyan-400/80 tracking-wider">
                    {agent.role}
                  </span>
                </div>
                {agent.detail && <p className="text-[10px] text-gray-400/85 mt-1 font-sans">{agent.detail}</p>}
              </div>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-cyan-500/10 pt-2 sm:pt-0">
              <span className="sm:hidden text-[9px] font-mono text-muted-foreground uppercase">TELEMETRY</span>
              <div className="text-right">
                <span className={`text-xs font-mono font-bold ${agent.color}`}>{agent.metric}</span>
                {agent.status === 'blocked' && (
                  <div className="flex items-center gap-1 mt-0.5 justify-end">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-rose-500"></span>
                    </span>
                    <span className="text-[9px] font-mono text-rose-400 uppercase">Blocked</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Regime + Breadth mini-cards */}
      {pipeline?.regimeAgent && (
        <div className="grid grid-cols-3 gap-3 relative z-10">
          <div className="bg-[#060c1a]/60 rounded-xl p-3 border border-cyan-500/20">
            <p className="text-[8px] font-mono text-muted-foreground mb-1 uppercase tracking-wider">HMM Regime Classifier</p>
            <p className={`text-xs font-bold uppercase tracking-wider font-mono ${REGIME_COLORS[pipeline.regimeAgent.regime] ?? 'text-gray-300'}`}>
              {pipeline.regimeAgent.regime?.replace('_', ' ')}
            </p>
          </div>
          <div className="bg-[#060c1a]/60 rounded-xl p-3 border border-cyan-500/20">
            <p className="text-[8px] font-mono text-muted-foreground mb-1 uppercase tracking-wider">Macro Risk Profile</p>
            <p className={`text-xs font-bold uppercase tracking-wider font-mono ${MACRO_COLORS[pipeline.regimeAgent.macroSignal] ?? 'text-gray-300'}`}>
              {pipeline.regimeAgent.macroSignal?.replace('_', ' ')}
            </p>
          </div>
          <div className="bg-[#060c1a]/60 rounded-xl p-3 border border-cyan-500/20">
            <p className="text-[8px] font-mono text-muted-foreground mb-1 uppercase tracking-wider">Dynamic Sizing Mult</p>
            <p className="text-xs font-bold text-cyan-400 font-mono">
              {pipeline.regimeAgent.positionSizeMultiplier?.toFixed(2)}×
            </p>
          </div>
        </div>
      )}

      {/* Top signals */}
      {(pipeline?.signalAgent?.topSignals?.length ?? 0) > 0 && (
        <div className="relative z-10 border-t border-cyan-500/10 pt-4 mt-3">
          <button
            onClick={() => setExpandedSignals(e => !e)}
            className="flex items-center gap-2 text-[10px] font-mono text-cyan-400/70 hover:text-cyan-400 uppercase tracking-widest transition-colors mb-3"
          >
            {expandedSignals ? <ChevronUp size={12} className="text-cyan-400" /> : <ChevronDown size={12} className="text-cyan-400" />}
            Target Scan Core Signals ({(pipeline?.signalAgent?.topSignals || []).length})
          </button>
          {expandedSignals && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
              {(pipeline?.signalAgent?.topSignals || []).map((sig: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-[#060c1a]/60 border border-cyan-500/10 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border rounded ${
                      sig.direction === 'BUY' ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' : 'bg-rose-950/20 border-rose-500/30 text-rose-400'
                    }`}>{sig.direction}</span>
                    <span className="text-xs font-mono font-bold text-gray-200">{sig.symbol?.replace('NSE:', '')}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border rounded ${
                      sig.grade === 'A' ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400' :
                      sig.grade === 'B' ? 'bg-cyan-950/20 border-cyan-500/30 text-cyan-400' :
                      'bg-amber-950/20 border-amber-500/30 text-amber-400'
                    }`}>{sig.grade}-GRADE</span>
                    <span className="text-xs font-mono text-cyan-400">{sig.confidence?.toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Risk summary */}
      {pipeline?.riskAgent && (
        <div className="flex items-center justify-between px-4 py-3 bg-[#060c1a]/60 rounded-xl border border-cyan-500/20 relative z-10">
          <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">Aggregation Node Risk Shield</span>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-gray-300">Heat Index: <span className="text-cyan-400 font-bold">{pipeline.riskAgent.portfolioHeat?.toFixed(1)}%</span></span>
            <span className={`text-xs font-mono font-bold px-2 py-0.5 border rounded ${GRADE_COLORS[pipeline.riskAgent.riskGrade] ?? 'text-gray-400'}`}>
              {pipeline.riskAgent.riskGrade}
            </span>
            {pipeline.riskAgent.drawdownLevel > 0 && (
              <span className="text-xs font-mono text-rose-400 font-bold flex items-center gap-1.5 animate-pulse">
                <AlertTriangle size={12} className="text-rose-400" /> KILL SWITCH LVL-{pipeline.riskAgent.drawdownLevel}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default AgentsPanel;
