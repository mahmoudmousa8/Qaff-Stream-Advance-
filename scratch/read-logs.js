const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'prisma', 'data', 'app.db');
const db = new Database(dbPath);

console.log('=== SYSTEM LOGS (LAST 100) ===');
try {
  const logs = db.prepare("SELECT id, datetime(timestamp/1000, 'unixepoch', 'localtime') as time, message FROM SystemLog ORDER BY id DESC LIMIT 100").all();
  logs.forEach(log => {
    console.log(`[${log.time}] ${log.message}`);
  });
} catch (e) {
  console.error('Error fetching logs:', e.message);
}

db.close();
