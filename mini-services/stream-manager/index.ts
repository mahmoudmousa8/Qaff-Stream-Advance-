import { spawn, ChildProcess } from 'child_process'
import { createServer } from 'http'
import { existsSync, mkdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import * as net from 'net'
import * as os from 'os'

// ── Configuration from ENV ───────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '..', '..')

const PORT = parseInt(process.env.STREAM_MANAGER_PORT || '3002', 10)
const VIDEOS_DIR = resolve(PROJECT_ROOT, process.env.VIDEOS_DIR || './data/videos')
const LOGS_DIR = resolve(PROJECT_ROOT, process.env.LOGS_DIR || './data/logs')
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_STREAMS || '500', 10)
const STAGGER_DELAY_MS = parseInt(process.env.STAGGER_MS || '1000', 10)

// ── Boot: ensure dirs ────────────────────────────────────────
const ALL_DIRS = [
  resolve(PROJECT_ROOT, process.env.APP_DATA_DIR || './data'),
  VIDEOS_DIR,
  resolve(PROJECT_ROOT, process.env.UPLOAD_DIR || './data/upload'),
  resolve(PROJECT_ROOT, process.env.DOWNLOAD_DIR || './data/download'),
  LOGS_DIR,
]
for (const dir of ALL_DIRS) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    log(`Created directory: ${dir}`)
  }
}

// ── Startup time ─────────────────────────────────────────────
const STARTUP_TIME = Date.now()

