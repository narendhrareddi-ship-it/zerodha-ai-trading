export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET: Get current broker config
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  try {
    const config = await prisma.tradingConfig.findUnique({ where: { userId } });
    return NextResponse.json({
      brokerType: config?.brokerType ?? 'kite',
      openalgoHost: config?.openalgoHost ?? 'http://127.0.0.1:5000',
      hasOpenalgoKey: !!(config?.openalgoApiKey),
      hasFyersConfig: !!(config?.fyersAppId && config?.fyersToken),
      fyersAppId: config?.fyersAppId ?? '',
      hasKotakConfig: !!(config?.kotakConsumerKey && config?.kotakToken),
      positionSizing: config?.positionSizing ?? 'half-kelly',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch broker config' }, { status: 500 });
  }
}

// PUT: Update broker config
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;

  try {
    const body = await request.json();
    
    const updateData: any = {};
    if (body?.brokerType !== undefined) updateData.brokerType = body.brokerType;
    if (body?.openalgoApiKey !== undefined) updateData.openalgoApiKey = body.openalgoApiKey;
    if (body?.openalgoHost !== undefined) updateData.openalgoHost = body.openalgoHost;
    if (body?.fyersAppId !== undefined) updateData.fyersAppId = body.fyersAppId;
    if (body?.fyersToken !== undefined) updateData.fyersToken = body.fyersToken;
    if (body?.kotakConsumerKey !== undefined) updateData.kotakConsumerKey = body.kotakConsumerKey;
    if (body?.kotakToken !== undefined) updateData.kotakToken = body.kotakToken;
    if (body?.positionSizing !== undefined) updateData.positionSizing = body.positionSizing;

    const config = await prisma.tradingConfig.update({
      where: { userId },
      data: updateData,
    });

    return NextResponse.json({
      brokerType: config.brokerType,
      openalgoHost: config.openalgoHost,
      hasOpenalgoKey: !!(config.openalgoApiKey),
      hasFyersConfig: !!(config.fyersAppId && config.fyersToken),
      fyersAppId: config.fyersAppId ?? '',
      hasKotakConfig: !!(config.kotakConsumerKey && config.kotakToken),
      positionSizing: config.positionSizing,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to update broker config' }, { status: 500 });
  }
}
