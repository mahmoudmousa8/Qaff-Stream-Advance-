const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'prisma', 'data', 'app.db');
const db = new Database(dbPath);

console.log('=== INSPECTING SLOTS 56 (55) AND 58 (57) ===');
try {
  const slots = db.prepare("SELECT * FROM StreamSlot WHERE slotIndex IN (55, 57)").all();
  slots.forEach(slot => {
    console.log(`SlotIndex: ${slot.slotIndex}`);
    console.log(`ChannelName: ${slot.channelName}`);
    console.log(`OutputType: ${slot.outputType}`);
    console.log(`StreamKey: "${slot.streamKey}"`);
    console.log(`RtmpServer: "${slot.rtmpServer}"`);
    console.log(`YoutubeChannelId: "${slot.youtubeChannelId}"`);
    console.log(`IsScheduled: ${slot.isScheduled}`);
    console.log(`IsRunning: ${slot.isRunning}`);
    console.log(`SchedStart: "${slot.schedStart}"`);
    console.log(`SchedStop: "${slot.schedStop}"`);
    console.log(`FilePath: "${slot.filePath}"`);
    console.log(`SwapVideoPath: "${slot.swapVideoPath}"`);
    console.log(`SwapVideoEnabled: ${slot.swapVideoEnabled}`);
    console.log('-----------------------------');
  });
} catch (e) {
  console.error('Error:', e.message);
}

db.close();
