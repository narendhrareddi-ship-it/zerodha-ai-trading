'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Link2, CheckCircle, XCircle, ExternalLink, Key, RefreshCw, Info, ShieldCheck, Zap, TrendingUp, Shield } from 'lucide-react';
import { toast } from 'sonner';

export function KiteConnect() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [requestToken, setRequestToken] = useState('');
  const [authenticating, setAuthenticating] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trading/broker/status');
      if (res?.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err: any) {
      console.error('Broker status error:', err?.message);
    } finally {
      setStatus((prev: any) => {
        if (!prev) return { connected: false, brokerType: 'kite' };
        return prev;
      });
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleAuth = async () => {
    if (!requestToken?.trim?.()) {
      toast.error('Please enter the request token');
      return;
    }
    setAuthenticating(true);
    try {
      const res = await fetch(`/api/kite/auth?request_token=${encodeURIComponent(requestToken)}`);
      const data = await res.json();
      if (res?.ok) {
        toast.success('Kite connected successfully!');
        setRequestToken('');
        fetchStatus();
      } else {
        toast.error(data?.error ?? 'Authentication failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Authentication failed');
    } finally {
      setAuthenticating(false);
    }
  };

  const getLoginUrl = async () => {
    try {
      const res = await fetch('/api/kite/auth');
      const data = await res.json();
      if (data?.loginUrl) {
        window.open(data.loginUrl, '_blank');
      } else {
        toast.error(data?.error ?? 'Failed to get login URL');
      }
    } catch (err: any) {
      toast.error('Failed to get login URL');
    }
  };

  const isConnected = status?.connected ?? false;
  const brokerType = status?.brokerType ?? 'kite';
  const platformConfigured = status?.platformConfigured !== false;

  const brokerNames: Record<string, string> = {
    kite: 'Zerodha Kite Connect',
    fyers: 'Fyers API v3',
    kotak: 'Kotak Neo API',
    openalgo: 'OpenAlgo Bridge',
  };

  const brokerLogos: Record<string, string> = {
    kite: '🔴',
    fyers: '🟡',
    kotak: '🟠',
    openalgo: '🔵',
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="text-xl">{brokerLogos[brokerType] || '🔌'}</span>
          {brokerNames[brokerType] || 'Broker'} Connection Status
        </CardTitle>
        <CardDescription>
          {brokerType === 'kite' 
            ? 'Connect your Zerodha account for live trading — no API subscription needed from you!'
            : `Verify configuration and check balance for your direct ${brokerNames[brokerType]} broker connection.`
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dynamic Free Access Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-primary/5 to-blue-500/10 border border-emerald-500/20">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                {brokerType === 'fyers' ? 'Fyers Integration: 100% Free API Execution' : 'Autonomous Trading Integration'}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {brokerType === 'fyers'
                  ? 'Fyers does not charge any monthly fee for API order execution. Your real money balance is loaded automatically to size positions according to the Half-Kelly criterion.'
                  : brokerType === 'kite'
                  ? 'Unlike other platforms, you do not need to buy a Kite Connect API subscription (₹2,000/month). Just log in with your regular Zerodha credentials and start live trading instantly.'
                  : 'Automated execution engine sizes positions dynamically according to risk criteria and live available capital.'
                }
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 flex items-start gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 mt-0.5">
              <ExternalLink className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium">1. Set Broker</p>
              <p className="text-[11px] text-muted-foreground">Select active broker in connection settings</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 flex items-start gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 mt-0.5">
              <Shield className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium">2. Authenticate</p>
              <p className="text-[11px] text-muted-foreground">Input API tokens or login to establish session</p>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 flex items-start gap-2.5">
            <div className="p-1.5 rounded-md bg-primary/10 mt-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium">3. Trade Live</p>
              <p className="text-[11px] text-muted-foreground">Bot executes real trades using actual funds</p>
            </div>
          </div>
        </div>

        {/* Connection Status & Action */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Connection Status</span>
              <Badge variant={isConnected ? 'default' : 'destructive'} className={`gap-1 ${isConnected ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : ''}`}>
                {isConnected ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {isConnected ? 'Connected' : 'Disconnected'}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchStatus} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {isConnected && status?.profileName && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Logged in as: <strong>{status.profileName}</strong></p>
                  <p className="text-xs text-muted-foreground mt-0.5">{brokerNames[brokerType]} ID: {status.profileId ?? 'N/A'}</p>
                </div>
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
          )}

          {!isConnected && brokerType === 'kite' && platformConfigured && (
            <>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1">
                <p className="font-medium text-foreground flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  Zerodha tokens expire daily. Connect each trading day:
                </p>
                <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
                  <li>Click &quot;Connect to Zerodha&quot; below</li>
                  <li>Log in with your Zerodha credentials</li>
                  <li>Authorize the app → you&apos;ll be redirected back automatically</li>
                </ol>
              </div>

              <Button className="gap-2 w-full" size="lg" onClick={getLoginUrl}>
                <ExternalLink className="w-4 h-4" /> Connect to Zerodha
              </Button>

              <div className="text-center">
                <button
                  onClick={() => setShowManual(!showManual)}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {showManual ? 'Hide manual entry' : 'Auto-redirect not working? Enter token manually'}
                </button>
              </div>

              {showManual && (
                <div className="space-y-2 p-3 rounded-lg bg-muted/30">
                  <Label htmlFor="requestToken" className="text-xs">Request Token</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="requestToken"
                        placeholder="Paste request_token from URL"
                        value={requestToken}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRequestToken(e.target.value)}
                        className="pl-10 text-sm"
                      />
                    </div>
                    <Button onClick={handleAuth} loading={authenticating} size="sm">
                      Connect
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {!isConnected && brokerType === 'fyers' && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 leading-relaxed">
              <Info className="w-4 h-4 inline mr-1.5 align-text-bottom" />
              Fyers token is missing or expired. Please generate a new access token using the fyers-token utility and paste it in Settings above.
            </div>
          )}

          {!isConnected && brokerType === 'kite' && !platformConfigured && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
              <Info className="w-4 h-4 inline mr-1" />
              Platform Kite API is not configured. Please contact the administrator.
            </div>
          )}

          {isConnected && (status?.availableMargin !== undefined || status?.margins) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Available Margin</p>
                <p className="font-mono font-bold text-sm">
                  ₹{(status?.availableMargin ?? 0)?.toLocaleString?.('en-IN') ?? '0'}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Used Margin</p>
                <p className="font-mono font-bold text-sm">
                  ₹{(status?.usedMargin ?? 0)?.toLocaleString?.('en-IN') ?? '0'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Paper trading info */}
        {!isConnected && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Paper Trading Active:</strong> The bot is running in simulation mode with virtual data. 
              Configure your credentials above to switch to live trading with real market execution.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
