const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.streamSlot.count();
  console.log(`Total slots: ${count}`);
  const first5 = await prisma.streamSlot.findMany({
    take: 5,
    orderBy: { slotIndex: 'asc' }
  });
  first5.forEach(s => {
    console.log(`Slot ${s.slotIndex + 1}: name="${s.channelName}" status="${s.status}" running=${s.isRunning} scheduled=${s.isScheduled} manuallyStopped=${s.manuallyStopped} start="${s.schedStart}" stop="${s.schedStop}" nextRun="${s.nextRunTime}" channelId="${s.youtubeChannelId}" key="${s.streamKey ? s.streamKey.substring(0, 8) + '...' : ''}" filePath="${s.filePath}"`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
