'use client';

import { useState, useEffect, useCallback, useRef, useMemo, memo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { DashboardHeader } from './dashboard-header';
import { StatusCards } from './status-cards';
import { BotControls } from './bot-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Container } from '@/components/layouts/container';

// ═══════════════════════════════════════════════════════════
// PERFORMANCE: Lazy-load ALL tab panels — only mount when active
// This eliminates 80%+ of unnecessary rendering on initial load
// ═══════════════════════════════════════════════════════════
const PositionsTable = dynamic(() => import('./positions-table').then(m => ({ default: m.PositionsTable })), { ssr: false });
const TradeHistory = dynamic(() => import('./trade-history').then(m => ({ default: m.TradeHistory })), { ssr: false });
const StrategyPanel = dynamic(() => import('./strategy-panel').then(m => ({ default: m.StrategyPanel })), { ssr: false });
const LogsViewer = dynamic(() => import('./logs-viewer').then(m => ({ default: m.LogsViewer })), { ssr: false });
const AiAnalysis = dynamic(() => import('./ai-analysis').then(m => ({ default: m.AiAnalysis })), { ssr: false });
const KiteConnect = dynamic(() => import('./kite-connect').then(m => ({ default: m.KiteConnect })), { ssr: false });
const ConfigPanel = dynamic(() => import('./config-panel').then(m => ({ default: m.ConfigPanel })), { ssr: false });
const BacktestPanel = dynamic(() => import('./backtest-panel').then(m => ({ default: m.BacktestPanel })), { ssr: false });
const TelegramSettings = dynamic(() => import('./telegram-settings').then(m => ({ default: m.TelegramSettings })), { ssr: false });
const AnalyticsPanel = dynamic(() => import('./analytics-panel').then(m => ({ default: m.AnalyticsPanel })), { ssr: false });
const NewsFeed = dynamic(() => import('./news-feed').then(m => ({ default: m.NewsFeed })), { ssr: false });
const WatchlistPanel = dynamic(() => import('./watchlist-panel').then(m => ({ default: m.WatchlistPanel })), { ssr: false });
const TradeJournal = dynamic(() => import('./trade-journal').then(m => ({ default: m.TradeJournal })), { ssr: false });
const BrokerSettings = dynamic(() => import('./broker-settings').then(m => ({ default: m.BrokerSettings })), { ssr: false });
import { MarketIndicesPanel } from './market-indices-panel';
const AgentsPanel = dynamic(() => import('./agents-panel'), { ssr: false });
const MonteCarloPanel = dynamic(() => import('./monte-carlo-panel'), { ssr: false });
const OptionsIntelPanel = dynamic(() => import('./options-intel-panel'), { ssr: false });
const MarketBreadthPanel = dynamic(() => import('./market-breadth-panel'), { ssr: false });

// ═══════════════════════════════════════════════════════════
// PERFORMANCE: Lightweight loading spinner for lazy panels
// ═══════════════════════════════════════════════════════════
const PanelLoader = memo(function PanelLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
});

// Auto-scan interval when bot is running (30s)
const DEFAULT_SCAN_INTERVAL_MS = 30_000;

