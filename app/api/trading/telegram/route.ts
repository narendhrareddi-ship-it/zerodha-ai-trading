export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifyTelegramChatId, getRecentChatId } from '@/lib/telegram';

// GET - fetch latest chat ID from bot updates (helper for user)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const chatId = await getRecentChatId();
    return NextResponse.json({ chatId: chatId ?? null });
  } catch (err: any) {
    console.error('Telegram GET error:', err?.message);
    return NextResponse.json({ error: 'Failed to get chat ID' }, { status: 500 });
  }
}

// POST - verify & save chat ID, or test notification
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any)?.id;
    const body = await req.json();
    const { action, chatId } = body ?? {};

    if (action === 'verify') {
      if (!chatId) {
        return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
      }
      const success = await verifyTelegramChatId(chatId);
      if (success) {
        // Save to config
        await prisma.tradingConfig.updateMany({
          where: { userId },
          data: { telegramChatId: chatId, enableTelegram: true },
        });
        return NextResponse.json({ success: true, message: 'Telegram connected! Check your bot for a confirmation message.' });
      } else {
        return NextResponse.json({ error: 'Failed to send test message. Make sure you started a chat with the bot and the Chat ID is correct.' }, { status: 400 });
      }
    }

    if (action === 'disconnect') {
      await prisma.tradingConfig.updateMany({
        where: { userId },
        data: { telegramChatId: '', enableTelegram: false },
      });
      return NextResponse.json({ success: true, message: 'Telegram disconnected' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Telegram POST error:', err?.message);
    return NextResponse.json({ error: 'Telegram operation failed' }, { status: 500 });
  }
}
