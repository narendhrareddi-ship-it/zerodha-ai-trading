'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { DashboardHeader } from './dashboard-header';
import { StatusCards } from './status-cards';
import { BotControls } from './bot-controls';
import { PositionsTable } from './positions-table';
import { TradeHistory } from './trade-history';
import { StrategyPanel } from './strategy-panel';
import { LogsViewer } from './logs-viewer';
import { AiAnalysis } from './ai-analysis';
import { KiteConnect } from './kite-connect';
import { ConfigPanel } from './config-panel';
import { BacktestPanel } from './backtest-panel';
import { TelegramSettings } from './telegram-settings';
import { AnalyticsPanel } from './analytics-panel';
import { NewsFeed } from './news-feed';
import { WatchlistPanel } from './watchlist-panel';
import { TradeJournal } from './trade-journal';
import { BrokerSettings } from './broker-settings';
import AgentsPanel from './agents-panel';
import MonteCarloPanel from './monte-carlo-panel';
import OptionsIntelPanel from './options-intel-panel';
import MarketBreadthPanel from './market-breadth-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Container } from '@/components/layouts/container';
import { FadeIn } from '@/components/ui/animate';

// Auto-scan interval when bot is running (120s default, overrideable in config)
const DEFAULT_SCAN_INTERVAL_MS = 120_000;

