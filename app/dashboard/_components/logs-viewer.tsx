'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, RefreshCw, AlertTriangle, Info, AlertCircle, CheckCircle } from 'lucide-react';

interface LogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
}

const levelConfig: Record<string, { icon: any; color: string; bg: string }> = {
  INFO: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  WARN: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  ERROR: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  SUCCESS: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-400/10' },
};

export function LogsViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const url = filter === 'ALL' ? '/api/trading/logs?take=100' : `/api/trading/logs?level=${filter}&take=100`;
      const res = await fetch(url);
      if (res?.ok) {
        const data = await res.json();
        setLogs(data ?? []);
      }
    } catch (err: any) {
      console.error('Logs fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-primary" />
            System Logs
          </CardTitle>
          <div className="flex items-center gap-2">
            {['ALL', 'INFO', 'WARN', 'ERROR'].map((level: string) => (
              <Button
                key={level}
                variant={filter === level ? 'default' : 'outline'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setFilter(level)}
              >
                {level}
              </Button>
            ))}
            <Button variant="ghost" size="icon-sm" onClick={fetchLogs} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {(logs ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No logs available</p>
              <p className="text-sm">System logs will appear here when the bot runs</p>
            </div>
          ) : (
            <div className="space-y-1">
              {(logs ?? []).map((log: LogEntry) => {
                const config = levelConfig[log?.level ?? 'INFO'] ?? levelConfig.INFO;
                const IconComp = config?.icon ?? Info;
                return (
                  <div
                    key={log?.id ?? Math.random()}
                    className="flex items-start gap-2 py-2 px-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center mt-0.5 ${config?.bg ?? ''}`}>
                      <IconComp className={`w-3 h-3 ${config?.color ?? ''}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className="text-[10px] font-mono px-1 py-0">
                          {log?.source ?? ''}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {log?.createdAt ? new Date(log.createdAt).toLocaleTimeString('en-IN') : ''}
                        </span>
                      </div>
                      <p className="text-sm text-foreground/80 break-words">{log?.message ?? ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
