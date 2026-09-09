import { db } from '../src/lib/db'
import { refreshAccessToken } from '../src/lib/youtube-helper'
import fs from 'fs'

async function testThumbnail() {
  const channel = await db.youtubeChannel.findFirst({
    where: { name: { contains: 'English 47' } }
  })
  if (!channel) {
    console.log('Channel English 47 not found')
    return
  }
  console.log(`Testing channel: ${channel.name}, channelId: ${channel.channelId}, DB id: ${channel.id}`)

  const accessToken = await refreshAccessToken(channel.id)

  // Check recent broadcast for this channel in DB
  const slot = await db.streamSlot.findFirst({
    where: {
      youtubeChannelId: channel.id,
      youtubeBroadcastId: { not: '' }
    }
  })

  console.log(`Sample Slot with broadcastId: ${slot?.slotIndex}, broadcastId: ${slot?.youtubeBroadcastId}`)

  if (!slot?.youtubeBroadcastId) {
    console.log('No active broadcastId found on English 47 slots')
    return
  }

  // Check the broadcast on YouTube
  const bcUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${slot.youtubeBroadcastId}&part=snippet,status,contentDetails`
  const bcRes = await fetch(bcUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  const bcData = await bcRes.json()
  console.log('Broadcast fetch status:', bcRes.status)
  if (bcData.items && bcData.items[0]) {
    console.log('Broadcast thumbnails in snippet:', JSON.stringify(bcData.items[0].snippet.thumbnails, null, 2))
  } else {
    console.log('Broadcast data:', bcData)
  }

  // Let's test uploading a thumbnail to this broadcast
  const testThumbPath = '/var/lib/qaff-stream/videos/English 47/يس/يس 1  (47).png'
  if (fs.existsSync(testThumbPath)) {
    const buf = fs.readFileSync(testThumbPath)
    console.log(`Uploading test thumbnail (${buf.length} bytes) to broadcast ${slot.youtubeBroadcastId}...`)
    const thumbUrl = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${slot.youtubeBroadcastId}`
    const thumbRes = await fetch(thumbUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'image/png',
        'Content-Length': buf.length.toString()
      },
      body: buf
    })
    console.log('Thumbnail API HTTP status:', thumbRes.status)
    const thumbText = await thumbRes.text()
    console.log('Thumbnail API Response:', thumbText)
  } else {
    console.log('Test thumb path does not exist:', testThumbPath)
  }
}

testThumbnail().catch(console.error)
