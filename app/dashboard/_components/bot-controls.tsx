'use client';

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

export function BotControls({ botStatus, onStart, onStop, onExitAll, onScan }: BotControlsProps) {
  const isRunning = botStatus === 'RUNNING';

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 py-4 px-4">
        <div className="flex items-center gap-2 mr-4">
          <Zap className={`w-5 h-5 ${isRunning ? 'text-primary animate-pulse-green' : 'text-muted-foreground'}`} />
          <span className="font-display font-semibold text-sm">
            Bot: {isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>

        {!isRunning ? (
          <Button onClick={onStart} size="sm" className="gap-2">
            <Play className="w-4 h-4" /> Start Bot
          </Button>
        ) : (
          <Button onClick={onStop} variant="secondary" size="sm" className="gap-2">
            <Square className="w-4 h-4" /> Stop Bot
          </Button>
        )}

        <Button onClick={onScan} variant="outline" size="sm" className="gap-2">
          <Search className="w-4 h-4" /> Manual Scan
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="gap-2">
              <XCircle className="w-4 h-4" /> Emergency Exit All
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Emergency Exit All Positions</AlertDialogTitle>
              <AlertDialogDescription>
                This will close ALL open positions immediately at market price and stop the trading bot.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onExitAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Confirm Exit All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
