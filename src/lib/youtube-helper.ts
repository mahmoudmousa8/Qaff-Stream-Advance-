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

// Helper to execute fetch requests with a strict timeout to prevent thread lockup
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(id)
  }
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
  
  const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: channel.refreshToken,
      grant_type: 'refresh_token'
    })
  }, 10000)

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

  const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true&maxResults=50'
  const streamsResponse = await fetchWithTimeout(streamsListUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 10000)

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
    const createStreamResponse = await fetchWithTimeout('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
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
    }, 10000)

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

  // 3.5 Cleanup any existing active/upcoming broadcasts bound to this streamId
  if (streamId) {
    console.log(`[YouTube Helper] Checking for stuck broadcasts bound to stream ID ${streamId}...`)
    try {
      const statusList = ['active', 'upcoming']
      for (const st of statusList) {
        const url = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=${st}&part=id,snippet,contentDetails&maxResults=50`
        const resp = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } }, 5000)
        if (resp.ok) {
          const data = await resp.json()
          for (const item of (data.items || [])) {
            if (item.contentDetails?.boundStreamId === streamId) {
              console.log(`[YouTube Helper] Deleting stuck ${st} broadcast ${item.id} because it holds streamId ${streamId}`)
              await deleteYoutubeBroadcast(channelId, item.id)
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[YouTube Helper] Non-fatal error cleaning up stuck broadcasts:`, e)
    }
  }

  // 4. Create Live Broadcast
  const truncatedTitle = title.substring(0, 100).trim() || 'Untitled Broadcast'
  const truncatedDesc = description.substring(0, 4500).trim() || 'Live stream powered by Qaff'

  console.log(`[YouTube Helper] Creating Live Broadcast: "${truncatedTitle}"`)
  const broadcastUrl = 'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails'
  const broadcastResponse = await fetchWithTimeout(broadcastUrl, {
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
  }, 10000)

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
  const bindResponse = await fetchWithTimeout(bindUrl, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Length': '0'
    }
  }, 10000)

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
        const isJpg = thumbnailPath.toLowerCase().endsWith('.jpg') || thumbnailPath.toLowerCase().endsWith('.jpeg')
        const contentType = isJpg ? 'image/jpeg' : 'image/png'
        console.log(`[YouTube Helper] Uploading Thumbnail (${(thumbnailSize / 1024).toFixed(1)} KB) with Content-Type: ${contentType}...`)
        const setThumbnailUrl = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${broadcastId}`
        const thumbnailResponse = await fetchWithTimeout(setThumbnailUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': contentType,
            'Content-Length': thumbnailSize.toString()
          },
          body: thumbnailBuffer
        }, 10000)

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
    const response = await fetchWithTimeout(transitionUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }, 10000)
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

export async function uploadYoutubeThumbnail(
  channelId: string,
  broadcastId: string,
  thumbnailPath: string
): Promise<boolean> {
  if (!broadcastId || !thumbnailPath || !existsSync(thumbnailPath)) {
    console.warn(`[YouTube Helper] Thumbnail upload skipped: broadcastId=${broadcastId}, path=${thumbnailPath}`)
    return false
  }

  try {
    const accessToken = await refreshAccessToken(channelId)
    const thumbnailBuffer = readFileSync(thumbnailPath)
    const thumbnailSize = thumbnailBuffer.length

    if (thumbnailSize <= 2 * 1024 * 1024) {
      console.log(`[YouTube Helper] Uploading PNG Thumbnail to active broadcast ${broadcastId}...`)
      const setThumbnailUrl = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${broadcastId}`
      const thumbnailResponse = await fetchWithTimeout(setThumbnailUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'image/png',
          'Content-Length': thumbnailSize.toString()
        },
        body: thumbnailBuffer
      }, 10000)

      if (!thumbnailResponse.ok) {
        console.error('[YouTube Helper] Thumbnail upload failed:', await thumbnailResponse.text())
        return false
      } else {
        console.log('[YouTube Helper] PNG Thumbnail successfully set on active broadcast!')
        return true
      }
    } else {
      console.warn(`[YouTube Helper] Thumbnail file is too large (${(thumbnailSize / 1024 / 1024).toFixed(2)}MB). Must be under 2MB. Skipping upload.`)
      return false
    }
  } catch (err: any) {
    console.error('[YouTube Helper] Error during thumbnail upload:', err?.message || err)
    return false
  }
}

export async function deleteYoutubeBroadcast(channelId: string, broadcastId: string): Promise<boolean> {
  if (!broadcastId) return false
  try {
    const accessToken = await refreshAccessToken(channelId)
    console.log(`[YouTube Helper] Deleting broadcast ${broadcastId}...`)
    const deleteUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${broadcastId}`
    const response = await fetchWithTimeout(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }, 10000)

    if (!response.ok) {
      const errMsg = await response.text()
      console.error(`[YouTube Helper] Failed to delete broadcast: ${errMsg}`)
      return false
    } else {
      console.log(`[YouTube Helper] Broadcast ${broadcastId} successfully deleted`)
      return true
    }
  } catch (err: any) {
    console.error(`[YouTube Helper] Error in deleteYoutubeBroadcast:`, err?.message || err)
    return false
  }
}

export async function cleanupUpcomingBroadcasts(channelId: string): Promise<{ deletedCount: number; errors: string[] }> {
  const errors: string[] = []
  let deletedCount = 0
  try {
    const accessToken = await refreshAccessToken(channelId)
    
    const itemsToDelete: any[] = []

    // 1. Fetch upcoming broadcasts
    console.log(`[YouTube Helper] Fetching upcoming broadcasts for channel ${channelId}...`)
    const listUrlUpcoming = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=upcoming&part=id,snippet&maxResults=50`
    const listResponseUpcoming = await fetchWithTimeout(listUrlUpcoming, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }, 10000)

    if (listResponseUpcoming.ok) {
      const dataUpcoming = await listResponseUpcoming.json()
      itemsToDelete.push(...(dataUpcoming.items || []))
    } else {
      errors.push(`فشل جلب البثوث القادمة: ${await listResponseUpcoming.text()}`)
    }

    // 2. Fetch active broadcasts
    console.log(`[YouTube Helper] Fetching active broadcasts for channel ${channelId}...`)
    const listUrlActive = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=active&part=id,snippet&maxResults=50`
    const listResponseActive = await fetchWithTimeout(listUrlActive, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }, 10000)

    if (listResponseActive.ok) {
      const dataActive = await listResponseActive.json()
      itemsToDelete.push(...(dataActive.items || []))
    } else {
      errors.push(`فشل جلب البثوث النشطة: ${await listResponseActive.text()}`)
    }

    // 3. Delete all fetched broadcasts
    console.log(`[YouTube Helper] Found ${itemsToDelete.length} total broadcasts to delete. Deleting...`)
    for (const item of itemsToDelete) {
      const broadcastId = item.id
      const title = item.snippet?.title || 'Untitled'
      console.log(`[YouTube Helper] Deleting broadcast: ${title} (${broadcastId})`)
      const deleted = await deleteYoutubeBroadcast(channelId, broadcastId)
      if (deleted) {
        deletedCount++
      } else {
        errors.push(`فشل حذف البث "${title}"`)
      }
    }

  } catch (err: any) {
    console.error(`[YouTube Helper] Error in cleanupUpcomingBroadcasts:`, err?.message || err)
    errors.push(err?.message || String(err))
  }

  return { deletedCount, errors }
}
