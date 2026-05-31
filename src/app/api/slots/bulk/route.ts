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

  try {
    const body = await request.json()
    const { action, thumbnailPath, slotIndexes, locale } = body

    const userFilter: any = {}
    if (user.role === 'user') {
      userFilter.slotIndex = { lt: user.slotsLimit }
    }

    if (Array.isArray(slotIndexes)) {
      const validIndexes = slotIndexes.map(Number).filter(idx => {
        if (user.role === 'user') {
          return idx < user.slotsLimit
        }
        return true
      })
      userFilter.slotIndex = { in: validIndexes }
    }

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
          const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m)
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
              status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
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
            data: { status: 'Starting', isRunning: false, manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false, isSwapped: false, schedStart: updatedSchedStart, schedStop: updatedSchedStop }
          })
        }))

        // Phase 3: Fire stream-manager start requests sequentially with a delay to prevent overwhelming the server
        const results: Array<
          | { status: 'fulfilled'; value: { success: boolean; slotIndex: number; message?: string } }
          | { status: 'rejected'; reason: any }
        > = []
        const BATCH_SIZE = 10
        for (let i = 0; i < slotsToStart.length; i += BATCH_SIZE) {
          const batch = slotsToStart.slice(i, i + BATCH_SIZE)

          await Promise.all(batch.map(async (slot) => {
            try {
              let finalInputPath = slot.filePath
              if (slot.inputType === 'live') {
                finalInputPath = `rtmp://127.0.0.1/live/${securityKey}`
              } else if (slot.filePath) {
                const { resolveVideoFileFromFolder, activeMainVideos } = await import('@/lib/run-scheduler')
                finalInputPath = resolveVideoFileFromFolder(slot.filePath, slot.slotIndex, 'main')
                activeMainVideos.set(slot.slotIndex, finalInputPath)
              }

              const outputType = slot.outputType || 'youtube'
              let finalStreamKey = slot.streamKey
              let finalRtmpServer = slot.rtmpServer
              let youtubeBroadcastId = ""

              if (slot.youtubeChannelId && outputType === 'youtube') {
                try {
                  console.log(`[Bulk Start] Slot ${slot.slotIndex}: Setting up YouTube Live broadcast...`)
                  const { setupYoutubeLiveStream } = await import('@/lib/youtube-helper')
                  const { resolveThumbnailFileFromFolder, activeThumbnails } = await import('@/lib/run-scheduler')
                  let resolvedThumbnailPath = slot.youtubeThumbnailPath || undefined
                  if (resolvedThumbnailPath) {
                    resolvedThumbnailPath = resolveThumbnailFileFromFolder(resolvedThumbnailPath, slot.slotIndex)
                    activeThumbnails.set(slot.slotIndex, resolvedThumbnailPath)
                  }

                  let finalTitle = slot.youtubeTitle || 'Live Stream'
                  let finalDescription = slot.youtubeDescription || ''

                  if ((slot as any).titleDescListId) {
                    try {
                      const tdList = await db.titleDescList.findUnique({
                        where: { id: (slot as any).titleDescListId }
                      })
                      if (tdList) {
                        const listData = JSON.parse(tdList.items)
                        const pairs = Array.isArray(listData) ? listData : (listData.pairs || [])
                        if (pairs.length > 0) {
                          const titles = pairs.map((p: any) => p.title).filter((t: string) => t.trim() !== '')
                          const descs = pairs.map((p: any) => p.description).filter((d: string) => d.trim() !== '')
                          if (titles.length > 0) {
                            finalTitle = titles[Math.floor(Math.random() * titles.length)]
                          }
                          if (descs.length > 0) {
                            finalDescription = descs[Math.floor(Math.random() * descs.length)]
                          }
                        }
                      }
                    } catch (e: any) {
                      console.error(`[Bulk Start] Failed to fetch/parse title desc list for slot ${slot.slotIndex}:`, e.message)
                    }
                  }

                  const yt = await setupYoutubeLiveStream(
                    slot.youtubeChannelId,
                    finalTitle,
                    finalDescription,
                    resolvedThumbnailPath,
                    slot.streamKey
                  )
                  finalStreamKey = yt.streamKey || finalStreamKey
                  finalRtmpServer = yt.rtmpServer || finalRtmpServer
                  youtubeBroadcastId = yt.broadcastId || ""
                } catch (ytErr: any) {
                  console.error(`[Bulk Start] Slot ${slot.slotIndex}: YouTube setup failed:`, ytErr.message)
                  await db.streamSlot.update({
                    where: { slotIndex: slot.slotIndex },
                    data: { status: 'Failed', isRunning: false, manuallyStopped: true }
                  })
                  await db.systemLog.create({
                    data: { message: `Slot ${slot.slotIndex + 1}: YouTube API Error: ${ytErr.message}` }
                  })
                  results.push({ status: 'fulfilled', value: { success: false, slotIndex: slot.slotIndex, message: `YouTube API Error: ${ytErr.message}` } })
                  return
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
                const { verifyStreamStatusAfterDelay, lastActionTokens } = await import('@/lib/run-scheduler')
                const token = Math.random().toString(36).substring(7)
                lastActionTokens.set(slot.slotIndex, token)
                verifyStreamStatusAfterDelay(slot.slotIndex, 'start', token)
                results.push({ status: 'fulfilled', value: { success: true, slotIndex: slot.slotIndex } })
              } else {
                await db.streamSlot.update({
                  where: { slotIndex: slot.slotIndex },
                  data: { status: 'Failed', isRunning: false, manuallyStopped: true }
                })
                results.push({ status: 'fulfilled', value: { success: false, slotIndex: slot.slotIndex, message: result.message } })
              }
            } catch (error: any) {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: { status: 'Failed', isRunning: false, manuallyStopped: true }
              })
              await db.systemLog.create({
                data: { message: `Slot ${slot.slotIndex + 1}: ${error.message || 'فشل بدء البث'}` }
              })
              results.push({ status: 'rejected', reason: error })
            }
          }))

          if (i + BATCH_SIZE < slotsToStart.length) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
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

        // Clear maps and trigger verification for stopped slots
        try {
          const { activeMainVideos, activeSwapVideos, verifyStreamStatusAfterDelay, lastActionTokens } = await import('@/lib/run-scheduler')
          for (const s of slotsToStop) {
            activeMainVideos.delete(s.slotIndex)
            activeSwapVideos.delete(s.slotIndex)
            const token = Math.random().toString(36).substring(7)
            lastActionTokens.set(s.slotIndex, token)
            verifyStreamStatusAfterDelay(s.slotIndex, 'stop', token)
          }
        } catch (err: any) {
          console.error('[bulk stop] Verification error:', err.message)
        }

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

      case 'setClosest10m6mAll': {
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
          let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, h, m, 0)
          
          if (targetDate.getTime() <= now.getTime()) {
            targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, h, m + 10, 0)
          }

          const startTime = formatCairoDate(targetDate)
          const stopDate = new Date(targetDate.getTime() + 6 * 60 * 1000) // 6 mins duration
          const stopTime = formatCairoDate(stopDate)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              schedStart: startTime,
              schedStop: stopTime,
              isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
              manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
              nextRunTime: startTime,
              status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
              hourly: false,
              daily: false,
              weekly: false,
              repeat15m: false,
              repeat10m: true,
              repeat30m: false,
              repeat1h: false,
              repeat2h: false
            }
          })
        }

        return NextResponse.json({ success: true, count: slots.length, message: `Set closest 10-min schedule (6m duration) for all ${slots.length} slots` })
      }

      case 'clearTimesAll': {
        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            schedStart: '',
            schedStop: '',
            daily: false,
            weekly: false,
            hourly: false,
            isScheduled: false,
            manuallyStopped: true,
            nextRunTime: '',
            status: 'Stopped'
          }
          })
          count++
        }
        const result = { count }
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
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const dailyCount = await db.streamSlot.count({
          where: { daily: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = dailyCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, true, false, false, false, false, false, false, false)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  daily: true,
                  weekly: false,
                  hourly: false,
                  repeat15m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  daily: true,
                  weekly: false,
                  hourly: false,
                  repeat15m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              daily: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: `${actionText} Daily and updated schedules for all slots` })
      }

      case 'hourlyAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const hourlyCount = await db.streamSlot.count({
          where: { hourly: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = hourlyCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, false, false, true, false, false, false, false, false)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: true,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: true,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              hourly: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: `${actionText} Hourly and updated schedules for all slots` })
      }

      case 'repeat15mAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const matchedCount = await db.streamSlot.count({
          where: { repeat15m: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = matchedCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, false, false, false, false, false, false, true, false)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: true,
                  repeat10m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: true,
                  repeat10m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              repeat15m: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: actionText + " 15-min repeat and updated schedules for all slots" })
      }

      case 'repeat10mAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const matchedCount = await db.streamSlot.count({
          where: { repeat10m: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = matchedCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, false, false, false, false, false, false, false, true)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: true,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: true,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              repeat10m: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: actionText + " 10-min repeat and updated schedules for all slots" })
      }

      case 'repeat30mAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const matchedCount = await db.streamSlot.count({
          where: { repeat30m: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = matchedCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, false, false, false, true, false, false, false, false)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: false,
                  repeat30m: true,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: false,
                  repeat30m: true,
                  repeat1h: false,
                  repeat2h: false,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              repeat30m: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: actionText + " 30-min repeat and updated schedules for all slots" })
      }

      case 'repeat1hAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const matchedCount = await db.streamSlot.count({
          where: { repeat1h: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = matchedCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, false, false, false, false, true, false, false, false)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: false,
                  repeat30m: false,
                  repeat1h: true,
                  repeat2h: false,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: false,
                  repeat30m: false,
                  repeat1h: true,
                  repeat2h: false,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              repeat1h: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: actionText + " 1-hour repeat and updated schedules for all slots" })
      }

      case 'repeat2hAll': {
        const { calculateNextRun } = await import('@/lib/timezone-helper')
        const safeFilter = { ...userFilter, isRunning: false }
        const matchedCount = await db.streamSlot.count({
          where: { repeat2h: true, ...safeFilter }
        })
        const total = await db.streamSlot.count({
          where: safeFilter
        })
        const targetState = matchedCount < total / 2

        let count = 0
        if (targetState) {
          const slots = await db.streamSlot.findMany({ where: safeFilter })
          for (const slot of slots) {
            if (slot.schedStart) {
              const nextRunTime = calculateNextRun(slot.schedStart, false, false, false, false, false, true, false, false)
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: true,
                  isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                  manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
                  nextRunTime,
                  status: 'Scheduled'
                }
              })
            } else {
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  hourly: false,
                  daily: false,
                  weekly: false,
                  repeat15m: false,
                  repeat10m: false,
                  repeat30m: false,
                  repeat1h: false,
                  repeat2h: true,
                  isScheduled: false,
                  manuallyStopped: true,
                  nextRunTime: '',
                  status: 'Stopped'
                }
              })
            }
            count++
          }
        } else {
          const res = await db.streamSlot.updateMany({
            where: safeFilter,
            data: {
              repeat2h: false,
              isScheduled: false,
              manuallyStopped: true,
              nextRunTime: '',
              status: 'Stopped'
            }
          })
          count = res.count
        }

        const actionText = targetState ? 'Enabled' : 'Disabled'
        return NextResponse.json({ success: true, count, message: actionText + " 2-hour repeat and updated schedules for all slots" })
      }

      case 'setClosestHourAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        let targetHour = cairoNow.hour
        let targetMinute = 0
        if (cairoNow.minute < 20) {
          targetMinute = 20
        } else if (cairoNow.minute < 40) {
          targetMinute = 40
        } else {
          targetMinute = 0
          targetHour += 1
        }
        let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, targetHour, targetMinute, 0)

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        const startTime = formatCairoDate(targetDate)
        const stopDate = new Date(targetDate.getTime() + 13 * 60 * 1000)
        const stopTime = formatCairoDate(stopDate)

        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
            manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
            nextRunTime: startTime,
            status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
            hourly: true,
            daily: false,
            weekly: false,
            repeat15m: false,
            repeat10m: false,
            repeat30m: false,
            repeat1h: false,
            repeat2h: false
          }
          })
          count++
        }
        const result = { count }

        return NextResponse.json({ success: true, count: result.count, message: locale === 'ar' ? `تم ضبط أوقات البدء والإيقاف لأقرب 20 دقيقة وبث 13 دقيقة للكل (${startTime})` : `Set closest 20-minute schedule (duration 13 mins) and scheduled all ${result.count} slots` })
      }

      case 'setFileOnlyAll': {
        const result = await db.streamSlot.updateMany({
          where: { ...userFilter, isRunning: false },
          data: {
            inputType: 'file',
            swapVideoEnabled: false,
          }
        })
        return NextResponse.json({
          success: true,
          count: result.count,
          message: locale === 'ar'
            ? `تم تحويل كافة المسارات إلى بث مسجل فقط (إجمالي ${result.count})`
            : `Set all slots to recorded stream only (${result.count} slots)`
        })
      }

      case 'setObsOnlyAll': {
        const result = await db.streamSlot.updateMany({
          where: { ...userFilter, isRunning: false },
          data: {
            inputType: 'live',
            swapVideoEnabled: false,
          }
        })
        return NextResponse.json({
          success: true,
          count: result.count,
          message: locale === 'ar'
            ? `تم تحويل كافة المسارات إلى إعادة بث OBS (إجمالي ${result.count})`
            : `Set all slots to live OBS ingest (${result.count} slots)`
        })
      }

      case 'setClosest15m9mAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        let targetHour = cairoNow.hour
        let targetMinute = 0
        if (cairoNow.minute < 15) {
          targetMinute = 15
        } else if (cairoNow.minute < 30) {
          targetMinute = 30
        } else if (cairoNow.minute < 45) {
          targetMinute = 45
        } else {
          targetMinute = 0
          targetHour += 1
        }
        let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, targetHour, targetMinute, 0)

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        const startTime = formatCairoDate(targetDate)
        const stopDate = new Date(targetDate.getTime() + 9 * 60 * 1000)
        const stopTime = formatCairoDate(stopDate)

        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
            manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
            nextRunTime: startTime,
            status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
            hourly: false,
            daily: false,
            weekly: false,
            repeat15m: true,
            repeat10m: false,
            repeat30m: false,
            repeat1h: false,
            repeat2h: false
          }
          })
          count++
        }
        const result = { count }

        return NextResponse.json({
          success: true,
          count: result.count,
          message: locale === 'ar'
            ? `تم ضبط أوقات البدء والإيقاف لأقرب 15 دقيقة وبث 9 دقائق للكل (${startTime})`
            : `Set all slots to nearest 15 mins (stream 9m) at ${startTime}`
        })
      }

      case 'setClosest30m24mAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        let targetHour = cairoNow.hour
        let targetMinute = 0
        if (cairoNow.minute < 30) {
          targetMinute = 30
        } else {
          targetMinute = 0
          targetHour += 1
        }
        let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, targetHour, targetMinute, 0)

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        const startTime = formatCairoDate(targetDate)
        const stopDate = new Date(targetDate.getTime() + 24 * 60 * 1000)
        const stopTime = formatCairoDate(stopDate)

        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
            manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
            nextRunTime: startTime,
            status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
            hourly: false,
            daily: false,
            weekly: false,
            repeat15m: false,
            repeat10m: false,
            repeat30m: true,
            repeat1h: false,
            repeat2h: false
          }
          })
          count++
        }
        const result = { count }

        return NextResponse.json({
          success: true,
          count: result.count,
          message: locale === 'ar'
            ? `تم ضبط أوقات البدء والإيقاف لأقرب نصف ساعة وبث 24 دقيقة للكل (${startTime})`
            : `Set all slots to nearest 30 mins (stream 24m) at ${startTime}`
        })
      }

      case 'setClosestHour50mAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        let targetHour = cairoNow.hour + 1
        let targetMinute = 0
        let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, targetHour, targetMinute, 0)

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        const startTime = formatCairoDate(targetDate)
        const stopDate = new Date(targetDate.getTime() + 50 * 60 * 1000)
        const stopTime = formatCairoDate(stopDate)

        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
            manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
            nextRunTime: startTime,
            status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
            hourly: false,
            daily: false,
            weekly: false,
            repeat15m: false,
            repeat10m: false,
            repeat30m: false,
            repeat1h: true,
            repeat2h: false
          }
          })
          count++
        }
        const result = { count }

        return NextResponse.json({
          success: true,
          count: result.count,
          message: locale === 'ar'
            ? `تم ضبط أوقات البدء والإيقاف لأقرب ساعة وبث 50 دقيقة للكل (${startTime})`
            : `Set all slots to nearest hour (stream 50m) at ${startTime}`
        })
      }

      case 'setClosest2h110mAll': {
        const { getCairoNowFields, getAbsoluteDateFromCairoFields } = await import('@/lib/timezone-helper')
        const now = new Date()
        const cairoNow = getCairoNowFields(now)

        let targetHour = cairoNow.hour + (2 - (cairoNow.hour % 2))
        let targetMinute = 0
        let targetDate = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, targetHour, targetMinute, 0)

        const formatCairoDate = (date: Date) => {
          const fields = getCairoNowFields(date)
          return `${String(fields.month + 1).padStart(2, '0')}-${String(fields.day).padStart(2, '0')} ${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
        }

        const startTime = formatCairoDate(targetDate)
        const stopDate = new Date(targetDate.getTime() + 110 * 60 * 1000)
        const stopTime = formatCairoDate(stopDate)

        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
            manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
            nextRunTime: startTime,
            status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
            hourly: false,
            daily: false,
            weekly: false,
            repeat15m: false,
            repeat10m: false,
            repeat30m: false,
            repeat1h: false,
            repeat2h: true
          }
          })
          count++
        }
        const result = { count }

        return NextResponse.json({
          success: true,
          count: result.count,
          message: locale === 'ar'
            ? `تم ضبط أوقات البدء والإيقاف لأقرب ساعتين وبث ساعة و50 دقيقة للكل (${startTime})`
            : `Set all slots to nearest 2 hours (stream 1h 50m) at ${startTime}`
        })
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

        const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
            channelName: '',
            filePath: '',
            streamKey: '',
            schedStart: '',
            schedStop: '',
            daily: false,
            weekly: false,
            hourly: false,
            repeat15m: false,
            repeat10m: false,
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
            isSwapped: false
          }
          })
          count++
        }
        const result = { count }

        // Clear maps and trigger verification for reset slots
        try {
          const { activeMainVideos, activeSwapVideos, verifyStreamStatusAfterDelay, lastActionTokens } = await import('@/lib/run-scheduler')
          for (const s of slotsToReset) {
            activeMainVideos.delete(s.slotIndex)
            activeSwapVideos.delete(s.slotIndex)
            const token = Math.random().toString(36).substring(7)
            lastActionTokens.set(s.slotIndex, token)
            verifyStreamStatusAfterDelay(s.slotIndex, 'stop', token)
          }
        } catch (err: any) {
          console.error('[bulk reset] Verification error:', err.message)
        }

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
            const nextRunTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m)
            await db.streamSlot.update({
              where: { slotIndex: slot.slotIndex },
              data: {
                isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
                status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
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

      case 'setMainVideoAll': {
        const { filePath } = body
        if (!filePath) {
          return NextResponse.json({ error: 'Missing filePath' }, { status: 400 })
        }

        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            filePath,
            inputType: 'file'
          }
        })

        return NextResponse.json({ success: true, count: result.count, message: `Set main video path for all ${result.count} slots` })
      }

      case 'setSwapVideoAll': {
        const { swapVideoPath } = body
        if (!swapVideoPath) {
          return NextResponse.json({ error: 'Missing swapVideoPath' }, { status: 400 })
        }

        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            swapVideoPath,
            swapVideoEnabled: true
          }
        })

        return NextResponse.json({ success: true, count: result.count, message: `Set unified swap path for all ${result.count} slots` })
      }

      case 'clearSwapVideoAll': {
        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            swapVideoPath: '',
            swapVideoEnabled: false,
            isSwapped: false
          }
        })

        return NextResponse.json({ success: true, count: result.count, message: `Cleared swap path from all ${result.count} slots` })
      }

      case 'refreshStreamKeysAll': {
        const { refreshAccessToken } = await import('@/lib/youtube-helper')

        const slotsToRefresh = await db.streamSlot.findMany({
          where: {
            outputType: 'youtube',
            youtubeChannelId: { not: null, not: '' },
            ...userFilter
          }
        })

        let count = 0;
        const errors: string[] = []

        for (const slot of slotsToRefresh) {
          try {
            const channelId = slot.youtubeChannelId!
            const accessToken = await refreshAccessToken(channelId)
            const streamsListUrl = 'https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,status&mine=true&maxResults=50'
            const streamsResponse = await fetch(streamsListUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(10000)
            })
            if (!streamsResponse.ok) {
              errors.push(`Slot ${slot.slotIndex + 1}: Failed to fetch from YouTube API`)
              continue
            }
            const streamsData = await streamsResponse.json()
            const items: any[] = streamsData.items || []
            const validStreams = items.filter((item: any) => item.cdn?.ingestionInfo?.streamName)
            
            if (validStreams.length > 0) {
              const streamKey = validStreams[0].cdn.ingestionInfo.streamName
              const rtmpServer = validStreams[0].cdn.ingestionInfo.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2'
              
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: { streamKey, rtmpServer }
              })
              count++
            } else {
              errors.push(`Slot ${slot.slotIndex + 1}: No valid stream keys found`)
            }
          } catch (e: any) {
            errors.push(`Slot ${slot.slotIndex + 1}: ${e.message}`)
          }
        }
        
        return NextResponse.json({
          success: true,
          count,
          errors: errors.length > 0 ? errors : undefined,
          message: `Refreshed stream keys for ${count} slots.`
        })
      }

      case 'setTitleDescAll': {
        const { youtubeTitle, youtubeDescription } = body
        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            youtubeTitle: youtubeTitle || '',
            youtubeDescription: youtubeDescription || ''
          }
        })

        return NextResponse.json({ success: true, count: result.count, message: `تم تعيين العنوان والوصف لـ ${result.count} قناة بنجاح` })
      }

      case 'setEpisodeNumberAll': {
        const { episodeNumber } = body
        const parsedEp = parseInt(episodeNumber)
        if (isNaN(parsedEp) || parsedEp < 1) {
          return NextResponse.json({ error: 'invalidEpisodeNumber' }, { status: 400 })
        }
        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            episodeNumber: parsedEp
          }
        })
        return NextResponse.json({ success: true, count: result.count, message: `تم تعيين رقم الحلقة إلى ${parsedEp} في ${result.count} قناة بنجاح` })
      }

      case 'setTitleDescListAll': {
        const { listId } = body
        console.log("setTitleDescListAll called. listId:", listId, "userFilter:", userFilter)

        const result = await db.streamSlot.updateMany({
          where: userFilter,
          data: {
            titleDescListId: listId || null
          }
        })
        
        console.log("setTitleDescListAll result:", result)

        return NextResponse.json({ success: true, count: result.count, message: `تم تعيين القائمة لـ ${result.count} قناة بنجاح` })
      }

      case 'assignChannelsToSlots': {
        const now = new Date()

        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        // 1. Fetch valid channels (created within the last 7 days)
        const validChannels = await db.youtubeChannel.findMany({
          where: {
            createdAt: { gt: sevenDaysAgo }
          },
          orderBy: { createdAt: 'asc' }
        })

        // 2. Fetch slots the user has access to
        const availableSlots = await db.streamSlot.findMany({
          where: userFilter,
          orderBy: { slotIndex: 'asc' }
        })

        // Find channels that are ALREADY in use by active or scheduled slots
        const usedChannelsInActiveSlots = new Set<string>()
        const freeSlots: any[] = []

        for (const slot of availableSlots) {
          const isBusy = slot.isRunning || slot.isScheduled || slot.status !== 'Stopped'
          if (isBusy) {
            if (slot.youtubeChannelId) {
              usedChannelsInActiveSlots.add(slot.youtubeChannelId)
            }
          } else {
            freeSlots.push(slot)
          }
        }

        // Filter out valid channels that are already being used in active/scheduled slots
        const availableChannels = validChannels.filter(c => !usedChannelsInActiveSlots.has(c.id))

        if (availableChannels.length === 0) {
          return NextResponse.json({ success: true, count: 0, assignedSlots: [], message: 'لا توجد قنوات متاحة للتعيين' })
        }

        let assignedCount = 0
        const assignedSlots: any[] = []

        // Assign channels to free slots
        for (let i = 0; i < Math.min(freeSlots.length, availableChannels.length); i++) {
          const slot = freeSlots[i]
          const channel = availableChannels[i]

          await db.streamSlot.update({
            where: { id: slot.id },
            data: {
              youtubeChannelId: channel.id,
              streamKey: '' // Auto Fetch
            }
          })
          assignedCount++
          assignedSlots.push(slot.slotIndex)
        }

        return NextResponse.json({
          success: true,
          count: assignedCount,
          assignedSlots,
          message: `تم تعيين ${assignedCount} قناة بنجاح`
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
