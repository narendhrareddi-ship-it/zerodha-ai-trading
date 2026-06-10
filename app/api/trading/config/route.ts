export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  const config = await prisma.tradingConfig.findUnique({ where: { userId } });
  return NextResponse.json(config ?? {});
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any)?.id;
  if (!userId) return NextResponse.json({ error: 'User ID not found' }, { status: 401 });

  try {
    const body = await request.json();
    const config = await prisma.tradingConfig.upsert({
      where: { userId },
      update: {
        maxDailyLoss: body?.maxDailyLoss ?? 500,
        maxPositions: body?.maxPositions ?? 3,
        capitalAmount: body?.capitalAmount ?? 10000,
        squareOffTime: body?.squareOffTime ?? '15:10',
        enableEquity: body?.enableEquity ?? true,
        enableFnO: body?.enableFnO ?? true,
        scanInterval: body?.scanInterval ?? 120,
        enableMomentum: body?.enableMomentum ?? true,
        enableRSI: body?.enableRSI ?? true,
        enableNewsSentiment: body?.enableNewsSentiment ?? true,
        enableMACD: body?.enableMACD ?? true,
        enableBollinger: body?.enableBollinger ?? true,
        enableSupertrend: body?.enableSupertrend ?? true,
        enableVWAP: body?.enableVWAP ?? true,
        enableEMACross: body?.enableEMACross ?? true,
        stopLossPercent: body?.stopLossPercent ?? 1.0,
        targetPercent: body?.targetPercent ?? 2.0,
        ...(body?.brokerType !== undefined ? { brokerType: body.brokerType } : {}),
        ...(body?.positionSizing !== undefined ? { positionSizing: body.positionSizing } : {}),
        ...(body?.openalgoApiKey !== undefined ? { openalgoApiKey: body.openalgoApiKey } : {}),
        ...(body?.openalgoHost !== undefined ? { openalgoHost: body.openalgoHost } : {}),
        ...(body?.fyersAppId !== undefined ? { fyersAppId: body.fyersAppId } : {}),
        ...(body?.fyersToken !== undefined ? { fyersToken: body.fyersToken } : {}),
        ...(body?.kotakConsumerKey !== undefined ? { kotakConsumerKey: body.kotakConsumerKey } : {}),
        ...(body?.kotakToken !== undefined ? { kotakToken: body.kotakToken } : {}),
      },
      create: {
        userId,
        maxDailyLoss: body?.maxDailyLoss ?? 500,
        maxPositions: body?.maxPositions ?? 3,
        capitalAmount: body?.capitalAmount ?? 10000,
      },
    });

    return NextResponse.json(config);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to update config' }, { status: 500 });
  }
}
