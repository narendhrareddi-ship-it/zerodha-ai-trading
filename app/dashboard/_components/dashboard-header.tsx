'use client';

import { Bot, TrendingUp, LogOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DashboardHeaderProps {
  userName: string;
  botStatus: string;
  isMarketOpen: boolean;
  onSignOut: () => void;
}

export function DashboardHeader({ userName, botStatus, isMarketOpen, onSignOut }: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-[1200px] mx-auto px-4 flex items-center justify-between h-16">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg tracking-tight flex items-center gap-2">
              ZerodhaAI
              <TrendingUp className="w-4 h-4 text-primary" />
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant={isMarketOpen ? 'default' : 'secondary'} className="font-mono text-xs">
            <Activity className="w-3 h-3 mr-1" />
            {isMarketOpen ? 'Market Open' : 'Market Closed'}
          </Badge>
          <Badge
            variant={botStatus === 'RUNNING' ? 'default' : 'outline'}
            className={`font-mono text-xs ${botStatus === 'RUNNING' ? 'animate-pulse-green' : ''}`}
          >
            {botStatus === 'RUNNING' ? '● Live' : '○ Stopped'}
          </Badge>
          <span className="text-sm text-muted-foreground hidden sm:inline">{userName ?? 'Trader'}</span>
          <Button variant="ghost" size="icon-sm" onClick={onSignOut} title="Sign Out">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
