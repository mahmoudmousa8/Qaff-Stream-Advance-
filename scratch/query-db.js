const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const channels = await prisma.youtubeChannel.findMany();
  console.log('Channels found:', channels.map(c => ({
    id: c.id,
    name: c.name,
    channelId: c.channelId,
    channelTitle: c.channelTitle,
    expiryDate: c.expiryDate
  })));
  
  const slots = await prisma.streamSlot.findMany();
  console.log('Slots count:', slots.length);
  const activeYtSlots = slots.filter(s => s.youtubeChannelId);
  console.log('Slots with YouTube Channel:', activeYtSlots.map(s => ({
    slotIndex: s.slotIndex,
    title: s.youtubeTitle,
    youtubeChannelId: s.youtubeChannelId
  })));
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect());
