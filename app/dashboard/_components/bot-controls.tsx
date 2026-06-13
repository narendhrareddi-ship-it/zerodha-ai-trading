'use client';

import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Play, Square, XCircle, Search, Zap } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface BotControlsProps {
  botStatus: string;
  onStart: () => void;
  onStop: () => void;
  onExitAll: () => void;
  onScan: () => void;
}

export const BotControls = memo(function BotControls({ botStatus, onStart, onStop, onExitAll, onScan }: BotControlsProps) {
  const isRunning = botStatus === 'RUNNING';

  return (
    <Card className={`relative overflow-hidden border backdrop-blur-md transition-all duration-300 ${isRunning ? 'border-emerald-500/30 bg-[#061a10]/20 glow-emerald' : 'border-cyan-500/20 bg-[#060c1a]/60'}`}>
      <div className="absolute inset-0 cyber-grid opacity-[0.1] pointer-events-none" />
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5 px-6 relative z-10">
        
        {/* Telemetry Indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded flex items-center justify-center transition-all ${isRunning ? 'bg-emerald-500/20 glow-emerald border border-emerald-500/40 text-emerald-400' : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400'}`}>
            <Zap className={`w-4 h-4 ${isRunning ? 'animate-bounce text-emerald-400 fill-emerald-400' : ''}`} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono tracking-widest text-muted-foreground uppercase">AI Controller State</span>
            <div className="flex items-center gap-2">
              <span className={`font-display font-black text-sm tracking-wide ${isRunning ? 'text-emerald-400' : 'text-cyan-400'}`}>
                {isRunning ? 'AGENTIVE SYSTEM ACTIVE' : 'SYSTEM ON STANDBY'}
              </span>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRunning ? 'bg-emerald-400' : 'bg-cyan-400'}`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-emerald-500' : 'bg-cyan-500'}`}></span>
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Controls Grid */}
        <div className="flex flex-wrap items-center gap-3">
          {!isRunning ? (
            <Button 
              onClick={onStart} 
              size="sm" 
              className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-mono font-bold text-xs uppercase tracking-wider glow-emerald border-none h-9 px-4 transition-transform active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-black" /> Engage H.E.R.M.E.S.
            </Button>
          ) : (
            <Button 
              onClick={onStop} 
              variant="outline" 
              size="sm" 
              className="gap-2 border-rose-500/40 bg-[#1a060a]/20 text-rose-400 hover:bg-rose-500/20 font-mono font-bold text-xs uppercase tracking-wider h-9 px-4 active:scale-95"
            >
              <Square className="w-3.5 h-3.5 fill-rose-400" /> Disengage Bot
            </Button>
          )}

          <Button 
            onClick={onScan} 
            variant="outline" 
            size="sm" 
            className="gap-2 border-cyan-500/20 bg-cyan-950/10 text-cyan-400 hover:bg-cyan-500/10 font-mono font-bold text-xs uppercase tracking-wider h-9 px-4 active:scale-95"
          >
            <Search className="w-3.5 h-3.5" /> Force Scan Matrix
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 border-rose-500/50 bg-[#1a060a] hover:bg-rose-500/20 text-rose-400 font-mono font-bold text-xs uppercase tracking-wider glow-rose h-9 px-4 active:scale-95"
              >
                <XCircle className="w-3.5 h-3.5" /> Emergency Dump
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-rose-500/30 bg-[#060c1a] text-foreground">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-display font-black text-rose-400 tracking-wider">
                  ⚠️ INITIATING EMERGENCY DEPOSITION PROTOCOL
                </AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground font-mono text-xs mt-2">
                  This command triggers a hard liquidation. All open positions will be exited immediately via market orders, and the cognitive routing scheduler will be shut down.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel className="border-cyan-500/20 text-muted-foreground hover:bg-cyan-500/10">Abort</AlertDialogCancel>
                <AlertDialogAction onClick={onExitAll} className="bg-rose-600 text-white hover:bg-rose-500 glow-rose border-none font-mono">
                  Confirm Deposition
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
});
