import Database from 'better-sqlite3'

try {
  const db = new Database('C:/Users/Mahmoud/Desktop/Stream/prisma/data/app.db')
  const info = db.prepare("PRAGMA table_info(StreamSlot)").all()
  console.log('Columns in StreamSlot:', info.map(c => c.name))
  
  const slots = db.prepare("SELECT * FROM StreamSlot").all()
  const active = slots.filter(s => s.isScheduled || s.isRunning || s.status !== 'Stopped' || s.schedStart !== '' || s.filePath !== '')
  console.log('Active slots:', JSON.stringify(active, null, 2))
} catch (err) {
  console.error('Error:', err)
}
