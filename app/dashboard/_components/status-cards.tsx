'use client';

import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, BarChart3, Target, Wallet, Shield } from 'lucide-react';
import { useEffect, useState, useRef, memo } from 'react';
import { useInView } from 'react-intersection-observer';

interface StatusCardsProps {
  dailyPnl: number;
  openPositions: number;
  totalTrades: number;
  winRate: number;
  capital: number;
  maxDailyLoss: number;
}

function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const [displayed, setDisplayed] = useState(0);
  const { ref, inView } = useInView({ triggerOnce: true });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1000;
    const startTime = performance.now();
    const startVal = 0;
    const endVal = value ?? 0;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(startVal + (endVal - startVal) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, inView]);

  return (
    <span ref={ref} className="font-mono font-bold">
      {prefix}{displayed?.toFixed?.(decimals) ?? '0'}{suffix}
    </span>
  );
}

export const StatusCards = memo(function StatusCards({ dailyPnl, openPositions, totalTrades, winRate, capital, maxDailyLoss }: StatusCardsProps) {
  const pnlPositive = (dailyPnl ?? 0) >= 0;
  const lossUsed = Math.abs(Math.min(dailyPnl ?? 0, 0));
  const lossPercent = maxDailyLoss > 0 ? (lossUsed / maxDailyLoss) * 100 : 0;

  const cards = [
    {
      title: "Today's Net P&L",
      value: <AnimatedNumber value={dailyPnl ?? 0} prefix="₹" decimals={2} />,
      icon: pnlPositive ? TrendingUp : TrendingDown,
      color: pnlPositive ? 'text-emerald-400' : 'text-rose-400',
      bgColor: pnlPositive ? 'bg-emerald-500/10' : 'bg-rose-500/10',
      glowClass: pnlPositive ? 'glow-emerald border-emerald-500/30 bg-[#061a10]/40' : 'glow-rose border-rose-500/30 bg-[#1a060a]/40',
      subtitle: pnlPositive ? 'PROFIT GAINED' : 'LOSS ENCOUNTERED',
    },
    {
      title: 'Active Positions',
      value: <AnimatedNumber value={openPositions ?? 0} />,
      icon: BarChart3,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
      glowClass: 'glow-cyan border-cyan-500/30 bg-[#061226]/40',
      subtitle: 'MARKET EXPOSURE',
    },
    {
      title: 'Total Executions',
      value: <AnimatedNumber value={totalTrades ?? 0} />,
      icon: Target,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      glowClass: 'border-amber-500/20 bg-amber-950/10',
      subtitle: 'SESSION FILLED',
    },
    {
      title: 'Calculated Win Rate',
      value: <AnimatedNumber value={winRate ?? 0} suffix="%" decimals={1} />,
      icon: TrendingUp,
      color: 'text-violet-400',
      bgColor: 'bg-violet-500/10',
      glowClass: 'glow-violet border-violet-500/30 bg-[#120626]/40',
      subtitle: 'STATISTICAL EDGE',
    },
    {
      title: 'Available Capital',
      value: <AnimatedNumber value={capital ?? 0} prefix="₹" decimals={0} />,
      icon: Wallet,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      glowClass: 'border-emerald-500/20 bg-emerald-950/10',
      subtitle: 'LIQUID COLLATERAL',
    },
    {
      title: 'Risk Guard Status',
      value: (
        <div className="space-y-1 w-full">
          <div className="flex justify-between items-center text-[10px] font-mono">
            <span className="text-gray-400">USED LIMIT</span>
            <span className={`${lossPercent > 80 ? 'text-rose-400' : 'text-emerald-400'}`}>₹{lossUsed?.toFixed?.(0) ?? '0'} / ₹{maxDailyLoss ?? 500}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-900 rounded-full overflow-hidden border border-cyan-500/10">
            <div
              className={`h-full rounded-full transition-all ${lossPercent > 80 ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e]' : lossPercent > 50 ? 'bg-amber-500 shadow-[0_0_8px_#f59e0b]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}`}
              style={{ width: `${Math.min(lossPercent, 100)}%` }}
            />
          </div>
        </div>
      ),
      icon: Shield,
      color: lossPercent > 80 ? 'text-rose-400' : 'text-emerald-400',
      bgColor: lossPercent > 80 ? 'bg-rose-500/10' : 'bg-emerald-500/10',
      glowClass: lossPercent > 80 ? 'glow-rose border-rose-500/40 bg-rose-950/10 animate-pulse' : 'border-emerald-500/20 bg-emerald-950/10',
      subtitle: 'KILL-SWITCH DEFENSE',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards?.map?.((card: any, i: number) => (
        <Card key={i} className={`relative overflow-hidden transition-all duration-300 hover:scale-[1.02] border backdrop-blur-md ${card?.glowClass ?? ''}`}>
          {/* Cyber-grid background layer inside cards */}
          <div className="absolute inset-0 cyber-grid opacity-[0.15] pointer-events-none" />
          
          <CardContent className="pt-4 pb-3 px-4 relative z-10 flex flex-col justify-between h-full min-h-[96px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase font-mono tracking-widest text-muted-foreground">{card?.title ?? ''}</span>
              <div className={`w-7 h-7 rounded ${card?.bgColor ?? ''} flex items-center justify-center`}>
                {card?.icon && <card.icon className={`w-3.5 h-3.5 ${card?.color ?? ''}`} />}
              </div>
            </div>
            
            <div className="space-y-1">
              <div className={`text-xl font-bold font-mono tracking-tight ${card?.color ?? ''}`}>{card?.value}</div>
              <div className="text-[8px] font-mono tracking-wider text-muted-foreground uppercase">{card?.subtitle}</div>
            </div>
          </CardContent>
        </Card>
      )) ?? null}
    </div>
  );
});
