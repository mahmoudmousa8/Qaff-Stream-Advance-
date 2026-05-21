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

// GET /api/youtube/streams?channelId=<dbId>
// Fetches all live stream keys registered for the given YouTube channel from the YouTube API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')

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

    // Refresh access token if needed
    const accessToken = await refreshAccessToken(channelId)

    // Fetch all live stream keys from the YouTube API
    const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true&maxResults=50'
    const streamsResponse = await fetch(streamsListUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
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
