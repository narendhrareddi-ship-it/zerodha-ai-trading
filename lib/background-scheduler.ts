// ============================================================
// BACKGROUND SCHEDULER — Persistent Autonomous Server Scanning
// Database: Supabase PostgreSQL via Prisma
// ============================================================

import { prisma } from './db';
import { runScanForUser } from './scan-pipeline';

let schedulerInterval: NodeJS.Timeout | null = null;
const activeScans = new Set<string>(); // Thread safety lock map to prevent overlapping runs

export function startBackgroundScheduler() {
  // Prevent duplicate scheduler instantiation
  if (schedulerInterval) {
    console.log('[Background Scheduler] Already running.');
    return;
  }

  console.log('[Background Scheduler] Initializing autonomous background loop...');

  // Query active bots and run scan pipeline at regular intervals
  schedulerInterval = setInterval(async () => {
    try {
      // Find all active bot sessions in the database
      const activeSessions = await prisma.botSession.findMany({
        where: { status: 'RUNNING' },
        select: { userId: true },
      });

      const userIds = Array.from(new Set(activeSessions.map((s) => s.userId)));
      if (userIds.length === 0) return;

      console.log(`[Background Scheduler] Found ${userIds.length} active bot sessions to process.`);

      for (const userId of userIds) {
        if (activeScans.has(userId)) {
          // Skip user if a scan iteration is already running to avoid overlaps
          console.log(`[Background Scheduler] Scan already in progress for user ${userId}. Skipping.`);
          continue;
        }

        activeScans.add(userId);

        // Run the scan asynchronously
        (async () => {
          try {
            console.log(`[Background Scheduler] Triggering scan iteration for user ${userId}`);
            await runScanForUser(userId, Date.now());
          } catch (err: any) {
            console.error(`[Background Scheduler] Scan pipeline error for user ${userId}:`, err?.message);
          } finally {
            activeScans.delete(userId);
          }
        })();
      }
    } catch (err: any) {
      console.error('[Background Scheduler] Cycle execution error:', err?.message);
    }
  }, 120 * 1000); // Trigger every 120 seconds (2 minutes) to align with default scanInterval
}

export function stopBackgroundScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Background Scheduler] Stopped successfully.');
  }
}
