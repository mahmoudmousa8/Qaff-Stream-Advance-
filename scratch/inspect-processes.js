import { exec } from 'child_process'

exec('powershell -Command "Get-NetTCPConnection -LocalPort 3000, 3002 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort, OwningProcess, State | Format-List"', (err, stdout, stderr) => {
  if (err) {
    console.error('Error:', err)
    return
  }
  console.log(stdout)
})
