'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Send, Unlink, Search, CheckCircle2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';

export function TelegramSettings() {
  const [chatId, setChatId] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/trading/config');
        if (res?.ok) {
          const data = await res.json();
          if (data?.telegramChatId) {
            setChatId(data.telegramChatId);
            setConnected(data.enableTelegram ?? false);
          }
        }
      } catch (err: any) {
        console.error('Config fetch error:', err?.message);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const detectChatId = async () => {
    setDetecting(true);
    try {
      const res = await fetch('/api/trading/telegram');
      if (res?.ok) {
        const data = await res.json();
        if (data?.chatId) {
          setChatId(data.chatId);
          toast.success(`Chat ID detected: ${data.chatId}`);
        } else {
          toast.error('No chat found. Send /start to the bot first, then try again.');
        }
      }
    } catch (err: any) {
      toast.error('Detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const verifyAndConnect = async () => {
    if (!chatId?.trim()) {
      toast.error('Please enter your Telegram Chat ID');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch('/api/trading/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', chatId: chatId.trim() }),
      });
      const data = await res.json();
      if (res?.ok) {
        setConnected(true);
        toast.success(data?.message ?? 'Telegram connected!');
      } else {
        toast.error(data?.error ?? 'Verification failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Connection failed');
    } finally {
      setVerifying(false);
    }
  };

  const disconnect = async () => {
    try {
      const res = await fetch('/api/trading/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (res?.ok) {
        setConnected(false);
        setChatId('');
        toast.success('Telegram disconnected');
      }
    } catch (err: any) {
      toast.error('Disconnect failed');
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="w-5 h-5 text-[#0088cc]" />
          Telegram Notifications
          {connected && (
            <Badge variant="default" className="ml-2 bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Connected
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Get real-time trade alerts, P&L summaries, and risk warnings on Telegram — completely free!
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected ? (
          <>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <p className="font-semibold">Setup in 3 steps:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Search for your trading bot on Telegram</li>
                <li>Send <code className="bg-muted px-1 rounded">/start</code> to the bot</li>
                <li>Click "Auto-Detect Chat ID" below or paste your ID manually</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Telegram Chat ID</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. 123456789"
                  value={chatId}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChatId(e.target.value)}
                  className="font-mono"
                />
                <Button variant="outline" onClick={detectChatId} loading={detecting} className="gap-1 shrink-0">
                  <Search className="w-4 h-4" /> Detect
                </Button>
              </div>
            </div>

            <Button onClick={verifyAndConnect} loading={verifying} className="w-full gap-2">
              <Send className="w-4 h-4" /> Connect & Test
            </Button>
          </>
        ) : (
          <>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="font-semibold text-emerald-500">Telegram Connected</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Chat ID: <code className="bg-muted px-1 rounded font-mono">{chatId}</code>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                You will receive: Trade entries, exits, daily P&L summaries, and risk alerts
              </p>
            </div>

            <Button variant="outline" onClick={disconnect} className="w-full gap-2 text-red-500 hover:text-red-600 hover:border-red-500/50">
              <Unlink className="w-4 h-4" /> Disconnect Telegram
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
