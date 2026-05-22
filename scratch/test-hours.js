import { getCairoOffsetMs } from '../src/lib/timezone-helper.ts';

// Test offsets for every hour of a day to see if any hour behaves weirdly
const base = new Date('2026-05-22T00:00:00Z');
for (let h = 0; h < 24; h++) {
  const d = new Date(base.getTime() + h * 60 * 60 * 1000);
  console.log(`UTC ${d.toISOString()} -> Offset: ${getCairoOffsetMs(d)} ms (${getCairoOffsetMs(d) / 3600000} hours)`);
}
