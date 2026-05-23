import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STREAM_MANAGER_URL } from '@/lib/paths'
import { getAuthUser } from '@/lib/auth-helper'

const BULK_STREAM_MANAGER = STREAM_MANAGER_URL

// POST - Bulk operations
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userFilter: any = {}
  if (user.role === 'user') {
    userFilter.slotIndex = { lt: user.slotsLimit }
  }

  try {
    const body = await request.json()
    const { action, thumbnailPath } = body

    switch (action) {
      case 'startAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')

        const allSlots = await db.streamSlot.findMany({
          where: {
            isRunning: false,
            ...userFilter
          }
        })

        const slots = allSlots.filter(slot => {
          if (slot.inputType !== 'live' && !slot.filePath) return false

          const outputType = slot.outputType || 'youtube'
          if (outputType === 'youtube' || outputType === 'facebook') {
            const ytId = slot.youtubeChannelId
            const hasYtChannel = ytId && ytId.trim() !== '' && ytId.toLowerCase() !== 'null' && ytId.toLowerCase() !== 'undefined'
            const hasStreamKey = slot.streamKey && slot.streamKey.trim() !== ''
            return !!(hasYtChannel || hasStreamKey)
          } else {
            return !!(slot.streamKey && slot.streamKey.trim() !== '')
          }
        })

        const slotsToSchedule = slots.filter(s => !!s.schedStart)
        const slotsToStart = slots.filter(s => !s.schedStart)

        // Phase 1: Schedule slots with schedStart
        for (const slot of slotsToSchedule) {
          const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly)
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isScheduled: true,
              status: 'Scheduled',
              nextRunTime,
              manuallyStopped: false
            }
          })
        }

        // Fetch client user to get security key for live streaming
        const clientUser = await db.user.findUnique({
          where: { username: 'user' }
        })
        const securityKey = clientUser?.securityKey || 'qaff-key-123'

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
            data: { status: 'Starting', isRunning: false, manuallyStopped: false, isSwapped: false, schedStart: updatedSchedStart, schedStop: updatedSchedStop }
          })
        }))

        // Phase 3: Fire stream-manager start requests sequentially with a delay to prevent overwhelming the server
        const results: Array<
          | { status: 'fulfilled'; value: { success: boolean; slotIndex: number; message?: string } }
          | { status: 'rejected'; reason: any }
        > = []
        for (const slot of slotsToStart) {
          try {
            let finalInputPath = slot.filePath
            if (slot.inputType === 'live') {
              finalInputPath = `rtmp://127.0.0.1/live/${securityKey}`
            }

            const outputType = slot.outputType || 'youtube'
            let finalStreamKey = slot.streamKey
            let finalRtmpServer = slot.rtmpServer
            let youtubeBroadcastId = ""

            if (slot.youtubeChannelId && outputType === 'youtube') {
              try {
                console.log(`[Bulk Start] Slot ${slot.slotIndex}: Setting up YouTube Live broadcast...`)
                const { setupYoutubeLiveStream } = await import('@/lib/youtube-helper')
                const yt = await setupYoutubeLiveStream(
                  slot.youtubeChannelId,
                  slot.youtubeTitle || 'Live Stream',
                  slot.youtubeDescription || '',
                  slot.youtubeThumbnailPath || undefined,
                  slot.streamKey
                )
                finalStreamKey = yt.streamKey || finalStreamKey
                finalRtmpServer = yt.rtmpServer || finalRtmpServer
                youtubeBroadcastId = yt.broadcastId || ""
              } catch (ytErr: any) {
                console.error(`[Bulk Start] Slot ${slot.slotIndex}: YouTube setup failed:`, ytErr.message)
                await db.streamSlot.update({
                  where: { slotIndex: slot.slotIndex },
                  data: { status: 'Failed', isRunning: false }
                })
                await db.systemLog.create({
                  data: { message: `Slot ${slot.slotIndex + 1}: YouTube API Error: ${ytErr.message}` }
                })
                results.push({ status: 'fulfilled', value: { success: false, slotIndex: slot.slotIndex, message: `YouTube API Error: ${ytErr.message}` } })
                continue
              }
            }

            const response = await fetch(`${BULK_STREAM_MANAGER}/start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slotIndex: slot.slotIndex,
                outputType,
                rtmpServer: finalRtmpServer,
                streamKey: finalStreamKey,
                filePath: finalInputPath
              })
            })
            const result = await response.json()

            if (result.success) {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  isRunning: true,
                  isScheduled: false,
                  status: 'Streaming',
                  streamKey: finalStreamKey,
                  rtmpServer: finalRtmpServer,
                  youtubeBroadcastId
                }
              })
              results.push({ status: 'fulfilled', value: { success: true, slotIndex: slot.slotIndex } })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: { status: 'Failed', isRunning: false }
              })
              results.push({ status: 'fulfilled', value: { success: false, slotIndex: slot.slotIndex, message: result.message } })
            }
          } catch (error: any) {
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
        // 1. Fetch active YouTube slots first BEFORE updating the DB and clearing fields
        const activeYoutubeSlots = await db.streamSlot.findMany({
          where: {
            isRunning: true,
            outputType: 'youtube',
            youtubeChannelId: { not: null },
            youtubeBroadcastId: { not: '' },
            ...userFilter
          }
        })

        // 2. Fetch all slots that are either running, starting, connecting, scheduled, or not manually stopped
        const slotsToStop = await db.streamSlot.findMany({
          where: {
            OR: [
              { isRunning: true },
              { status: 'Starting' },
              { status: 'connecting' },
              { isScheduled: true },
              { manuallyStopped: false }
            ],
            ...userFilter
          }
        })

        // 3. Call stop on stream-manager for each slot to ensure they are killed/dequeued
        await Promise.allSettled(
          slotsToStop.map(s =>
            fetch(`${BULK_STREAM_MANAGER}/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotIndex: s.slotIndex })
            })
          )
        )

        // 4. Update the DB status for those slots to Stopped and manuallyStopped = true
        const result = await db.streamSlot.updateMany({
          where: {
            slotIndex: { in: slotsToStop.map(s => s.slotIndex) }
          },
          data: {
            isRunning: false,
            isScheduled: false,
            manuallyStopped: true,
            isSwapped: false,
            status: 'Stopped',
            nextRunTime: '',
            youtubeBroadcastId: ''
          }
        })

        // 5. Terminate any active YouTube live broadcasts cleanly
        if (activeYoutubeSlots.length > 0) {
          try {
            const { stopYoutubeLiveStream } = await import('@/lib/youtube-helper')
            await Promise.allSettled(
              activeYoutubeSlots.map(s =>
                stopYoutubeLiveStream(s.youtubeChannelId!, s.youtubeBroadcastId)
              )
            )
          } catch {
            // Non-fatal — continue
          }
        }

        return NextResponse.json({ success: true, count: result.count, message: `Stopped ${result.count} slots` })
      }

      case 'setTimeAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        const slots = await db.streamSlot.findMany({
          where: { ...userFilter, isRunning: false },
          orderBy: { slotIndex: 'asc' }
        })

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        for (const slot of slots) {
          const isAM = slot.slotIndex % 2 === 0

          let targetDate: Date
          if (isAM) {
            // 12 AM (00:00) of the next day in Cairo
            targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day + 1, 0, 0, 0)
          } else {
            // 12 PM (12:00) of today or next day in Cairo
            if (cairoNow.hour >= 12) {
              targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day + 1, 12, 0, 0)
            } else {
              targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, 12, 0, 0)
            }
          }

          const startTime = formatCairoDate(targetDate)
          const stopDate = new Date(targetDate.getTime() + (11 * 60 + 45) * 60 * 1000)
          const stopTime = formatCairoDate(stopDate)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              schedStart: startTime,
              schedStop: stopTime,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
        }

        return NextResponse.json({ success: true, count: slots.length, message: `Set alternating 12 AM/PM schedule for all ${slots.length} slots` })
      }

      case 'setClosest10MinAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        let m = Math.floor(cairoNow.minute / 10) * 10 + 10
        let h = cairoNow.hour
        if (m >= 60) {
          m -= 60
          h += 1
        }
        let h12 = h % 12
        if (h12 === 0) h12 = 12

        const slots = await db.streamSlot.findMany({
          where: { ...userFilter, isRunning: false },
          orderBy: { slotIndex: 'asc' }
        })

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        for (const slot of slots) {
          const isAM = slot.slotIndex % 2 === 0

          let targetHour = h
          if (isAM) {
            targetHour = (h12 === 12 ? 0 : h12)
          } else {
            targetHour = (h12 === 12 ? 12 : h12 + 12)
          }

          let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, targetHour, m, 0)

          if (targetDate.getTime() <= now.getTime()) {
            targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day + 1, targetHour, m, 0)
          }

          const startTime = formatCairoDate(targetDate)
          const stopDate = new Date(targetDate.getTime() + (11 * 60 + 45) * 60 * 1000)
          const stopTime = formatCairoDate(stopDate)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              schedStart: startTime,
              schedStop: stopTime,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
        }

        return NextResponse.json({ success: true, count: slots.length, message: `Set alternating closest 10-min schedule for all ${slots.length} slots` })
      }

      case 'clearTimesAll': {
        const result = await db.streamSlot.updateMany({
          where: { ...userFilter, isRunning: false },
          data: {
            schedStart: '',
            schedStop: '',
            isScheduled: false,
            manuallyStopped: true,
            nextRunTime: '',
            status: 'Stopped'
          }
        })
        return NextResponse.json({ success: true, count: result.count, message: `Cleared start and stop times for all slots` })
      }

      case 'setThumbnailAll': {
        if (!thumbnailPath || typeof thumbnailPath !== 'string') {
          return NextResponse.json({ error: 'صورة غلاف غير صالحة' }, { status: 400 })
        }

        // Find currently running YouTube slots that match userFilter and have a broadcast ID
        const activeYoutubeSlots = await db.streamSlot.findMany({
          where: {
            isRunning: true,
            outputType: 'youtube',
            youtubeChannelId: { not: null },
            youtubeBroadcastId: { not: '' },
            ...userFilter
          }
        })

        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            youtubeThumbnailPath: thumbnailPath
          }
        })

        // Upload to active YouTube streams in the background
        if (activeYoutubeSlots.length > 0) {
          try {
            const { uploadYoutubeThumbnail } = await import('@/lib/youtube-helper')
            Promise.allSettled(
              activeYoutubeSlots.map(s =>
                uploadYoutubeThumbnail(s.youtubeChannelId!, s.youtubeBroadcastId, thumbnailPath)
              )
            )
          } catch (err) {
            console.error('[setThumbnailAll] Failed to trigger thumbnail upload for active slots:', err)
          }
        }

        const msg = `تم تعيين الصورة المصغرة الموحدة لـ ${result.count} قناة بنجاح`
        return NextResponse.json({ success: true, count: result.count, message: msg })
      }

      case 'clearThumbnailAll': {
        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            youtubeThumbnailPath: ""
          }
        })
        const msg = `تم حذف الصورة المصغرة لـ ${result.count} قناة بنجاح`
        return NextResponse.json({ success: true, count: result.count, message: msg })
      }

      case 'dailyAll': {
        // Toggle daily for all slots (excluding running ones)
        const safeFilter = { ...userFilter, isRunning: false }
        const dailyCount = await db.streamSlot.count({
          where: { daily: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = dailyCount < total / 2

        const result = await db.streamSlot.updateMany({
          where: safeFilter,
          data: {
            daily: targetState,
            weekly: false,
            hourly: false,
            isScheduled: false,
            manuallyStopped: true,
            nextRunTime: '',
            status: 'Stopped'
          }
        })

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count: result.count, message: `${actionText} Daily for all slots` })
      }

      case 'hourlyAll': {
        // Toggle hourly for all slots (excluding running ones)
        const safeFilter = { ...userFilter, isRunning: false }
        const hourlyCount = await db.streamSlot.count({
          where: { hourly: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = hourlyCount < total / 2

        const result = await db.streamSlot.updateMany({
          where: safeFilter,
          data: {
            hourly: targetState,
            daily: false,
            weekly: false,
            isScheduled: false,
            manuallyStopped: true,
            nextRunTime: '',
            status: 'Stopped'
          }
        })

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count: result.count, message: `${actionText} Hourly for all slots` })
      }

      case 'setClosestHourAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        // The closest next hour is cairoNow.hour + 1, minute 0
        let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, cairoNow.hour + 1, 0, 0)

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        const startTime = formatCairoDate(targetDate)
        // Stop time is +50 minutes
        const stopDate = new Date(targetDate.getTime() + 50 * 60 * 1000)
        const stopTime = formatCairoDate(stopDate)

        const result = await db.streamSlot.updateMany({
          where: { ...userFilter, isRunning: false },
          data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: false,
            manuallyStopped: true,
            nextRunTime: '',
            status: 'Stopped'
          }
        })

        return NextResponse.json({ success: true, count: result.count, message: `Set closest hour schedule (duration 50 mins) for all ${result.count} slots` })
      }

      case 'resetAll': {
        const slotsToReset = await db.streamSlot.findMany({
          where: { ...userFilter, isRunning: false }
        })

        // Stop all streams first
        await Promise.allSettled(
          slotsToReset.map(s =>
            fetch(`${BULK_STREAM_MANAGER}/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotIndex: s.slotIndex })
            })
          )
        )

        const result = await db.streamSlot.updateMany({
          where: { ...userFilter, isRunning: false },
          data: {
            channelName: '',
            filePath: '',
            streamKey: '',
            schedStart: '',
            schedStop: '',
            daily: false,
            weekly: false,
            hourly: false,
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
        const { calculateNextRun } = await import('@/lib/timezone-helper')

        const allSlots = await db.streamSlot.findMany({
          where: {
            schedStart: { not: '' },
            isRunning: false,
            isScheduled: false,
            ...userFilter
          }
        })

        const slots = allSlots.filter(slot => {
          if (slot.inputType !== 'live' && !slot.filePath) return false

          const outputType = slot.outputType || 'youtube'
          if (outputType === 'youtube' || outputType === 'facebook') {
            const ytId = slot.youtubeChannelId
            const hasYtChannel = ytId && ytId.trim() !== '' && ytId.toLowerCase() !== 'null' && ytId.toLowerCase() !== 'undefined'
            const hasStreamKey = slot.streamKey && slot.streamKey.trim() !== ''
            return !!(hasYtChannel || hasStreamKey)
          } else {
            return !!(slot.streamKey && slot.streamKey.trim() !== '')
          }
        })

        const errors: string[] = []
        let count = 0

        for (const slot of slots) {
          try {
            const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly)
            await db.streamSlot.update({
              where: { slotIndex: slot.slotIndex },
              data: {
                isScheduled: true,
                status: 'Scheduled',
                nextRunTime,
                manuallyStopped: false
              }
            })
            count++
          } catch (err: any) {
            errors.push(`Slot ${slot.slotIndex + 1}: Failed to schedule: ${err.message}`)
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
