'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, TrendingUp, Mail, Lock, ArrowRight, Info } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });
      if (result?.ok) {
        router.replace('/dashboard');
      } else {
        toast.error('Invalid email or password. If you are new, please create an account first.');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Bot className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight">ZerodhaAI</h1>
          <p className="text-muted-foreground">Autonomous AI-powered trading system</p>
        </div>

        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex gap-2 items-start">
          <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-300">
            <strong>This is your app login</strong> — not your Zerodha login. Create an account below if you're new. You'll connect your Zerodha account inside the dashboard after logging in.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Sign In to Dashboard
            </CardTitle>
            <CardDescription>Use your ZerodhaAI app credentials (not your Zerodha broker credentials)</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your-email@example.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Sign In <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/20 text-center">
              <p className="text-sm font-medium text-foreground">New here?</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">Create a free account to start using the AI trading bot</p>
              <Link href="/auth/signup">
                <Button variant="outline" className="w-full border-primary/30 hover:bg-primary/10">
                  Create Account <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
