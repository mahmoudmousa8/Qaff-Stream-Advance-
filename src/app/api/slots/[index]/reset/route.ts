import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STREAM_MANAGER_URL } from '@/lib/paths'

// POST - Reset slot
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params
    const slotIndex = parseInt(index)

    // Always tell stream-manager to stop FFmpeg first.
    // This prevents ghost processes from continuing after a reset.
    try {
      await fetch(`${STREAM_MANAGER_URL}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotIndex })
      })
    } catch {
      // Non-fatal — proceed with DB reset even if stream-manager is unreachable
    }

    // If this slot has an active YouTube broadcast, transition it to complete first
    const slot = await db.streamSlot.findUnique({ where: { slotIndex } })
    if (slot?.isRunning && slot?.youtubeChannelId && slot?.youtubeBroadcastId && slot?.outputType === 'youtube') {
      try {
        const { stopYoutubeLiveStream } = await import('@/lib/youtube-helper')
        await stopYoutubeLiveStream(slot.youtubeChannelId, slot.youtubeBroadcastId)
      } catch (ytErr: any) {
        console.error(`[Reset Route] YouTube stop failed:`, ytErr.message)
      }
    }

    const updatedSlot = await db.streamSlot.update({
      where: { slotIndex },
      data: {
        channelName: '',
        outputType: 'youtube',
        filePath: '',
        streamKey: '',
        rtmpServer: '',
        schedStart: '',
        schedStop: '',
        daily: false,
        weekly: false,
        hourly: false,
        repeat30m: false,
        repeat1h: false,
        repeat2h: false,
        isScheduled: false,
        isRunning: false,
        manuallyStopped: true,
        nextRunTime: '',
        status: 'Stopped',
        swapVideoPath: '',
        swapVideoEnabled: false,
        isSwapped: false,
        youtubeBroadcastId: ''
      }
    })

    return NextResponse.json({
      success: true,
      slot: updatedSlot,
      message: 'Slot reset'
    })
  } catch (error) {
    console.error('Error resetting slot:', error)
    return NextResponse.json({ error: 'Failed to reset slot' }, { status: 500 })
  }
}
