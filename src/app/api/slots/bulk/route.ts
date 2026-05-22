import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STREAM_MANAGER_URL } from '@/lib/paths'

const BULK_STREAM_MANAGER = STREAM_MANAGER_URL

// POST - Bulk operations
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json()

    switch (action) {
      case 'startAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')

        const slots = await db.streamSlot.findMany({
          where: {
            streamKey: { not: '' },
            filePath: { not: '' },
            isRunning: false
          }
        })

        const slotsToSchedule = slots.filter(s => !!s.schedStart)
        const slotsToStart = slots.filter(s => !s.schedStart)

        // Phase 1: Schedule slots with schedStart
        for (const slot of slotsToSchedule) {
          const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly)
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isScheduled: true,
              status: 'Scheduled',
              nextRunTime
            }
          })
        }

        // Phase 2: Mark remaining slots as "Starting" in DB simultaneously
        await Promise.all(slotsToStart.map(async (slot) => {
          const now = new Date();
          const sMonth = String(now.getMonth() + 1).padStart(2, '0');
          const sDate = String(now.getDate()).padStart(2, '0');
          const sH = String(now.getHours()).padStart(2, '0');
          const sM = String(now.getMinutes()).padStart(2, '0');
          const updatedSchedStart = `${sMonth}-${sDate} ${sH}:${sM}`;

          let updatedSchedStop = slot.schedStop;
          if (updatedSchedStop && updatedSchedStop.startsWith('DUR ')) {
            const [hStr, mStr] = updatedSchedStop.replace('DUR ', '').split(':');
            const dursMins = parseInt(hStr || '0') * 60 + parseInt(mStr || '0');
            if (dursMins > 0) {
              const targetDate = new Date();
              targetDate.setMinutes(targetDate.getMinutes() + dursMins);
              const fMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
              const fDate = String(targetDate.getDate()).padStart(2, '0');
              const fH = String(targetDate.getHours()).padStart(2, '0');
              const fM = String(targetDate.getMinutes()).padStart(2, '0');
              updatedSchedStop = `${fMonth}-${fDate} ${fH}:${fM}`;
            }
          }

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: { status: 'Starting', isRunning: false, manuallyStopped: false, schedStart: updatedSchedStart, schedStop: updatedSchedStop }
          })
        }))

        // Phase 3: Fire stream-manager start requests sequentially with a delay to prevent overwhelming the server
        const results: Array<
          | { status: 'fulfilled'; value: { success: boolean; slotIndex: number; message?: string } }
          | { status: 'rejected'; reason: any }
        > = []
        for (const slot of slotsToStart) {
          try {
            const response = await fetch(`${BULK_STREAM_MANAGER}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slotIndex: slot.slotIndex,
                rtmpServer: slot.rtmpServer,
                streamKey: slot.streamKey,
                filePath: slot.filePath
              })
            })
            const result = await response.json()

            if (result.success) {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: { isRunning: true, isScheduled: false, status: 'Streaming' }
              })
              results.push({ status: 'fulfilled', value: { success: true, slotIndex: slot.slotIndex } })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: { status: 'Failed', isRunning: false }
              })
              results.push({ status: 'fulfilled', value: { success: false, slotIndex: slot.slotIndex, message: result.message } })
            }
          } catch (error) {
            results.push({ status: 'rejected', reason: error })
          }
          
          // Delay to prevent thundering herd
          await new Promise(resolve => setTimeout(resolve, 3000))
        }

        let count = 0
        const errors: string[] = []
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.success) {
            count++
          } else if (r.status === 'fulfilled' && !r.value.success) {
            errors.push(`Slot ${r.value.slotIndex + 1}: ${r.value.message}`)
          } else if (r.status === 'rejected') {
            errors.push(`Slot: Stream manager error`)
          }
        }

        return NextResponse.json({
          success: true,
          count: count + slotsToSchedule.length,
          errors: errors.length > 0 ? errors : undefined,
          message: `Started ${count} slots, scheduled ${slotsToSchedule.length} slots.`
        })
      }


      case 'stopAll': {
        const result = await db.streamSlot.updateMany({
          where: {
            OR: [
              { isRunning: true },
              { status: 'Starting' },
              { status: 'connecting' },
              { isScheduled: true }
            ]
          },
          data: {
            isRunning: false,
            isScheduled: false,
            manuallyStopped: true,
            status: 'Stopped',
            nextRunTime: '',
            youtubeBroadcastId: ''
          }
        })

        // Stop all via stream manager first
        try {
          await fetch(`${BULK_STREAM_MANAGER}/stop-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
        } catch {
          // Continue even if stream manager is down
        }

        // Terminate any active YouTube live broadcasts cleanly
        const activeYoutubeSlots = await db.streamSlot.findMany({
          where: {
            isRunning: true,
            outputType: 'youtube',
            youtubeChannelId: { not: null },
            youtubeBroadcastId: { not: '' }
          }
        })
        if (activeYoutubeSlots.length > 0) {
          try {
            const { stopYoutubeLiveStream } = await import('@/lib/youtube-helper')
            await Promise.allSettled(
              activeYoutubeSlots.map(s =>
                stopYoutubeLiveStream(s.youtubeChannelId!, s.youtubeBroadcastId)
              )
            )
          } catch {
            // Non-fatal — continue with DB update
          }
        }

        return NextResponse.json({ success: true, count: result.count, message: `Stopped ${result.count} slots` })
      }

      case 'setTimeAll': {
        const now = new Date()

        const slots = await db.streamSlot.findMany({
          orderBy: { slotIndex: 'asc' }
        })

        for (const slot of slots) {
          const isAM = slot.slotIndex % 2 === 0

          let target: Date
          if (isAM) {
            target = new Date(now)
            target.setDate(target.getDate() + 1)
            target.setHours(0, 0, 0, 0)
          } else {
            target = new Date(now)
            if (now.getHours() >= 12) {
              target.setDate(target.getDate() + 1)
            }
            target.setHours(12, 0, 0, 0)
          }

          const fmt = (d: Date) =>
            `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

          const startTime = fmt(target)
          const stopDate = new Date(target.getTime() + 11 * 60 * 60 * 1000 + 45 * 60 * 1000)
          const stopTime = fmt(stopDate)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: { schedStart: startTime, schedStop: stopTime }
          })
        }

        return NextResponse.json({ success: true, count: slots.length, message: `Set alternating 12 AM/PM schedule for all ${slots.length} slots` })
      }

      case 'setClosest5MinAll': {
        const now = new Date()
        let m = Math.floor(now.getMinutes() / 5) * 5 + 5
        let h = now.getHours()
        if (m >= 60) {
          m -= 60
          h += 1
        }
        let h12 = h % 12
        if (h12 === 0) h12 = 12

        const slots = await db.streamSlot.findMany({
          orderBy: { slotIndex: 'asc' }
        })

        for (const slot of slots) {
          const isAM = slot.slotIndex % 2 === 0

          let target = new Date(now)
          target.setMinutes(m, 0, 0)
          
          if (isAM) {
            target.setHours(h12 === 12 ? 0 : h12)
          } else {
            target.setHours(h12 === 12 ? 12 : h12 + 12)
          }

          if (target.getTime() <= now.getTime()) {
            target.setDate(target.getDate() + 1)
          }

          const fmt = (d: Date) =>
            `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

          const startTime = fmt(target)
          const stopDate = new Date(target.getTime() + 11 * 60 * 60 * 1000 + 45 * 60 * 1000)
          const stopTime = fmt(stopDate)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: { schedStart: startTime, schedStop: stopTime }
          })
        }

        return NextResponse.json({ success: true, count: slots.length, message: `Set alternating closest 5-min schedule for all ${slots.length} slots` })
      }

      case 'clearTimesAll': {
        const result = await db.streamSlot.updateMany({
          data: {
            schedStart: '',
            schedStop: '',
            isScheduled: false,
          }
        })
        return NextResponse.json({ success: true, count: result.count, message: `Cleared start and stop times for all slots` })
      }

      case 'dailyAll': {
        // Toggle daily for all slots
        const dailyCount = await db.streamSlot.count({
          where: { daily: true }
        })
        const total = await db.streamSlot.count()
        const targetState = dailyCount < total / 2

        const result = await db.streamSlot.updateMany({
          data: {
            daily: targetState,
            weekly: false
          }
        })

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count: result.count, message: `${actionText} Daily for all slots` })
      }

      case 'resetAll': {
        // Stop all streams first
        try {
          await fetch(`${BULK_STREAM_MANAGER}/stop-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
        } catch {
          // Continue even if stream manager is down
        }

        const result = await db.streamSlot.updateMany({
          data: {
            channelName: '',
            filePath: '',
            streamKey: '',
            schedStart: '',
            schedStop: '',
            daily: false,
            weekly: false,
            isScheduled: false,
            isRunning: false,
            manuallyStopped: true,
            nextRunTime: '',
            status: 'Stopped',
            swapVideoPath: '',
            swapVideoEnabled: false,
            isSwapped: false
          }
        })

        return NextResponse.json({ success: true, count: result.count, message: `Reset ${result.count} slots` })
      }

      case 'scheduleAll': {
        // Schedule all configured slots (have key + file + schedStart) that aren't already running
        const slots = await db.streamSlot.findMany({
          where: {
            streamKey: { not: '' },
            filePath: { not: '' },
            schedStart: { not: '' },
            isRunning: false,
            isScheduled: false,
          }
        })

        const errors: string[] = []
        let count = 0

        for (const slot of slots) {
          try {
            await db.streamSlot.update({
              where: { slotIndex: slot.slotIndex },
              data: { isScheduled: true, status: 'Scheduled' }
            })
            count++
          } catch {
            errors.push(`Slot ${slot.slotIndex + 1}: Failed to schedule`)
          }
        }

        return NextResponse.json({
          success: true, count, errors: errors.length > 0 ? errors : undefined,
          message: `Scheduled ${count} slots`
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error in bulk operation:', error)
    return NextResponse.json({ error: 'Failed to perform operation' }, { status: 500 })
  }
}
