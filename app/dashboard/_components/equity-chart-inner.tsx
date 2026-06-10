'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';

export default function EquityChartInner({ data }: { data: { date: string; equity: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v: number) => `₹${v}`} />
        <Tooltip
          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
          labelStyle={{ color: '#e2e8f0' }}
          formatter={(value: number) => [`₹${value.toFixed(2)}`, 'Equity']}
        />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <Area
          type="monotone"
          dataKey="equity"
          stroke="#10B981"
          fillOpacity={1}
          fill="url(#equityGrad)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
