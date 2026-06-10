'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function KiteCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession() || {};
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting to Zerodha...');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user) {
      router.replace('/auth/login');
      return;
    }

    const requestToken = searchParams?.get('request_token');
    const kiteStatus = searchParams?.get('status');

    if (!requestToken) {
      setState('error');
      setMessage('No request token found in the URL. Please try connecting again from the dashboard.');
      return;
    }

    if (kiteStatus === 'error') {
      setState('error');
      setMessage('Zerodha login was cancelled or failed. Please try again.');
      return;
    }

    const authenticate = async () => {
      try {
        const res = await fetch(`/api/kite/auth?request_token=${encodeURIComponent(requestToken)}`);
        const data = await res.json();
        if (res?.ok) {
          setState('success');
          setMessage('Zerodha account connected successfully! Redirecting to dashboard...');
          setTimeout(() => router.replace('/dashboard'), 2000);
        } else {
          setState('error');
          setMessage(data?.error ?? 'Failed to authenticate with Zerodha. The token may have expired.');
        }
      } catch (err: any) {
        setState('error');
        setMessage(err?.message ?? 'Connection failed. Please try again.');
      }
    };

    authenticate();
  }, [searchParams, session, status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Kite Connect</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-center gap-2 text-lg">
              {state === 'loading' && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
              {state === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {state === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
              {state === 'loading' ? 'Connecting...' : state === 'success' ? 'Connected!' : 'Connection Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">{message}</p>
            {state === 'error' && (
              <Button onClick={() => router.replace('/dashboard')} variant="outline">
                Back to Dashboard
              </Button>
            )}
            {state === 'success' && (
              <div className="flex items-center justify-center gap-2 text-sm text-green-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirecting...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
