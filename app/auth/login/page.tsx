'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, ArrowRight, Info, Cpu, Network } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { HermesLogo } from '@/components/hermes-logo';

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
    <div className="relative min-h-screen flex items-center justify-center bg-[#02050c] p-4 overflow-hidden">
      {/* Background Cyber grid overlay */}
      <div className="absolute inset-0 cyber-grid opacity-[0.14] pointer-events-none" />
      
      {/* Background neon glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-amber-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center space-y-3">
          {/* Animated Winged Arc Reactor Logo */}
          <div className="relative inline-flex items-center justify-center w-24 h-24 mb-2 cursor-pointer group hover:scale-105 transition-transform duration-300">
            <HermesLogo size={88} status="standby" />
            {/* Scanner line */}
            <div className="absolute top-0 left-0 w-full h-[1.5px] bg-amber-400 opacity-70 animate-bounce" />
          </div>

          <h1 className="text-3xl font-display font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-cyan-400">
            H.E.R.M.E.S.
          </h1>
          <p className="text-[10px] font-mono text-amber-400/80 tracking-widest uppercase">
            Hybrid Execution & Risk Management Engine Safeguard
          </p>
        </div>

        {/* Security / Connection Tip */}
        <div className="p-3.5 rounded-lg border border-amber-500/20 bg-amber-950/10 flex gap-3 items-start backdrop-blur-md">
          <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0 animate-pulse" />
          <p className="text-[11px] font-mono text-amber-300/95 leading-relaxed">
            <strong>PORTAL ACCESS NODE</strong> — Authenticate via local credentials. H.E.R.M.E.S. secure engine routes trades autonomously across verified brokerage APIs.
          </p>
        </div>

        <Card className="border border-amber-500/20 bg-[#040814]/90 backdrop-blur-md glow-stark relative overflow-hidden">
          <div className="absolute inset-0 cyber-grid opacity-[0.05] pointer-events-none" />
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 font-display font-bold text-lg text-gray-100">
              <Network className="w-5 h-5 text-amber-400 animate-pulse" />
              S.T.A.R.K. Core Handshake
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground font-mono">
              Provide operator credentials to synchronize local synapse
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-mono tracking-wider text-gray-300 uppercase">OPERATOR SYNAPSE EMAIL</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="operator@hermes.quant"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                    className="pl-10 border-amber-500/20 bg-slate-950/80 text-gray-100 font-mono text-sm focus:border-amber-400/50"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-mono tracking-wider text-gray-300 uppercase">ACCESS PASSPHRASE SIGNATURE</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/60" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                    className="pl-10 border-amber-500/20 bg-slate-950/80 text-gray-100 font-mono text-sm focus:border-amber-400/50"
                    required
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-amber-500 via-yellow-400 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-wider glow-stark border-none h-10 mt-2 transition-transform active:scale-95" 
                loading={loading}
              >
                Sync Terminal <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>
            
            <div className="mt-6 p-4 rounded border border-amber-500/10 bg-amber-950/5 text-center">
              <p className="text-xs font-mono text-amber-400/80">New Quant Operator?</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-1 mb-3">Register a new routing signature key</p>
              <Link href="/auth/signup">
                <Button variant="outline" className="w-full border-amber-500/20 bg-slate-950 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 font-mono text-[10px] uppercase tracking-wider">
                  Initialize Registry <ArrowRight className="w-3.5 h-3.5 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
