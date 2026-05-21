import { db } from './db'
import { readFileSync, existsSync } from 'fs'
import { getCairoNowFields, getAbsoluteDateFromCairoFields } from './timezone-helper'

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
  const cairoNow = getCairoNowFields(now)
  
  // Calculate tomorrow's Cairo date (add 24 hours to current time)
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const tomorrowFields = getCairoNowFields(tomorrowDate)
  
  // Construct Cairo midnight tomorrow (00:00:00 Cairo time)
  const cairoMidnightInUtc = getAbsoluteDateFromCairoFields(
    tomorrowFields.year,
    tomorrowFields.month,
    tomorrowFields.day,
    0, // hour
    0, // minute
    0  // second
  )
  
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
  thumbnailPath?: string,
  preferredStreamKey?: string,
  scheduledStartTimeStr?: string
): Promise<{ streamKey: string; rtmpServer: string; broadcastId: string }> {
  // 1. Refresh token
  const accessToken = await refreshAccessToken(channelId)

  // 2. Scheduled Start time (must be in the future to avoid Google 400 Bad Request error)
  let scheduledStartTime = scheduledStartTimeStr || new Date().toISOString()
  const parsedTime = new Date(scheduledStartTime).getTime()
  // If parsing failed, or it is in the past, or less than 60 seconds in the future, push to 2 minutes in the future
  if (isNaN(parsedTime) || parsedTime < Date.now() + 60 * 1000) {
    scheduledStartTime = new Date(Date.now() + 2 * 60 * 1000).toISOString()
  }
  console.log(`[YouTube Helper] Scheduling live broadcast start time: ${scheduledStartTime}`)

  // 3. Find or Create Stream Key
  let streamId = ''
  let streamKey = ''
  let rtmpServer = 'rtmp://a.rtmp.youtube.com/live2' // fallback
  let selectedStream: any = null

  const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true'
  const streamsResponse = await fetch(streamsListUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (streamsResponse.ok) {
    const streamsData = await streamsResponse.json()
    
    if (preferredStreamKey) {
      // User explicitly chose a stream key — match it strictly by streamName
      selectedStream = streamsData.items?.find((item: any) => 
        item.cdn?.ingestionInfo?.streamName === preferredStreamKey
      )
      if (!selectedStream) {
        throw new Error(
          `مفتاح البث المحدد "${preferredStreamKey.substring(0, 6)}****" غير موجود أو غير نشط على قناة يوتيوب هذه. ` +
          `تحقق من مفتاح البث المختار في الإعدادات المتقدمة.`
        )
      }
    } else {
      // No preferred key — auto-select: prefer key named "default", otherwise first available
      selectedStream = streamsData.items?.find((item: any) => 
        item.snippet?.title?.toLowerCase().includes('default') || 
        item.cdn?.ingestionInfo?.streamName
      ) || streamsData.items?.[0]
    }

    if (selectedStream) {
      streamId = selectedStream.id
      streamKey = selectedStream.cdn?.ingestionInfo?.streamName || ''
      rtmpServer = selectedStream.cdn?.ingestionInfo?.ingestionAddress || rtmpServer
      console.log(`[YouTube Helper] Found matching YouTube Live Stream key: ${streamKey.substring(0, 4)}**** (ID: ${streamId})`)
    }
  } else {
    const errorText = await streamsResponse.text()
    let errorMsg = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.error && parsed.error.message) {
        errorMsg = parsed.error.message
      }
    } catch {}
    console.error('[YouTube Helper] Error fetching Live Streams:', errorMsg)
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
      const errorText = await createStreamResponse.text()
      let errorMsg = errorText
      try {
        const parsed = JSON.parse(errorText)
        if (parsed.error && parsed.error.message) {
          errorMsg = parsed.error.message
        }
      } catch {}
      throw new Error(`Failed to create YouTube Live Stream Key: ${errorMsg}`)
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
        enableAutoStop: false
      }
    })
  })

  if (!broadcastResponse.ok) {
    const errorText = await broadcastResponse.text()
    let errorMsg = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.error && parsed.error.message) {
        errorMsg = parsed.error.message
      }
    } catch {}
    throw new Error(`Failed to create YouTube Live Broadcast: ${errorMsg}`)
  }

  const broadcastData = await broadcastResponse.json()
  const broadcastId = broadcastData.id
  console.log(`[YouTube Helper] Created Live Broadcast ID: ${broadcastId}`)

  // 5. Bind Broadcast to Stream Key
  console.log(`[YouTube Helper] Binding Broadcast (${broadcastId}) to Stream Key (${streamId})`)
  const bindUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&part=id,snippet,contentDetails,status&streamId=${streamId}`
  const bindResponse = await fetch(bindUrl, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Length': '0'
    }
  })

  if (!bindResponse.ok) {
    const errorText = await bindResponse.text()
    let errorMsg = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.error && parsed.error.message) {
        errorMsg = parsed.error.message
      }
    } catch {}
    throw new Error(`Failed to bind YouTube Broadcast to Stream: ${errorMsg}`)
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

  return { streamKey, rtmpServer, broadcastId }
}

export async function stopYoutubeLiveStream(channelId: string, broadcastId: string): Promise<void> {
  if (!broadcastId) return
  try {
    const accessToken = await refreshAccessToken(channelId)
    console.log(`[YouTube Helper] Transitioning broadcast ${broadcastId} to status: complete`)
    const transitionUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${broadcastId}&part=id,status`
    const response = await fetch(transitionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    if (!response.ok) {
      const errMsg = await response.text()
      console.error(`[YouTube Helper] Failed to transition broadcast to complete: ${errMsg}`)
    } else {
      console.log(`[YouTube Helper] Broadcast ${broadcastId} successfully completed`)
    }
  } catch (err: any) {
    console.error(`[YouTube Helper] Error in stopYoutubeLiveStream:`, err?.message || err)
  }
}
