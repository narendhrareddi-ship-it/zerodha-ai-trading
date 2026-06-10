'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart } from 'lucide-react';
import dynamic from 'next/dynamic';

const PnlChartInner = dynamic(() => import('./pnl-chart-inner'), { ssr: false, loading: () => <div className="h-[300px] flex items-center justify-center text-muted-foreground">Loading chart...</div> });

interface PnlDataPoint {
  date: string;
  pnl: number;
  trades: number;
}

export function PnlChart({ data }: { data: PnlDataPoint[] }) {
  const safeData = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <LineChart className="w-5 h-5 text-primary" />
          P&L History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {safeData.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <LineChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No P&L data yet</p>
            <p className="text-sm">Historical P&L chart will appear as trading sessions complete</p>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <PnlChartInner data={safeData} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
