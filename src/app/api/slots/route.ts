import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-helper'

const DEFAULT_RTMP = "rtmp://a.rtmp.youtube.com/live2"

// GET - Fetch slots with pagination (restricted by user role and limits)
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '100')
  const search = searchParams.get('search') || ''
  const skip = (page - 1) * limit

  try {
    // Ensure at least 100 slots exist, or enough to cover the maximum slotsLimit assigned to any user
    const users = await db.user.findMany({
      select: { slotsLimit: true }
    })
    const maxUserLimit = Math.max(100, ...users.map(u => u.slotsLimit || 0))
    const existingCount = await db.streamSlot.count()

    if (existingCount < maxUserLimit) {
      const slotsToCreate: any[] = []
      for (let i = existingCount; i < maxUserLimit; i++) {
        slotsToCreate.push({
          slotIndex: i,
          channelName: `Slot ${i + 1}`,
          rtmpServer: DEFAULT_RTMP,
          outputType: 'youtube',
        })
      }

      if (slotsToCreate.length > 0) {
        await db.streamSlot.createMany({
          data: slotsToCreate
        })
      }
    }

    // Build query conditions
    const whereClause: any = {}
    if (search) {
      whereClause.channelName = { contains: search }
    }

    // If Normal User, limit visible slots to their slotsLimit
    if (user.role === 'user') {
      whereClause.slotIndex = { lt: user.slotsLimit }
    }

    const slots = await db.streamSlot.findMany({
      skip,
      take: limit,
      where: whereClause,
      orderBy: { slotIndex: 'asc' }
    })

    const total = await db.streamSlot.count({
      where: whereClause
    })

    return NextResponse.json({ slots, total })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error fetching slots:', msg)
    return NextResponse.json({ error: 'Failed to fetch slots', detail: msg }, { status: 500 })
  }
}
