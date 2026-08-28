import { db } from '../src/lib/db'
import { refreshAccessToken } from '../src/lib/youtube-helper'

async function cleanPk70() {
  const channel = await db.youtubeChannel.findFirst({
    where: { name: { contains: 'PK 70' } }
  })
  if (!channel) {
    console.log('Channel PK 70 not found')
    return
  }
  console.log(`Cleaning channel: ${channel.name} (${channel.channelTitle}), DB id: ${channel.id}`)

  const accessToken = await refreshAccessToken(channel.id)

  // 1. Fetch upcoming broadcasts (with pagination)
  let pageToken = ''
  let allUpcoming: any[] = []
  do {
    const url = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=upcoming&part=id,snippet,status&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const data = await res.json()
    if (data.items) {
      allUpcoming.push(...data.items)
    }
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  console.log(`Found ${allUpcoming.length} upcoming broadcasts to delete on PK 70.`)

  let deletedCount = 0
  for (const item of allUpcoming) {
    const broadcastId = item.id
    const title = item.snippet?.title?.substring(0, 40) || 'Untitled'
    console.log(`Deleting [${broadcastId}] ${title}...`)
    try {
      const delUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`
      const delRes = await fetch(delUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      })
      if (delRes.ok || delRes.status === 204) {
        deletedCount++
        console.log(`  -> Deleted successfully (${deletedCount}/${allUpcoming.length})`)
      } else {
        const err = await delRes.text()
        console.warn(`  -> Delete failed (${delRes.status}): ${err}`)
      }
    } catch (e: any) {
      console.error(`  -> Error deleting ${broadcastId}:`, e.message)
    }
  }

  // 2. Fetch active broadcasts and stop & delete them
  const activeUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=active&part=id,snippet&maxResults=50`
  const activeRes = await fetch(activeUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (activeRes.ok) {
    const activeData = await activeRes.json()
    const activeItems = activeData.items || []
    console.log(`Found ${activeItems.length} active broadcasts.`)
    for (const item of activeItems) {
      console.log(`Transitioning active broadcast ${item.id} to complete...`)
      try {
        await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${item.id}&part=id,status`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        })
      } catch {}
      try {
        await fetch(`https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${item.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` }
        })
        deletedCount++
      } catch {}
    }
  }

  console.log(`\n=============================`)
  console.log(`CLEANUP COMPLETE: Total ${deletedCount} broadcasts cleaned on PK 70!`)
  console.log(`=============================\n`)
}

cleanPk70().catch(console.error)