// ── FFmpeg / FFprobe paths ───────────────────────────────────
function findTool(name: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`
    return execSync(cmd, { encoding: 'utf-8', timeout: 3000 }).trim().split('\n')[0] || null
  } catch { return null }
}
const FFMPEG_PATH = findTool('ffmpeg') || 'ffmpeg'
const FFPROBE_PATH = findTool('ffprobe') || 'ffprobe'

interface StreamOptions {
  muteAudio?: boolean
  audioVolume?: number
  audioFilePath?: string
  overlayText?: string
  overlayTextRight?: string
  overlayTextLeft?: string
  overlayTextEnabled?: boolean
}

// ── Stagger queue ────────────────────────────────────────────
let staggerQueue: Array<{
  slotIndex: number; rtmpUrl: string; streamKey: string; filePath: string; options?: StreamOptions
  resolve: (result: { success: boolean; message: string }) => void
}> = []
let isProcessingQueue = false

// ── Active streams ───────────────────────────────────────────
interface StreamInfo {
  process: ChildProcess | null
  slotIndex: number
  startTime: Date
  profile: string
  bitrateMbps: number    // current outgoing bitrate
  bitrateRaw: string     // e.g. "4500.0kbits/s"
  streamKey: string      // for duplicate detection
  lastProgressAt: Date   // last FFmpeg progress timestamp
  rtmpUrl: string        // needed for auto-restart
  filePath: string       // needed for auto-restart
  isStopping: boolean    // true if stopped by user
  restartCount: number   // to prevent infinite fast-restart loops
  options?: StreamOptions // save options for watchdog
  status?: 'running' | 'connecting'
}
const activeStreams: Map<number, StreamInfo> = new Map()

// ── Logging with streamKey masking ───────────────────────────
function log(message: string, streamKey?: string) {
  const timestamp = new Date().toISOString()
  let maskedMessage = message
  if (streamKey) {
    const masked = streamKey.length > 8
      ? streamKey.substring(0, 4) + '****' + streamKey.substring(streamKey.length - 4)
      : '****'
    maskedMessage = message.replace(streamKey, masked)
  }
  console.log(`[${timestamp}] ${maskedMessage}`)
}

// ── FFprobe: check source compatibility ──────────────────────
interface ProbeResult {
  videoCodec: string; audioCodec: string; fps: number; compatible: boolean; width: number; height: number; hasAudio: boolean
}

function probeFile(filePath: string): ProbeResult {
  const defaultResult: ProbeResult = { videoCodec: 'unknown', audioCodec: 'unknown', fps: 30, compatible: false, width: 1280, height: 720, hasAudio: false }
  try {
    const vCodec = execSync(
      `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim().split('\n')[0] || 'unknown'

    let cleanACodec = 'unknown'
    let hasAudio = false
    try {
      const aCodec = execSync(
        `"${FFPROBE_PATH}" -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim().split('\n')[0]
      if (aCodec && aCodec !== 'unknown') {
        cleanACodec = aCodec.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        hasAudio = true
      }
    } catch { }

    let fps = 30
    try {
      const fpsRaw = execSync(
        `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim().split('\n')[0]
      if (fpsRaw && fpsRaw.includes('/')) {
        const [num, den] = fpsRaw.split('/').map(Number)
        if (den > 0) fps = Math.round(num / den)
      }
    } catch { }

    let width = 1280
    let height = 720
    try {
      const resRaw = execSync(
        `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim()
      if (resRaw && resRaw.includes('x')) {
        const [w, h] = resRaw.split('x').map(Number)
        if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
          width = w
          height = h
        }
      }
    } catch { }

    const cleanVCodec = vCodec.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const compatible = cleanVCodec.includes('h264') && cleanACodec.includes('aac')
    return { videoCodec: cleanVCodec, audioCodec: cleanACodec, fps, compatible, width, height, hasAudio }
  } catch (err) {
    log(`FFprobe error: ${err instanceof Error ? err.message : err}`)
    return defaultResult
  }
}

// ── Build FFmpeg args ────────────────────────────────────────
function buildFfmpegArgs(filePath: string, rtmpUrl: string, options?: StreamOptions): { args: string[]; profile: string } {
  // Check if it is a live stream network URL
  const isUrl = filePath.startsWith('rtmp://') || filePath.startsWith('rtmps://') || filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('rtsp://')

  if (isUrl) {
    log(`  Profile: Live Relay (source is URL: ${filePath})`);
    return {
      profile: 'copy',
      args: [
        '-fflags', '+genpts',
        '-i', filePath,
        '-c', 'copy',
        '-max_muxing_queue_size', '1024',
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        rtmpUrl
      ]
    };
  }

  log(`  Profile: Direct Copy (source file: ${filePath})`);
  return {
    profile: 'copy',
    args: [
      '-re',
      '-stream_loop', '-1',
      '-fflags', '+genpts',
      '-i', filePath,
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '1024',
      '-f', 'flv',
      '-flvflags', 'no_duration_filesize',
      rtmpUrl
    ]
  };
}

// ── Build final RTMP URL from outputType + server + key ─────
// slotIndex is used to round-robin YouTube RTMP endpoints:
//   even slots → a.rtmp.youtube.com
//   odd  slots → b.rtmp.youtube.com
function buildRtmpUrl(outputType: string, rtmpServer: string, streamKey: string, slotIndex: number = 0): string {
  switch (outputType) {
    case 'youtube': {
      // Round-robin: distribute load across YouTube's two ingest endpoints
      const endpoint = slotIndex % 2 === 0 ? 'a' : 'b'
      return `rtmp://${endpoint}.rtmp.youtube.com/live2/${streamKey}`
    }
    case 'facebook':
      return `rtmps://live-api-s.facebook.com:443/rtmp/${streamKey}`
    case 'tiktok':
    case 'custom':
    default:
      // rtmpServer is the full URL for TikTok/Custom
      return rtmpServer
  }
}

// ── Parse bitrate from FFmpeg progress stderr ────────────────
function parseBitrate(line: string): number | null {
  // FFmpeg outputs lines like: frame=  100 fps= 30 q=28.0 size=    2048kB time=00:00:03.33 bitrate=4908.1kbits/s speed=1.00x
  const match = line.match(/bitrate=\s*(\d+(?:\.\d+)?)\s*kbits\/s/)
  if (match) {
    return parseFloat(match[1]) / 1000 // convert kbits/s → Mbps
  }
  return null
}

// ── Process stagger queue ────────────────────────────────────
async function processStaggerQueue() {
  if (isProcessingQueue) return
  isProcessingQueue = true

  // Safely take all current queue items immediately
  const batch = [...staggerQueue]
  staggerQueue = []

  // Fire them all in a single tick synchronously without any setTimeout
  for (const item of batch) {
    if (activeStreams.size >= MAX_CONCURRENT) {
      item.resolve({ success: false, message: `Concurrency limit (${MAX_CONCURRENT}) reached` })
      continue
    }
    const result = startStreamImmediate(item.slotIndex, item.rtmpUrl, item.streamKey, item.filePath, item.options)
    item.resolve(result)
  }

  isProcessingQueue = false
}

// ── Find orphan FFmpeg process by streamKey ─────────────────
function findOrphanPid(streamKey: string): number | null {
  if (!streamKey || streamKey.length < 4) return null
  try {
    const keySnippet = streamKey.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '.')
    const result = execSync(`pgrep -f "${keySnippet}"`, { encoding: 'utf-8', timeout: 2000 }).trim()
    if (!result) return null
    const pid = parseInt(result.split('\n')[0])
    return isNaN(pid) ? null : pid
  } catch { return null }
}

