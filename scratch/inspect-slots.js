import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const slots = await prisma.streamSlot.findMany({
    where: {
      OR: [
        { isScheduled: true },
        { isRunning: true },
        { status: { not: 'Stopped' } },
        { schedStart: { not: '' } },
        { filePath: { not: '' } },
        { streamKey: { not: '' } }
      ]
    }
  })
  console.log('Active slots:', JSON.stringify(slots, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
