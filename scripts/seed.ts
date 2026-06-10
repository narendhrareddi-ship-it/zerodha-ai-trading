import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create test user
  const hashedPassword = await bcrypt.hash('johndoe123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      name: 'Admin Trader',
      password: hashedPassword,
      role: 'admin',
    },
  });

  // Create default trading config
  await prisma.tradingConfig.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      maxDailyLoss: 500,
      maxPositions: 3,
      capitalAmount: 10000,
      squareOffTime: '15:10',
      enableEquity: true,
      enableFnO: true,
      scanInterval: 120,
      enableMomentum: true,
      enableRSI: true,
      enableNewsSentiment: true,
      stopLossPercent: 1.0,
      targetPercent: 2.0,
    },
  });

  // Seed some sample daily PnL data for chart
  const dates = [];
  for (let i = 14; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    dates.push(d);
  }

  for (const date of dates) {
    const pnl = Math.round((Math.random() - 0.3) * 300);
    const tradesCount = Math.floor(Math.random() * 5) + 1;
    const winCount = Math.floor(Math.random() * tradesCount);
    await prisma.dailyPnl.upsert({
      where: { date },
      update: {
        totalPnl: pnl,
        tradesCount,
        winCount,
        lossCount: tradesCount - winCount,
      },
      create: {
        date,
        totalPnl: pnl,
        tradesCount,
        winCount,
        lossCount: tradesCount - winCount,
      },
    });
  }

  // Seed initial log entry
  await prisma.tradingLog.create({
    data: {
      level: 'INFO',
      source: 'SYSTEM',
      message: 'Trading system initialized. Welcome to ZerodhaAI!',
    },
  });

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
