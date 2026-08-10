const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
async function main() {
  const slot27 = await prisma.streamSlot.findUnique({ where: { slotIndex: 26 } })
  console.log(JSON.stringify(slot27, null, 2))
}
main().finally(() => prisma.$disconnect())
