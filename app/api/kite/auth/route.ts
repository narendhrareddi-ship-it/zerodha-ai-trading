export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateSession, getKiteLoginUrl, getPlatformKiteCredentials } from '@/lib/kite';
import { prisma } from '@/lib/db';
import { logTradingEvent } from '@/lib/trading-engine';


export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = (session.user as any)?.id;
  const { searchParams } = new URL(request.url);
  const requestToken = searchParams.get('request_token');

  // Use platform-level Kite credentials (owner's single subscription)
  const { apiKey, apiSecret } = getPlatformKiteCredentials();

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Platform Kite API credentials not configured. Please contact the admin.' }, { status: 500 });
  }

  if (requestToken) {
    try {
      const kiteSession = await generateSession(requestToken, apiKey, apiSecret);
      const accessToken = kiteSession?.data?.access_token;
      if (!accessToken) throw new Error('No access token received');

      const expiresAt = new Date();
      expiresAt.setHours(23, 59, 59, 999);

      await prisma.kiteToken.create({
        data: {
          userId,
          accessToken,
          requestToken,
          expiresAt,
        },
      });

      await logTradingEvent('INFO', 'KITE_AUTH', `Kite authentication successful for user ${userId}`);
      return NextResponse.json({ success: true, message: 'Kite connected successfully' });
    } catch (err: any) {
      await logTradingEvent('ERROR', 'KITE_AUTH', `Auth failed: ${err?.message ?? 'Unknown'}`);
      return NextResponse.json({ error: err?.message ?? 'Authentication failed' }, { status: 400 });
    }
  }

  // Build redirect URL to our callback page
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const protocol = request.headers.get('x-forwarded-proto') ?? 'https';
  const baseUrl = process.env.NEXTAUTH_URL ?? `${protocol}://${host}`;
  const redirectUrl = `${baseUrl}/kite/callback`;
  return NextResponse.json({ loginUrl: getKiteLoginUrl(apiKey, redirectUrl) });
}
