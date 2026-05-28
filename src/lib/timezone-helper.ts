/**
 * timezone-helper.ts
 *
 * Provides timezone-aware, DST-resilient utilities for the 'Africa/Cairo' timezone.
 * All calculations are timezone-independent of the underlying server OS.
 */

// Shared single instance of Intl.DateTimeFormat for Africa/Cairo timezone to avoid the massive cost of recreating it.
const cairoFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  hour12: false
});

// Cache for timezone offsets to prevent massive performance penalty of Intl formatting in loop operations.
// The key is the UTC timestamp rounded to the hour (since timezone offsets only change on DST transition boundaries, usually on hour/day boundary).
const offsetCache = new Map<number, number>();

// Returns the absolute timezone offset of 'Africa/Cairo' for a given absolute date in milliseconds.
// E.g., +2 hours = 7200000, +3 hours = 10800000.
export function getCairoOffsetMs(date: Date): number {
  const timeMs = date.getTime();
  if (isNaN(timeMs)) {
    return 2 * 3600000; // Fallback to standard Cairo offset (UTC+2) if date is invalid
  }
  const hourTimestamp = Math.floor(timeMs / 3600000);
  
  if (offsetCache.has(hourTimestamp)) {
    return offsetCache.get(hourTimestamp)!;
  }

  let offset: number;
  try {
    const parts = cairoFormatter.formatToParts(date);
    const getPart = (type: string) => {
      const val = parts.find(p => p.type === type)?.value;
      return val ? parseInt(val, 10) : NaN;
    };
    
    const year = getPart('year');
    const month = getPart('month') - 1; // 0-indexed
    const day = getPart('day');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    if (
      isNaN(year) || year < 1970 ||
      isNaN(month) || month < 0 || month > 11 ||
      isNaN(day) || day < 1 || day > 31 ||
      isNaN(hour) || hour < 0 || hour > 23 ||
      isNaN(minute) || minute < 0 || minute > 59 ||
      isNaN(second) || second < 0 || second > 59
    ) {
      throw new Error('Invalid date parts parsed from cairoFormatter');
    }
    
    const localUtc = Date.UTC(year, month, day, hour, minute, second);
    offset = Math.round((localUtc - timeMs) / 1000) * 1000;

    // Cairo offsets should always be UTC+2 or UTC+3 (+7200000 or +10800000 ms)
    // We allow a range of 1.5 to 3.5 hours for sanity check.
    if (offset < 1.5 * 3600000 || offset > 3.5 * 3600000) {
      throw new Error(`Cairo offset ${offset} is outside expected range`);
    }
  } catch (err) {
    // Fallback to approximate Egypt DST rule:
    // DST: May (4) to October (9) is UTC+3 (10800000 ms), otherwise UTC+2 (7200000 ms)
    const utcMonth = date.getUTCMonth();
    offset = (utcMonth >= 4 && utcMonth <= 9) ? 3 * 3600000 : 2 * 3600000;
  }

  // Prevent memory leaks in long-running processes by capping cache size
  if (offsetCache.size > 10000) {
    offsetCache.clear();
  }
  offsetCache.set(hourTimestamp, offset);

  return offset;
}

// Converts Cairo local datetime components (year, month (0-indexed), day, hour, minute, second)
// into an absolute Date object (UTC milliseconds).
export function getAbsoluteDateFromCairoFields(
  year: number,
  month: number, // 0-indexed (0 = Jan, 11 = Dec)
  day: number,
  hour: number,
  minute: number,
  second = 0
): Date {
  // Approximate UTC timestamp assuming 3 hours offset
  const approxUtc = Date.UTC(year, month, day, hour, minute, second) - 3 * 60 * 60 * 1000;
  // Get actual offset at that approximate time
  const offset = getCairoOffsetMs(new Date(approxUtc));
  // Exact UTC timestamp
  return new Date(Date.UTC(year, month, day, hour, minute, second) - offset);
}

// Returns current or specific Cairo local time fields (year, month (0-indexed), day, hour, minute, second, weekday, and offset).
export function getCairoNowFields(now: Date = new Date()): {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  offsetHours: number;
} {
  const offsetMs = getCairoOffsetMs(now);
  const cairoDateObject = new Date(now.getTime() + offsetMs);
  
  return {
    year: cairoDateObject.getUTCFullYear(),
    month: cairoDateObject.getUTCMonth(),
    day: cairoDateObject.getUTCDate(),
    hour: cairoDateObject.getUTCHours(),
    minute: cairoDateObject.getUTCMinutes(),
    second: cairoDateObject.getUTCSeconds(),
    weekday: cairoDateObject.getUTCDay(),
    offsetHours: offsetMs / (1000 * 60 * 60)
  };
}

// Normalizes schedule targets across years relative to now, strictly in Cairo timezone.
export function getCairoTargetDate(
  parsed: { month: number; day: number; hour: number; minute: number },
  now: Date
): Date {
  const cairoNow = getCairoNowFields(now);
  
  // Create target in Cairo timezone using current Cairo year
  let target = getAbsoluteDateFromCairoFields(cairoNow.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0);
  
  const halfYearMs = 1000 * 60 * 60 * 24 * 180;
  
  if (now.getTime() - target.getTime() > halfYearMs) {
    // Target is too far in the past, move to next year
    target = getAbsoluteDateFromCairoFields(cairoNow.year + 1, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0);
  } else if (target.getTime() - now.getTime() > halfYearMs) {
    // Target is too far in the future, move to previous year
    target = getAbsoluteDateFromCairoFields(cairoNow.year - 1, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, 0);
  }
  
  return target;
}

export function parseScheduleTime(sched: string): { month: number; day: number; hour: number; minute: number } | null {
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

export function calculateNextRun(
  schedStart: string,
  daily: boolean,
  weekly: boolean,
  hourly?: boolean,
  repeat30m?: boolean,
  repeat1h?: boolean,
  repeat2h?: boolean,
  repeat15m?: boolean
): string {
  if (!schedStart) return ''
  const now = new Date()
  try {
    const parsed = parseScheduleTime(schedStart)
    if (!parsed) return ''
    const { month, day, hour, minute } = parsed

    let intervalMins = 0
    if (repeat15m) intervalMins = 15
    else if (hourly) intervalMins = 20
    else if (repeat30m) intervalMins = 30
    else if (repeat1h) intervalMins = 60
    else if (repeat2h) intervalMins = 120

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
