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

// DELETE - Unlink a channel (supports comma-separated list of IDs for bulk deletion)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing channel ID parameter' }, { status: 400 })
    }

    const ids = id.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Invalid channel ID parameter' }, { status: 400 })
    }

    // Clean up relations: Set youtubeChannelId to null in any bound StreamSlot
    await db.streamSlot.updateMany({
      where: { youtubeChannelId: { in: ids } },
      data: {
        youtubeChannelId: null,
        youtubeTitle: '',
        youtubeDescription: '',
        youtubeThumbnailPath: ''
      }
    })

    // Delete the credential records
    const deleteResult = await db.youtubeChannel.deleteMany({
      where: { id: { in: ids } }
    })

    console.log(`[YouTube Channels DELETE] Bulk unlinked channels: count=${deleteResult.count}`)
    return NextResponse.json({ success: true, message: 'YouTube channels unlinked successfully', count: deleteResult.count })
  } catch (error: any) {
    console.error('[YouTube Channels DELETE] Error:', error)
    return NextResponse.json({ error: 'Failed to unlink channels: ' + error.message }, { status: 500 })
  }
}
