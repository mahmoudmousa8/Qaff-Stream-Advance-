import { exec } from 'child_process'

exec('netstat -ano', (err, stdout, stderr) => {
  if (err) {
    console.error('Error:', err)
    return
  }
  const lines = stdout.split('\n')
  const listening = lines.filter(line => line.includes('LISTENING'))
  console.log('ALL Listening connections:')
  listening.forEach(line => {
    console.log(line.trim())
  })
})