// ── Start a stream immediately ───────────────────────────────
function startStreamImmediate(slotIndex: number, rtmpUrl: string, streamKey: string, filePath: string, options?: StreamOptions): { success: boolean; message: string } {
  const existing = activeStreams.get(slotIndex)
  if (existing && existing.status !== 'connecting') {
    return { success: false, message: `Slot ${slotIndex + 1} is already streaming` }
  }

  // Duplicate prevention: if same streamKey is already active on another slot, reconcile
  if (streamKey) {
    for (const [existingSlot, info] of activeStreams) {
      if (info.streamKey === streamKey && existingSlot !== slotIndex) {
        log(`Slot ${slotIndex + 1}: Duplicate streamKey found on slot ${existingSlot + 1}. Skipping spawn.`)
        return { success: false, message: `Duplicate stream (slot ${existingSlot + 1} has same key). Reconciled.` }
      }
    }
  }

  if (activeStreams.size >= MAX_CONCURRENT && !existing) {
    return { success: false, message: `Concurrency limit (${MAX_CONCURRENT}) reached` }
  }

  const isUrl = filePath.startsWith('rtmp://') || filePath.startsWith('rtmps://') || filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('rtsp://')
  if (!isUrl && !existsSync(filePath)) {
    return { success: false, message: `File not found: ${filePath}` }
  }

  const restartCount = existing ? existing.restartCount : 0

  // Mask the stream key in all log output
  const maskedUrl = streamKey
    ? rtmpUrl.replace(streamKey, streamKey.length > 8
      ? streamKey.substring(0, 4) + '****' + streamKey.substring(streamKey.length - 4)
      : '****')
    : rtmpUrl

  log(`Starting stream for slot ${slotIndex + 1}`)
  log(`  File: ${filePath}`)
  log(`  RTMP: ${maskedUrl}`)

  try {
    const { args, profile } = buildFfmpegArgs(filePath, rtmpUrl, options)

    const redactedArgs = args.map(a => a === rtmpUrl ? maskedUrl : a)
    log(`  FFmpeg cmd: ${FFMPEG_PATH} ${redactedArgs.join(' ')}`)

    const ffmpegProcess = spawn(FFMPEG_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const streamInfo: StreamInfo = {
      process: ffmpegProcess,
      slotIndex,
      startTime: new Date(),
      profile,
      bitrateMbps: 0,
      bitrateRaw: '0kbits/s',
      streamKey,
      lastProgressAt: new Date(),
      rtmpUrl,
      filePath,
      isStopping: false,
      restartCount,
      options,
      status: 'running'
    }
    activeStreams.set(slotIndex, streamInfo)

    let stderrBuffer = ''
    ffmpegProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      stderrBuffer += output
      if (stderrBuffer.length > 4096) stderrBuffer = stderrBuffer.slice(-4096)

      // Parse bitrate from progress lines
      const lines = output.split('\n')
      for (const line of lines) {
        const mbps = parseBitrate(line)
        if (mbps !== null && activeStreams.has(slotIndex)) {
          const info = activeStreams.get(slotIndex)!
          info.bitrateMbps = mbps
          info.bitrateRaw = line.match(/bitrate=\s*(\d+(?:\.\d+)?kbits\/s)/)?.[1] || info.bitrateRaw
          info.lastProgressAt = new Date()  // track last progress
        }

        // Log errors (but never the raw RTMP URL with key)
        if (line.includes('error') || line.includes('Error') || line.includes('Invalid')) {
          const sanitized = streamKey ? line.replace(streamKey, '****') : line
          log(`[Slot ${slotIndex + 1} ERR]: ${sanitized.substring(0, 200).trim()}`)
        }
      }
    })

    ffmpegProcess.on('close', (code) => {
      const info = activeStreams.get(slotIndex)
      log(`Slot ${slotIndex + 1} stream ended with code ${code}`)
      
      if (code !== 0 && stderrBuffer) {
        const lastLines = stderrBuffer.trim().split('\n').slice(-3).join(' | ')
        const sanitized = streamKey ? lastLines.replace(streamKey, '****') : lastLines
        log(`  Last stderr: ${sanitized.substring(0, 300)}`)
      }

      // ── WATCHDOG / AUTO-RESTART LOGIC ───────────────────────
      if (info && !info.isStopping) {
        // If the stream ran stably for more than 60 seconds, reset the restart counter
        let currentRestartCount = info.restartCount
        if (Date.now() - info.startTime.getTime() > 60000) {
          currentRestartCount = 0
        }

        const isUrl = info.filePath.startsWith('rtmp://') || info.filePath.startsWith('rtmps://') || info.filePath.startsWith('http://') || info.filePath.startsWith('https://') || info.filePath.startsWith('rtsp://')
        const maxAttempts = isUrl ? 1000000 : 30
        const restartDelay = isUrl ? 2000 : 500

        if (currentRestartCount < maxAttempts) {
          const nextAttempt = currentRestartCount + 1
          
          if (!isUrl || nextAttempt % 10 === 0 || nextAttempt === 1) {
            log(`[WATCHDOG] Slot ${slotIndex + 1} crashed/stopped unexpectedly. Restarting in ${restartDelay}ms... (Attempt ${nextAttempt}/${maxAttempts === 1000000 ? 'inf' : maxAttempts})`)
          }

          // Update slot to connecting state so it remains active in the manager status list
          info.status = 'connecting'
          info.process = null
          info.restartCount = nextAttempt
          
          const attemptRestart = () => {
            const currentInfo = activeStreams.get(slotIndex)
            if (!currentInfo || currentInfo.isStopping) return

            const result = startStreamImmediate(slotIndex, currentInfo.rtmpUrl, currentInfo.streamKey, currentInfo.filePath, currentInfo.options)
            if (result.success) {
              const newInfo = activeStreams.get(slotIndex)
              if (newInfo) {
                newInfo.restartCount = nextAttempt
              }
              if (!isUrl || nextAttempt % 10 === 0 || nextAttempt === 1) {
                log(`[WATCHDOG] Slot ${slotIndex + 1} successfully restarted.`)
              }
            } else {
              if (!isUrl || nextAttempt % 10 === 0 || nextAttempt === 1) {
                log(`[WATCHDOG] Slot ${slotIndex + 1} failed to restart: ${result.message}. Retrying again in ${restartDelay}ms...`)
              }
              // Schedule retry since it's in connecting state and failed to start
              setTimeout(attemptRestart, restartDelay)
            }
          }
          
          setTimeout(attemptRestart, restartDelay)
        } else {
          activeStreams.delete(slotIndex)
          log(`[WATCHDOG] Slot ${slotIndex + 1} reached max consecutive restart attempts (${maxAttempts}). Giving up.`)
        }
      } else {
        activeStreams.delete(slotIndex)
      }
    })

    ffmpegProcess.on('error', (err) => {
      log(`Slot ${slotIndex + 1} error: ${err.message}`)
      activeStreams.delete(slotIndex)
    })

    const profileLabel = profile === 'copy' ? 'Direct Copy' : 'Transcode'
    return { success: true, message: `Slot ${slotIndex + 1}: Started streaming (${profileLabel})` }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log(`Failed to start stream for slot ${slotIndex + 1}: ${errorMessage}`)
    return { success: false, message: `Failed to start: ${errorMessage}` }
  }
}

