import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - List linked channels
export async function GET() {
  try {
    const channels = await db.youtubeChannel.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ channels })
  } catch (error: any) {
    console.error('[YouTube Channels GET] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch YouTube channels: ' + error.message }, { status: 500 })
  }
}

// DELETE - Unlink a channel
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing channel ID parameter' }, { status: 400 })
    }

    const existing = await db.youtubeChannel.findUnique({
      where: { id }
    })

    if (!existing) {
      return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 })
    }

    // Clean up relations: Set youtubeChannelId to null in any bound StreamSlot
    await db.streamSlot.updateMany({
      where: { youtubeChannelId: id },
      data: {
        youtubeChannelId: null,
        youtubeTitle: '',
        youtubeDescription: '',
        youtubeThumbnailPath: ''
      }
    })

    // Delete the credential record
    await db.youtubeChannel.delete({
      where: { id }
    })

    console.log(`[YouTube Channels DELETE] Unlinked channel: ${existing.channelTitle} (${existing.name})`)
    return NextResponse.json({ success: true, message: 'YouTube channel unlinked successfully' })
  } catch (error: any) {
    console.error('[YouTube Channels DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to unlink channel: ' + error.message }, { status: 500 })
  }
}
