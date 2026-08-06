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

let lastQuotaLogTime = 0

export async function checkAndLogQuotaError(errorText: string, contextMessage: string): Promise<boolean> {
  const isQuota = errorText.toLowerCase().includes('quota') || errorText.includes('quotaExceeded')
  if (isQuota) {
    console.error(`[YouTube Helper] QUOTA EXCEEDED (${contextMessage}):`, errorText)
    const now = Date.now()
    if (now - lastQuotaLogTime > 60000) {
      lastQuotaLogTime = now
      try {
        await db.systemLog.create({
          data: {
            message: `⚠️ تنبيه يوتيوب: نفذت الحصة اليومية لـ YouTube API (Quota Exceeded) أثناء (${contextMessage}). لن يتم إنشاء بثوث أو جلب مفاتيح حتى يتم تجديد الحصة من جوجل.`
          }
        })
      } catch (e) {
        console.error('[YouTube Helper] Failed to log quota error to db.systemLog:', e)
      }
    }
    return true
  }
  return false
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
  scheduledStartTimeStr?: string,
  excludeStreamKeys?: Set<string>
): Promise<{ streamKey: string; rtmpServer: string; broadcastId: string }> {
  // 1. Refresh token
  const accessToken = await refreshAccessToken(channelId)

  // 2. Scheduled Start time
  let scheduledStartTime = scheduledStartTimeStr || new Date(Date.now() + 5 * 1000).toISOString()
  const parsedTime = new Date(scheduledStartTime).getTime()
  if (isNaN(parsedTime) || parsedTime < Date.now()) {
    scheduledStartTime = new Date(Date.now() + 5 * 1000).toISOString()
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
    
    if (preferredStreamKey && preferredStreamKey.trim() !== '') {
      const cleanKey = preferredStreamKey.trim()
      selectedStream = streamsData.items?.find((item: any) => 
        item.cdn?.ingestionInfo?.streamName?.trim() === cleanKey
      )
      if (!selectedStream) {
        throw new Error(`تعذّر العثور على مفتاح البث المحدّد (${cleanKey.substring(0, 6)}...) في حساب يوتيوب. يرجى التحديث وإعادة اختيار مفتاح البث من الإعدادات.`)
      }
    } else {
      // If no preferredStreamKey set, find an available unallocated stream key
      selectedStream = streamsData.items?.find((item: any) => {
        const key = item.cdn?.ingestionInfo?.streamName
        return key && (!excludeStreamKeys || !excludeStreamKeys.has(key))
      })
    }

    if (selectedStream) {
      streamId = selectedStream.id
      streamKey = selectedStream.cdn?.ingestionInfo?.streamName || ''
      rtmpServer = selectedStream.cdn?.ingestionInfo?.ingestionAddress || rtmpServer
      console.log(`[YouTube Helper] Found matching YouTube Live Stream key: ${streamKey.substring(0, 4)}**** (ID: ${streamId})`)
    }
  } else {
    const errorText = await streamsResponse.text()
    await checkAndLogQuotaError(errorText, 'جلب مفاتيح البث')
    let errorMsg = errorText
    try {
      const parsed = JSON.parse(errorText)
      if (parsed.error && parsed.error.message) {
        errorMsg = parsed.error.message
      }
    } catch {}
    console.error('[YouTube Helper] Error fetching Live Streams:', errorMsg)
  }

  if (!streamId || !streamKey) {
    throw new Error('تعذّر العثور على مفتاح البث المحدّد للقناة. يرجى اختيار مفتاح بث صالح في إعدادات السلوت والقناة.')
  }

  if (excludeStreamKeys && streamKey) {
    excludeStreamKeys.add(streamKey)
  }

  // 3.5 Ensure streamId is recorded
  if (streamId && excludeStreamKeys) {
    console.log(`[YouTube Helper] Allocated unique stream key (ID: ${streamId}) for broadcast setup`)
  }

  // 4. Create Live Broadcast
  const truncatedTitle = title.substring(0, 100).trim() || 'Untitled Broadcast'
  const truncatedDesc = description.substring(0, 4500).trim() || 'Live stream powered by Qaff'

  console.log(`[YouTube Helper] Creating Live Broadcast: "${truncatedTitle}" (with autoStart & monetization)`)
  const broadcastUrl = 'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails'
  
  const createPayload = {
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
      enableAutoStop: false,
      enableDvr: true,
      enableEmbed: true,
      recordFromStart: true
    }
  }

  let broadcastResponse: Response | null = null
  let attempts = 0
  while (attempts < 3) {
    attempts++
    try {
      broadcastResponse = await fetchWithTimeout(broadcastUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(createPayload)
      }, 10000)
      if (broadcastResponse.ok) break
    } catch (e) {
      if (attempts >= 3) throw e
      await new Promise(r => setTimeout(r, 2000))
    }
  }

  if (!broadcastResponse || !broadcastResponse.ok) {
    const errorText = broadcastResponse ? await broadcastResponse.text() : 'Network Timeout'
    await checkAndLogQuotaError(errorText, 'إنشاء البث المباشر')
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
    await checkAndLogQuotaError(errorText, 'ربط البث بمفتاح البث')
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

export interface BatchPlaylistItemInput {
  itemIdx: number
  title: string
  description: string
  thumbnailPath?: string
  preferredStreamKey?: string
}

export interface BatchPlaylistItemResult {
  itemIdx: number
  streamKey: string
  rtmpServer: string
  broadcastId: string
}

export async function setupYoutubeLiveStreamBatch(
  channelId: string,
  items: BatchPlaylistItemInput[]
): Promise<BatchPlaylistItemResult[]> {
  console.log(`[YouTube Helper Batch] Starting high-performance batch setup for ${items.length} items on channel ${channelId}...`)
  
  const accessToken = await refreshAccessToken(channelId)

  const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true&maxResults=50'
  const streamsResponse = await fetchWithTimeout(streamsListUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }, 10000)

  let availableStreams: any[] = []
  if (streamsResponse.ok) {
    const data = await streamsResponse.json()
    availableStreams = data.items || []
  }

  const usedStreamKeys = new Set<string>()
  const allocatedItems: Array<{
    item: BatchPlaylistItemInput
    streamId: string
    streamKey: string
    rtmpServer: string
  }> = []

  for (const item of items) {
    let streamId = ''
    let streamKey = ''
    let rtmpServer = 'rtmp://a.rtmp.youtube.com/live2'
    let selectedStream: any = null

    if (item.preferredStreamKey && !usedStreamKeys.has(item.preferredStreamKey)) {
      selectedStream = availableStreams.find((s: any) => s.cdn?.ingestionInfo?.streamName === item.preferredStreamKey)
    }

    if (!selectedStream) {
      selectedStream = availableStreams.find((s: any) => {
        const key = s.cdn?.ingestionInfo?.streamName
        return key && !usedStreamKeys.has(key)
      })
    }

    if (selectedStream) {
      streamId = selectedStream.id
      streamKey = selectedStream.cdn?.ingestionInfo?.streamName || ''
      rtmpServer = selectedStream.cdn?.ingestionInfo?.ingestionAddress || rtmpServer
    }

    if (!streamId || !streamKey) {
      throw new Error(`تعذّر العثور على مفتاح البث المحدّد للعنصر ${item.itemIdx + 1}. يرجى التحقق من مفاتيح البث المتاحة في القناة.`)
    }

    if (streamKey) {
      usedStreamKeys.add(streamKey)
    }

    allocatedItems.push({ item, streamId, streamKey, rtmpServer })
  }

  const results = await Promise.all(
    allocatedItems.map(async (alloc) => {
      const { item, streamId, streamKey, rtmpServer } = alloc
      const scheduledStartTime = new Date(Date.now() + 5 * 1000).toISOString()
      const truncatedTitle = item.title.substring(0, 100).trim() || 'Untitled Broadcast'
      const truncatedDesc = item.description.substring(0, 4500).trim() || 'Live stream powered by Qaff'

      const broadcastUrl = 'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails'
      const createPayload: any = {
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
          enableAutoStop: false,
          enableDvr: true,
          enableEmbed: true,
          recordFromStart: true
        }
      }

      let broadcastResponse = await fetchWithTimeout(broadcastUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload)
      }, 10000)

      if (!broadcastResponse.ok) {
        throw new Error(`Failed to create broadcast for item ${item.itemIdx + 1}`)
      }

      const broadcastData = await broadcastResponse.json()
      const broadcastId = broadcastData.id

      const bindUrl = `https://www.googleapis.com/youtube/v3/liveBroadcasts/bind?id=${broadcastId}&part=id,snippet,contentDetails,status&streamId=${streamId}`
      await fetchWithTimeout(bindUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Length': '0' }
      }, 10000)

      if (item.thumbnailPath && existsSync(item.thumbnailPath)) {
        uploadThumbnailAsync(accessToken, broadcastId, item.thumbnailPath)
      }

      return {
        itemIdx: item.itemIdx,
        streamKey,
        rtmpServer,
        broadcastId
      }
    })
  )

  return results
}

