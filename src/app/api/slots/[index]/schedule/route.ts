import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { calculateNextRun } from '@/lib/timezone-helper'

// POST - Schedule streaming
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params
    const slotIndex = parseInt(index)

    const slot = await db.streamSlot.findUnique({
      where: { slotIndex }
    })

    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    if (!slot.schedStart) {
      return NextResponse.json({ error: 'Please set start schedule time' }, { status: 400 })
    }

    if (slot.inputType !== 'live' && !slot.filePath) {
      return NextResponse.json({ error: 'Please fill File Path' }, { status: 400 })
    }
    
    if (!slot.youtubeChannelId && !slot.streamKey) {
      return NextResponse.json({ error: 'Please fill Stream Key' }, { status: 400 })
    }

    // Check for overlap before scheduling
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
      if (areSlotsOverlapping(slot, otherSlot, new Date())) {
        const channelDesc = otherSlot.channelName ? `(${otherSlot.channelName})` : ''
        return NextResponse.json({
          error: `عذراً، يوجد تعارض في الجدولة مع البث في السلوت رقم ${otherSlot.slotIndex + 1} ${channelDesc}`
        }, { status: 400 })
      }
    }

    const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m)

    const updatedSlot = await db.streamSlot.update({
      where: { slotIndex },
      data: {
        isScheduled: true,
        status: 'Scheduled',
        nextRunTime,
        manuallyStopped: false
      }
    })

    return NextResponse.json({ 
      success: true, 
      slot: updatedSlot,
      message: 'Stream scheduled'
    })
  } catch (error) {
    console.error('Error scheduling stream:', error)
    return NextResponse.json({ error: 'Failed to schedule stream' }, { status: 500 })
  }
}
