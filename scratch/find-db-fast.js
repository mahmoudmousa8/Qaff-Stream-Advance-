import fs from 'fs'
import path from 'path'

function findDb(dir) {
  const files = fs.readdirSync(dir)
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue
    const fullPath = path.join(dir, file)
    try {
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        findDb(fullPath)
      } else if (file === 'app.db') {
        console.log(`Found: ${fullPath} (Size: ${stat.size} bytes)`)
      }
    } catch (e) {
      // ignore errors
    }
  }
}

console.log('Searching C:/Users/Mahmoud/Desktop/Stream...')
findDb('C:/Users/Mahmoud/Desktop/Stream')

console.log('Searching d:/برامج/مشاريع جارى العمل عليها/Stream إصدار جديد...')
findDb('d:/برامج/مشاريع جارى العمل عليها/Stream إصدار جديد')