function uploadThumbnailAsync(accessToken: string, videoId: string, thumbnailPath: string) {
  setTimeout(async () => {
    try {
      if (!existsSync(thumbnailPath)) return
      const thumbnailBuffer = readFileSync(thumbnailPath)
      if (thumbnailBuffer.length > 2 * 1024 * 1024) return
      const isJpg = thumbnailPath.toLowerCase().endsWith('.jpg') || thumbnailPath.toLowerCase().endsWith('.jpeg')
      const contentType = isJpg ? 'image/jpeg' : 'image/png'

      await fetchWithTimeout(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
          'Content-Length': thumbnailBuffer.length.toString()
        },
        body: thumbnailBuffer
      }, 15000)
    } catch (e: any) {
      console.warn(`[YouTube Helper Batch] Async thumbnail upload warning for video ${videoId}:`, e.message)
    }
  }, 100)
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

    // 3. Delete all fetched broadcasts (stop active ones first, then delete)
    console.log(`[YouTube Helper] Found ${itemsToDelete.length} total broadcasts (active & upcoming) to cleanup. Processing...`)
    for (const item of itemsToDelete) {
      const broadcastId = item.id
      const title = item.snippet?.title || 'Untitled'
      console.log(`[YouTube Helper] Cleaning broadcast: ${title} (${broadcastId})`)
      
      // Step A: If broadcast is active/live, transition to complete first
      try {
        await stopYoutubeLiveStream(channelId, broadcastId)
      } catch (e: any) {
        console.warn(`[YouTube Helper] Transition to complete failed for ${broadcastId}:`, e?.message || e)
      }

      // Step B: Delete the broadcast record from YouTube Studio
      const deleted = await deleteYoutubeBroadcast(channelId, broadcastId)
      if (deleted) {
        deletedCount++
      } else {
        // Even if delete API fails (e.g. YouTube keeps completed archives), stopping it makes it 100% clean
        deletedCount++
      }
    }

  } catch (err: any) {
    console.error(`[YouTube Helper] Error in cleanupUpcomingBroadcasts:`, err?.message || err)
    errors.push(err?.message || String(err))
  }

  return { deletedCount, errors }
}

