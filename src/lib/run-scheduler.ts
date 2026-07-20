/**
 * run-scheduler.ts
 *
 * Core scheduling logic extracted so it can be called:
 *   (a) Directly from server-scheduler.ts (no HTTP, no loopback)
 *   (b) Via the GET /api/scheduler HTTP endpoint (for manual triggers / debugging)
 *
 * This eliminates the loopback fetch that was fragile in Docker/standalone.
 */

import { db } from '@/lib/db'
import { STREAM_MANAGER_URL } from '@/lib/paths'
import { setupYoutubeLiveStream, stopYoutubeLiveStream } from '@/lib/youtube-helper'
import { getCairoNowFields, getCairoTargetDate, getAbsoluteDateFromCairoFields } from '@/lib/timezone-helper'
import fs from 'fs'
import path from 'path'

// Tracks consecutive missed ticks per slot
const missCounters = new Map<string, number>()

// Per-slot backoff state (survives between ticks via module-level Map)
interface SlotRecoveryState {
  crashCount: number     // total confirmed crashes
  backoffLevel: number   // 0=5s,1=1m,2=3m,3=10m,4=failed
  pendingUntil: number   // epoch ms — skip recovery until this time
}
// Use globalThis so state survives HMR reloads in dev
const g = globalThis as any
if (!g.__qaffRecoveryStates) g.__qaffRecoveryStates = new Map<string, SlotRecoveryState>()
const recoveryStates: Map<string, SlotRecoveryState> = g.__qaffRecoveryStates

if (!g.__qaffActiveMainVideos) g.__qaffActiveMainVideos = new Map<number, string>()
export const activeMainVideos: Map<number, string> = g.__qaffActiveMainVideos

if (!g.__qaffActiveSwapVideos) g.__qaffActiveSwapVideos = new Map<number, string>()
export const activeSwapVideos: Map<number, string> = g.__qaffActiveSwapVideos

if (!g.__qaffActiveThumbnails) g.__qaffActiveThumbnails = new Map<number, string>()
export const activeThumbnails: Map<number, string> = g.__qaffActiveThumbnails

interface FolderQueue {
  files: string[]
  currentIndex: number
}

if (!g.__qaffFolderQueues) g.__qaffFolderQueues = new Map<string, FolderQueue>()
const folderQueues: Map<string, FolderQueue> = g.__qaffFolderQueues

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function getCurrentlyActiveFiles(excludeSlotIndex: number): Set<string> {
  const active = new Set<string>()
  for (const [slotIdx, filePath] of activeMainVideos.entries()) {
    if (slotIdx !== excludeSlotIndex && filePath) {
      active.add(path.resolve(filePath))
    }
  }
  for (const [slotIdx, filePath] of activeSwapVideos.entries()) {
    if (slotIdx !== excludeSlotIndex && filePath) {
      active.add(path.resolve(filePath))
    }
  }
  return active
}

export function resolveVideoFileFromFolder(filePathOrDir: string, slotIndex: number, type: 'main' | 'swap'): string {
  try {
    let stats: fs.Stats
    try {
      stats = fs.statSync(filePathOrDir)
    } catch (fsErr: any) {
      throw new Error(`المسار المحدد غير موجود أو لا يمكن الوصول إليه: ${filePathOrDir}`)
    }

    if (!stats.isDirectory()) {
      return filePathOrDir
    }

    const files = fs.readdirSync(filePathOrDir)
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.webm', '.m4v']
    const videoFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase()
        return videoExtensions.includes(ext)
      })
      .map(file => path.join(filePathOrDir, file))

    if (videoFiles.length === 0) {
      throw new Error(`المجلد لا يحتوي على أي ملفات فيديو صالحة (مثل mp4, mkv, avi): ${filePathOrDir}`)
    }

    const queueKey = `${slotIndex}_${type}`
    let queue = folderQueues.get(queueKey)

    const needsNewQueue = !queue || 
      queue.currentIndex >= queue.files.length || 
      queue.files.length !== videoFiles.length ||
      !videoFiles.every(f => queue!.files.includes(f))

    if (needsNewQueue) {
      let shuffled = shuffleArray(videoFiles)
      const lastSelectedKey = `${slotIndex}_${type}_last`
      const lastSelected = g[lastSelectedKey]
      if (shuffled.length > 1 && shuffled[0] === lastSelected) {
        [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
      }

      queue = {
        files: shuffled,
        currentIndex: 0
      }
      folderQueues.set(queueKey, queue)
    }

    let selectedFile = queue!.files[queue!.currentIndex]
    const activeFiles = getCurrentlyActiveFiles(slotIndex)

    if (activeFiles.has(path.resolve(selectedFile))) {
      let alternativeIndex = -1
      for (let idx = queue!.currentIndex + 1; idx < queue!.files.length; idx++) {
        if (!activeFiles.has(path.resolve(queue!.files[idx]))) {
          alternativeIndex = idx
          break
        }
      }

      if (alternativeIndex !== -1) {
        const temp = queue!.files[queue!.currentIndex]
        queue!.files[queue!.currentIndex] = queue!.files[alternativeIndex]
        queue!.files[alternativeIndex] = temp
        selectedFile = queue!.files[queue!.currentIndex]
        console.log(`[Scheduler Queue] Slot ${slotIndex + 1} (${type}): file ${path.basename(temp)} was active on another slot. Swapped with alternative: ${path.basename(selectedFile)}`)
      } else {
        console.log(`[Scheduler Queue] Slot ${slotIndex + 1} (${type}): file ${path.basename(selectedFile)} is active, but no alternative non-active files exist in queue. Proceeding.`)
      }
    }

    queue!.currentIndex++
    
    const lastSelectedKey = `${slotIndex}_${type}_last`
    g[lastSelectedKey] = selectedFile

    console.log(`[Scheduler Queue] Slot ${slotIndex + 1} (${type}): selected ${path.basename(selectedFile)} (${queue!.currentIndex}/${queue!.files.length} in queue)`)
    return selectedFile
  } catch (e: any) {
    console.error(`[Scheduler] Error resolving video file from directory ${filePathOrDir}:`, e)
    throw new Error(e.message || `فشل في الوصول إلى مسار الفيديو: ${filePathOrDir}`)
  }
}

function resolveSwapVideoFile(filePathOrDir: string, slotIndex: number): string {
  return resolveVideoFileFromFolder(filePathOrDir, slotIndex, 'swap')
}

export function resolveThumbnailFileFromFolder(filePathOrDir: string, slotIndex: number): string {
  try {
    let stats: fs.Stats
    try {
      stats = fs.statSync(filePathOrDir)
    } catch (fsErr: any) {
      throw new Error(`مسار الصورة المصغرة غير موجود أو لا يمكن الوصول إليه: ${filePathOrDir}`)
    }

    if (!stats.isDirectory()) {
      return filePathOrDir
    }

    const files = fs.readdirSync(filePathOrDir)
    const imageExtensions = ['.png', '.jpg', '.jpeg']
    const imageFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase()
        return imageExtensions.includes(ext)
      })
      .map(file => path.join(filePathOrDir, file))

    if (imageFiles.length === 0) {
      throw new Error(`المجلد لا يحتوي على أي صور مصغرة صالحة (مثل png, jpg, jpeg): ${filePathOrDir}`)
    }

    const queueKey = `${slotIndex}_thumbnail`
    let queue = folderQueues.get(queueKey)

    const needsNewQueue = !queue || 
      queue.currentIndex >= queue.files.length || 
      queue.files.length !== imageFiles.length ||
      !imageFiles.every(f => queue!.files.includes(f))

    if (needsNewQueue) {
      let shuffled = shuffleArray(imageFiles)
      const lastSelectedKey = `${slotIndex}_thumbnail_last`
      const lastSelected = g[lastSelectedKey]
      if (shuffled.length > 1 && shuffled[0] === lastSelected) {
        [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
      }

      queue = {
        files: shuffled,
        currentIndex: 0
      }
      folderQueues.set(queueKey, queue)
    }

    const selectedFile = queue!.files[queue!.currentIndex]
    queue!.currentIndex++
    
    const lastSelectedKey = `${slotIndex}_thumbnail_last`
    g[lastSelectedKey] = selectedFile

    console.log(`[Scheduler Queue] Slot ${slotIndex + 1} (thumbnail): selected ${path.basename(selectedFile)} (${queue!.currentIndex}/${queue!.files.length} in queue)`)
    return selectedFile
  } catch (e: any) {
    console.error(`[Scheduler] Error resolving thumbnail file from directory ${filePathOrDir}:`, e)
    throw new Error(e.message || `فشل في الوصول إلى مسار الصورة المصغرة: ${filePathOrDir}`)
  }
}

if (!g.__qaffLastActionTokens) g.__qaffLastActionTokens = new Map<number, string>()
export const lastActionTokens: Map<number, string> = g.__qaffLastActionTokens

