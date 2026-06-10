'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Position {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  stopLoss: number;
  target: number;
  strategy: string;
  entryTime: string;
}

export function PositionsTable({ positions }: { positions: Position[] }) {
  const safePositions = positions ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="w-5 h-5 text-primary" />
          Open Positions
          <Badge variant="outline" className="ml-2 font-mono">{safePositions?.length ?? 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {safePositions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No open positions</p>
            <p className="text-sm">Positions will appear here when the bot executes trades</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">SL</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead>Strategy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safePositions.map((pos: Position) => (
                  <TableRow key={pos?.id ?? Math.random()}>
                    <TableCell className="font-mono font-medium">{pos?.symbol ?? ''}</TableCell>
                    <TableCell>
                      <Badge variant={pos?.direction === 'BUY' ? 'default' : 'destructive'} className="gap-1">
                        {pos?.direction === 'BUY' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {pos?.direction ?? ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{pos?.quantity ?? 0}</TableCell>
                    <TableCell className="text-right font-mono">₹{pos?.entryPrice?.toFixed?.(2) ?? '0'}</TableCell>
                    <TableCell className="text-right font-mono text-red-400">₹{pos?.stopLoss?.toFixed?.(2) ?? '0'}</TableCell>
                    <TableCell className="text-right font-mono text-green-400">₹{pos?.target?.toFixed?.(2) ?? '0'}</TableCell>
                    <TableCell className={`text-right font-mono font-bold ${(pos?.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ₹{pos?.pnl?.toFixed?.(2) ?? '0'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{pos?.strategy ?? ''}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
