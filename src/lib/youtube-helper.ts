import { db } from './db'
import { readFileSync, existsSync } from 'fs'

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || ''

export interface YouTubeChannelData {
  id: string
  name: string
  channelId: string
  channelTitle: string
  accessToken: string
  refreshToken: string
  expiryDate: Date
}

// Generates next Cairo midnight target (00:00:00 Africa/Cairo time tomorrow) in UTC ISO format
export function getCairoMidnightISO(): string {
  const now = new Date()
  
  // Cairo is UTC+3. Get current date/time in Cairo.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  })
  
  const parts = formatter.formatToParts(now)
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10)
  
  const year = getPart('year')
  const month = getPart('month') - 1 // 0-indexed
  const day = getPart('day')
  
  // Target tomorrow at 00:00:00 in Cairo time (Africa/Cairo)
  // Tomorrow's midnight in Cairo is (day + 1) at 00:00 Cairo time.
  // Cairo = UTC + 3 hours. So 00:00 Cairo time is 21:00 UTC on the previous day.
  const targetMidnightCairo = new Date(Date.UTC(year, month, day + 1, 0, 0, 0))
  const cairoMidnightInUtc = new Date(targetMidnightCairo.getTime() - 3 * 60 * 60 * 1000)
  
  return cairoMidnightInUtc.toISOString()
}

