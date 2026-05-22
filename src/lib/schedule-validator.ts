import { getCairoTargetDate, getCairoNowFields, getAbsoluteDateFromCairoFields, parseScheduleTime } from './timezone-helper'

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

function getOccurrences(slot: any, windowStart: Date, windowEnd: Date): Array<{ start: Date, end: Date }> {
  const parsedStart = parseScheduleTime(slot.schedStart)
  if (!parsedStart) return []
  const baselineStart = getCairoTargetDate(parsedStart, windowStart)
  const baselineStop = resolveStopDate(slot.schedStop, baselineStart, windowStart)
  if (!baselineStop) return []
  const durationMs = baselineStop.getTime() - baselineStart.getTime()

  const isRecurring = slot.daily || slot.weekly
  if (!isRecurring) {
    // One-time occurrence
    if (baselineStart.getTime() < windowEnd.getTime() && windowStart.getTime() < baselineStop.getTime()) {
      return [{ start: baselineStart, end: baselineStop }]
    }
    return []
  }

  const startFields = getCairoNowFields(baselineStart)
  const startHour = startFields.hour
  const startMinute = startFields.minute
  const startWeekday = startFields.weekday

  const startDayFields = getCairoNowFields(windowStart)
  // Start at 00:00 of the day of windowStart in Cairo
  let currentDayDate = getAbsoluteDateFromCairoFields(startDayFields.year, startDayFields.month, startDayFields.day, 0, 0, 0)
  
  const occurrences: { start: Date, end: Date }[] = []

  let loopCount = 0
  const maxIterations = 500 // Safety guard against infinite loops

  while (currentDayDate.getTime() <= windowEnd.getTime() && loopCount < maxIterations) {
    loopCount++
    const currentFields = getCairoNowFields(currentDayDate)
    
    let shouldInclude = false
    if (slot.daily) {
      shouldInclude = true
    } else if (slot.weekly) {
      if (currentFields.weekday === startWeekday) {
        shouldInclude = true
      }
    }

    if (shouldInclude) {
      const occStart = getAbsoluteDateFromCairoFields(
        currentFields.year,
        currentFields.month,
        currentFields.day,
        startHour,
        startMinute,
        0
      )
      const occEnd = new Date(occStart.getTime() + durationMs)
      
      // Check if this occurrence falls within or overlaps the window
      if (occStart.getTime() < windowEnd.getTime() && windowStart.getTime() < occEnd.getTime()) {
        occurrences.push({ start: occStart, end: occEnd })
      }
    }

    // Advance to next day safely (28 hours ensures we cross midnight/DST boundary)
    const prevTime = currentDayDate.getTime()
    currentDayDate = new Date(currentDayDate.getTime() + 28 * 60 * 60 * 1000)
    const nextFields = getCairoNowFields(currentDayDate)
    currentDayDate = getAbsoluteDateFromCairoFields(nextFields.year, nextFields.month, nextFields.day, 0, 0, 0)

    // Safety check: ensure currentDayDate strictly increases in every iteration to prevent infinite loop.
    if (currentDayDate.getTime() <= prevTime) {
      currentDayDate = new Date(prevTime + 24 * 60 * 60 * 1000)
    }
  }

  if (loopCount >= maxIterations) {
    console.warn(`[getOccurrences] Reached maxIterations (${maxIterations}) guard for slot:`, slot)
  }

  return occurrences
}

function isValidDestinationValue(val: any): boolean {
  if (val === null || val === undefined) return false
  const s = String(val).trim()
  if (s === '' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return false
  return true
}

function shareSameDestination(slotA: any, slotB: any): boolean {
  const typeA = slotA.outputType || 'youtube'
  const typeB = slotB.outputType || 'youtube'
  
  if (typeA !== typeB) {
    return false
  }

  if (typeA === 'youtube') {
    const ytA = slotA.youtubeChannelId
    const ytB = slotB.youtubeChannelId
    if (isValidDestinationValue(ytA) && isValidDestinationValue(ytB) && ytA === ytB) {
      return true
    }
  } else if (typeA === 'custom') {
    const keyA = slotA.streamKey
    const keyB = slotB.streamKey
    if (isValidDestinationValue(keyA) && isValidDestinationValue(keyB) && keyA === keyB) {
      const serverA = (slotA.rtmpServer || '').trim()
      const serverB = (slotB.rtmpServer || '').trim()
      if (serverA === serverB) {
        return true
      }
    }
  }
  return false
}

export function areSlotsOverlapping(slotA: any, slotB: any, now: Date = new Date()): boolean {
  // Only validate overlap if they stream to the same destination (channel/key)
  if (!shareSameDestination(slotA, slotB)) {
    return false
  }

  const parsedStartA = parseScheduleTime(slotA.schedStart)
  const parsedStopA = slotA.schedStop
  const parsedStartB = parseScheduleTime(slotB.schedStart)
  const parsedStopB = slotB.schedStop

  if (!parsedStartA || !parsedStopA || !parsedStartB || !parsedStopB) {
    return false
  }

  const startA = getCairoTargetDate(parsedStartA, now)
  const stopA = resolveStopDate(slotA.schedStop, startA, now)
  const startB = getCairoTargetDate(parsedStartB, now)
  const stopB = resolveStopDate(slotB.schedStop, startB, now)

  if (!stopA || !stopB) return false

  const isRecurringA = slotA.daily || slotA.weekly
  const isRecurringB = slotB.daily || slotB.weekly

  if (isRecurringA && isRecurringB) {
    // Both are recurring. Check over an 8-day window starting now.
    const windowStart = now
    const windowEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    const occsA = getOccurrences(slotA, windowStart, windowEnd)
    const occsB = getOccurrences(slotB, windowStart, windowEnd)
    
    for (const oA of occsA) {
      for (const oB of occsB) {
        if (oA.start.getTime() < oB.end.getTime() && oB.start.getTime() < oA.end.getTime()) {
          return true
        }
      }
    }
    return false
  }
  
  if (isRecurringA && !isRecurringB) {
    // A is recurring, B is one-time.
    const occsA = getOccurrences(slotA, startB, stopB)
    for (const oA of occsA) {
      if (oA.start.getTime() < stopB.getTime() && startB.getTime() < oA.end.getTime()) {
        return true
      }
    }
    return false
  }

  if (!isRecurringA && isRecurringB) {
    // A is one-time, B is recurring.
    const occsB = getOccurrences(slotB, startA, stopA)
    for (const oB of occsB) {
      if (oB.start.getTime() < stopA.getTime() && startA.getTime() < oB.end.getTime()) {
        return true
      }
    }
    return false
  }

  // Both are one-time.
  return startA.getTime() < stopB.getTime() && startB.getTime() < stopA.getTime()
}
