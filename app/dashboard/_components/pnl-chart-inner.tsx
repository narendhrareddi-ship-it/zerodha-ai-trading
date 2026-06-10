'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';

interface PnlDataPoint {
  date: string;
  pnl: number;
  trades: number;
}

export default function PnlChartInner({ data }: { data: PnlDataPoint[] }) {
  const safeData = data ?? [];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={safeData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tickLine={false}
          tick={{ fontSize: 10 }}
          label={{ value: 'Date', position: 'insideBottom', offset: -15, style: { textAnchor: 'middle', fontSize: 11 } }}
        />
        <YAxis
          tickLine={false}
          tick={{ fontSize: 10 }}
          tickFormatter={(val: number) => `₹${val}`}
          label={{ value: 'P&L', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11 } }}
        />
        <Tooltip
          contentStyle={{ fontSize: 11, background: 'hsl(222 47% 9%)', border: '1px solid hsl(217 33% 17%)', borderRadius: '8px' }}
          formatter={(value: any) => [`₹${Number(value ?? 0).toFixed(2)}`, 'P&L']}
        />
        <ReferenceLine y={0} stroke="hsl(0 0% 50%)" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="pnl"
          stroke="#10B981"
          fill="url(#pnlGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
