import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT - Update a slot
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params
    const slotIndex = parseInt(index)
    const updates = await request.json()

    const slot = await db.streamSlot.findUnique({
      where: { slotIndex }
    })

    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    const proposedSlot = { ...slot, ...updates }

    const schedulingFields = [
      'schedStart',
      'schedStop',
      'daily',
      'weekly',
      'hourly',
      'repeat15m',
      'repeat10m',
      'repeat30m',
      'repeat1h',
      'repeat2h',
      'isScheduled',
      'outputType',
      'youtubeChannelId',
      'streamKey',
      'rtmpServer'
    ]

    const hasSchedulingChanges = schedulingFields.some(field => {
      if (!(field in updates)) return false
      return updates[field] !== (slot as any)[field]
    })

    if (proposedSlot.isScheduled && proposedSlot.schedStart && hasSchedulingChanges) {
      const otherSlots = await db.streamSlot.findMany({
        where: {
          slotIndex: { not: slotIndex },
          OR: [
            { isScheduled: true },
            { isRunning: true }
          ]
        }
      })

      const { areSlotsOverlapping } = await import('@/lib/schedule-validator')
      for (const otherSlot of otherSlots) {
        if (areSlotsOverlapping(proposedSlot, otherSlot, new Date())) {
          const channelDesc = otherSlot.channelName ? `(${otherSlot.channelName})` : ''
          return NextResponse.json({
            error: `عذراً، يوجد تعارض في الجدولة مع البث في السلوت رقم ${otherSlot.slotIndex + 1} ${channelDesc}`
          }, { status: 400 })
        }
      }
    }

    const extraUpdates: any = {}
    if (!slot.isRunning && !updates.isRunning) {
      extraUpdates.manuallyStopped = true
      if ('schedStart' in updates || 'schedStop' in updates || 'daily' in updates || 'weekly' in updates || 'hourly' in updates || 'repeat15m' in updates || 'repeat10m' in updates || 'repeat30m' in updates || 'repeat1h' in updates || 'repeat2h' in updates) {
        extraUpdates.isScheduled = false
        extraUpdates.nextRunTime = ''
        extraUpdates.status = 'Stopped'
      }
    }

    const updatedSlot = await db.streamSlot.update({
      where: { slotIndex },
      data: {
        ...updates,
        ...extraUpdates
      }
    })

    // If slot is running and thumbnail changed, upload to YouTube immediately
    if (updates.youtubeThumbnailPath && updates.youtubeThumbnailPath !== slot.youtubeThumbnailPath) {
      if (slot.isRunning && slot.outputType === 'youtube' && slot.youtubeChannelId && slot.youtubeBroadcastId) {
        try {
          const { uploadYoutubeThumbnail } = await import('@/lib/youtube-helper')
          uploadYoutubeThumbnail(slot.youtubeChannelId, slot.youtubeBroadcastId, updates.youtubeThumbnailPath)
        } catch (err) {
          console.error('[Individual Slot Update] Failed to trigger thumbnail upload for active slot:', err)
        }
      }
    }

    return NextResponse.json(updatedSlot)
  } catch (error) {
    console.error('Error updating slot:', error)
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 })
  }
}
