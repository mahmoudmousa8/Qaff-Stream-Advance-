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

    if (proposedSlot.isScheduled && proposedSlot.schedStart) {
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

    const updatedSlot = await db.streamSlot.update({
      where: { slotIndex },
      data: updates
    })

    return NextResponse.json(updatedSlot)
  } catch (error) {
    console.error('Error updating slot:', error)
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 })
  }
}