// ── Queue a stream for staggered start ───────────────────────
function startStream(slotIndex: number, rtmpUrl: string, streamKey: string, filePath: string, options?: StreamOptions): { success: boolean; message: string } {
  // Fire and forget — resolve immediately with "queued" to avoid blocking Next.js scheduler
  staggerQueue.push({ slotIndex, rtmpUrl, streamKey, filePath, options, resolve: () => {} })
  log(`Slot ${slotIndex + 1} queued async for start (queue position: ${staggerQueue.length})`)
  processStaggerQueue()
  return { success: true, message: `Slot ${slotIndex + 1} queued for start` }
}

// ── Stop a stream ────────────────────────────────────────────
function stopStream(slotIndex: number): { success: boolean; message: string } {
  const stream = activeStreams.get(slotIndex)

  if (!stream) {
    return { success: false, message: `Slot ${slotIndex + 1} is not streaming` }
  }

  try {
    stream.isStopping = true // Tell watchdog to NOT restart
    if (stream.process) {
      stream.process.kill('SIGTERM')
      setTimeout(() => { try { stream?.process?.kill('SIGKILL') } catch { } }, 3000)
    }
    activeStreams.delete(slotIndex)
    log(`Stopped stream for slot ${slotIndex + 1}`)
    return { success: true, message: `Slot ${slotIndex + 1}: Stopped` }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, message: `Failed to stop: ${errorMessage}` }
  }
}

