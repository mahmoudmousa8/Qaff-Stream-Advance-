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

    if (!slot.streamKey || !slot.filePath) {
      return NextResponse.json({ error: 'Please fill Key and File Path' }, { status: 400 })
    }

    const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly)

    const updatedSlot = await db.streamSlot.update({
      where: { slotIndex },
      data: {
        isScheduled: true,
        status: 'Scheduled',
        nextRunTime
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
