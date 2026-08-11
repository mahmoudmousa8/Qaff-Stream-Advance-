import { db } from '../src/lib/db'
import { cleanupUpcomingBroadcasts } from '../src/lib/youtube-helper'

async function main() {
  const channel = await db.youtubeChannel.findFirst({
    where: { name: { contains: 'English 27' } }
  })
  if (!channel) {
    console.log('Channel English 27 not found!')
    return
  }

  console.log(`Running cleanup for channel: ${channel.name} (${channel.id})...`)
  const res = await cleanupUpcomingBroadcasts(channel.id)
  console.log('Cleanup result:', JSON.stringify(res, null, 2))
}

main().finally(() => db.$disconnect())
