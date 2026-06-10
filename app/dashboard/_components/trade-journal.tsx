'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Plus, Brain, Star, TrendingUp, TrendingDown, Minus, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

const EMOTIONS = [
  { value: 'confident', label: '💪 Confident', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'neutral', label: '😐 Neutral', color: 'bg-gray-500/20 text-gray-400' },
  { value: 'fearful', label: '😨 Fearful', color: 'bg-amber-500/20 text-amber-400' },
  { value: 'greedy', label: '🤑 Greedy', color: 'bg-red-500/20 text-red-400' },
  { value: 'fomo', label: '😰 FOMO', color: 'bg-purple-500/20 text-purple-400' },
  { value: 'patient', label: '🧘 Patient', color: 'bg-blue-500/20 text-blue-400' },
];

const MARKET_CONDITIONS = ['Trending Up', 'Trending Down', 'Sideways', 'Volatile', 'Low Volume', 'News Driven'];

export function TradeJournal() {
  const [entries, setEntries] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({
    symbol: '', direction: 'BUY', entryPrice: '', exitPrice: '', pnl: '',
    strategy: '', emotion: 'neutral', notes: '', rating: 3,
    lessonsLearned: '', marketCondition: '', tags: '',
  });

  const fetchJournal = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trading/journal');
      if (res?.ok) {
        const data = await res.json();
        setEntries(data?.entries ?? []);
        setStats(data?.stats ?? null);
      }
    } catch (err: any) {
      console.error('Journal fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchJournal(); }, []);

  const handleSubmit = async () => {
    if (!form?.symbol?.trim?.() && !form?.notes?.trim?.()) {
      toast.error('Please enter a symbol or notes');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        entryPrice: form.entryPrice ? Number(form.entryPrice) : null,
        exitPrice: form.exitPrice ? Number(form.exitPrice) : null,
        pnl: form.pnl ? Number(form.pnl) : null,
        rating: Number(form.rating) || 3,
      };
      const res = await fetch('/api/trading/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res?.ok) {
        toast.success('Journal entry saved with AI insight!');
        setShowForm(false);
        setForm({
          symbol: '', direction: 'BUY', entryPrice: '', exitPrice: '', pnl: '',
          strategy: '', emotion: 'neutral', notes: '', rating: 3,
          lessonsLearned: '', marketCondition: '', tags: '',
        });
        fetchJournal();
      } else {
        toast.error('Failed to save entry');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getEmotionInfo = (emotion: string) => EMOTIONS.find(e => e.value === emotion) ?? EMOTIONS[1];

  return (
    <div className="space-y-4">
      {/* Stats Banner */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Total Entries</p>
            <p className="text-xl font-bold font-mono">{stats.total}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Avg Rating</p>
            <p className="text-xl font-bold font-mono flex items-center gap-1">
              {stats.avgRating} <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Top Emotion</p>
            <p className="text-sm font-semibold">
              {stats.emotionBreakdown ? getEmotionInfo(
                Object.entries(stats.emotionBreakdown).sort((a: any, b: any) => b[1] - a[1])?.[0]?.[0] ?? 'neutral'
              ).label : '-'}
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">AI Insights</p>
            <p className="text-xl font-bold font-mono">{entries.filter(e => e?.aiInsight).length}</p>
          </Card>
        </div>
      )}

      {/* Header + Add Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Trade Journal</h3>
          <Badge variant="outline" className="text-xs gap-1">
            <Brain className="w-3 h-3" /> AI-Powered
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={fetchJournal} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setShowForm(!showForm)}>
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? 'Cancel' : 'New Entry'}
          </Button>
        </div>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Symbol</Label>
                <Input placeholder="e.g. RELIANCE" value={form.symbol}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Direction</Label>
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Entry ₹</Label>
                <Input type="number" placeholder="0" value={form.entryPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, entryPrice: e.target.value })} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Exit ₹</Label>
                <Input type="number" placeholder="0" value={form.exitPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, exitPrice: e.target.value })} className="font-mono" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">P&L ₹</Label>
                <Input type="number" placeholder="0" value={form.pnl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, pnl: e.target.value })} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Strategy</Label>
                <Input placeholder="e.g. RSI" value={form.strategy}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, strategy: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Market Condition</Label>
                <select value={form.marketCondition} onChange={(e) => setForm({ ...form, marketCondition: e.target.value })}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm">
                  <option value="">Select...</option>
                  {MARKET_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rating (1-5)</Label>
                <div className="flex gap-1 items-center h-10">
                  {[1,2,3,4,5].map(r => (
                    <button key={r} onClick={() => setForm({ ...form, rating: r })}
                      className={`p-1 transition-colors ${r <= (form.rating || 3) ? 'text-amber-400' : 'text-muted-foreground/30'}`}>
                      <Star className="w-5 h-5 fill-current" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Emotion Selector */}
            <div className="space-y-1">
              <Label className="text-xs">How were you feeling?</Label>
              <div className="flex flex-wrap gap-2">
                {EMOTIONS.map(e => (
                  <button key={e.value} onClick={() => setForm({ ...form, emotion: e.value })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${form.emotion === e.value ? e.color + ' border-current scale-105' : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50'}`}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes / Thought Process</Label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full h-20 rounded-md border bg-background px-3 py-2 text-sm resize-none"
                placeholder="Why did you take this trade? What was your analysis?" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lessons Learned</Label>
              <textarea value={form.lessonsLearned} onChange={(e) => setForm({ ...form, lessonsLearned: e.target.value })}
                className="w-full h-16 rounded-md border bg-background px-3 py-2 text-sm resize-none"
                placeholder="What would you do differently next time?" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tags (comma separated)</Label>
              <Input placeholder="e.g. breakout, earnings, gap-up" value={form.tags}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, tags: e.target.value })} />
            </div>

            <Button onClick={handleSubmit} loading={saving} className="gap-2 w-full">
              <Sparkles className="w-4 h-4" /> Save & Generate AI Insight
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Journal Entries */}
      {entries.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No journal entries yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Start documenting your trades to get AI-powered insights</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <Card key={entry.id} className="overflow-hidden">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {entry.symbol && (
                      <Badge variant="outline" className="font-mono">{entry.symbol}</Badge>
                    )}
                    {entry.direction && (
                      <Badge variant={entry.direction === 'BUY' ? 'default' : 'destructive'} className="text-xs gap-0.5">
                        {entry.direction === 'BUY' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {entry.direction}
                      </Badge>
                    )}
                    {entry.strategy && (
                      <Badge variant="outline" className="text-xs">{entry.strategy}</Badge>
                    )}
                    <Badge className={getEmotionInfo(entry.emotion).color + ' text-xs border-0'}>
                      {getEmotionInfo(entry.emotion).label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.pnl != null && (
                      <span className={`font-mono font-bold text-sm ${(entry.pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(entry.pnl ?? 0) >= 0 ? '+' : ''}₹{entry.pnl?.toFixed?.(2)}
                      </span>
                    )}
                    <div className="flex">
                      {[1,2,3,4,5].map(r => (
                        <Star key={r} className={`w-3 h-3 ${r <= (entry.rating ?? 3) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/20'}`} />
                      ))}
                    </div>
                  </div>
                </div>

                {(entry.entryPrice || entry.exitPrice) && (
                  <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                    {entry.entryPrice && <span>Entry: ₹{entry.entryPrice}</span>}
                    {entry.exitPrice && <span>Exit: ₹{entry.exitPrice}</span>}
                    {entry.marketCondition && <span>• {entry.marketCondition}</span>}
                  </div>
                )}

                {entry.notes && (
                  <p className="text-sm text-muted-foreground">{entry.notes}</p>
                )}

                {entry.lessonsLearned && (
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300">💡 {entry.lessonsLearned}</p>
                  </div>
                )}

                {entry.aiInsight && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Brain className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary">AI Insight</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{entry.aiInsight}</p>
                  </div>
                )}

                {entry.tags && (
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.split(',').filter(Boolean).map((tag: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0">
                        {tag.trim()}
                      </Badge>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground/50">
                  {new Date(entry.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