// ── Get stream status ────────────────────────────────────────
function getStreamStatus(slotIndex: number): object {
  const stream = activeStreams.get(slotIndex)
  if (!stream) return { isRunning: false }

  const duration = Math.floor((Date.now() - stream.startTime.getTime()) / 1000)
  const msSinceProgress = Date.now() - stream.lastProgressAt.getTime()
  return {
    isRunning: true,
    status: stream.status || 'running',
    startTime: stream.startTime.toISOString(),
    duration,
    profile: stream.profile,
    bitrateMbps: stream.bitrateMbps,
    lastProgressAt: stream.lastProgressAt.toISOString(),
    msSinceProgress,
    isProgressStale: msSinceProgress > 20_000
  }
}

function listActiveStreams(): number[] {
  return Array.from(activeStreams.keys())
}

// ── RAM stats ────────────────────────────────────────────────
function getRamStats(): { usedPercent: number; usedMB: number; totalMB: number } {
  const total = os.totalmem()
  const free = os.freemem()
  const used = total - free
  return {
    usedPercent: Math.round((used / total) * 100),
    usedMB: Math.round(used / 1024 / 1024),
    totalMB: Math.round(total / 1024 / 1024)
  }
}

// ── PID lock: prevent double-start ───────────────────────────
function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => { tester.close(); resolve(false) })
      .listen(port, '127.0.0.1')
  })
}

