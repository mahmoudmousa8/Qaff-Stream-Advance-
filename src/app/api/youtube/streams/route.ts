import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { refreshAccessToken } from '@/lib/youtube-helper'

export interface YouTubeStreamKey {
  id: string
  title: string
  streamKey: string
  rtmpServer: string
  status: string
}

interface CacheEntry {
  streamKeys: YouTubeStreamKey[]
  timestamp: number
}

const streamsCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 3 * 60 * 1000 // 3 minutes

// GET /api/youtube/streams?channelId=<dbId>
// Fetches all live stream keys registered for the given YouTube channel from the YouTube API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const force = searchParams.get('force') === 'true'

    if (!channelId) {
      return NextResponse.json({ error: 'Missing channelId parameter' }, { status: 400 })
    }

    // Verify channel exists in DB
    const channel = await db.youtubeChannel.findUnique({
      where: { id: channelId }
    })

    if (!channel) {
      return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 })
    }

    // Return cached entries if not forced refresh
    if (!force) {
      const cached = streamsCache.get(channelId)
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[YouTube Streams API] Returning cached stream keys for channel: ${channel.channelTitle}`)
        return NextResponse.json({
          success: true,
          channelTitle: channel.channelTitle,
          streamKeys: cached.streamKeys
        })
      }
    }

    // Refresh access token if needed
    const accessToken = await refreshAccessToken(channelId)

    // Fetch all live stream keys from the YouTube API
    const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true&maxResults=50'
    const streamsResponse = await fetch(streamsListUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000)
    })

    if (!streamsResponse.ok) {
      const errorText = await streamsResponse.text()
      console.error('[YouTube Streams API] Error fetching live streams:', errorText)
      return NextResponse.json(
        { error: 'Failed to fetch stream keys from YouTube API', details: errorText },
        { status: streamsResponse.status }
      )
    }

    const streamsData = await streamsResponse.json()
    const items: any[] = streamsData.items || []

    const streamKeys: YouTubeStreamKey[] = items
      .filter((item: any) => item.cdn?.ingestionInfo?.streamName)
      .map((item: any) => ({
        id: item.id,
        title: item.snippet?.title || 'Untitled Stream Key',
        streamKey: item.cdn.ingestionInfo.streamName,
        rtmpServer: item.cdn.ingestionInfo.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
        status: item.status?.streamStatus || 'inactive'
      }))

    // Save to Cache
    streamsCache.set(channelId, {
      streamKeys,
      timestamp: Date.now()
    })

    console.log(`[YouTube Streams API] Fetched ${streamKeys.length} stream key(s) for channel: ${channel.channelTitle}`)

    return NextResponse.json({
      success: true,
      channelTitle: channel.channelTitle,
      streamKeys
    })
  } catch (error: any) {
    console.error('[YouTube Streams API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stream keys: ' + error.message },
      { status: 500 }
    )
  }
}

// POST /api/youtube/streams
// Creates a new YouTube Live Stream key with a custom title/name
export async function POST(request: NextRequest) {
  try {
    const { channelId, title } = await request.json()

    if (!channelId) {
      return NextResponse.json({ error: 'Missing channelId' }, { status: 400 })
    }

    const channel = await db.youtubeChannel.findUnique({
      where: { id: channelId }
    })

    if (!channel) {
      return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 })
    }

    const accessToken = await refreshAccessToken(channelId)
    const streamTitle = (title && title.trim()) ? title.trim() : `Stream Key ${new Date().toLocaleDateString('ar-EG')}`

    const createUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn'
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        snippet: {
          title: streamTitle
        },
        cdn: {
          frameRate: 'variable',
          ingestionType: 'rtmp',
          resolution: 'variable'
        }
      }),
      signal: AbortSignal.timeout(12000)
    })

    if (!createRes.ok) {
      const errText = await createRes.text()
      console.error('[YouTube Streams API] Create Stream Key failed:', errText)
      return NextResponse.json({ error: 'Failed to create stream key on YouTube', details: errText }, { status: createRes.status })
    }

    const createdData = await createRes.json()
    const streamKey = createdData.cdn?.ingestionInfo?.streamName
    const rtmpServer = createdData.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2'

    if (!streamKey) {
      return NextResponse.json({ error: 'YouTube API did not return streamName' }, { status: 500 })
    }

    // Invalidate cache for this channel
    streamsCache.delete(channelId)

    console.log(`[YouTube Streams API] Successfully created new stream key "${streamTitle}" for channel ${channel.channelTitle}: ${streamKey}`)

    return NextResponse.json({
      success: true,
      id: createdData.id,
      title: streamTitle,
      streamKey,
      rtmpServer
    })
  } catch (error: any) {
    console.error('[YouTube Streams API] Error creating stream key:', error)
    return NextResponse.json({ error: 'Failed to create stream key: ' + error.message }, { status: 500 })
  }
}

// PUT /api/youtube/streams
// Renames an existing YouTube Live Stream key
export async function PUT(request: NextRequest) {
  try {
    const { channelId, streamId, title } = await request.json()

    if (!channelId || !streamId || !title) {
      return NextResponse.json({ error: 'Missing channelId, streamId, or title' }, { status: 400 })
    }

    const channel = await db.youtubeChannel.findUnique({
      where: { id: channelId }
    })

    if (!channel) {
      return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 })
    }

    const accessToken = await refreshAccessToken(channelId)
    const newTitle = title.trim()

    const updateUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn'
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: streamId,
        snippet: {
          title: newTitle
        },
        cdn: {
          frameRate: 'variable',
          ingestionType: 'rtmp',
          resolution: 'variable'
        }
      }),
      signal: AbortSignal.timeout(12000)
    })

    if (!updateRes.ok) {
      const errText = await updateRes.text()
      console.error('[YouTube Streams API] Rename Stream Key failed:', errText)
      return NextResponse.json({ error: 'Failed to rename stream key on YouTube', details: errText }, { status: updateRes.status })
    }

    // Invalidate cache for this channel
    streamsCache.delete(channelId)

    console.log(`[YouTube Streams API] Successfully renamed stream key ${streamId} to "${newTitle}" for channel ${channel.channelTitle}`)

    return NextResponse.json({
      success: true,
      id: streamId,
      title: newTitle
    })
  } catch (error: any) {
    console.error('[YouTube Streams API] Error renaming stream key:', error)
    return NextResponse.json({ error: 'Failed to rename stream key: ' + error.message }, { status: 500 })
  }
}


