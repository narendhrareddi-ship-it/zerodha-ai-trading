// ============================================================
// SCAN ENDPOINT — Autonomous Trading Bot Controller
// Database: Supabase PostgreSQL via Prisma
// ============================================================
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runScanForUser } from '@/lib/scan-pipeline';

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const authHeader = request.headers.get('authorization');
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (isCron) {
      // Find all users with RUNNING bots
      const activeSessions = await prisma.botSession.findMany({
        where: { status: 'RUNNING' },
        select: { userId: true },
      });
      const userIds = Array.from(new Set(activeSessions.map(s => s.userId)));

      if (userIds.length === 0) {
        return NextResponse.json({ message: 'No active bot sessions to scan.', scannedUsersCount: 0, results: [] });
      }

      const scanPromises = userIds.map(async (uid) => {
        try {
          const scanData = await runScanForUser(uid, Date.now());
          return { userId: uid, status: 200, summary: scanData };
        } catch (err: any) {
          return { userId: uid, status: 500, error: err?.message };
        }
      });
      const results = await Promise.all(scanPromises);

      return NextResponse.json({ isCron: true, scannedUsersCount: userIds.length, results });
    }

    // Normal browser request
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = (session.user as any)?.id;
    if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

    const scanData = await runScanForUser(userId, startTime);
    return NextResponse.json(scanData);
  } catch (err: any) {
    console.error('Scan route handler error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