// ── HTTP Server ──────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const pathname = url.pathname

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(200); res.end(); return
  }

  try {
    // GET /health
    if (pathname === '/health' && req.method === 'GET') {
      const uptimeSeconds = Math.floor((Date.now() - STARTUP_TIME) / 1000)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        activeStreams: activeStreams.size,
        queueLength: staggerQueue.length,
        ffmpegPath: FFMPEG_PATH,
        ffprobePath: FFPROBE_PATH,
        uptimeSeconds,
        maxConcurrent: MAX_CONCURRENT,
        staggerMs: STAGGER_DELAY_MS,
        videosDir: VIDEOS_DIR
      }))
      return
    }

    // GET /stats/ram
    if (pathname === '/stats/ram' && req.method === 'GET') {
      const ram = getRamStats()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(ram))
      return
    }

    // GET /stats/bitrate?slotIndex=N
    if (pathname === '/stats/bitrate' && req.method === 'GET') {
      const slotIndex = parseInt(url.searchParams.get('slotIndex') || '-1')
      const stream = activeStreams.get(slotIndex)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        slotIndex,
        bitrateMbps: stream?.bitrateMbps ?? 0,
        bitrateRaw: stream?.bitrateRaw ?? '0kbits/s',
        isRunning: !!stream
      }))
      return
    }

    // POST /start - Staggered queue
    if (pathname === '/start' && req.method === 'POST') {
      const body = await readBody(req)
      const parsed = JSON.parse(body)
      const { slotIndex, outputType, rtmpServer, streamKey, filePath, muteAudio, audioVolume, audioFilePath, overlayText, overlayTextRight, overlayTextLeft, overlayTextEnabled } = parsed

      // Build final RTMP URL from outputType — slotIndex selects a/b endpoint (round-robin)
      const rtmpUrl = buildRtmpUrl(outputType || 'custom', rtmpServer || '', streamKey || '', slotIndex ?? 0)

      const options: StreamOptions = {
        muteAudio,
        audioVolume,
        audioFilePath,
        overlayText,
        overlayTextRight,
        overlayTextLeft,
        overlayTextEnabled
      }

      const result = startStream(slotIndex, rtmpUrl, streamKey || '', filePath, options)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // POST /start-immediate
    if (pathname === '/start-immediate' && req.method === 'POST') {
      const body = await readBody(req)
      const parsed = JSON.parse(body)
      const { slotIndex, outputType, rtmpServer, streamKey, filePath, muteAudio, audioVolume, audioFilePath, overlayText, overlayTextRight, overlayTextLeft, overlayTextEnabled } = parsed
      const rtmpUrl = buildRtmpUrl(outputType || 'custom', rtmpServer || '', streamKey || '', slotIndex ?? 0)

      const options: StreamOptions = {
        muteAudio,
        audioVolume,
        audioFilePath,
        overlayText,
        overlayTextRight,
        overlayTextLeft,
        overlayTextEnabled
      }

      const result = startStreamImmediate(slotIndex, rtmpUrl, streamKey || '', filePath, options)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // POST /stop
    if (pathname === '/stop' && req.method === 'POST') {
      const body = await readBody(req)
      const { slotIndex } = JSON.parse(body)
      const result = stopStream(slotIndex)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // POST /stop-all
    if (pathname === '/stop-all' && req.method === 'POST') {
      const stopped: number[] = []
      for (const [slotIndex] of activeStreams) {
        stopStream(slotIndex)
        stopped.push(slotIndex)
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, stopped, count: stopped.length }))
      return
    }

    // GET /status
    if (pathname === '/status' && req.method === 'GET') {
      const slotIndex = parseInt(url.searchParams.get('slotIndex') || '-1')
      if (slotIndex >= 0) {
        const status = getStreamStatus(slotIndex)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(status))
      } else {
        const active = listActiveStreams()
        const uptimeMs = Date.now() - STARTUP_TIME
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          activeStreams: active,
          count: active.length,
          queueLength: staggerQueue.length,
          uptimeMs,
          isInStartupGrace: uptimeMs < 90_000
        }))
      }
      return
    }

    // GET /reconcile — detailed stream info for smart recovery
    if (pathname === '/reconcile' && req.method === 'GET') {
      const uptimeMs = Date.now() - STARTUP_TIME
      const streams: any[] = []
      for (const [slotIndex, info] of activeStreams) {
        const msSinceProgress = Date.now() - info.lastProgressAt.getTime()
        streams.push({
          slotIndex,
          streamKey: info.streamKey,
          startTime: info.startTime.toISOString(),
          lastProgressAt: info.lastProgressAt.toISOString(),
          msSinceProgress,
          isProgressStale: msSinceProgress > 20_000,
          profile: info.profile,
          bitrateMbps: info.bitrateMbps,
          status: info.status || 'running'
        })
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ uptimeMs, isInStartupGrace: uptimeMs < 90_000, streams }))
      return
    }

    // Default
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      service: 'Qaff Stream Manager',
      version: '4.0.0',
      status: 'running',
      activeStreams: listActiveStreams().length,
      queueLength: staggerQueue.length,
      maxConcurrent: MAX_CONCURRENT,
      staggerDelay: STAGGER_DELAY_MS,
      endpoints: ['/health', '/start', '/start-immediate', '/stop', '/stop-all', '/status', '/stats/ram', '/stats/bitrate']
    }))

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: errorMessage }))
  }
})

// ── Read body ────────────────────────────────────────────────
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