export function DashboardClient() {
  const { data: session, status } = useSession() || {};
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [lastScanResult, setLastScanResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('agents');
  const autoScanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dashboardDataRef = useRef<any>(null); // avoid stale closures

  const [indicesHistory, setIndicesHistory] = useState<{ time: string; nifty: number; bse: number }[]>([]);

  useEffect(() => {
    if (dashboardData?.indices?.nifty) {
      setIndicesHistory(prev => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (prev.length > 0 && prev[prev.length - 1].time === time) return prev;
        const next = [...prev, {
          time,
          nifty: dashboardData.indices.nifty,
          bse: dashboardData.indices.bse,
        }];
        return next.slice(-30);
      });
    }
  }, [dashboardData]);

  // ═══════════════════════════════════════════════════════════
  // PERFORMANCE: Dashboard data refresh with delta detection
  // Only triggers re-render when data actually changes
  // ═══════════════════════════════════════════════════════════
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/trading/dashboard');
      if (res?.ok) {
        const data = await res.json();
        // PERF: Only update state if data meaningfully changed
        const prev = dashboardDataRef.current;
        const changed =
          !prev ||
          prev.dailyPnl !== data.dailyPnl ||
          prev.openPositions !== data.openPositions ||
          prev.totalTrades !== data.totalTrades ||
          prev.botStatus !== data.botStatus ||
          prev.winRate !== data.winRate ||
          prev.indices?.nifty !== data.indices?.nifty ||
          prev.indices?.bse !== data.indices?.bse;
        if (changed) {
          dashboardDataRef.current = data;
          setDashboardData(data);
        }
      }
    } catch (err: any) {
      console.error('Dashboard fetch error:', err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    // PERF: Refresh every 15s instead of 10s to reduce re-renders
    const interval = setInterval(fetchDashboard, 15_000);
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

    if (autoScanRef.current) {
      clearInterval(autoScanRef.current);
      autoScanRef.current = null;
    }

    if (botRunning) {
      runScan(true);
      autoScanRef.current = setInterval(() => runScan(true), DEFAULT_SCAN_INTERVAL_MS);
    }

    return () => {
      if (autoScanRef.current) clearInterval(autoScanRef.current);
    };
  }, [dashboardData?.botStatus]);

  // ── Bot actions ──
  const handleBotAction = useCallback(async (action: string) => {
    try {
      const res = await fetch('/api/trading/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res?.ok) {
        toast.success(action === 'start' ? `🚀 ${data?.message ?? 'Bot started'}` : (data?.message ?? `Bot ${action}ed`));
        setRefreshKey(k => k + 1);
      } else {
        toast.error(data?.error ?? 'Action failed');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Action failed');
    }
  }, []);

  const handleExitAll = useCallback(async () => {
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
  }, []);

  // ═══════════════════════════════════════════════════════════
  // PERFORMANCE: Memoize derived props to avoid re-creating objects
  // ═══════════════════════════════════════════════════════════
  const statusCardsProps = useMemo(() => ({
    dailyPnl: dashboardData?.dailyPnl ?? 0,
    openPositions: dashboardData?.openPositions ?? 0,
    totalTrades: dashboardData?.totalTrades ?? 0,
    winRate: dashboardData?.winRate ?? 0,
    capital: dashboardData?.capital ?? 10000,
    maxDailyLoss: dashboardData?.maxDailyLoss ?? 500,
  }), [dashboardData?.dailyPnl, dashboardData?.openPositions, dashboardData?.totalTrades, dashboardData?.winRate, dashboardData?.capital, dashboardData?.maxDailyLoss]);

  const botControlsProps = useMemo(() => ({
    botStatus: dashboardData?.botStatus ?? 'STOPPED',
    onStart: () => handleBotAction('start'),
    onStop: () => handleBotAction('stop'),
    onExitAll: handleExitAll,
    onScan: () => runScan(false),
  }), [dashboardData?.botStatus, handleBotAction, handleExitAll, runScan]);

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

          <StatusCards {...statusCardsProps} />

          <MarketIndicesPanel
            history={indicesHistory}
            niftyPrice={dashboardData?.indices?.nifty}
            bsePrice={dashboardData?.indices?.bse}
            niftyChange={dashboardData?.indices?.niftyChange}
            bseChange={dashboardData?.indices?.bseChange}
          />

          <BotControls {...botControlsProps} />

          {/* J.A.R.V.I.S. Quantum Telemetry Card */}
          <div className={`relative overflow-hidden border rounded-xl backdrop-blur-md transition-all duration-300 ${
            dashboardData?.botStatus === 'RUNNING' 
              ? 'border-cyan-500/30 bg-[#061226]/40 glow-cyan' 
              : 'border-border bg-card/40'
          }`}>
            <div className="absolute inset-0 cyber-grid opacity-[0.08] pointer-events-none" />
            <div className="p-4 flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
              
              {/* Telemetry Left: Core Status */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex items-center justify-center w-8 h-8">
                  <div className={`absolute w-full h-full rounded-full border border-cyan-400/30 ${scanning ? 'animate-spin' : 'animate-pulse'}`} />
                  <div className={`w-3.5 h-3.5 rounded-full ${
                    scanning 
                      ? 'bg-amber-400 animate-pulse shadow-[0_0_8px_#f59e0b]' 
                      : dashboardData?.botStatus === 'RUNNING' 
                      ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' 
                      : 'bg-rose-400 shadow-[0_0_8px_#f43f5e]'
                  }`} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-mono tracking-widest text-muted-foreground uppercase">Synapse Pipeline Feed</span>
                  <span className="text-xs font-mono font-bold text-gray-200">
                    {scanning 
                      ? 'INTERROGATING QUANT QUOTES...' 
                      : dashboardData?.botStatus === 'RUNNING' 
                      ? `INTELLIGENCE ROUTING ENGINE: ACTIVE [Awaiting 30s Poll]`
                      : 'INTELLIGENCE ROUTING ENGINE: STANDBY'}
                  </span>
                </div>
              </div>

              {/* Telemetry Right: Live Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto text-[10px] font-mono">
                {/* Active Regime */}
                <div className="flex flex-col border-l border-cyan-500/20 pl-3">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-widest">Market Regime</span>
                  <span className={`font-bold uppercase tracking-wider ${
                    lastScanResult?.regime?.regime === 'TRENDING_UP' 
                      ? 'text-emerald-400' 
                      : lastScanResult?.regime?.regime === 'TRENDING_DOWN' 
                      ? 'text-rose-400' 
                      : lastScanResult?.regime?.regime === 'VOLATILE'
                      ? 'text-amber-400'
                      : 'text-cyan-400'
                  }`}>
                    {lastScanResult?.regime?.regime ?? 'AWAITING SCAN'}
                  </span>
                </div>

                {/* Portfolio Heat */}
                <div className="flex flex-col border-l border-cyan-500/20 pl-3">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-widest">Portfolio Heat</span>
                  <span className="text-cyan-300 font-bold">
                    {lastScanResult?.risk?.portfolioHeat !== undefined 
                      ? `${lastScanResult.risk.portfolioHeat.toFixed(1)}%` 
                      : '0.0%'}
                  </span>
                </div>

                {/* Ensemble Threshold */}
                <div className="flex flex-col border-l border-cyan-500/20 pl-3">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-widest">Ensemble gate</span>
                  <span className="text-violet-400 font-bold">
                    {dashboardData?.botStatus === 'RUNNING' ? '2/3 VOTE MIN' : 'OFFLINE'}
                  </span>
                </div>

                {/* Last Refresh */}
                <div className="flex flex-col border-l border-cyan-500/20 pl-3">
                  <span className="text-[8px] text-muted-foreground uppercase tracking-widest">Last Update</span>
                  <span className="text-amber-400 font-bold">
                    {lastScanTime ? lastScanTime.toLocaleTimeString() : 'NEVER'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Ticker scanner bar */}
            {scanning && (
              <div className="h-[1px] w-full bg-cyan-400 animate-pulse-green glow-cyan" />
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════
              PERFORMANCE: Only render the ACTIVE tab's content.
              forceMount is NOT used — inactive tabs are unmounted.
              ═══════════════════════════════════════════════════════ */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full overflow-x-auto scrollbar-hide">
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

            <TabsContent value="agents" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <AgentsPanel marketData={dashboardData?.marketSnapshot ?? []} />
              </Suspense>
            </TabsContent>

            <TabsContent value="intelligence" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-1 space-y-5">
                    <MarketBreadthPanel marketData={dashboardData?.marketSnapshot ?? []} />
                    <OptionsIntelPanel spotPrice={dashboardData?.niftyPrice ?? 22000} />
                  </div>
                  <div className="lg:col-span-2">
                    <MonteCarloPanel />
                  </div>
                </div>
              </Suspense>
            </TabsContent>

            <TabsContent value="positions" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <PositionsTable positions={dashboardData?.positions ?? []} />
              </Suspense>
            </TabsContent>

            <TabsContent value="trades" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <TradeHistory trades={dashboardData?.recentTrades ?? []} />
              </Suspense>
            </TabsContent>

            <TabsContent value="strategies" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <StrategyPanel strategies={dashboardData?.strategies ?? []} />
              </Suspense>
            </TabsContent>

            <TabsContent value="backtest" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <BacktestPanel />
              </Suspense>
            </TabsContent>

            <TabsContent value="watchlist" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <WatchlistPanel />
              </Suspense>
            </TabsContent>

            <TabsContent value="news" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <NewsFeed />
              </Suspense>
            </TabsContent>

            <TabsContent value="analytics" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <AnalyticsPanel />
              </Suspense>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <AiAnalysis />
              </Suspense>
            </TabsContent>

            <TabsContent value="journal" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <TradeJournal />
              </Suspense>
            </TabsContent>

            <TabsContent value="logs" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <LogsViewer />
              </Suspense>
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
              <Suspense fallback={<PanelLoader />}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <KiteConnect />
                  <ConfigPanel />
                  <TelegramSettings />
                </div>
                <div className="mt-6">
                  <BrokerSettings />
                </div>
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </Container>
    </div>
  );
}
