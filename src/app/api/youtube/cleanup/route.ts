import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-helper'
import { cleanupUpcomingBroadcasts } from '@/lib/youtube-helper'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST - Cleanup upcoming broadcasts for a specific channel
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { channelDbId } = await request.json()
    if (!channelDbId) {
      return NextResponse.json({ error: 'Missing channel ID parameter' }, { status: 400 })
    }

    // Fetch the channel credential record
    const channel = await db.youtubeChannel.findUnique({
      where: { id: channelDbId }
    })

    if (!channel) {
      return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 })
    }

    // Call helper to clean up upcoming broadcasts
    const result = await cleanupUpcomingBroadcasts(channel.id)

    if (result.errors && result.errors.length > 0 && result.deletedCount === 0) {
      return NextResponse.json({
        success: false,
        message: 'فشل تنظيف البثوث المعلقة: ' + result.errors.join(', ')
      }, { status: 500 })
    }

    const msg = `تم بنجاح تنظيف وحذف عدد ${result.deletedCount} من البثوث المعلقة والقادمة على القناة.`
    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message: msg
    })
  } catch (error: any) {
    console.error('[YouTube Cleanup POST] Error:', error)
    return NextResponse.json({ error: 'Failed to perform cleanup: ' + error.message }, { status: 500 })
  }
}
