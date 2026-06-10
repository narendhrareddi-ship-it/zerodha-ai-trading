export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name ?? email?.split?.('@')?.[0] ?? 'User',
        role: 'user',
      },
    });

    // Create default trading config
    await prisma.tradingConfig.create({
      data: {
        userId: user.id,
        maxDailyLoss: 500,
        maxPositions: 3,
        capitalAmount: 10000,
      },
    });

    return NextResponse.json({ message: 'Account created successfully', userId: user.id });
  } catch (error: any) {
    console.error('Signup error:', error);
    return NextResponse.json({ error: error?.message ?? 'Failed to create account' }, { status: 500 });
  }
}
