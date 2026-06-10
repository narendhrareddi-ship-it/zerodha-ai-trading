export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserKiteClient, getPlatformKiteCredentials } from '@/lib/kite';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any)?.id;

  try {
    // Check if platform has Kite credentials configured
    const { apiKey } = getPlatformKiteCredentials();
    if (!apiKey) {
      return NextResponse.json({
        connected: false,
        platformConfigured: false,
        message: 'Platform Kite API not configured. Contact admin.',
      });
    }

    const { client } = await getUserKiteClient(userId);

    if (!client) {
      return NextResponse.json({
        connected: false,
        platformConfigured: true,
        message: 'Not connected. Click "Connect to Zerodha" to authenticate.',
      });
    }

    try {
      const profile = await client.getProfile();
      const margins = await client.getMargins();

      return NextResponse.json({
        connected: true,
        platformConfigured: true,
        profile: profile?.data,
        margins: margins?.data,
      });
    } catch {
      return NextResponse.json({
        connected: false,
        platformConfigured: true,
        message: 'Token expired. Please re-authenticate.',
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to check status' }, { status: 500 });
  }
}
