const { execSync } = require('child_process')
try {
  const ps = execSync("ps aux | grep ffmpeg | grep -v grep").toString()
  console.log('Active FFmpeg processes:')
  console.log(ps)
} catch (e) {
  console.log('Error listing FFmpeg processes:', e.message)
}