// Refresh Google OAuth token if close to expiry (within 2 minutes)
export async function refreshAccessToken(channelId: string): Promise<string> {
  const channel = await db.youtubeChannel.findUnique({
    where: { id: channelId }
  })
  if (!channel) {
    throw new Error(`YouTube channel with ID ${channelId} not found in database`)
  }

  const isExpired = new Date(channel.expiryDate).getTime() < Date.now() + 120 * 1000
  if (!isExpired) {
    return channel.accessToken
  }

  console.log(`[YouTube Helper] Refreshing access token for channel: ${channel.channelTitle} (${channel.name})`)
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: channel.refreshToken,
      grant_type: 'refresh_token'
    })
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Failed to refresh Google OAuth access token: ${errorBody}`)
  }

  const data = await response.json()
  const newAccessToken = data.access_token
  const expiresIn = data.expires_in || 3600
  const newExpiryDate = new Date(Date.now() + expiresIn * 1000)

  // Update token in DB
  await db.youtubeChannel.update({
    where: { id: channelId },
    data: {
      accessToken: newAccessToken,
      expiryDate: newExpiryDate
    }
  })

  console.log(`[YouTube Helper] Access token successfully refreshed for channel: ${channel.channelTitle}`)
  return newAccessToken
}

// Sequence: Tokens check, Cairo midnight calculation, Live Broadcast creation, Stream Key binding, and PNG thumbnail uploading.
// Returns the direct stream key and server endpoint URL
export async function setupYoutubeLiveStream(
  channelId: string,
  title: string,
  description: string,
  thumbnailPath?: string
): Promise<{ streamKey: string; rtmpServer: string }> {
  // 1. Refresh token
  const accessToken = await refreshAccessToken(channelId)

  // 2. Cairo Midnight Start time
  const scheduledStartTime = getCairoMidnightISO()
  console.log(`[YouTube Helper] Scheduling live broadcast start time (Cairo Midnight in UTC): ${scheduledStartTime}`)

  // 3. Find or Create Default Stream Key
  let streamId = ''
  let streamKey = ''
  let rtmpServer = 'rtmp://a.rtmp.youtube.com/live2' // fallback

  const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true'
  const streamsResponse = await fetch(streamsListUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (streamsResponse.ok) {
    const streamsData = await streamsResponse.json()
    const defaultStream = streamsData.items?.find((item: any) => 
      item.snippet?.title?.toLowerCase().includes('default') || 
      item.cdn?.ingestionInfo?.streamName
    ) || streamsData.items?.[0]

    if (defaultStream) {
      streamId = defaultStream.id
      streamKey = defaultStream.cdn?.ingestionInfo?.streamName || ''
      rtmpServer = defaultStream.cdn?.ingestionInfo?.ingestionAddress || rtmpServer
      console.log(`[YouTube Helper] Found existing YouTube Live Stream key: ${streamKey.substring(0, 4)}****`)
    }
  } else {
    console.error('[YouTube Helper] Error fetching Live Streams:', await streamsResponse.text())
  }

  // Create one if we couldn't list or find any
  if (!streamId || !streamKey) {
    console.log('[YouTube Helper] No active stream key found. Creating a new Default stream key...')
    const createStreamResponse = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: { title: 'Default Stream Key' },
        cdn: {
          frameRate: 'variable',
          ingestionType: 'rtmp',
          resolution: 'variable'
        }
      })
    })

    if (!createStreamResponse.ok) {
      throw new Error(`Failed to create YouTube Live Stream Key: ${await createStreamResponse.text()}`)
    }

    const createdStream = await createStreamResponse.json()
    streamId = createdStream.id
    streamKey = createdStream.cdn?.ingestionInfo?.streamName || ''
    rtmpServer = createdStream.cdn?.ingestionInfo?.ingestionAddress || rtmpServer
    console.log(`[YouTube Helper] Successfully created new YouTube Live Stream key: ${streamKey.substring(0, 4)}****`)
  }

  // 4. Create Live Broadcast
  const truncatedTitle = title.substring(0, 100).trim() || 'Untitled Broadcast'
  const truncatedDesc = description.substring(0, 4500).trim() || 'Live stream powered by Qaff'

  console.log(`[YouTube Helper] Creating Live Broadcast: "${truncatedTitle}"`)
  const broadcastUrl = 'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails'
  const broadcastResponse = await fetch(broadcastUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      snippet: {
        title: truncatedTitle,
        description: truncatedDesc,
        scheduledStartTime: scheduledStartTime
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true
      }
    })
  })

  if (!broadcastResponse.ok) {
    throw new Error(`Failed to create YouTube Live Broadcast: ${await broadcastResponse.text()}`)
  }

  const broadcastData = await broadcastResponse.json()
  const broadcastId = broadcastData.id
  console.log(`[YouTube Helper] Created Live Broadcast ID: ${broadcastId}`)

  // 5. Bind Broadcast to Stream Key
  console.log(`[YouTube Helper] Binding Broadcast (${broadcastId}) to Stream Key (${streamId})`)
  const bindUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&part=id,snippet,contentDetails,status&streamId=${streamId}`
  const bindResponse = await fetch(bindUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!bindResponse.ok) {
    throw new Error(`Failed to bind YouTube Broadcast to Stream: ${await bindResponse.text()}`)
  }
  console.log('[YouTube Helper] Successfully bound Live Broadcast to Stream Key')

  // 6. Upload Thumbnail if PNG exists and is under 2MB
  if (thumbnailPath && existsSync(thumbnailPath)) {
    try {
      console.log(`[YouTube Helper] Reading thumbnail file: ${thumbnailPath}`)
      const thumbnailBuffer = readFileSync(thumbnailPath)
      const thumbnailSize = thumbnailBuffer.length

      if (thumbnailSize <= 2 * 1024 * 1024) {
        console.log(`[YouTube Helper] Uploading PNG Thumbnail (${(thumbnailSize / 1024).toFixed(1)} KB)...`)
        const setThumbnailUrl = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${broadcastId}`
        const thumbnailResponse = await fetch(setThumbnailUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'image/png',
            'Content-Length': thumbnailSize.toString()
          },
          body: thumbnailBuffer
        })

        if (!thumbnailResponse.ok) {
          console.error('[YouTube Helper] Thumbnail upload failed:', await thumbnailResponse.text())
        } else {
          console.log('[YouTube Helper] PNG Thumbnail successfully set!')
        }
      } else {
        console.warn(`[YouTube Helper] Thumbnail file is too large (${(thumbnailSize / 1024 / 1024).toFixed(2)}MB). Must be under 2MB. Skipping upload.`)
      }
    } catch (err: any) {
      console.error('[YouTube Helper] Error during thumbnail processing/upload:', err?.message || err)
    }
  }

  return { streamKey, rtmpServer }
}
