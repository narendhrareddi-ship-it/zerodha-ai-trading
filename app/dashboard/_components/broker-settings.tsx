'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Globe, Save, Check, Calculator, Info, Eye, EyeOff, Zap, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { SUPPORTED_BROKERS } from '@/lib/openalgo';

const SIZING_METHODS = [
  {
    id: 'half-kelly',
    name: 'Half-Kelly Criterion',
    desc: 'Mathematically optimal sizing based on your win rate. Conservative variant that maximizes long-term growth while limiting drawdowns.',
    badge: 'Recommended',
  },
  {
    id: 'fixed-risk',
    name: 'Fixed Risk',
    desc: 'Risks a fixed ₹ amount per trade regardless of win history. Simpler but less optimal.',
    badge: null,
  },
];

export function BrokerSettings() {
  const [config, setConfig] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openalgoKey, setOpenalgoKey] = useState('');
  const [openalgoHost, setOpenalgoHost] = useState('http://127.0.0.1:5000');
  const [showKey, setShowKey] = useState(false);
  // Fyers state
  const [fyersAppId, setFyersAppId] = useState('');
  const [fyersToken, setFyersToken] = useState('');
  const [showFyersToken, setShowFyersToken] = useState(false);
  // Kotak Neo state
  const [kotakConsumerKey, setKotakConsumerKey] = useState('');
  const [kotakToken, setKotakToken] = useState('');
  const [showKotakToken, setShowKotakToken] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/trading/broker');
        if (res?.ok) {
          const data = await res.json();
          setConfig(data);
          setOpenalgoHost(data?.openalgoHost ?? 'http://127.0.0.1:5000');
          setFyersAppId(data?.fyersAppId ?? '');
        }
      } catch (err: any) {
        console.error('Broker config error:', err?.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const saveBrokerConfig = async (updates: any) => {
    setSaving(true);
    try {
      const res = await fetch('/api/trading/broker', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res?.ok) {
        const data = await res.json();
        setConfig(data);
        toast.success('Settings saved!');
      } else {
        toast.error('Failed to save');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
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
    <div className="space-y-4">
      {/* Broker Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="w-5 h-5 text-primary" />
            Broker Connection
          </CardTitle>
          <CardDescription>Choose your broker. Kite (built-in) or connect any broker via OpenAlgo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Broker Type Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'kite', name: 'Zerodha (Kite)', desc: 'Direct Kite Connect. Free for all users via platform OAuth.', icon: '🟢', badge: 'Built-in' },
              { id: 'fyers', name: 'Fyers', desc: 'Free execution API. Sub-50ms speeds, TradingView integration.', icon: '🟡', badge: 'Free' },
              { id: 'kotak', name: 'Kotak Neo', desc: 'Zero brokerage on API orders. Free API access.', icon: '🔶', badge: '₹0 Brokerage' },
              { id: 'openalgo', name: 'OpenAlgo (30+ Brokers)', desc: 'Multi-broker bridge. Self-hosted, open-source.', icon: '🌐', badge: null },
            ].map(broker => (
              <button
                key={broker.id}
                onClick={() => saveBrokerConfig({ brokerType: broker.id })}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  config?.brokerType === broker.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{broker.icon} {broker.name}</span>
                  <div className="flex items-center gap-1.5">
                    {broker.badge && (
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                        {broker.badge}
                      </Badge>
                    )}
                    {config?.brokerType === broker.id && (
                      <Badge variant="default" className="bg-primary/20 text-primary text-xs gap-0.5">
                        <Check className="w-3 h-3" /> Active
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{broker.desc}</p>
              </button>
            ))}
          </div>

          {/* Fyers Config */}
          {config?.brokerType === 'fyers' && (
            <div className="p-4 rounded-lg bg-muted/20 border space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <p className="text-xs text-muted-foreground">
                  Get your App ID & Access Token from <a href="https://myapi.fyers.in/dashboard/" target="_blank" rel="noopener noreferrer" className="text-primary underline">Fyers API Dashboard</a>. Create an app → copy App ID & generate access token daily.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fyers App ID (client_id)</Label>
                  <Input
                    placeholder="e.g., XXXX-100"
                    value={fyersAppId}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFyersAppId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showFyersToken ? 'text' : 'password'}
                      placeholder="Paste your access token"
                      value={fyersToken}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFyersToken(e.target.value)}
                      className="font-mono text-sm pr-10"
                    />
                    <button type="button" onClick={() => setShowFyersToken(!showFyersToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showFyersToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <Button onClick={() => saveBrokerConfig({ fyersAppId, fyersToken })} disabled={saving} size="sm" className="gap-2">
                <Save className="w-4 h-4" /> Save Fyers Settings
              </Button>
              {config?.hasFyersConfig && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Fyers API configured and ready
                </div>
              )}
            </div>
          )}

          {/* Kotak Neo Config */}
          {config?.brokerType === 'kotak' && (
            <div className="p-4 rounded-lg bg-muted/20 border space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />
                <p className="text-xs text-muted-foreground">
                  Get your Consumer Key from <a href="https://napi.kotaksecurities.com/devportal" target="_blank" rel="noopener noreferrer" className="text-primary underline">Kotak Neo Developer Portal</a>. Generate access token via TOTP login.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Consumer Key</Label>
                  <Input
                    placeholder="Your consumer key"
                    value={kotakConsumerKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakConsumerKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showKotakToken ? 'text' : 'password'}
                      placeholder="Paste your access token"
                      value={kotakToken}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakToken(e.target.value)}
                      className="font-mono text-sm pr-10"
                    />
                    <button type="button" onClick={() => setShowKotakToken(!showKotakToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showKotakToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <Button onClick={() => saveBrokerConfig({ kotakConsumerKey, kotakToken })} disabled={saving} size="sm" className="gap-2">
                <Save className="w-4 h-4" /> Save Kotak Settings
              </Button>
              {config?.hasKotakConfig && (
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <Check className="w-3.5 h-3.5" /> Kotak Neo API configured and ready
                </div>
              )}
              <div className="p-2 rounded bg-orange-500/10 text-[10px] text-orange-300">
                💡 Zero brokerage on all API-executed orders under eligible plans
              </div>
            </div>
          )}

          {/* OpenAlgo Config */}
          {config?.brokerType === 'openalgo' && (
            <div className="p-4 rounded-lg bg-muted/20 border space-y-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Set up <a href="https://openalgo.in" target="_blank" rel="noopener noreferrer" className="text-primary underline">OpenAlgo</a> on your computer or VPS, connect your broker, then paste your API key below.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">OpenAlgo Host URL</Label>
                  <Input
                    placeholder="http://127.0.0.1:5000"
                    value={openalgoHost}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenalgoHost(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">OpenAlgo API Key</Label>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder="Your OpenAlgo API key"
                      value={openalgoKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenalgoKey(e.target.value)}
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => saveBrokerConfig({ openalgoApiKey: openalgoKey, openalgoHost })}
                loading={saving}
                size="sm"
                className="gap-2"
              >
                <Save className="w-4 h-4" /> Save OpenAlgo Settings
              </Button>

              <div className="pt-2 border-t">
                <p className="text-xs font-medium mb-2">Supported Brokers via OpenAlgo:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUPPORTED_BROKERS.map(b => (
                    <Badge key={b.id} variant="outline" className="text-[10px] gap-1">
                      {b.logo} {b.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Position Sizing Method */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="w-5 h-5 text-primary" />
            Position Sizing
          </CardTitle>
          <CardDescription>Choose how the bot calculates trade quantity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {SIZING_METHODS.map(m => (
            <button
              key={m.id}
              onClick={() => saveBrokerConfig({ positionSizing: m.id })}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                config?.positionSizing === m.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">{m.name}</span>
                <div className="flex items-center gap-2">
                  {m.badge && (
                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                      {m.badge}
                    </Badge>
                  )}
                  {config?.positionSizing === m.id && (
                    <Badge variant="default" className="bg-primary/20 text-primary text-xs gap-0.5">
                      <Check className="w-3 h-3" /> Active
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </button>
          ))}

          <div className="p-3 rounded-lg bg-muted/20 text-xs text-muted-foreground">
            <p><strong>Half-Kelly Criterion:</strong> Uses your last 50 trades to calculate optimal bet size. Needs ≥10 trades for statistics; falls back to fixed-risk otherwise. Formula: f* = (p×b - q) ÷ b, applied at 50% for safety.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