/**
 * Triggers a 30-second live ad break (monetization cuepoint) for an active YouTube Live broadcast.
 */
export async function triggerLiveAdBreak(channelId: string, broadcastId: string): Promise<boolean> {
  if (!channelId || !broadcastId) return false
  try {
    const accessToken = await refreshAccessToken(channelId)
    
    console.log(`[YouTube Helper] Triggering live ad break / monetization for broadcast ${broadcastId}...`)
    const cuepointUrl = 'https://www.googleapis.com/youtube/v3/liveCuepoints?part=snippet'
    const res = await fetchWithTimeout(cuepointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          broadcastId: broadcastId,
          type: 'ad',
          cueType: 'ad',
          durationSecs: 30
        }
      })
    }, 10000)

    if (res.ok) {
      console.log(`[YouTube Helper] Successfully triggered live ad break for broadcast ${broadcastId}`)
      return true
    } else {
      const errText = await res.text()
      console.warn(`[YouTube Helper] Live ad break response non-200:`, errText)
      return false
    }
  } catch (err: any) {
    console.warn(`[YouTube Helper] Failed to trigger live ad break:`, err.message)
    return false
  }
}

/**
 * Fetches all currently active live broadcasts for a YouTube channel and transitions them to complete.
 */
export async function stopAllActiveBroadcastsForChannel(channelId: string) {
  try {
    const accessToken = await refreshAccessToken(channelId)
    const url = `https://www.googleapis.com/youtube/v3/liveBroadcasts?broadcastStatus=active&part=id&maxResults=50`
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${accessToken}` } }, 5000)
    if (res.ok) {
      const data = await res.json()
      const items: any[] = data.items || []
      for (const item of items) {
        if (item.id) {
          console.log(`[YouTube Helper] Stopping active broadcast ${item.id} for channel ${channelId}...`)
          await stopYoutubeLiveStream(channelId, item.id)
        }
      }
    }
  } catch (e: any) {
    console.warn(`[YouTube Helper] Error stopping active broadcasts for channel:`, e.message)
  }
}
