'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

interface Trade {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  status: string;
  strategy: string;
  entryTime: string;
  exitTime: string | null;
  notes?: string | null;
}

export function TradeHistory({ trades }: { trades: Trade[] }) {
  const safeTrades = trades ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="w-5 h-5 text-primary" />
          Today's Trade History
          <Badge variant="outline" className="ml-2 font-mono">{safeTrades?.length ?? 0}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {safeTrades.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No trades today</p>
            <p className="text-sm">Trade history will appear here once trading begins</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead className="text-right">Exit</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Strategy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeTrades.map((trade: Trade) => (
                  <TableRow key={trade?.id ?? Math.random()}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {trade?.entryTime ? new Date(trade.entryTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </TableCell>
                    <TableCell className="font-mono font-medium">{trade?.symbol ?? ''}</TableCell>
                    <TableCell>
                      <Badge variant={trade?.direction === 'BUY' ? 'default' : 'destructive'} className="gap-1 text-xs">
                        {trade?.direction === 'BUY' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {trade?.direction ?? ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{trade?.quantity ?? 0}</TableCell>
                    <TableCell className="text-right font-mono">₹{trade?.entryPrice?.toFixed?.(2) ?? '0'}</TableCell>
                    <TableCell className="text-right font-mono">
                      {trade?.exitPrice != null ? `₹${trade.exitPrice.toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {trade?.pnl != null ? (
                        trade.notes ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`cursor-help border-b border-dashed border-muted-foreground/40 font-bold ${(trade?.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  ₹{trade.pnl.toFixed(2)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="bg-popover border text-popover-foreground p-3 max-w-[280px]">
                                <div className="text-xs font-mono space-y-1">
                                  <p className="font-semibold text-xs border-b pb-1 mb-1 text-primary">Trade Details & Fees</p>
                                  <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">{trade.notes}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className={`font-bold ${(trade?.pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ₹{trade.pnl.toFixed(2)}
                          </span>
                        )
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={trade?.status === 'OPEN' ? 'default' : 'secondary'} className="text-xs">
                        {trade?.status ?? ''}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{trade?.strategy ?? ''}</Badge>
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
