import { exec } from 'child_process'

exec('powershell -Command "Get-ChildItem -Path \'C:\\Users\\Mahmoud\\Desktop\\Stream\', \'d:\\برامج\\مشاريع جارى العمل عليها\\Stream إصدار جديد\' -Filter \'app.db\' -Recurse -ErrorAction SilentlyContinue | Select-Object FullName, Length | Format-List"', (err, stdout, stderr) => {
  if (err) {
    console.error('Error:', err)
    return
  }
  console.log(stdout)
})
