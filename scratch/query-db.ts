import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  console.log('--- Users ---')
  console.log(users)

  const slots = await prisma.streamSlot.findMany({
    take: 5
  })
  console.log('--- Slots (first 5) ---')
  console.log(slots)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
