const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('\n=== RECURRING SLOTS ===');
    const slots = await prisma.streamSlot.findMany({
      where: {
        OR: [
          { hourly: true },
          { daily: true },
          { weekly: true }
        ]
      }
    });

    if (slots.length === 0) {
      console.log('No recurring slots found.');
    } else {
      slots.forEach(s => {
        console.log(`Slot #${s.slotIndex + 1} (${s.channelName || 'No Name'}):`);
        console.log(`  isRunning: ${s.isRunning}`);
        console.log(`  isScheduled: ${s.isScheduled}`);
        console.log(`  schedStart: "${s.schedStart}"`);
        console.log(`  schedStop: "${s.schedStop}"`);
        console.log(`  nextRunTime: "${s.nextRunTime}"`);
        console.log(`  hourly: ${s.hourly}, daily: ${s.daily}, weekly: ${s.weekly}`);
        console.log('---');
      });
    }

    console.log('\n=== RECENT SYSTEM LOGS ===');
    const logs = await prisma.systemLog.findMany({
      take: 40,
      orderBy: { id: 'desc' }
    });

    if (logs.length === 0) {
      console.log('No logs found.');
    } else {
      logs.reverse().forEach(l => {
        console.log(`[${l.timestamp.toISOString()}] ${l.message}`);
      });
    }
  } catch (e) {
    console.error('Error querying DB via Prisma:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
