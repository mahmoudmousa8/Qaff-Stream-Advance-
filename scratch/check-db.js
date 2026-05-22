const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Try standard locations
const PROJECT_DIR = path.join(__dirname, '..');
const pathsToTry = [
  path.join(PROJECT_DIR, 'data', 'app.db'),
  path.join(PROJECT_DIR, 'prisma', 'data', 'app.db'),
  path.join(PROJECT_DIR, 'app.db'),
];

let dbPath = null;
for (const p of pathsToTry) {
  if (fs.existsSync(p)) {
    dbPath = p;
    break;
  }
}

if (!dbPath) {
  console.error("❌ Could not find database file in standard locations:", pathsToTry);
  process.exit(1);
}

console.log(`📂 Using database at: ${dbPath}`);
const db = new Database(dbPath);

try {
  // 1. Get Users info
  const users = db.prepare("SELECT id, username, role, slotsLimit, renewalDate FROM User").all();
  console.log("\n👤 Users in database:");
  console.table(users);

  // 2. Get Slots stats
  const totalSlots = db.prepare("SELECT COUNT(*) as count FROM StreamSlot").get().count;
  const runningSlots = db.prepare("SELECT COUNT(*) as count FROM StreamSlot WHERE isRunning = 1").get().count;
  const scheduledSlots = db.prepare("SELECT COUNT(*) as count FROM StreamSlot WHERE isScheduled = 1").get().count;

  console.log("\n📊 Slots Stats:");
  console.log(`- Total slots in DB: ${totalSlots}`);
  console.log(`- Running slots: ${runningSlots}`);
  console.log(`- Scheduled slots: ${scheduledSlots}`);

  // 3. Get running slots info
  if (runningSlots > 0) {
    const running = db.prepare("SELECT slotIndex, channelName, isRunning, status FROM StreamSlot WHERE isRunning = 1").all();
    console.log("\n🟢 Running Slots:");
    console.table(running);
  }

} catch (err) {
  console.error("❌ Database query error:", err.message);
}
