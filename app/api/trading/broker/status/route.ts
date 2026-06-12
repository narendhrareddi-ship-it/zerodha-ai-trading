export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    if (!config) return NextResponse.json({ connected: false, brokerType: 'kite' });

    const brokerType = config.brokerType ?? 'kite';

    if (brokerType === 'kite') {
      const { getUserKiteClient, getPlatformKiteCredentials } = await import('@/lib/kite');
      const { apiKey } = getPlatformKiteCredentials();
      if (!apiKey) {
        return NextResponse.json({
          brokerType: 'kite',
          connected: false,
          platformConfigured: false,
          message: 'Platform Kite API not configured. Contact admin.',
        });
      }

      const { client } = await getUserKiteClient(userId);
      if (!client) {
        return NextResponse.json({
          brokerType: 'kite',
          connected: false,
          platformConfigured: true,
          message: 'Not connected. Click "Connect to Zerodha" to authenticate.',
        });
      }

      try {
        const profile = await client.getProfile();
        const margins = await client.getMargins();
        return NextResponse.json({
          brokerType: 'kite',
          connected: true,
          platformConfigured: true,
          profileName: profile?.data?.user_name || profile?.data?.user_id || 'Kite User',
          profileId: profile?.data?.user_id || 'N/A',
          availableMargin: margins?.data?.equity?.available?.cash ?? margins?.data?.equity?.net ?? 0,
          usedMargin: margins?.data?.equity?.utilised?.debits ?? 0,
        });
      } catch (err: any) {
        return NextResponse.json({
          brokerType: 'kite',
          connected: false,
          platformConfigured: true,
          message: 'Kite Token expired or invalid. Please re-authenticate.',
        });
      }
    }

    if (brokerType === 'fyers') {
      if (!config.fyersAppId || !config.fyersToken) {
        return NextResponse.json({
          brokerType: 'fyers',
          connected: false,
          message: 'Fyers is not configured. Please input your App ID and Access Token in settings.',
        });
      }

      try {
        const { FyersClient } = await import('@/lib/fyers');
        const fyers = new FyersClient({ appId: config.fyersAppId, accessToken: config.fyersToken });
        const profile = await fyers.getProfile();
        const funds = await fyers.getFunds();

        let availableMargin = 0;
        let usedMargin = 0;

        if (funds?.fund_limit?.length) {
          // Find Total Balance or Available Balance
          const totalBalance = funds.fund_limit.find((item: any) => 
            item?.title?.toLowerCase()?.includes('total') || 
            item?.title?.toLowerCase()?.includes('available') ||
            item?.id === 1 || item?.id === 10
          );
          const utilizedBalance = funds.fund_limit.find((item: any) => 
            item?.title?.toLowerCase()?.includes('realized') ||
            item?.title?.toLowerCase()?.includes('utilized') ||
            item?.id === 2
          );

          availableMargin = totalBalance?.equityAmount ?? funds.fund_limit[0]?.equityAmount ?? 0;
          usedMargin = utilizedBalance?.equityAmount ?? 0;
        }

        return NextResponse.json({
          brokerType: 'fyers',
          connected: true,
          profileName: profile?.data?.name || profile?.data?.fy_id || 'Fyers User',
          profileId: profile?.data?.fy_id || 'N/A',
          availableMargin,
          usedMargin,
        });
      } catch (err: any) {
        return NextResponse.json({
          brokerType: 'fyers',
          connected: false,
          message: `Fyers API error: ${err.message}. Please generate a new access token.`,
        });
      }
    }

    if (brokerType === 'kotak') {
      if (!config.kotakConsumerKey || !config.kotakToken) {
        return NextResponse.json({
          brokerType: 'kotak',
          connected: false,
          message: 'Kotak Neo is not configured.',
        });
      }

      try {
        const { KotakNeoClient } = await import('@/lib/kotak-neo');
        const kotak = new KotakNeoClient({ consumerKey: config.kotakConsumerKey, accessToken: config.kotakToken, sessionToken: config.kotakToken });
        const funds = await kotak.getFunds();
        const availableMargin = funds?.availableLimit ?? funds?.gpayInBalance ?? 0;
        return NextResponse.json({
          brokerType: 'kotak',
          connected: true,
          profileName: 'Kotak Neo Account',
          profileId: 'Kotak User',
          availableMargin,
          usedMargin: funds?.utilisedLimit ?? 0,
        });
      } catch (err: any) {
        return NextResponse.json({
          brokerType: 'kotak',
          connected: false,
          message: `Kotak Neo error: ${err.message}`,
        });
      }
    }

    if (brokerType === 'openalgo') {
      return NextResponse.json({
        brokerType: 'openalgo',
        connected: !!config.openalgoApiKey,
        profileName: 'OpenAlgo Connection',
        profileId: 'OpenAlgo',
        availableMargin: 0,
        usedMargin: 0,
      });
    }

    return NextResponse.json({ connected: false, brokerType });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to check broker status' }, { status: 500 });
  }
}
