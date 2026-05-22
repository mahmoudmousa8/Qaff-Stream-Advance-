import { getCairoOffsetMs, getCairoNowFields } from '../src/lib/timezone-helper.ts';

console.log("Cairo Offset for now:", getCairoOffsetMs(new Date()));
console.log("Cairo Now fields:", getCairoNowFields(new Date()));
