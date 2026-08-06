import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STREAM_MANAGER_URL } from '@/lib/paths'

// POST - Manual Stop streaming
// For one-time streams: cancels all scheduled state permanently.
// For daily/weekly streams: stops the current session but keeps the schedule
// active so the next run happens automatically (isScheduled stays true).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params
    const slotIndex = parseInt(index)

    if (isNaN(slotIndex) || slotIndex < 0) {
      return NextResponse.json({ error: 'Invalid slot index' }, { status: 400 })
    }

    const slot = await db.streamSlot.findUnique({ where: { slotIndex } })
    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
    const updatedSlot = await db.streamSlot.update({
      where: { slotIndex },
      data: {
        isRunning: false,
        manuallyStopped: true,
        isScheduled: false,
        status: 'Stopped',
        nextRunTime: '',
        isSwapped: false,
        youtubeBroadcastId: "",
        ...(!isRecurring ? { schedStart: '00-00 00:00', schedStop: '' } : {})
      }
    })

    // Call stream-manager to stop FFmpeg (primary + sub-slots for multi-video group)
    try {
      await fetch(`${STREAM_MANAGER_URL}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotIndex })
      })
      
      // Stop up to 30 possible sub-slot streams
      for (let itemIdx = 1; itemIdx < 30; itemIdx++) {
        const subSlotIndex = 10000 + slotIndex * 100 + itemIdx
        try {
          await fetch(`${STREAM_MANAGER_URL}/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slotIndex: subSlotIndex })
          })
        } catch {}
      }
    } catch (error) {
      console.error('Failed to connect to stream manager:', error)
    }

    if (slot.youtubeChannelId && slot.outputType === 'youtube') {
      try {
        const { stopYoutubeLiveStream } = await import('@/lib/youtube-helper')
        
        if (slot.youtubeBroadcastId) {
          const bcIds = slot.youtubeBroadcastId.split(',').map(s => s.trim()).filter(Boolean)
          for (const bId of bcIds) {
            try {
              await stopYoutubeLiveStream(slot.youtubeChannelId, bId)
            } catch (ytErr: any) {
              console.error(`[Stop Route] YouTube stop failed for broadcast ${bId}:`, ytErr.message)
            }
          }
        }
      } catch (ytErr: any) {
        console.error(`[Stop Route] YouTube stop failed:`, ytErr.message)
      }
    }

    // Clear folder randomizer active state and trigger 10s verification
    try {
      const { activeMainVideos, activeSwapVideos, lastActionTokens, verifyStreamStatusAfterDelay } = await import('@/lib/run-scheduler')
      activeMainVideos.delete(slotIndex)
      activeSwapVideos.delete(slotIndex)
      const token = Math.random().toString(36).substring(7)
      lastActionTokens.set(slotIndex, token)
      verifyStreamStatusAfterDelay(slotIndex, 'stop', token)
    } catch (err: any) {
      console.error('Verification trigger error:', err.message)
    }

    return NextResponse.json({
      success: true,
      slot: updatedSlot,
      message: 'Stream stopped and schedule cleared for editing'
    })
  } catch (error) {
    console.error('Error stopping stream:', error)
    return NextResponse.json({ error: 'Failed to stop stream' }, { status: 500 })
  }
}
