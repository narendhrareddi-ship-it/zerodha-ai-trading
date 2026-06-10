export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level');
  const take = Math.min(parseInt(searchParams.get('take') ?? '100', 10), 500);

  const where: any = {};
  if (level && level !== 'ALL') where.level = level;

  const logs = await prisma.tradingLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });

  return NextResponse.json(
    logs?.map?.((l: any) => ({
      id: l?.id ?? '',
      level: l?.level ?? 'INFO',
      source: l?.source ?? '',
      message: l?.message ?? '',
      data: l?.data ?? null,
      createdAt: l?.createdAt?.toISOString?.() ?? '',
    })) ?? []
  );
}