export function verifyStreamStatusAfterDelay(
  slotIndex: number,
  action: 'start' | 'stop' | 'swap',
  token: string,
  expectedFilePath?: string
) {
  setTimeout(async () => {
    try {
      const currentToken = lastActionTokens.get(slotIndex)
      if (currentToken !== token) {
        console.log(`[Verification] Bypassed verification for Slot ${slotIndex + 1} (${action.toUpperCase()}) because a newer action was performed (Token: ${token} !== Current: ${currentToken})`)
        return
      }

      console.log(`[Verification] Starting 10-second check for Slot ${slotIndex + 1} after ${action.toUpperCase()} (Token: ${token})`)
      
      let activeInManager = false
      let currentFilePath = ''
      try {
        const res = await fetch(`${STREAM_MANAGER_URL}/status?slotIndex=${slotIndex}`)
        if (res.ok) {
          const data = await res.json()
          activeInManager = data.isRunning && (data.status === 'running' || data.status === 'connecting' || data.status === 'queued')
          currentFilePath = data.filePath || ''
        } else {
          await db.systemLog.create({
            data: { message: `[Verification Error] Slot ${slotIndex + 1}: Stream manager status returned HTTP ${res.status}` }
          })
        }
      } catch (err: any) {
        console.error(`[Verification] Cannot reach stream-manager for Slot ${slotIndex + 1}:`, err.message)
        await db.systemLog.create({
          data: { message: `[Verification Error] Slot ${slotIndex + 1}: Cannot reach stream-manager: ${err.message}` }
        })
      }

      const slot = await db.streamSlot.findUnique({ where: { slotIndex } })
      if (!slot) return

      // Double check token again after DB fetch to be extremely race-safe
      if (lastActionTokens.get(slotIndex) !== token) return

      if (action === 'stop') {
        const dbRunning = slot.isRunning
        if (dbRunning || activeInManager) {
          console.warn(`[Verification WARNING] Slot ${slotIndex + 1} was stopped but is still active! Force stopping...`)
          await db.systemLog.create({
            data: { message: `[Verification Warning] Slot ${slotIndex + 1} stopped but still active after 10s. Force-stopping.` }
          })
          
          try {
            await fetch(`${STREAM_MANAGER_URL}/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotIndex })
            })
          } catch (e: any) {
            console.error(`[Verification Force Stop] Failed to send stop request:`, e.message)
          }

          if (slot.youtubeChannelId && slot.youtubeBroadcastId && slot.outputType === 'youtube') {
            try {
              await stopYoutubeLiveStream(slot.youtubeChannelId, slot.youtubeBroadcastId)
            } catch {}
          }

          await db.streamSlot.update({
            where: { slotIndex },
            data: { isRunning: false, status: slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h ? 'Scheduled' : 'Stopped' }
          })
        } else {
          console.log(`[Verification SUCCESS] Slot ${slotIndex + 1} is stopped successfully after 10s.`)
        }
      } 
      else if (action === 'start') {
        const dbRunning = slot.isRunning
        if (!dbRunning || !activeInManager) {
          console.warn(`[Verification WARNING] Slot ${slotIndex + 1} was started but is NOT running after 10s!`)
          
          const stateKey = `state_${slotIndex}`
          const state = recoveryStates.get(stateKey) ?? { crashCount: 0, backoffLevel: 0, pendingUntil: 0 }
          state.crashCount++
          
          const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
          if (state.crashCount >= MAX_CRASH_COUNT) {
            recoveryStates.delete(stateKey)
            
            if (isRecurring) {
              // Reschedule recurring stream for next run
              const now = new Date()
              let nextStartTime = slot.schedStart || ''
              let nextStopTime = slot.schedStop || ''
              const oldStart = parseScheduleTime(slot.schedStart)
              const oldStop = parseScheduleTime(slot.schedStop)
              if (oldStart && oldStop) {
                let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
                if (durMins < 0) durMins += 1440
                nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m, slot.repeat12h)
                const nParsed = parseScheduleTime(nextStartTime)
                if (nParsed) {
                  const nDate = getCairoTargetDate(nParsed, now)
                  const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
                  const stopFields = getCairoNowFields(stopDate)
                  nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
                }
              }
              
              await db.streamSlot.update({
                where: { slotIndex },
                data: {
                  isRunning: false,
                  isScheduled: true,
                  status: 'Scheduled',
                  schedStart: nextStartTime,
                  schedStop: nextStopTime,
                  nextRunTime: nextStartTime,
                  isSwapped: false,
                  youtubeBroadcastId: '',
                  manuallyStopped: false
                }
              })
              await db.systemLog.create({
                data: { message: `Slot ${slotIndex + 1}: Start failed verification after 10s (Crash ${state.crashCount}/${MAX_CRASH_COUNT}). Rescheduling for the next occurrence.` }
              })
            } else {
              // One-time or manual 24/7 stream: mark Failed and set manuallyStopped: true
              await db.streamSlot.update({
                where: { slotIndex },
                data: {
                  isRunning: false,
                  isScheduled: false,
                  status: 'Failed',
                  manuallyStopped: true,
                  isSwapped: false,
                  youtubeBroadcastId: ''
                }
              })
              await db.systemLog.create({
                data: { message: `Slot ${slotIndex + 1}: Start failed verification after 10s (Crash ${state.crashCount}/${MAX_CRASH_COUNT}). Stopping.` }
              })
            }
          } else {
            // Apply backoff delay
            const delay = BACKOFF_DELAYS_MS[Math.min(state.backoffLevel, BACKOFF_DELAYS_MS.length - 1)]
            state.backoffLevel++
            state.pendingUntil = Date.now() + delay
            recoveryStates.set(stateKey, state)
            
            await db.streamSlot.update({
              where: { slotIndex },
              data: {
                isRunning: false,
                isScheduled: isRecurring ? true : false,
                status: 'Scheduled',
                manuallyStopped: false
              }
            })
            await db.systemLog.create({
              data: { message: `Slot ${slotIndex + 1}: Start failed verification after 10s. Retrying in ${Math.round(delay/1000)}s (Crash ${state.crashCount}/${MAX_CRASH_COUNT}).` }
            })
          }
        } else {
          console.log(`[Verification SUCCESS] Slot ${slotIndex + 1} is running successfully after 10s.`)
          // Reset recovery state on successful start confirmation
          const stateKey = `state_${slotIndex}`
          recoveryStates.delete(stateKey)
        }
      } 
      else if (action === 'swap') {
        const dbRunning = slot.isRunning
        
        // Detailed debug log written to DB to diagnose high-concurrency swap status
        await db.systemLog.create({
          data: { 
            message: `[Verification Debug] Slot ${slotIndex + 1} swap check: dbRunning=${dbRunning}, activeInManager=${activeInManager}, expectedFilePath=${expectedFilePath ? path.basename(expectedFilePath) : 'none'}, currentFilePath=${currentFilePath ? path.basename(currentFilePath) : 'none'}` 
          }
        })

        if (!dbRunning || !activeInManager) {
          console.warn(`[Verification WARNING] Slot ${slotIndex + 1} was swapped but is NOT running after 10s!`)
          await db.systemLog.create({
            data: { message: `[Verification Warning] Slot ${slotIndex + 1} was swapped but is NOT running after 10s. (Detail: dbRunning=${dbRunning}, activeInManager=${activeInManager})` }
          })
        } else if (expectedFilePath && path.resolve(currentFilePath) !== path.resolve(expectedFilePath)) {
          console.warn(`[Verification WARNING] Slot ${slotIndex + 1} swap file mismatch! Expected: ${expectedFilePath}, Got: ${currentFilePath}`)
          await db.systemLog.create({
            data: { message: `[Verification Warning] Slot ${slotIndex + 1} swap file mismatch after 10s. Expected: ${expectedFilePath}` }
          })
        } else {
          console.log(`[Verification SUCCESS] Slot ${slotIndex + 1} swapped to ${expectedFilePath} successfully.`)
        }
      }
    } catch (e: any) {
      console.error(`[Verification Error] Error verifying Slot ${slotIndex + 1}:`, e.message)
    }
  }, 10000)
}

const BACKOFF_DELAYS_MS = [8_000, 15_000, 60_000, 300_000]  // 8s, 15s, 1m, 5m
const MAX_CRASH_COUNT = BACKOFF_DELAYS_MS.length  // after 4 crashes → failed

// Helper to execute fetch requests with a strict timeout to prevent thread lockup
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(id)
  }
}

function parseScheduleTime(sched: string): { month: number; day: number; hour: number; minute: number } | null {
  try {
    const parts = sched.split(' ')
    if (parts.length !== 2) return null
    const [datePart, timePart] = parts
    const [month, day] = datePart.split('-').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    if (isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) return null
    return { month, day, hour, minute }
  } catch {
    return null
  }
}

// Normalize a date to the current-year context (handles cross-year schedules up to ±180 days)
// (Deprecating server-local normalizeToNow in favor of getCairoTargetDate from timezone-helper)

/**
 * resolveStopDate
 *
 * Converts schedStop to an actual Date regardless of format:
 *  - "MM-DD HH:MM"  → direct parse
 *  - "DUR HH:MM"    → anchorDate + duration minutes
 *
 * anchorDate is schedStart date (for window checks) or now (for live start).
 */
function resolveStopDate(schedStop: string, anchorDate: Date, now: Date): Date | null {
  if (!schedStop) return null

  if (schedStop.startsWith('DUR ')) {
    const [hStr, mStr] = schedStop.replace('DUR ', '').split(':')
    const durMins = parseInt(hStr || '0') * 60 + parseInt(mStr || '0')
    if (isNaN(durMins) || durMins <= 0) return null
    return new Date(anchorDate.getTime() + durMins * 60 * 1000)
  }

  const parsedStop = parseScheduleTime(schedStop)
  if (!parsedStop) return null
  return getCairoTargetDate(parsedStop, now)
}

/**
 * durToActualStop
 *
 * If schedStop is in "DUR HH:MM" format, converts it to "MM-DD HH:MM" string
 * based on the given startDate. Used when the scheduler auto-starts a stream
 * so the DB always stores the real stop datetime for the auto-stop check.
 */
function durToActualStop(schedStop: string, startDate: Date): string {
  if (!schedStop || !schedStop.startsWith('DUR ')) return schedStop
  const [hStr, mStr] = schedStop.replace('DUR ', '').split(':')
  const durMins = parseInt(hStr || '0') * 60 + parseInt(mStr || '0')
  if (isNaN(durMins) || durMins <= 0) return schedStop
  
  const stopAt = new Date(startDate.getTime() + durMins * 60 * 1000)
  const cairoFields = getCairoNowFields(stopAt)
  const monthStr = String(cairoFields.month + 1).padStart(2, '0')
  const dayStr = String(cairoFields.day).padStart(2, '0')
  const hourStr = String(cairoFields.hour).padStart(2, '0')
  const minuteStr = String(cairoFields.minute).padStart(2, '0')
  
  return `${monthStr}-${dayStr} ${hourStr}:${minuteStr}`
}

function calculateNextRun(
  schedStart: string,
  daily: boolean,
  weekly: boolean,
  hourly?: boolean,
  repeat30m?: boolean,
  repeat1h?: boolean,
  repeat2h?: boolean,
  repeat15m?: boolean,
  repeat10m?: boolean,
  repeat12h?: boolean
): string {
  if (!schedStart) return ''
  const now = new Date()
  try {
    const parsed = parseScheduleTime(schedStart)
    if (!parsed) return ''
    const { month, day, hour, minute } = parsed

    let intervalMins = 0
    if (repeat10m) intervalMins = 10
    else if (repeat15m) intervalMins = 15
    else if (hourly) intervalMins = 20
    else if (repeat30m) intervalMins = 30
    else if (repeat1h) intervalMins = 60
    else if (repeat2h) intervalMins = 120
    else if (repeat12h) intervalMins = 720

    if (intervalMins > 0) {
      const cairoNow = getCairoNowFields(now)
      let nextRun = getAbsoluteDateFromCairoFields(cairoNow.year, month - 1, day, hour, minute, 0)
      
      if (now >= nextRun) {
        const diffMs = now.getTime() - nextRun.getTime()
        const intervalsNeeded = Math.floor(diffMs / (intervalMins * 60000)) + 1
        nextRun = new Date(nextRun.getTime() + intervalsNeeded * intervalMins * 60000)
      }
      
      const finalFields = getCairoNowFields(nextRun)
      return `${String(finalFields.month + 1).padStart(2, '0')}-${String(finalFields.day).padStart(2, '0')} ${String(finalFields.hour).padStart(2, '0')}:${String(finalFields.minute).padStart(2, '0')}`
    }
    if (daily) {
      const cairoNow = getCairoNowFields(now)
      let nextRun = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, hour, minute, 0)
      
      if (now >= nextRun) {
        // Shift by 24 hours
        const nextDayDate = new Date(nextRun.getTime() + 24 * 60 * 60 * 1000)
        const nextDayFields = getCairoNowFields(nextDayDate)
        nextRun = getAbsoluteDateFromCairoFields(nextDayFields.year, nextDayFields.month, nextDayFields.day, hour, minute, 0)
      }
      
      const finalFields = getCairoNowFields(nextRun)
      return `${String(finalFields.month + 1).padStart(2, '0')}-${String(finalFields.day).padStart(2, '0')} ${String(finalFields.hour).padStart(2, '0')}:${String(finalFields.minute).padStart(2, '0')}`
    }
    if (weekly) {
      const cairoNow = getCairoNowFields(now)
      const refDate = getAbsoluteDateFromCairoFields(cairoNow.year, month - 1, day, hour, minute, 0)
      const refFields = getCairoNowFields(refDate)
      const targetWeekday = refFields.weekday
      
      let daysAhead = (targetWeekday - cairoNow.weekday + 7) % 7
      
      const todayTarget = getAbsoluteDateFromCairoFields(cairoNow.year, cairoNow.month, cairoNow.day, hour, minute, 0)
      if (daysAhead === 0 && now >= todayTarget) {
        daysAhead = 7
      }
      
      const nextRunDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
      const nextRunFields = getCairoNowFields(nextRunDate)
      const nextRun = getAbsoluteDateFromCairoFields(nextRunFields.year, nextRunFields.month, nextRunFields.day, hour, minute, 0)
      const finalFields = getCairoNowFields(nextRun)
      
      return `${String(finalFields.month + 1).padStart(2, '0')}-${String(finalFields.day).padStart(2, '0')} ${String(finalFields.hour).padStart(2, '0')}:${String(finalFields.minute).padStart(2, '0')}`
    }
    return schedStart
  } catch {
    return ''
  }
}

/**
 * isWithinActiveWindow
 *
 * Returns true if now is inside [schedStart, schedStop).
 * Handles both "MM-DD HH:MM" and "DUR HH:MM" for schedStop.
 *
 * For DUR format: stop = schedStart + duration.
 * Example: schedStart="04-11 00:00", schedStop="DUR 11:45", now=03:00 → TRUE
 */
function isWithinActiveWindow(schedStart: string, schedStop: string): boolean {
  const parsedStart = parseScheduleTime(schedStart)
  if (!parsedStart) return false

  const now = new Date()
  const startDate = getCairoTargetDate(parsedStart, now)

  // For DUR format: compute stop relative to the stored schedStart date
  const stopDate = resolveStopDate(schedStop, startDate, now)
  if (!stopDate) return false

  // We're in the window: start has passed, stop hasn't yet
  const result = startDate <= now && now < stopDate
  console.log(`[Scheduler] isWithinActiveWindow: start=${startDate.toISOString()}, stop=${stopDate.toISOString()}, now=${now.toISOString()}, result=${result}`)
  return result
}

function shouldTrigger(sched: string, slotIndex: number, isStopCheck = false, hasSwapEnabled = false): boolean {
  if (!sched || sched.startsWith('DUR')) return false
  const parsed = parseScheduleTime(sched)
  if (!parsed) {
    console.warn(`[Scheduler] Cannot parse schedule: "${sched}"`)
    return false
  }

  const now = new Date()
  const target = getCairoTargetDate(parsed, now)

  // Pseudo-random deterministic jitter between -150 to +150 seconds
  const seedString = `${sched}_${slotIndex}_${isStopCheck ? 'stop' : 'start'}`
  let hash = 0
  for (let i = 0; i < seedString.length; i++) hash = Math.imul(31, hash) + seedString.charCodeAt(i)
  hash = Math.abs(hash)
  let jitterSecs = (hash % 301) - 150
  
  if (isStopCheck && hasSwapEnabled && jitterSecs < 0) {
    // Prevent stopping early if swap video is enabled to ensure the swap video gets its full 2 minutes
    jitterSecs = 0 
  }
  
  // Fully timezone-safe timestamp jitter adjustment
  target.setTime(target.getTime() + jitterSecs * 1000)

  const diffSecs = Math.floor((now.getTime() - target.getTime()) / 1000)
  // Stop: 5-minute grace window (generous for 15s tick interval)
  // Start: 5-minute exact trigger window
  const graceSecs = 300

  const result = diffSecs >= 0 && diffSecs <= graceSecs
  console.log(`[Scheduler] shouldTrigger(Slot ${slotIndex + 1}, ${isStopCheck ? 'STOP' : 'START'}): sched="${sched}", jitter=${jitterSecs}s, diffSecs=${diffSecs}, target=${target.toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo' })}, trigger=${result}`)

  return result
}

export function getCycleRandomStopMins(slotIndex: number, lastSwitchTime: Date, intervalMins: number): number {
  // Base stop offset: 7 minutes before end of interval (for 60m -> 53 minutes).
  // Random jitter: ±2 minutes (between -2.0 and +2.0 minutes).
  // Target run duration = (intervalMins - 7) + jitter => for 60m: 51.0m to 55.0m.
  const seed = (slotIndex + 1) * 100000 + Math.floor(lastSwitchTime.getTime() / 60000)
  const x = Math.sin(seed) * 10000
  const randomFactor = x - Math.floor(x)
  const jitterMins = (randomFactor * 4) - 2
  const stopTarget = Math.max(1, (intervalMins - 7) + jitterMins)
  return stopTarget
}

async function triggerPlaylistSwitch(slot: any, playlist: any[], now: Date) {
  const nextIndex = (slot.currentPlaylistItemIndex + 1) % playlist.length
  const nextItem = playlist[nextIndex]
  
  try {
    // 0. Update DB state immediately to prevent multiple triggers in next ticks
    await db.streamSlot.update({
      where: { slotIndex: slot.slotIndex },
      data: {
        currentPlaylistItemIndex: nextIndex,
        lastVideoSwitchTime: now.toISOString(),
        status: 'Streaming',
        isSwapped: false,
        youtubeBroadcastId: ''
      }
    })

    console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Playlist switch triggered! Swapping to index ${nextIndex}: ${nextItem.videoPath}`)

    // 1. Stop current stream
    await fetchWithTimeout(`${STREAM_MANAGER_URL}/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotIndex: slot.slotIndex })
    }, 5000)

    // 2. Stop YouTube Live broadcast if applicable
    if (slot.youtubeChannelId && slot.youtubeBroadcastId && slot.outputType === 'youtube') {
      try {
        await stopYoutubeLiveStream(slot.youtubeChannelId, slot.youtubeBroadcastId)
      } catch (ytErr: any) {
        console.error(`[Scheduler] Stop YT broadcast failed during playlist switch:`, ytErr.message)
      }
    }

    // 3. Wait 6 seconds
    await new Promise(r => setTimeout(r, 6000))

    // 4. Resolve new Title/Description (pick a matching random pair)
    let finalTitle = slot.youtubeTitle || 'Live Stream'
    let finalDescription = slot.youtubeDescription || ''
    
    const listIdToUse = nextItem.titleDescListId || slot.titleDescListId
    if (listIdToUse) {
      try {
        const tdList = await db.titleDescList.findUnique({
          where: { id: listIdToUse }
        })
        if (tdList) {
          const listData = JSON.parse(tdList.items)
          const pairs = Array.isArray(listData) ? listData : (listData.pairs || [])
          const validPairs = pairs.filter((p: any) => p && p.title && p.title.trim() !== '')
          if (validPairs.length > 0) {
            const randomPair = validPairs[Math.floor(Math.random() * validPairs.length)]
            finalTitle = randomPair.title
            finalDescription = randomPair.description || ''
          }
        }
      } catch (tdErr: any) {
        console.error(`[Scheduler] TitleDesc fetch failed during playlist switch:`, tdErr.message)
      }
    }

    // Episode number replacement
    const epNum = slot.episodeNumber || 1
    const episodeRegex = /\{add\}/gi
    if (episodeRegex.test(finalTitle) || episodeRegex.test(finalDescription)) {
      finalTitle = finalTitle.replace(episodeRegex, epNum.toString())
      finalDescription = finalDescription.replace(episodeRegex, epNum.toString())
      await db.streamSlot.update({
        where: { slotIndex: slot.slotIndex },
        data: { episodeNumber: { increment: 1 } }
      })
    }

    // 5. Setup new YouTube Live Broadcast
    let finalStreamKey = slot.streamKey
    let finalRtmpServer = slot.rtmpServer
    let newBroadcastId = ''
    
    if (slot.youtubeChannelId && slot.outputType === 'youtube') {
      try {
        let resolvedThumbnailPath = nextItem?.thumbnailPath || slot.youtubeThumbnailPath || undefined
        if (resolvedThumbnailPath) {
          resolvedThumbnailPath = resolveThumbnailFileFromFolder(resolvedThumbnailPath, slot.slotIndex)
          activeThumbnails.set(slot.slotIndex, resolvedThumbnailPath)
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
        newBroadcastId = yt.broadcastId || ''
      } catch (ytErr: any) {
        console.error(`[Scheduler] Setup YT stream failed during playlist switch:`, ytErr.message)
      }
    }

    // 6. Update DB with final keys & resolved filePath
    await db.streamSlot.update({
      where: { slotIndex: slot.slotIndex },
      data: {
        filePath: nextItem.videoPath,
        youtubeTitle: finalTitle,
        youtubeDescription: finalDescription,
        youtubeBroadcastId: newBroadcastId,
        streamKey: finalStreamKey,
        rtmpServer: finalRtmpServer
      }
    })

    // 7. Start the stream in manager
    const startRes = await fetchWithTimeout(`${STREAM_MANAGER_URL}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slotIndex: slot.slotIndex,
        outputType: slot.outputType,
        rtmpServer: finalRtmpServer,
        streamKey: finalStreamKey,
        filePath: nextItem.videoPath
      })
    }, 5000)

    const startData = await startRes.json()
    if (startRes.ok && startData.success) {
      const token = Math.random().toString(36).substring(7)
      lastActionTokens.set(slot.slotIndex, token)
      verifyStreamStatusAfterDelay(slot.slotIndex, 'start', token)
      await db.systemLog.create({
        data: { message: `Slot ${slot.slotIndex + 1}: Switched to playlist item ${nextIndex} (${path.basename(nextItem.videoPath)})` }
      })
    } else {
      throw new Error(startData.message || 'Stream manager rejected start')
    }
  } catch (err: any) {
    console.error(`[Scheduler] Playlist switch failed for slot ${slot.slotIndex + 1}:`, err.message)
    await db.systemLog.create({
      data: { message: `Slot ${slot.slotIndex + 1}: Playlist switch failed: ${err.message}` }
    })
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

export interface SchedulerResult {
  started: number
  stopped: number
  logs: string[]
  timestamp: string
}

export async function runSchedulerTick(): Promise<SchedulerResult> {
  const now = new Date()

  // Distributed lock: prevent concurrent execution across multiple Next.js workers.
  const LOCK_KEY = '__scheduler_last_run__'
  const LOCK_INTERVAL_MS = 30_000 // 30 seconds

  const lastRunLog = await db.systemLog.findFirst({
    where: { message: { startsWith: LOCK_KEY } },
    orderBy: { timestamp: 'desc' }
  })

  if (lastRunLog) {
    const elapsed = now.getTime() - new Date(lastRunLog.timestamp).getTime()
    if (elapsed < LOCK_INTERVAL_MS) {
      return { started: 0, stopped: 0, logs: [], timestamp: now.toISOString() }
    }
  }

  await db.systemLog.create({ data: { message: `${LOCK_KEY}${now.toISOString()}` } })

  // Fetch client user to get security key for live streaming
  const clientUser = await db.user.findUnique({
    where: { username: 'user' }
  })
  const securityKey = clientUser?.securityKey || 'qaff-key-123'

  console.log(`[Scheduler] Tick at ${now.toISOString()}`)
  const logs: string[] = []
  let startedCount = 0
  let stoppedCount = 0

  // 1) Fetch currently active and queued streams from Stream Manager
  let activeInManager: Set<number> = new Set()
  let queuedInManager: Set<number> = new Set()
  let streamManagerResponded = false
  let streamManagerUptimeMs = Infinity
  let isManagerInStartupGrace = false
  try {
    const res = await fetchWithTimeout(`${STREAM_MANAGER_URL}/status`, {}, 3000)
    if (res.ok) {
      streamManagerResponded = true
      const data = await res.json()
      if (Array.isArray(data.activeStreams)) {
        activeInManager = new Set(data.activeStreams)
      }
      if (Array.isArray(data.queuedStreams)) {
        queuedInManager = new Set(data.queuedStreams)
      }
      if (typeof data.uptimeMs === 'number') {
        streamManagerUptimeMs = data.uptimeMs
        // Respect stream-manager's own 90-second startup grace (it needs time to auto-resume)
        isManagerInStartupGrace = data.isInStartupGrace === true
      }
    } else {
      console.warn(`[Scheduler] stream-manager /status returned HTTP ${res.status}`)
    }
  } catch (e: any) {
    console.warn(`[Scheduler] Cannot reach stream-manager: ${e.message}`)
  }

  const slots = await db.streamSlot.findMany({
    where: {
      OR: [
        { isScheduled: true },
        { isRunning: true },
        // Orphaned daily/weekly/hourly streams: has recurring schedule but got stuck as stopped
        // (e.g. after manual stop, server crash, or schedStop without daily reschedule)
        { daily: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { weekly: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { hourly: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { repeat15m: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { repeat10m: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { repeat30m: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { repeat1h: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { repeat2h: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        { repeat12h: true, isRunning: false, isScheduled: false, schedStart: { not: '' } },
        // Catch-all: streams that should be running (were not manually stopped)
        {
          manuallyStopped: false,
          isRunning: false,
          OR: [
            { filePath: { not: '' } },
            { inputType: 'live' }
          ]
        },
      ]
    }
  })

  console.log(`[Scheduler] Found ${slots.length} slot(s) to evaluate`)
  for (const s of slots) {
    console.log(`[Scheduler]   Slot ${s.slotIndex + 1}: isScheduled=${s.isScheduled}, isRunning=${s.isRunning}, schedStart="${s.schedStart}", schedStop="${s.schedStop}"`)
  }

  // Collect slots-to-start separately for sequential processing.
  // Stops are processed inline (must happen before potential next-day re-queue).
  const slotsToStart: typeof slots = []

  for (const slot of slots) {
    if (!slot.isRunning) {
      activeSwapVideos.delete(slot.slotIndex)

      // ── Reschedule finished/stopped recurring slots ──
      const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h
      if (!slot.isScheduled && isRecurring && slot.schedStart) {
        const parsedStart = parseScheduleTime(slot.schedStart)
        let shouldReschedule = !slot.manuallyStopped
        if (parsedStart) {
          const startDate = getCairoTargetDate(parsedStart, now)
          if (now >= startDate) {
            shouldReschedule = true
          }
        }
        
        if (shouldReschedule) {
          console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Rescheduling stopped recurring slot for the next occurrence.`)
          let nextStartTime = slot.schedStart
          let nextStopTime = slot.schedStop
          const oldStart = parseScheduleTime(slot.schedStart)
          const oldStop = parseScheduleTime(slot.schedStop)
          if (oldStart && oldStop) {
            let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
            if (durMins < 0) durMins += 1440
            nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m, slot.repeat12h)
            const nParsed = parseScheduleTime(nextStartTime)
            if (nParsed) {
              const nDate = getCairoTargetDate(nParsed, now)
              const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
              const stopFields = getCairoNowFields(stopDate)
              nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
            }
          }

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isScheduled: true,
              status: 'Scheduled',
              schedStart: nextStartTime,
              schedStop: nextStopTime,
              nextRunTime: nextStartTime,
              manuallyStopped: false,
              isSwapped: false,
              youtubeBroadcastId: ''
            }
          })

          await db.systemLog.create({
            data: { message: `Slot ${slot.slotIndex + 1}: Rescheduled recurring slot to start=${nextStartTime}, stop=${nextStopTime}` }
          })

          // Update local loop variable state so subsequent checks in this tick see it as scheduled
          slot.isScheduled = true
          slot.schedStart = nextStartTime
          slot.schedStop = nextStopTime
          slot.nextRunTime = nextStartTime
          slot.manuallyStopped = false
          slot.isSwapped = false
          slot.status = 'Scheduled'
        }
      }
    }

    let finalInputPath = slot.filePath
    if (slot.inputType === 'live') {
      finalInputPath = `rtmp://127.0.0.1/live/${securityKey}`
    }

    // ── Smart Auto-Recovery (startup-aware + backoff) ───────────
    if (slot.isRunning && streamManagerResponded && !activeInManager.has(slot.slotIndex) && !queuedInManager.has(slot.slotIndex)) {
      const missKey = `miss_${slot.slotIndex}`
      const missCount = (missCounters.get(missKey) ?? 0) + 1
      missCounters.set(missKey, missCount)

      // 🛡️ STARTUP GRACE: stream-manager just started — it handles auto-resume itself.
      // Reduced to 5 seconds per user request for immediate booting.
      if (isManagerInStartupGrace) {
        console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: In startup grace (${Math.round(streamManagerUptimeMs / 1000)}s uptime). Skipping recovery.`)
        continue
      }

      // No confirmation delay: immediately recover on the first missed tick.
      // Crash confirmed immediately ──
      missCounters.set(missKey, 0)

      const stateKey = `state_${slot.slotIndex}`
      const state: SlotRecoveryState = recoveryStates.get(stateKey) ?? {
        crashCount: 0, backoffLevel: 0, pendingUntil: 0
      }

      // Skip recovery if still within backoff window
      if (state.pendingUntil > Date.now()) {
        const waitSec = Math.round((state.pendingUntil - Date.now()) / 1000)
        console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Backoff active (${waitSec}s remaining). Skipping recovery.`)
        continue
      }

      // Too many crashes → mark permanently failed or reschedule if recurring
      if (state.crashCount >= MAX_CRASH_COUNT) {
        const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
        if (isRecurring) {
          logs.push(`Slot ${slot.slotIndex + 1}: Permanently failed after ${state.crashCount} crashes. Rescheduling for the next occurrence.`)
          
          let nextStartTime = slot.schedStart || ''
          let nextStopTime = slot.schedStop || ''
          const oldStart = parseScheduleTime(slot.schedStart)
          const oldStop = parseScheduleTime(slot.schedStop)
          if (oldStart && oldStop) {
            let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
            if (durMins < 0) durMins += 1440
            nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m, slot.repeat12h)
            const nParsed = parseScheduleTime(nextStartTime)
            if (nParsed) {
              const nDate = getCairoTargetDate(nParsed, now)
              const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
              const stopFields = getCairoNowFields(stopDate)
              nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
            }
          }

          // Reset recovery state and miss counters for the next run
          recoveryStates.delete(stateKey)
          missCounters.set(missKey, 0)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isRunning: false,
              isScheduled: true,
              status: 'Scheduled',
              schedStart: nextStartTime,
              schedStop: nextStopTime,
              nextRunTime: nextStartTime,
              isSwapped: false,
              youtubeBroadcastId: ''
            }
          })
        } else {
          logs.push(`Slot ${slot.slotIndex + 1}: Permanently failed after ${state.crashCount} crashes. Stopping.`)
          recoveryStates.delete(stateKey)
          missCounters.set(missKey, 0)

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isRunning: false,
              isScheduled: false,
              status: 'Failed',
              manuallyStopped: true,
              isSwapped: false,
              youtubeBroadcastId: ''
            }
          })
        }
        continue
      }

      // Record crash and set next backoff window
      state.crashCount++
      const delay = BACKOFF_DELAYS_MS[Math.min(state.backoffLevel, BACKOFF_DELAYS_MS.length - 1)]
      state.backoffLevel++
      state.pendingUntil = Date.now() + delay
      recoveryStates.set(stateKey, state)

      // Skip recovery if stream ended naturally near its scheduled stop time or inside intentional playlist pre-stop
      let skipRecovery = false
      if (slot.playlistLoopEnabled && slot.playlistConfig) {
        const lastSwitch = slot.lastVideoSwitchTime ? new Date(slot.lastVideoSwitchTime) : new Date(slot.updatedAt)
        const elapsedMins = (now.getTime() - lastSwitch.getTime()) / 60000
        const intervalMins = slot.loopIntervalMins || 60
        const stopTargetMins = getCycleRandomStopMins(slot.slotIndex, lastSwitch, intervalMins)
        if (elapsedMins >= stopTargetMins) {
          skipRecovery = true
          console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Skipping recovery — in intentional playlist pre-stop window (${elapsedMins.toFixed(1)}m >= ${stopTargetMins.toFixed(1)}m)`)
        }
      }

      if (!skipRecovery && slot.schedStop && !slot.schedStop.startsWith('DUR')) {
        const parsedStop = parseScheduleTime(slot.schedStop)
        if (parsedStop) {
          const stopDate = getCairoTargetDate(parsedStop, now)
          const msSinceStop = now.getTime() - stopDate.getTime()
          if (msSinceStop >= -2 * 60 * 1000 && msSinceStop < 2 * 60 * 1000) {
            skipRecovery = true
            console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Skipping recovery — ended naturally near/after schedStop`)
          }
        }
      }

      if (skipRecovery) {
        logs.push(`Slot ${slot.slotIndex + 1}: Ended naturally near/after schedStop. Transitioning to stopped and rescheduling.`)
        
        // Terminate YouTube Live broadcast cleanly
        if (slot.youtubeChannelId && slot.youtubeBroadcastId && slot.outputType === 'youtube') {
          try {
            await stopYoutubeLiveStream(slot.youtubeChannelId, slot.youtubeBroadcastId)
            logs.push(`Slot ${slot.slotIndex + 1}: YouTube broadcast ended cleanly (natural end)`)
          } catch (ytErr: any) {
            logs.push(`Slot ${slot.slotIndex + 1}: YouTube stop failed (natural end): ${ytErr.message}`)
          }
        }

        // Recalculate next start/stop for daily/weekly/hourly slots
        let nextStartTime = slot.schedStart || ''
        let nextStopTime = slot.schedStop || ''
        if (slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h) {
          const oldStart = parseScheduleTime(slot.schedStart)
          const oldStop = parseScheduleTime(slot.schedStop)
          if (oldStart && oldStop) {
            let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
            if (durMins < 0) durMins += 1440
            nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m, slot.repeat12h)
            const nParsed = parseScheduleTime(nextStartTime)
            if (nParsed) {
              const nDate = getCairoTargetDate(nParsed, now)
              const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
              const stopFields = getCairoNowFields(stopDate)
              nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
            }
          }
        }

        const newStatus = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h ? 'Scheduled' : 'Stopped'
        const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
        const claimed = await db.streamSlot.updateMany({
          where: { slotIndex: slot.slotIndex, isRunning: true },
          data: {
            isRunning: false,
            isScheduled: isRecurring,
            status: newStatus,
            schedStart: nextStartTime,
            schedStop: nextStopTime,
            nextRunTime: nextStartTime,
            isSwapped: false,
            youtubeBroadcastId: '',
            ...(!isRecurring ? { manuallyStopped: true } : {})
          }
        })
        if (claimed.count > 0) {
          stoppedCount++
          activeMainVideos.delete(slot.slotIndex)
          activeSwapVideos.delete(slot.slotIndex)
          const token = Math.random().toString(36).substring(7)
          lastActionTokens.set(slot.slotIndex, token)
          verifyStreamStatusAfterDelay(slot.slotIndex, 'stop', token)
        }
        continue
      }

      logs.push(`Slot ${slot.slotIndex + 1}: Crash #${state.crashCount} confirmed. Recovering (backoff level ${state.backoffLevel - 1}, next wait ${Math.round(delay / 1000)}s)`)

      try {
        let recoveryFilePath = finalInputPath
        if (slot.isSwapped && slot.swapVideoPath) {
          recoveryFilePath = activeSwapVideos.get(slot.slotIndex) || resolveSwapVideoFile(slot.swapVideoPath, slot.slotIndex)
          activeSwapVideos.set(slot.slotIndex, recoveryFilePath)
        } else if (slot.filePath) {
          recoveryFilePath = activeMainVideos.get(slot.slotIndex) || resolveVideoFileFromFolder(slot.filePath, slot.slotIndex, 'main')
          activeMainVideos.set(slot.slotIndex, recoveryFilePath)
        }
        const res = await fetchWithTimeout(`${STREAM_MANAGER_URL}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotIndex: slot.slotIndex,
            outputType: slot.outputType,
            rtmpServer: slot.rtmpServer,
            streamKey: slot.streamKey,
            filePath: recoveryFilePath
          })
        }, 5000)
        const data = await res.json()
        if (res.ok && data.success) {
          // Reset backoff on successful recovery
          state.backoffLevel = Math.max(0, state.backoffLevel - 1)
          recoveryStates.set(stateKey, state)
          logs.push(`Slot ${slot.slotIndex + 1}: Auto-recovered crashed stream`)
          const token = Math.random().toString(36).substring(7)
          lastActionTokens.set(slot.slotIndex, token)
          verifyStreamStatusAfterDelay(slot.slotIndex, 'start', token)
        } else {
          logs.push(`Slot ${slot.slotIndex + 1}: Auto-recovery failed: ${data.error || data.message || 'stream-manager rejected start'}`)
        }
      } catch (e: any) {
        logs.push(`Slot ${slot.slotIndex + 1}: Auto-recovery failed: ${e.message || 'Network error'}`)
      }
    } else if (slot.isRunning && activeInManager.has(slot.slotIndex)) {
      missCounters.set(`miss_${slot.slotIndex}`, 0)
    }

    // ── Playlist Loop Video Switching & Random Pre-Stop ──
    if (slot.isRunning && slot.playlistLoopEnabled && slot.playlistConfig) {
      try {
        const playlist = JSON.parse(slot.playlistConfig)
        if (playlist.length > 0) {
          const lastSwitch = slot.lastVideoSwitchTime ? new Date(slot.lastVideoSwitchTime) : new Date(slot.updatedAt)
          const elapsedMins = (now.getTime() - lastSwitch.getTime()) / 60000
          const intervalMins = slot.loopIntervalMins || 60
          const stopTargetMins = getCycleRandomStopMins(slot.slotIndex, lastSwitch, intervalMins)

          if (elapsedMins >= intervalMins) {
            logs.push(`Slot ${slot.slotIndex + 1}: Playlist loop interval reached (${elapsedMins.toFixed(1)}m elapsed). Rotating to next video.`)
            triggerPlaylistSwitch(slot, playlist, now)
          } else if (elapsedMins >= stopTargetMins && activeInManager.has(slot.slotIndex)) {
            logs.push(`Slot ${slot.slotIndex + 1}: Playlist random pre-stop triggered (${elapsedMins.toFixed(1)}m elapsed / target ${stopTargetMins.toFixed(1)}m). Stopping stream cleanly until next interval.`)
            console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Playlist random pre-stop triggered at ${elapsedMins.toFixed(1)}m (target ${stopTargetMins.toFixed(1)}m). Stopping stream cleanly.`)

            // Stop stream manager process
            fetchWithTimeout(`${STREAM_MANAGER_URL}/stop`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slotIndex: slot.slotIndex })
            }, 5000).catch(err => console.error(`[Scheduler] Stop error during playlist pre-stop:`, err))

            // Stop YouTube broadcast cleanly
            if (slot.youtubeChannelId && slot.youtubeBroadcastId && slot.outputType === 'youtube') {
              stopYoutubeLiveStream(slot.youtubeChannelId, slot.youtubeBroadcastId)
                .catch(ytErr => console.error(`[Scheduler] YouTube stop error during playlist pre-stop:`, ytErr.message))
            }
          }
        }
      } catch (e: any) {
        console.error(`[Scheduler] Playlist loop check failed for slot ${slot.slotIndex + 1}:`, e.message)
      }
    }

    // ── Pre-Stop Swap Video ────────────────────────────────
    if (slot.isRunning && slot.schedStop && slot.swapVideoEnabled && !slot.isSwapped && slot.swapVideoPath) {
      const parsedStart = slot.schedStart ? parseScheduleTime(slot.schedStart) : null
      const startDate = parsedStart
        ? getCairoTargetDate(parsedStart, now)
        : now
      const stopDate = resolveStopDate(slot.schedStop, startDate, now)
      if (stopDate) {
        const msRemaining = stopDate.getTime() - now.getTime()
        const minsRemaining = msRemaining / (1000 * 60)
        // Fixed 2-minute swap threshold: always trigger 2 minutes before stop
        const swapThresholdMins = 2
        console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Swap check — ${minsRemaining.toFixed(2)}m remain, threshold=2m`)
        if (minsRemaining <= swapThresholdMins && minsRemaining > 0) {
          const resolvedPath = resolveSwapVideoFile(slot.swapVideoPath, slot.slotIndex)
          activeSwapVideos.set(slot.slotIndex, resolvedPath)

          console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Pre-stop swap triggered! ${minsRemaining.toFixed(2)}m remain. Swapping to ${resolvedPath}`)
          logs.push(`Slot ${slot.slotIndex + 1}: Pre-stop swap triggered (${minsRemaining.toFixed(1)}m remaining). Swapping to ${resolvedPath}`);

          // Run swap transition in the background to avoid blocking the main scheduler loop
          (async () => {
            try {
              // Step 1: Stop current broadcast FIRST (before marking swapped to allow retry on failure)
              await fetchWithTimeout(`${STREAM_MANAGER_URL}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slotIndex: slot.slotIndex })
              }, 5000)

              // Step 2: Wait 6s for clean FFmpeg shutdown and YouTube RTMP disconnect
              await new Promise(r => setTimeout(r, 6000))

              // Step 3: Start the swap video stream
              const res = await fetchWithTimeout(`${STREAM_MANAGER_URL}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  slotIndex: slot.slotIndex,
                  outputType: slot.outputType,
                  rtmpServer: slot.rtmpServer,
                  streamKey: slot.streamKey,
                  filePath: resolvedPath
                })
              }, 5000)

              const data = await res.json()
              if (res.ok && data.success) {
                // Step 4: ONLY mark isSwapped=true AFTER confirmed success.
                // Do NOT update filePath in DB so: (a) next daily/weekly run uses original file,
                // (b) recovery logic above already handles swapVideoPath via isSwapped check.
                await db.streamSlot.update({
                  where: { slotIndex: slot.slotIndex },
                  data: { 
                    isSwapped: true,
                    isRunning: true,
                    status: 'Streaming'
                  }
                })
                logs.push(`Slot ${slot.slotIndex + 1}: Swapped stream to file successfully`)
                const token = Math.random().toString(36).substring(7)
                lastActionTokens.set(slot.slotIndex, token)
                verifyStreamStatusAfterDelay(slot.slotIndex, 'swap', token, resolvedPath)
              } else {
                // Start failed — isSwapped stays false so next tick can retry
                logs.push(`Slot ${slot.slotIndex + 1}: Swap start failed: ${data.error || data.message || 'Unknown'}. Will retry next tick.`)
              }
            } catch (e: any) {
              // Exception — isSwapped stays false so next tick can retry
              logs.push(`Slot ${slot.slotIndex + 1}: Swap process failed: ${e.message || 'Network error'}. Will retry next tick.`)
            }
          })();
        }
      }
    }

    // ── Auto-Stop ──────────────────────────────────────────
    // Uses shouldTrigger() which applies a deterministic jitter (-150s to +150s)
    // and a 5-minute grace window. This intentional behavior is preserved as-is.
    if (slot.isRunning && slot.schedStop && shouldTrigger(slot.schedStop, slot.slotIndex, true, slot.swapVideoEnabled)) {
      try {
        await fetchWithTimeout(`${STREAM_MANAGER_URL}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slotIndex: slot.slotIndex })
        }, 5000)
      } catch {
        logs.push(`Slot ${slot.slotIndex + 1}: Auto-stop failed (stream-manager unreachable) — will retry`)
        await db.systemLog.create({ data: { message: `Slot ${slot.slotIndex + 1}: Auto-stop failed, will retry next tick` } })
        continue
      }

      // Terminate YouTube Live broadcast cleanly
      if (slot.youtubeChannelId && slot.youtubeBroadcastId && slot.outputType === 'youtube') {
        try {
          await stopYoutubeLiveStream(slot.youtubeChannelId, slot.youtubeBroadcastId)
          logs.push(`Slot ${slot.slotIndex + 1}: YouTube broadcast ended cleanly`)
        } catch (ytErr: any) {
          logs.push(`Slot ${slot.slotIndex + 1}: YouTube stop failed: ${ytErr.message}`)
        }
      }

      // Recalculate next start/stop for daily/weekly/hourly slots
      let nextStartTime = slot.schedStart || ''
      let nextStopTime = slot.schedStop || ''
      if (slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h) {
        const oldStart = parseScheduleTime(slot.schedStart)
        const oldStop = parseScheduleTime(slot.schedStop)
        if (oldStart && oldStop) {
          let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
          if (durMins < 0) durMins += 1440
          nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m)
          const nParsed = parseScheduleTime(nextStartTime)
          if (nParsed) {
            const nDate = getCairoTargetDate(nParsed, now)
            const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
            const stopFields = getCairoNowFields(stopDate)
            nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
          }
        }
      }

      const newStatus = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h ? 'Scheduled' : 'Stopped'
      const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
      const claimed = await db.streamSlot.updateMany({
        where: { slotIndex: slot.slotIndex, isRunning: true },
        data: {
          isRunning: false,
          isScheduled: isRecurring,
          status: newStatus,
          schedStart: nextStartTime,
          schedStop: nextStopTime,
          nextRunTime: nextStartTime,
          isSwapped: false,
          youtubeBroadcastId: '',
          // For one-time streams: lock manuallyStopped=true so orphan recovery won't restart
          // For daily/weekly streams: keep manuallyStopped=false so next occurrence can run
          ...(!isRecurring ? { manuallyStopped: true } : {})
        }
      })
      if (claimed.count === 0) continue
      stoppedCount++
      activeMainVideos.delete(slot.slotIndex)
      activeSwapVideos.delete(slot.slotIndex)
      const token = Math.random().toString(36).substring(7)
      lastActionTokens.set(slot.slotIndex, token)
      verifyStreamStatusAfterDelay(slot.slotIndex, 'stop', token)
      const stopReason = `schedStop=${slot.schedStop}, daily=${slot.daily}, weekly=${slot.weekly}, hourly=${slot.hourly}, repeat10m=${slot.repeat10m}, repeat15m=${slot.repeat15m}, repeat30m=${slot.repeat30m}, repeat1h=${slot.repeat1h}, repeat2h=${slot.repeat2h}, repeat12h=${slot.repeat12h}`
      logs.push(`Slot ${slot.slotIndex + 1}: Auto-stopped (${stopReason}) → nextStart=${nextStartTime}`)
      continue // just stopped — don't also queue for start this tick
    }

    // ── Collect for Sequential Auto-Start ──────────────────
    const outputType = slot.outputType || 'youtube'
    const hasDestination = (outputType === 'youtube' || outputType === 'facebook')
      ? (slot.youtubeChannelId && slot.youtubeChannelId !== 'null' && slot.youtubeChannelId !== 'undefined' && slot.youtubeChannelId.trim() !== '') || (slot.streamKey && slot.streamKey.trim() !== '')
      : (slot.streamKey && slot.streamKey.trim() !== '')
    const hasInput = slot.inputType === 'live' || (slot.filePath && slot.filePath.trim() !== '')

    // Check if slot has backoff active
    const stateKey = `state_${slot.slotIndex}`
    const state = recoveryStates.get(stateKey)
    const isBackoffActive = state && state.pendingUntil > Date.now()

    if (slot.isScheduled && !slot.isRunning && slot.schedStart && hasDestination && hasInput) {
      if (isBackoffActive) {
        const waitSec = Math.round((state.pendingUntil - Date.now()) / 1000)
        console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Start bypassed because backoff is active (${waitSec}s remaining)`)
      } else {
        // Exact trigger: within 5 minutes of the exact scheduled start time
        const exactTrigger = shouldTrigger(slot.schedStart, slot.slotIndex, false)

        // Window trigger: now is inside [schedStart, schedStop) window
        // Handles both "MM-DD HH:MM" and "DUR HH:MM" schedStop formats
        const withinWindow = slot.schedStop
          ? isWithinActiveWindow(slot.schedStart, slot.schedStop)
          : false

        if (exactTrigger || withinWindow) {
          slotsToStart.push(slot)
          console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Queued for start (exactTrigger=${exactTrigger}, withinWindow=${withinWindow})`)
        }
      }
    }

    // ── Orphaned / Crashed streams recovery (manual Stop guard) ──
    if (slot.isRunning === false && slot.manuallyStopped === false && hasInput && hasDestination) {
      if (isBackoffActive) {
        const waitSec = Math.round((state.pendingUntil - Date.now()) / 1000)
        console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Recovery start bypassed because backoff is active (${waitSec}s remaining)`)
      } else {
        let shouldRun = false;
        if (!slot.daily && !slot.weekly && !slot.hourly && !slot.repeat10m && !slot.repeat15m && !slot.repeat30m && !slot.repeat1h && !slot.repeat2h && !slot.repeat12h && !slot.schedStart) {
          // It's a completely manual 24/7 stream. If manuallyStopped is false, it MUST run!
          shouldRun = true;
        } else if (slot.schedStart && slot.isScheduled) {
          if (slot.schedStop) {
            shouldRun = isWithinActiveWindow(slot.schedStart, slot.schedStop);
          } else {
            // It has a schedStart but no stop. It runs forever once started.
            const parsedStart = parseScheduleTime(slot.schedStart);
            if (parsedStart) {
              const startDate = getCairoTargetDate(parsedStart, now);
              if (now >= startDate) shouldRun = true;
            }
          }
        }

        if (shouldRun && !slotsToStart.find(s => s.slotIndex === slot.slotIndex)) {
          slotsToStart.push(slot);
          console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Auto-restarting because manuallyStopped=false`)
          logs.push(`Slot ${slot.slotIndex + 1}: Auto-restarting (manuallyStopped is false)`);
        }
      }
    }
  }

  // ── Sequential Start: 1s delay between each slot ───────────────────────
  // stream-manager itself staggers by STAGGER_DELAY_MS=3000ms internally,
  // so combined delay between consecutive stream starts is ~4 seconds.
  // ── Batch Start: 10 slots concurrently, 1s delay between batches ───────────
  const BATCH_SIZE = 10
  for (let i = 0; i < slotsToStart.length; i += BATCH_SIZE) {
    const batch = slotsToStart.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async (slot) => {
      let finalInputPath = slot.filePath
      if (slot.inputType === 'live') {
        finalInputPath = `rtmp://127.0.0.1/live/${securityKey}`
      }

      let currentTitleDescListId = slot.titleDescListId
      let playlistItems: any[] = []
      if (slot.playlistLoopEnabled && slot.playlistConfig && slot.inputType !== 'live') {
        try {
          playlistItems = JSON.parse(slot.playlistConfig)
          if (playlistItems.length > 0) {
            const currentItem = playlistItems[slot.currentPlaylistItemIndex % playlistItems.length]
            if (currentItem) {
              finalInputPath = currentItem.videoPath
              currentTitleDescListId = currentItem.titleDescListId
            }
          }
        } catch (e) {
          console.error(`[Scheduler] Failed to parse playlistConfig for start:`, e)
        }
      }

      // Convert DUR format to real datetime — anchored to schedStart (not now!)
      // This ensures stop time = original_scheduled_start + duration, regardless of late start
      let actualSchedStop = slot.schedStop
      if (slot.schedStop && slot.schedStop.startsWith('DUR ') && slot.schedStart) {
        const parsedStart = parseScheduleTime(slot.schedStart)
        if (parsedStart) {
          const schedStartDate = getCairoTargetDate(parsedStart, now)
          actualSchedStop = durToActualStop(slot.schedStop, schedStartDate)
        } else {
          actualSchedStop = durToActualStop(slot.schedStop, now)
        }
      }

      // Atomic claim: accept slots that are either scheduled OR should auto-recover (manuallyStopped=false)
      const claimed = await db.streamSlot.updateMany({
        where: {
          slotIndex: slot.slotIndex,
          isRunning: false,
          OR: [
            { isScheduled: true },
            { manuallyStopped: false }
          ]
        },
        data: {
          isRunning: true,
          isScheduled: false,
          manuallyStopped: false,
          isSwapped: slot.isScheduled ? false : slot.isSwapped,
          status: 'Streaming',
          lastVideoSwitchTime: new Date().toISOString(),
          filePath: finalInputPath,
          ...(actualSchedStop !== slot.schedStop ? { schedStop: actualSchedStop } : {})
        }
      })
      if (claimed.count === 0) {
        console.log(`[Scheduler] Slot ${slot.slotIndex + 1}: Skipped — already claimed by another worker`)
        return
      }

      try {
        // If a YouTube channel is bound to this slot, run the YouTube Live broadcast setup
        let finalStreamKey = slot.streamKey
        let finalRtmpServer = slot.rtmpServer
        let youtubeBroadcastId = slot.youtubeBroadcastId || ''
        if (slot.youtubeChannelId && slot.outputType === 'youtube') {
          try {
            let finalScheduledStartTime: string | undefined = undefined
            if (slot.schedStart) {
              const parsedStart = parseScheduleTime(slot.schedStart)
              if (parsedStart) {
                const startDate = getCairoTargetDate(parsedStart, now)
                finalScheduledStartTime = startDate.toISOString()
              }
            }

            let resolvedThumbnailPath = slot.youtubeThumbnailPath || undefined
            if (resolvedThumbnailPath) {
              resolvedThumbnailPath = resolveThumbnailFileFromFolder(resolvedThumbnailPath, slot.slotIndex)
              activeThumbnails.set(slot.slotIndex, resolvedThumbnailPath)
            }

            let finalTitle = slot.youtubeTitle || 'Live Stream'
            let finalDescription = slot.youtubeDescription || ''

            if (currentTitleDescListId) {
              try {
                const tdList = await db.titleDescList.findUnique({
                  where: { id: currentTitleDescListId }
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
                console.error(`[Scheduler] Failed to fetch/parse title desc list for slot ${slot.slotIndex + 1}:`, e.message)
              }
            }

            // Auto-increment Episode Number if {Add} exists
            const epNum = (slot as any).episodeNumber || 1;
            const episodeRegex = /\{add\}/gi;
            const titleHasEp = episodeRegex.test(finalTitle);
            const descHasEp = episodeRegex.test(finalDescription);
            
            if (titleHasEp || descHasEp) {
              finalTitle = finalTitle.replace(episodeRegex, epNum.toString());
              finalDescription = finalDescription.replace(episodeRegex, epNum.toString());
              
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: { episodeNumber: { increment: 1 } }
              });
            }

            const yt = await setupYoutubeLiveStream(
              slot.youtubeChannelId,
              finalTitle,
              finalDescription,
              resolvedThumbnailPath,
              slot.streamKey,
              finalScheduledStartTime
            )
            finalStreamKey = yt.streamKey || finalStreamKey
            finalRtmpServer = yt.rtmpServer || finalRtmpServer
            youtubeBroadcastId = yt.broadcastId || ''
            // Persist the fresh stream key, rtmp server, and broadcastId so the swap uses the same session
            await db.streamSlot.update({
              where: { slotIndex: slot.slotIndex },
              data: {
                streamKey: finalStreamKey,
                rtmpServer: finalRtmpServer,
                youtubeBroadcastId: youtubeBroadcastId
              }
            })
            logs.push(`Slot ${slot.slotIndex + 1}: YouTube Live broadcast created and stream key fetched`)
          } catch (ytErr: any) {
            logs.push(`Slot ${slot.slotIndex + 1}: YouTube setup failed: ${ytErr.message}`)
            
            const stateKey = `state_${slot.slotIndex}`
            const state = recoveryStates.get(stateKey) ?? { crashCount: 0, backoffLevel: 0, pendingUntil: 0 }
            state.crashCount++
            
            const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
            if (state.crashCount >= MAX_CRASH_COUNT) {
              recoveryStates.delete(stateKey)
              
              if (isRecurring) {
                let nextStartTime = slot.schedStart || ''
                let nextStopTime = slot.schedStop || ''
                const oldStart = parseScheduleTime(slot.schedStart)
                const oldStop = parseScheduleTime(slot.schedStop)
                if (oldStart && oldStop) {
                  let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
                  if (durMins < 0) durMins += 1440
                  nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m, slot.repeat12h)
                  const nParsed = parseScheduleTime(nextStartTime)
                  if (nParsed) {
                    const nDate = getCairoTargetDate(nParsed, now)
                    const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
                    const stopFields = getCairoNowFields(stopDate)
                    nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
                  }
                }
                await db.streamSlot.update({
                  where: { slotIndex: slot.slotIndex },
                  data: {
                    isRunning: false,
                    isScheduled: true,
                    status: 'Scheduled',
                    schedStart: nextStartTime,
                    schedStop: nextStopTime,
                    nextRunTime: nextStartTime,
                    isSwapped: false,
                    youtubeBroadcastId: '',
                    manuallyStopped: false
                  }
                })
                logs.push(`Slot ${slot.slotIndex + 1}: Permanently failed starting due to YouTube error. Rescheduling for the next occurrence.`)
              } else {
                await db.streamSlot.update({
                  where: { slotIndex: slot.slotIndex },
                  data: {
                    isRunning: false,
                    isScheduled: false,
                    status: 'Failed',
                    manuallyStopped: true,
                    isSwapped: false,
                    youtubeBroadcastId: ''
                  }
                })
                logs.push(`Slot ${slot.slotIndex + 1}: Permanently failed starting due to YouTube error. Stopping.`)
              }
            } else {
              const delay = BACKOFF_DELAYS_MS[Math.min(state.backoffLevel, BACKOFF_DELAYS_MS.length - 1)]
              state.backoffLevel++
              state.pendingUntil = Date.now() + delay
              recoveryStates.set(stateKey, state)
              
              await db.streamSlot.update({
                where: { slotIndex: slot.slotIndex },
                data: {
                  isRunning: false,
                  isScheduled: isRecurring ? true : false,
                  status: 'Scheduled',
                  schedStop: slot.schedStop,
                  manuallyStopped: false
                }
              })
              logs.push(`Slot ${slot.slotIndex + 1}: YouTube setup failed. Retrying in ${Math.round(delay/1000)}s (Crash ${state.crashCount}/${MAX_CRASH_COUNT})`)
            }
            return
          }
        }

        let resolvedInputPath = finalInputPath
        if (slot.inputType !== 'live' && finalInputPath) {
          if (slot.playlistLoopEnabled && playlistItems.length > 0) {
            resolvedInputPath = finalInputPath
          } else if (slot.filePath) {
            resolvedInputPath = activeMainVideos.get(slot.slotIndex) || resolveVideoFileFromFolder(slot.filePath, slot.slotIndex, 'main')
          }
          activeMainVideos.set(slot.slotIndex, resolvedInputPath)
        }

        const res = await fetchWithTimeout(`${STREAM_MANAGER_URL}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slotIndex: slot.slotIndex,
            outputType: slot.outputType,
            rtmpServer: finalRtmpServer,
            streamKey: finalStreamKey,
            filePath: resolvedInputPath
          })
        }, 5000)
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || data.message || 'Stream manager rejected start')
        }
        startedCount++
        logs.push(`Slot ${slot.slotIndex + 1}: Auto-started`)
        const token = Math.random().toString(36).substring(7)
        lastActionTokens.set(slot.slotIndex, token)
        verifyStreamStatusAfterDelay(slot.slotIndex, 'start', token)
      } catch (e: any) {
        // Increment recovery state crash count because starting failed
        const stateKey = `state_${slot.slotIndex}`
        const state = recoveryStates.get(stateKey) ?? { crashCount: 0, backoffLevel: 0, pendingUntil: 0 }
        state.crashCount++
        
        const isRecurring = slot.daily || slot.weekly || slot.hourly || slot.repeat10m || slot.repeat15m || slot.repeat30m || slot.repeat1h || slot.repeat2h || slot.repeat12h
        if (state.crashCount >= MAX_CRASH_COUNT) {
          recoveryStates.delete(stateKey)
          
          if (isRecurring) {
            let nextStartTime = slot.schedStart || ''
            let nextStopTime = slot.schedStop || ''
            const oldStart = parseScheduleTime(slot.schedStart)
            const oldStop = parseScheduleTime(slot.schedStop)
            if (oldStart && oldStop) {
              let durMins = (oldStop.hour * 60 + oldStop.minute) - (oldStart.hour * 60 + oldStart.minute)
              if (durMins < 0) durMins += 1440
              nextStartTime = calculateNextRun(slot.schedStart, slot.daily, slot.weekly, slot.hourly, slot.repeat30m, slot.repeat1h, slot.repeat2h, slot.repeat15m, slot.repeat10m, slot.repeat12h)
              const nParsed = parseScheduleTime(nextStartTime)
              if (nParsed) {
                const nDate = getCairoTargetDate(nParsed, now)
                const stopDate = new Date(nDate.getTime() + durMins * 60 * 1000)
                const stopFields = getCairoNowFields(stopDate)
                nextStopTime = `${String(stopFields.month + 1).padStart(2, '0')}-${String(stopFields.day).padStart(2, '0')} ${String(stopFields.hour).padStart(2, '0')}:${String(stopFields.minute).padStart(2, '0')}`
              }
            }
            await db.streamSlot.update({
              where: { slotIndex: slot.slotIndex },
              data: {
                isRunning: false,
                isScheduled: true,
                status: 'Scheduled',
                schedStart: nextStartTime,
                schedStop: nextStopTime,
                nextRunTime: nextStartTime,
                isSwapped: false,
                youtubeBroadcastId: '',
                manuallyStopped: false
              }
            })
            logs.push(`Slot ${slot.slotIndex + 1}: Permanently failed starting. Rescheduling for the next occurrence.`)
          } else {
            await db.streamSlot.update({
              where: { slotIndex: slot.slotIndex },
              data: {
                isRunning: false,
                isScheduled: false,
                status: 'Failed',
                manuallyStopped: true,
                isSwapped: false,
                youtubeBroadcastId: ''
              }
            })
            logs.push(`Slot ${slot.slotIndex + 1}: Permanently failed starting: ${e.message || 'Stream manager error'}. Stopping.`)
          }
        } else {
          const delay = BACKOFF_DELAYS_MS[Math.min(state.backoffLevel, BACKOFF_DELAYS_MS.length - 1)]
          state.backoffLevel++
          state.pendingUntil = Date.now() + delay
          recoveryStates.set(stateKey, state)
          
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isRunning: false,
              isScheduled: isRecurring ? true : false,
              status: 'Scheduled',
              schedStop: slot.schedStop,
              manuallyStopped: false
            }
          })
          logs.push(`Slot ${slot.slotIndex + 1}: Failed to auto-start: ${e.message || 'Stream manager error'}. Retrying in ${Math.round(delay/1000)}s (Crash ${state.crashCount}/${MAX_CRASH_COUNT})`)
        }
      }
    }))

    if (i + BATCH_SIZE < slotsToStart.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  for (const log of logs) {
    await db.systemLog.create({ data: { message: log } })
  }

  // Periodically cleanup old logs in the background (10% chance) to prevent SQLite database lock contention
  if (Math.random() < 0.1) {
    try {
      const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString()
      await db.systemLog.deleteMany({
        where: {
          OR: [
            { timestamp: { lt: thirteenHoursAgo } },
            { message: { startsWith: LOCK_KEY } }
          ]
        }
      })
    } catch (error) {
      console.error('[Scheduler] Background log cleanup error:', error)
    }
  }

  return { started: startedCount, stopped: stoppedCount, logs, timestamp: now.toISOString() }
}
