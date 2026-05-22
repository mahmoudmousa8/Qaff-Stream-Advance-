const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Fetching latest system logs...");
  const logs = await prisma.systemLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 30
  });
  console.log("LOGS count:", logs.length);
  logs.forEach(log => {
    console.log(`[${log.timestamp.toISOString()}] ${log.message}`);
  });
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
