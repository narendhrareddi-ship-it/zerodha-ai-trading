'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brain, Send, Loader2 } from 'lucide-react';

export function AiAnalysis() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleAnalyze = async () => {
    if (!query?.trim?.()) return;
    setLoading(true);
    setResponse('');

    try {
      abortRef.current = new AbortController();
      const res = await fetch('/api/trading/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: abortRef.current.signal,
      });

      if (!res?.ok) {
        const data = await res?.json?.().catch(() => ({}));
        setResponse(`Error: ${data?.error ?? 'Analysis failed'}`);
        return;
      }

      const reader = res?.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let partialRead = '';

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        partialRead += decoder.decode(value, { stream: true });
        const lines = partialRead.split('\n');
        partialRead = lines?.pop?.() ?? '';
        for (const line of (lines ?? [])) {
          if (line?.startsWith?.('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              const content = parsed?.choices?.[0]?.delta?.content ?? '';
              if (content) {
                buffer += content;
                setResponse(buffer);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setResponse(`Error: ${err?.message ?? 'Analysis failed'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Brain className="w-5 h-5 text-primary" />
          AI Market Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask about market conditions, stock analysis, or trading strategy..."
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleAnalyze()}
            className="flex-1"
          />
          <Button onClick={handleAnalyze} disabled={loading || !query?.trim?.()} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Analyze
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            'Analyze NIFTY trend today',
            'Best intraday stocks for momentum?',
            'Banking sector outlook',
            'Risk of shorting IT stocks',
          ].map((suggestion: string) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="text-xs h-8 whitespace-nowrap overflow-hidden text-ellipsis"
              onClick={() => { setQuery(suggestion); }}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        {response && (
          <ScrollArea className="h-[300px]">
            <div className="prose prose-sm prose-invert max-w-none p-4 rounded-lg bg-muted/30">
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground/80">{response}</pre>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