export function DashboardClient() {
  const { data: session, status } = useSession() || {};
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [lastScanResult, setLastScanResult] = useState<any>(null);
  const autoScanRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Dashboard data refresh (every 10s) ──
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/dashboard');
      if (res?.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 10_000);
    return () => clearInterval(interval);
  }, [fetchDashboard, refreshKey]);

  // ── Autonomous scan execution ──
  const runScan = useCallback(async (silent = false) => {
    if (scanning) return;
    if (!silent) toast.info('🔍 Scanning markets with AI pipeline...');
    setScanning(true);
    try {
      const res = await fetch('/api/trading/scan', { method: 'POST' });
      const data = await res.json();
      setLastScanTime(new Date());
      setLastScanResult(data);

      if (res.ok) {
        const executed = data?.executed?.length ?? 0;
        const closed = data?.closed?.length ?? 0;
        const signals = data?.signals?.length ?? 0;
        const regime = data?.regime?.regime ?? '';

        if (!silent || executed > 0 || closed > 0) {
          const msg = [
            signals > 0 ? `${signals} signals` : null,
            executed > 0 ? `${executed} executed` : null,
            closed > 0 ? `${closed} closed` : null,
            regime ? `Regime: ${regime}` : null,
          ].filter(Boolean).join(' · ');
          toast.success(`Scan complete: ${msg || 'No signals'}`);
        }

        setRefreshKey(k => k + 1);
      } else {
        if (!silent) toast.error(data?.error ?? data?.message ?? 'Scan failed');
      }
    } catch (err: any) {
      if (!silent) toast.error(err?.message ?? 'Scan error');
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  // ── Auto-scan loop when bot is RUNNING ──
  useEffect(() => {
    const botRunning = dashboardData?.botStatus === 'RUNNING';
    const isMarketOpen = dashboardData?.isMarketOpen ?? false;
    const scanIntervalSec = 120; // TODO: pull from config once dashboard exposes it

    if (autoScanRef.current) {
      clearInterval(autoScanRef.current);
      autoScanRef.current = null;
    }

    if (botRunning && isMarketOpen) {
      // Run immediately, then on interval
      runScan(true);
      autoScanRef.current = setInterval(() => runScan(true), scanIntervalSec * 1000);
    }

    return () => {
      if (autoScanRef.current) clearInterval(autoScanRef.current);
    };
  }, [dashboardData?.botStatus, dashboardData?.isMarketOpen]);

  // ── Bot actions ──
  const handleBotAction = async (action: string) => {
    try {
      const res = await fetch('/api/trading/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res?.ok) {
        if (action === 'start') {
          toast.success(`🚀 ${data?.message ?? 'Bot started'}`);
        } else {
          toast.success(data?.message ?? `Bot ${action}ed`);
        }
        setRefreshKey(k => k + 1);
      } else {
        toast.error(data?.error ?? 'Action failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Action failed');
    }
  };

  const handleExitAll = async () => {
    try {
      const res = await fetch('/api/trading/exit-all', { method: 'POST' });
      const data = await res.json();
      if (res?.ok) {
        toast.success(data?.message ?? 'All positions closed');
        setRefreshKey(k => k + 1);
      } else {
        toast.error(data?.error ?? 'Exit failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Exit failed');
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground font-mono text-sm">Initializing AI Trading System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        userName={(session?.user as any)?.name ?? 'Trader'}
        botStatus={dashboardData?.botStatus ?? 'STOPPED'}
        isMarketOpen={dashboardData?.isMarketOpen ?? false}
        onSignOut={() => signOut({ callbackUrl: '/auth/login' })}
      />

      <Container size="xl">
        <div className="py-6 space-y-6">
          {/* Kill-switch / portfolio risk alerts */}
          {dashboardData?.drawdown?.triggered && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
              dashboardData.drawdown.level >= 3
                ? 'bg-red-500/10 border-red-500/40 text-red-400'
                : dashboardData.drawdown.level >= 2
                ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
            }`}>
              <span>⚠️</span>
              <span>Kill-Switch Level {dashboardData.drawdown.level}: {dashboardData.drawdown.reason}</span>
            </div>
          )}

          <FadeIn>
            <StatusCards
              dailyPnl={dashboardData?.dailyPnl ?? 0}
              openPositions={dashboardData?.openPositions ?? 0}
              totalTrades={dashboardData?.totalTrades ?? 0}
              winRate={dashboardData?.winRate ?? 0}
              capital={dashboardData?.capital ?? 10000}
              maxDailyLoss={dashboardData?.maxDailyLoss ?? 500}
            />
          </FadeIn>

          <FadeIn delay={0.1}>
            <BotControls
              botStatus={dashboardData?.botStatus ?? 'STOPPED'}
              onStart={() => handleBotAction('start')}
              onStop={() => handleBotAction('stop')}
              onExitAll={handleExitAll}
              onScan={() => runScan(false)}
            />
          </FadeIn>

          {/* Auto-scan status indicator */}
          {dashboardData?.botStatus === 'RUNNING' && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className={`w-2 h-2 rounded-full ${scanning ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span>
                {scanning ? 'AI scan in progress...' : `Auto-scanning every 2 min${lastScanTime ? ` · Last: ${lastScanTime.toLocaleTimeString()}` : ''}`}
              </span>
              {lastScanResult?.regime?.regime && (
                <span className="ml-2 px-2 py-0.5 bg-gray-800 rounded-full text-gray-400">
                  Regime: {lastScanResult.regime.regime}
                </span>
              )}
              {lastScanResult?.risk?.portfolioHeat !== undefined && (
                <span className="px-2 py-0.5 bg-gray-800 rounded-full text-gray-400">
                  Heat: {lastScanResult.risk.portfolioHeat?.toFixed(1)}%
                </span>
              )}
            </div>
          )}

          <FadeIn delay={0.2}>
            <Tabs defaultValue="agents" className="w-full">
              <TabsList className="flex w-full overflow-x-auto">
                <TabsTrigger value="agents">🤖 Agents</TabsTrigger>
                <TabsTrigger value="intelligence">🧠 Intelligence</TabsTrigger>
                <TabsTrigger value="positions">Positions</TabsTrigger>
                <TabsTrigger value="trades">Trades</TabsTrigger>
                <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
                <TabsTrigger value="news">News</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="strategies">Strategies</TabsTrigger>
                <TabsTrigger value="backtest">Backtest</TabsTrigger>
                <TabsTrigger value="ai">AI Analysis</TabsTrigger>
                <TabsTrigger value="journal">Journal</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              {/* Phase 9 — Agent Pipeline Tab */}
              <TabsContent value="agents" className="mt-4">
                <AgentsPanel marketData={dashboardData?.marketSnapshot ?? []} />
              </TabsContent>

              {/* Phase 7/8 — Intelligence Tab */}
              <TabsContent value="intelligence" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-1 space-y-5">
                    <MarketBreadthPanel marketData={dashboardData?.marketSnapshot ?? []} />
                    <OptionsIntelPanel spotPrice={dashboardData?.niftyPrice ?? 22000} />
                  </div>
                  <div className="lg:col-span-2">
                    <MonteCarloPanel />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="positions" className="mt-4">
                <PositionsTable positions={dashboardData?.positions ?? []} />
              </TabsContent>

              <TabsContent value="trades" className="mt-4">
                <TradeHistory trades={dashboardData?.recentTrades ?? []} />
              </TabsContent>

              <TabsContent value="strategies" className="mt-4">
                <StrategyPanel strategies={dashboardData?.strategies ?? []} />
              </TabsContent>

              <TabsContent value="backtest" className="mt-4">
                <BacktestPanel />
              </TabsContent>

              <TabsContent value="watchlist" className="mt-4">
                <WatchlistPanel />
              </TabsContent>

              <TabsContent value="news" className="mt-4">
                <NewsFeed />
              </TabsContent>

              <TabsContent value="analytics" className="mt-4">
                <AnalyticsPanel />
              </TabsContent>

              <TabsContent value="ai" className="mt-4">
                <AiAnalysis />
              </TabsContent>

              <TabsContent value="journal" className="mt-4">
                <TradeJournal />
              </TabsContent>

              <TabsContent value="logs" className="mt-4">
                <LogsViewer />
              </TabsContent>

              <TabsContent value="settings" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <KiteConnect />
                  <ConfigPanel />
                  <TelegramSettings />
                </div>
                <div className="mt-6">
                  <BrokerSettings />
                </div>
              </TabsContent>
            </Tabs>
          </FadeIn>
        </div>
      </Container>
    </div>
  );
}