// ── Start server with port-in-use guard ──────────────────────
async function startServer() {
  const inUse = await checkPortInUse(PORT)
  if (inUse) {
    log(`ERROR: Port ${PORT} is already in use!`)
    process.exit(1)
  }

  server.listen(PORT, '127.0.0.1', async () => {
    log(`Qaff Stream Manager v4.0.0 started on 127.0.0.1:${PORT}`)
    log(`  Videos directory: ${VIDEOS_DIR}`)
    log(`  FFmpeg: ${FFMPEG_PATH}`)
    log(`  FFprobe: ${FFPROBE_PATH}`)
    log(`  Max concurrent: ${MAX_CONCURRENT}`)
    log(`  Stagger delay: ${STAGGER_DELAY_MS}ms`)
    log('Ready to accept connections')

    // ── Auto-Resume Active Streams ──────────────────────────────
    try {
      let dbPath = resolve(PROJECT_ROOT, 'prisma/data/app.db')
      if (process.env.DATABASE_URL) {
        const rawPath = process.env.DATABASE_URL.replace('file:', '').replace('sqlite:', '')
        if (rawPath.startsWith('/') || rawPath.includes(':\\') || rawPath.includes(':/')) {
          dbPath = rawPath
        } else {
          const prismaDbPath = resolve(PROJECT_ROOT, 'prisma', rawPath)
          if (existsSync(prismaDbPath)) {
            dbPath = prismaDbPath
          } else {
            dbPath = resolve(PROJECT_ROOT, rawPath)
          }
        }
      } else {
        if (!existsSync(dbPath)) {
          dbPath = resolve(PROJECT_ROOT, 'data/app.db')
        }
      }

      if (existsSync(dbPath)) {
        log(`Checking for previously active streams in DB: ${dbPath}`)
        const Database = (await import('better-sqlite3')).default
        const db = new Database(dbPath, { readonly: true })
        
        // Fetch client user to get security key for live streaming
        let securityKey = 'qaff-key-123'
        try {
          const clientUser = db.prepare("SELECT securityKey FROM User WHERE username = 'user' LIMIT 1").get() as { securityKey: string } | undefined
          if (clientUser?.securityKey) {
            securityKey = clientUser.securityKey
          }
        } catch (e) {
          log(`Warning: Failed to fetch client securityKey for live auto-resume: ${e}`)
        }

        // Fetch slots where isRunning is true (1)
        const activeSlots = db.prepare(`
          SELECT slotIndex, outputType, rtmpServer, streamKey, filePath, inputType 
          FROM StreamSlot 
          WHERE isRunning = 1 OR status = 'Live'
        `).all() as Array<{
          slotIndex: number
          outputType: string
          rtmpServer: string
          streamKey: string
          filePath: string
          inputType: string
        }>

        db.close()

        if (activeSlots.length > 0) {
          log(`Found ${activeSlots.length} active stream(s) to auto-resume...`)
          for (const slot of activeSlots) {
            let finalInputPath = slot.filePath
            if (slot.inputType === 'live') {
              finalInputPath = `rtmp://127.0.0.1/live/${securityKey}`
            }
            const finalRtmp = buildRtmpUrl(slot.outputType, slot.rtmpServer, slot.streamKey, slot.slotIndex)

            // Orphan detection: kill any stale FFmpeg with same streamKey before restarting
            const orphanPid = findOrphanPid(slot.streamKey)
            if (orphanPid) {
              log(`Slot ${slot.slotIndex + 1}: Found orphan FFmpeg (PID ${orphanPid}). Terminating before restart...`)
              try {
                process.kill(orphanPid, 'SIGTERM')
                await new Promise(r => setTimeout(r, 500))
                try { process.kill(orphanPid, 'SIGKILL') } catch { }
              } catch { }
            }

            staggerQueue.push({
              slotIndex: slot.slotIndex,
              rtmpUrl: finalRtmp,
              streamKey: slot.streamKey,
              filePath: finalInputPath,
              resolve: (res) => {
                log(`Auto-resume slot ${slot.slotIndex + 1}: ${res.success ? 'Success' : `Failed (${res.message})`}`)
              }
            })
          }
          // Kickoff the queue processor
          processStaggerQueue()
        } else {
          log('No active streams found to auto-resume.')
        }
      } else {
        log(`Skipping auto-resume: Database not found at ${dbPath}`)
      }
    } catch (err) {
      log(`Auto-resume failed: ${err instanceof Error ? err.message : err}`)
    }
  })
}

startServer()

// ── Graceful shutdown ────────────────────────────────────────
const shutdown = () => {
  log('Shutting down...')
  for (const [slotIndex, stream] of activeStreams) {
    log(`Stopping stream for slot ${slotIndex + 1}`)
    if (stream.process) {
      stream.process.kill('SIGTERM')
    }
  }
  server.close(() => { log('Server closed'); process.exit(0) })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
