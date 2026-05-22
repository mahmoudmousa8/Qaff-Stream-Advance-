// Intl is built-in in Node

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

function getCairoOffsetMsOriginal(date) {
  const parts = cairoFormatter.formatToParts(date);
  const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  
  const year = getPart('year');
  const month = getPart('month') - 1; // 0-indexed
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');
  const second = getPart('second');
  
  const localUtc = Date.UTC(year, month, day, hour, minute, second);
  return Math.round((localUtc - date.getTime()) / 1000) * 1000;
}

const offsetCache = new Map();

function getCairoOffsetMsCached(date) {
  const timeMs = date.getTime();
  const hourTimestamp = Math.floor(timeMs / 3600000);
  if (offsetCache.has(hourTimestamp)) {
    return offsetCache.get(hourTimestamp);
  }
  
  const parts = cairoFormatter.formatToParts(date);
  const getPart = (type) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
  
  const year = getPart('year');
  const month = getPart('month') - 1; // 0-indexed
  const day = getPart('day');
  const hour = getPart('hour');
  const minute = getPart('minute');
  const second = getPart('second');
  
  const localUtc = Date.UTC(year, month, day, hour, minute, second);
  const offset = Math.round((localUtc - timeMs) / 1000) * 1000;
  
  if (offsetCache.size > 10000) {
    offsetCache.clear();
  }
  offsetCache.set(hourTimestamp, offset);
  return offset;
}

// Benchmark
const now = new Date();
const dates = [];
for (let i = 0; i < 2000; i++) {
  dates.push(new Date(now.getTime() + i * 60 * 1000)); // Increments of 1 minute
}

// Verify correctness
for (const d of dates) {
  const orig = getCairoOffsetMsOriginal(d);
  const cached = getCairoOffsetMsCached(d);
  if (orig !== cached) {
    console.error(`Mismatch for date ${d.toISOString()}: original=${orig}, cached=${cached}`);
    process.exit(1);
  }
}
console.log('Verification passed: cached offsets are 100% identical to original!');

console.time('Original');
for (const d of dates) {
  getCairoOffsetMsOriginal(d);
}
console.timeEnd('Original');

console.time('Cached');
for (const d of dates) {
  getCairoOffsetMsCached(d);
}
console.timeEnd('Cached');

