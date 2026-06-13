// ============================================================
// NEXT.JS SERVER INSTRUMENTATION HOOK
// Runs on server start to boot up core background workers
// ============================================================

export async function register() {
  // Only execute scheduler on Node.js server-side, not in Edge runtime
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      console.log('[Instrumentation] Initializing server-start startup hooks...');
      const { startBackgroundScheduler } = await import('./lib/background-scheduler');
      startBackgroundScheduler();
    } catch (err: any) {
      console.error('[Instrumentation] Failed to initialize background scheduler:', err?.message);
    }
  }
}
