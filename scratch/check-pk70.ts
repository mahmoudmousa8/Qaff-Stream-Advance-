import { db } from '../src/lib/db'
import { refreshAccessToken } from '../src/lib/youtube-helper'

async function checkChannel() {
  const channel = await db.youtubeChannel.findFirst({
    where: { name: { contains: 'PK 70' } }
  })
  if (!channel) {
    console.log('Channel PK 70 not found')
    return
  }
  console.log(`Found channel: ${channel.name} (${channel.channelTitle}), DB id: ${channel.id}`)

  const accessToken = await refreshAccessToken(channel.id)
  console.log('Token refreshed successfully.')

  // Fetch all upcoming broadcasts with pagination
  let pageToken = ''
  let allUpcoming: any[] = []
  do {
    const url = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=upcoming&part=id,snippet,status&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const data = await res.json()
    console.log('Upcoming API response status:', res.status, 'items count:', data.items?.length, 'nextPageToken:', data.nextPageToken)
    if (data.items) {
      allUpcoming.push(...data.items)
    }
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  console.log(`Total upcoming broadcasts on PK 70: ${allUpcoming.length}`)
  if (allUpcoming.length > 0) {
    console.log('Sample broadcast:', JSON.stringify(allUpcoming[0], null, 2))
  }
}

checkChannel().catch(console.error)
