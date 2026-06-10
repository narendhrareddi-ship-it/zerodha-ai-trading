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
      title: "Today's P&L",
      value: <AnimatedNumber value={dailyPnl ?? 0} prefix="₹" decimals={2} />,
      icon: pnlPositive ? TrendingUp : TrendingDown,
      color: pnlPositive ? 'text-green-400' : 'text-red-400',
      bgColor: pnlPositive ? 'bg-green-400/10' : 'bg-red-400/10',
    },
    {
      title: 'Open Positions',
      value: <AnimatedNumber value={openPositions ?? 0} />,
      icon: BarChart3,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      title: 'Total Trades',
      value: <AnimatedNumber value={totalTrades ?? 0} />,
      icon: Target,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
    },
    {
      title: 'Win Rate',
      value: <AnimatedNumber value={winRate ?? 0} suffix="%" decimals={1} />,
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      title: 'Capital',
      value: <AnimatedNumber value={capital ?? 0} prefix="₹" decimals={0} />,
      icon: Wallet,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-400/10',
    },
    {
      title: 'Risk Status',
      value: (
        <div className="space-y-1">
          <span className="font-mono font-bold text-sm">₹{lossUsed?.toFixed?.(0) ?? '0'} / ₹{maxDailyLoss ?? 500}</span>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${lossPercent > 80 ? 'bg-red-500' : lossPercent > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(lossPercent, 100)}%` }}
            />
          </div>
        </div>
      ),
      icon: Shield,
      color: lossPercent > 80 ? 'text-red-400' : 'text-green-400',
      bgColor: lossPercent > 80 ? 'bg-red-400/10' : 'bg-green-400/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards?.map?.((card: any, i: number) => (
        <Card key={i} className="hover:shadow-lg transition-shadow duration-normal">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg ${card?.bgColor ?? ''} flex items-center justify-center`}>
                {card?.icon && <card.icon className={`w-4 h-4 ${card?.color ?? ''}`} />}
              </div>
              <span className="text-xs text-muted-foreground">{card?.title ?? ''}</span>
            </div>
            <div className={`text-lg ${card?.color ?? ''}`}>{card?.value}</div>
          </CardContent>
        </Card>
      )) ?? null}
    </div>
  );
});
