const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.systemLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50
  });
  
  logs.forEach(l => {
    if (!l.message.includes('__scheduler_last_run__')) {
      console.log(`[${l.timestamp.toISOString()}] ${l.message}`);
    }
  });
}
main().catch(console.error).finally(() => prisma.$disconnect());
