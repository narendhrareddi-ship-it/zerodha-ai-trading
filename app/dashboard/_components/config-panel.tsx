'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings, Save } from 'lucide-react';
import { toast } from 'sonner';

export function ConfigPanel() {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/trading/config');
        if (res?.ok) {
          const data = await res.json();
          setConfig(data ?? {});
        }
      } catch (err: any) {
        console.error('Config fetch error:', err?.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/trading/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res?.ok) {
        toast.success('Configuration saved');
      } else {
        toast.error('Failed to save configuration');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setConfig((prev: any) => ({ ...(prev ?? {}), [field]: value }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="w-5 h-5 text-primary" />
          Trading Configuration
        </CardTitle>
        <CardDescription>Configure risk limits, strategies, and trading parameters</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Max Daily Loss (₹)</Label>
            <Input
              type="number"
              value={config?.maxDailyLoss ?? 500}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('maxDailyLoss', Number(e.target.value))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max Positions</Label>
            <Input
              type="number"
              value={config?.maxPositions ?? 3}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('maxPositions', Number(e.target.value))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Capital (₹)</Label>
            <Input
              type="number"
              value={config?.capitalAmount ?? 10000}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('capitalAmount', Number(e.target.value))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Square-off Time</Label>
            <Input
              type="time"
              value={config?.squareOffTime ?? '15:10'}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('squareOffTime', e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stop Loss %</Label>
            <Input
              type="number"
              step="0.1"
              value={config?.stopLossPercent ?? 1.0}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('stopLossPercent', Number(e.target.value))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Target %</Label>
            <Input
              type="number"
              step="0.1"
              value={config?.targetPercent ?? 2.0}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('targetPercent', Number(e.target.value))}
              className="font-mono"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Momentum Strategy</Label>
            <Switch
              checked={config?.enableMomentum ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableMomentum', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">RSI Strategy</Label>
            <Switch
              checked={config?.enableRSI ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableRSI', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">MACD Strategy</Label>
            <Switch
              checked={config?.enableMACD ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableMACD', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Bollinger Bands Strategy</Label>
            <Switch
              checked={config?.enableBollinger ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableBollinger', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Supertrend Strategy</Label>
            <Switch
              checked={config?.enableSupertrend ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableSupertrend', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">VWAP Strategy</Label>
            <Switch
              checked={config?.enableVWAP ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableVWAP', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">EMA Crossover Strategy</Label>
            <Switch
              checked={config?.enableEMACross ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableEMACross', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">VWAP Pullback Strategy</Label>
            <Switch
              checked={config?.enableVwapPullback ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableVwapPullback', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Volume Breakout Strategy</Label>
            <Switch
              checked={config?.enableVolBreakout ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableVolBreakout', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">News Sentiment Strategy</Label>
            <Switch
              checked={config?.enableNewsSentiment ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableNewsSentiment', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Equity Segment</Label>
            <Switch
              checked={config?.enableEquity ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableEquity', checked)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">F&O Segment</Label>
            <Switch
              checked={config?.enableFnO ?? true}
              onCheckedChange={(checked: boolean) => updateField('enableFnO', checked)}
            />
          </div>
        </div>

        <Button onClick={handleSave} loading={saving} className="w-full gap-2">
          <Save className="w-4 h-4" /> Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
}
