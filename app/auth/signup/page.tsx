'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, UserPlus, Mail, Lock, User, ArrowRight, Info, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (res?.ok) {
        toast.success('Account created! Signing you in...');
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.ok) {
          router.replace('/dashboard');
        }
      } else {
        toast.error(data?.error ?? 'Signup failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Signup failed');
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
          <p className="text-muted-foreground">Create your trading dashboard account</p>
        </div>

        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 space-y-2">
          <div className="flex gap-2 items-start">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-300">
              <strong>Create your app account here.</strong> This is separate from your Zerodha broker account.
            </p>
          </div>
          <div className="flex flex-col gap-1 pl-6">
            <div className="flex items-center gap-2 text-xs text-blue-300/80">
              <CheckCircle className="w-3 h-3 text-primary" />
              Step 1: Create account here (you are here)
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-300/80">
              <CheckCircle className="w-3 h-3 text-muted-foreground" />
              Step 2: Connect Zerodha inside dashboard (free, no API subscription needed)
            </div>
            <div className="flex items-center gap-2 text-xs text-blue-300/80">
              <CheckCircle className="w-3 h-3 text-muted-foreground" />
              Step 3: Start autonomous trading
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Create Account
            </CardTitle>
            <CardDescription>Set up your AI trading dashboard credentials</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
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
                    placeholder="Min 6 characters"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Create Account & Sign In <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
