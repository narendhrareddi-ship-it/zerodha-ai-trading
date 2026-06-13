'use client';

import { Bot, TrendingUp, LogOut, Activity, Cpu, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { HermesLogo } from '@/components/hermes-logo';

interface DashboardHeaderProps {
  userName: string;
  botStatus: string;
  isMarketOpen: boolean;
  onSignOut: () => void;
}

export function DashboardHeader({ userName, botStatus, isMarketOpen, onSignOut }: DashboardHeaderProps) {
  const [coherence, setCoherence] = useState(99.4);
  const [synapseDelay, setSynapseDelay] = useState(42);

  useEffect(() => {
    const timer = setInterval(() => {
      setCoherence(prev => {
        const next = prev + (Math.random() - 0.5) * 0.1;
        return Math.min(100, Math.max(98.5, Number(next.toFixed(2))));
      });
      setSynapseDelay(prev => {
        const delta = Math.floor((Math.random() - 0.5) * 4);
        return Math.min(60, Math.max(30, prev + delta));
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const running = botStatus === 'RUNNING';

  return (
    <header className="sticky top-0 z-50 border-b border-amber-500/20 bg-[#040814]/90 backdrop-blur-xl glow-stark">
      {/* Stark Laser line effect */}
      <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-amber-400 to-cyan-400 animate-pulse" />
      
      <div className="max-w-[1200px] mx-auto px-4 flex items-center justify-between h-20">
        {/* Left Section: HERMES Logo and Tagline */}
        <div className="flex items-center gap-4">
          {/* HERMES Winged Arc Reactor Logo */}
          <div className="relative cursor-pointer group hover:scale-105 transition-transform duration-300">
            <HermesLogo size={48} status={running ? 'active' : 'standby'} />
            {/* HUD Scanline */}
            <div className="absolute top-0 left-0 w-full h-[1.5px] bg-amber-400 opacity-60 animate-bounce" />
          </div>

          <div className="flex flex-col">
            <h1 className="font-display font-black text-xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-cyan-400 flex items-center gap-2">
              H.E.R.M.E.S.
              <span className="text-[8px] py-0.5 px-1.5 border border-amber-500/30 rounded bg-amber-950/40 text-amber-400 font-mono font-normal tracking-widest uppercase animate-pulse">
                S.T.A.R.K. Core v2.0
              </span>
            </h1>
            <span className="text-[9px] text-amber-400/80 font-mono tracking-wider uppercase mt-0.5 hidden xs:block">
              Hybrid Execution & Risk Management Engine Safeguard
            </span>
          </div>
        </div>


        {/* Right Section: System Metrics & Stats */}
        <div className="flex items-center gap-4">
          {/* Coherence & Synapse delay indicators */}
          <div className="hidden md:flex items-center gap-4 border-r border-cyan-500/10 pr-4 text-[10px] font-mono">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground uppercase text-[8px] tracking-widest">Core Sync</span>
              <span className="text-cyan-400 font-bold">{coherence}%</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground uppercase text-[8px] tracking-widest">Latency</span>
              <span className="text-violet-400 font-bold">{synapseDelay}ms</span>
            </div>
          </div>

          {/* Market Status Badge */}
          <Badge variant="outline" className={`font-mono text-[10px] px-2.5 py-1 border-cyan-500/20 bg-cyan-950/10 ${isMarketOpen ? 'text-emerald-400 border-emerald-500/30' : 'text-gray-400'}`}>
            <Activity className={`w-3.5 h-3.5 mr-1.5 ${isMarketOpen ? 'animate-pulse text-emerald-400' : ''}`} />
            {isMarketOpen ? 'MARKET: LIVE' : 'MARKET: OFFLINE'}
          </Badge>

          {/* Bot State Badge */}
          <Badge
            variant="outline"
            className={`font-mono text-[10px] px-2.5 py-1 transition-all duration-300 ${
              running 
                ? 'bg-emerald-950/20 text-emerald-400 border-emerald-500/50 glow-emerald animate-pulse' 
                : 'bg-rose-950/10 text-rose-400 border-rose-500/30'
            }`}
          >
            <Zap className={`w-3 h-3 mr-1.5 ${running ? 'text-emerald-400 fill-emerald-400 animate-spin' : 'text-rose-400'}`} />
            {running ? 'CORE: ACTIVE' : 'CORE: STANDBY'}
          </Badge>

          {/* User & LogOut */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-cyan-300 hidden sm:inline max-w-[80px] truncate" title={userName}>
              {userName ?? 'Trader'}
            </span>
            <Button 
              variant="outline" 
              size="icon" 
              className="w-8 h-8 rounded border-cyan-500/20 bg-[#060c1a] hover:bg-cyan-500/10 hover:text-cyan-400 text-muted-foreground"
              onClick={onSignOut} 
              title="Terminate Session"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
