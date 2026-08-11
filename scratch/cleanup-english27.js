const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const channels = await prisma.youtubeChannel.findMany()
  console.log('All channels in DB:')
  for (const c of channels) {
    console.log(`- ${c.name} (ID: ${c.id})`)
  }

  const channel = channels.find(c => c.name.includes('27') || c.name.includes('English'))
  if (!channel) {
    console.log('No channel matching 27 / English found')
    return
  }

  console.log(`Running cleanup for channel: ${channel.name} (${channel.id})...`)
  const { cleanupUpcomingBroadcasts } = require('../src/lib/youtube-helper')
  const res = await cleanupUpcomingBroadcasts(channel.id)
  console.log('Cleanup result:', JSON.stringify(res, null, 2))
}

main().finally(() => prisma.$disconnect())
