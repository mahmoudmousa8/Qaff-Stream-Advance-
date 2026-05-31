const fs = require('fs');
let code = fs.readFileSync('src/app/api/slots/bulk/route.ts', 'utf8');

const helper = `
function isSlotValidForSchedule(slot: any) {
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
}
`;

if (!code.includes('isSlotValidForSchedule')) {
  code = code.replace('export async function POST(req: NextRequest) {', helper + '\nexport async function POST(req: NextRequest) {');
}

// For cases that use a for-loop (e.g., setClosest10m6mAll, dailyAll, etc.)
code = code.replace(/isScheduled:\s*true,/g, "isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,");
code = code.replace(/manuallyStopped:\s*false,/g, "manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,");
code = code.replace(/status:\s*'Scheduled',/g, "status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',");

// For cases that use updateMany (e.g. setClosestHourAll, setClosest15m9mAll, setClosest30m24mAll, setClosestHour50mAll, setClosest2h110mAll)
// They look like this:
/*
        const result = await db.streamSlot.updateMany({
          where: { ...userFilter, isRunning: false },
          data: {
            schedStart: startTime,
            schedStop: stopTime,
            isScheduled: typeof slot !== 'undefined' ? isSlotValidForSchedule(slot) : true,
            manuallyStopped: typeof slot !== 'undefined' ? !isSlotValidForSchedule(slot) : false,
            nextRunTime: startTime,
            status: typeof slot !== 'undefined' && isSlotValidForSchedule(slot) ? 'Scheduled' : 'Stopped',
            ...
          }
        })
*/
// I will just change those to loop through slots.
const updateManyRegex = /const result = await db\.streamSlot\.updateMany\(\{\s*where: \{ \.\.\.userFilter, isRunning: false \},\s*data: \{([^}]+)\}\s*\}\)/g;

code = code.replace(updateManyRegex, (match, dataBody) => {
  if (dataBody.includes('schedStart:')) {
    return `const allSlots = await db.streamSlot.findMany({ where: { ...userFilter, isRunning: false } })
        let count = 0
        for (const slot of allSlots) {
          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {${dataBody}}
          })
          count++
        }
        const result = { count }`;
  }
  return match; // return original if not related to schedule
});

fs.writeFileSync('src/app/api/slots/bulk/route.ts', code);
console.log('Refactored route.ts');
