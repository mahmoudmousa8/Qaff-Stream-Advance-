/**
 * PM2 Ecosystem Configuration — Qaff Studio Streaming
 *
 * The deploy.sh script automatically patches the `cwd` paths below.
 * To start manually:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   ← then run the sudo command it shows
 */

const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

// Use __dirname so the config works from any directory
const PROJECT_DIR = __dirname

// Load .env file explicitly so PM2 injects it
require('dotenv').config({ path: path.join(PROJECT_DIR, '.env') })

const LOGS_DIR      = process.env.LOGS_DIR      || path.join(PROJECT_DIR, 'data/logs')
const VIDEOS_DIR    = process.env.VIDEOS_DIR    || path.join(PROJECT_DIR, 'data/videos')
const UPLOAD_DIR    = process.env.UPLOAD_DIR    || path.join(PROJECT_DIR, 'data/upload')
const DOWNLOAD_DIR  = process.env.DOWNLOAD_DIR  || path.join(PROJECT_DIR, 'data/download')
const APP_DATA_DIR  = process.env.APP_DATA_DIR  || path.join(PROJECT_DIR, 'data')
const DATABASE_URL  = process.env.DATABASE_URL  || `file:${path.join(PROJECT_DIR, 'data/app.db')}`

// Ensure logs directory exists so PM2 can write to it
if (!fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true })
  } catch (err) {
    console.error(`Could not create logs directory at ${LOGS_DIR}:`, err)
  }
}

// Check if cloudflared is installed
let hasCloudflared = false
try {
  execSync('which cloudflared', { stdio: 'ignore' })
  hasCloudflared = true
} catch (e) {
  if (fs.existsSync('/usr/local/bin/cloudflared') || fs.existsSync('/usr/bin/cloudflared')) {
    hasCloudflared = true
  }
}

const apps = [
  // ── Web App (Next.js on port 3000) ─────────────────────
  {
    name: 'qaff-web',
    script: '.next/standalone/server.js',
    cwd: PROJECT_DIR,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '0.0.0.0',
      // Persistent paths — forwarded explicitly so standalone server.js finds files after update
      DATABASE_URL,
      APP_DATA_DIR,
      VIDEOS_DIR,
      UPLOAD_DIR,
      DOWNLOAD_DIR,
      LOGS_DIR,
      CLOUDFLARE_LOG_PATH: process.env.CLOUDFLARE_LOG_PATH || path.join(LOGS_DIR, 'cloudflare-tunnel.log'),
      // YouTube OAuth
      YOUTUBE_CLIENT_ID:     process.env.YOUTUBE_CLIENT_ID     || '',
      YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || '',
      YOUTUBE_REDIRECT_URI:  process.env.YOUTUBE_REDIRECT_URI  || '',
      // Session / Auth
      SESSION_SECRET: process.env.SESSION_SECRET || '',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || '',
      NEXTAUTH_URL:    process.env.NEXTAUTH_URL    || '',
      // Stream Manager
      STREAM_MANAGER_URL:  process.env.STREAM_MANAGER_URL  || 'http://127.0.0.1:3002',
      STREAM_MANAGER_PORT: process.env.STREAM_MANAGER_PORT || '3002',
    },
    error_file: path.join(LOGS_DIR, 'web-error.log'),
    out_file: path.join(LOGS_DIR, 'web-out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  },

  // ── Stream Manager (port 3002) ──────────────────────────
  {
    name: 'qaff-stream-manager',
    script: 'index.ts',
    cwd: path.join(PROJECT_DIR, 'mini-services/stream-manager'),
    interpreter: 'tsx',
    interpreter_args: '',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      // Persistent paths — must match the web app
      DATABASE_URL,
      APP_DATA_DIR,
      VIDEOS_DIR,
      UPLOAD_DIR,
      DOWNLOAD_DIR,
      LOGS_DIR,
      // Stream Manager port
      STREAM_MANAGER_PORT: process.env.STREAM_MANAGER_PORT || '3002',
      MAX_CONCURRENT_STREAMS: process.env.MAX_CONCURRENT_STREAMS || '500',
      STAGGER_MS: process.env.STAGGER_MS || '1000',
    },
    error_file: path.join(LOGS_DIR, 'stream-manager-error.log'),
    out_file: path.join(LOGS_DIR, 'stream-manager-out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  },
]

// Only start Quick Tunnel if ENABLE_QUICK_TUNNEL=true is set in .env
// We don't want to spawn a random trycloudflare domain if the user already has a stable domain configured.
const enableQuickTunnel = process.env.ENABLE_QUICK_TUNNEL === 'true'

if (hasCloudflared && enableQuickTunnel) {
  apps.push({
    name: 'qaff-tunnel',
    script: 'cloudflared',
    args: `tunnel --url http://127.0.0.1:3000 --logfile ${path.join(LOGS_DIR, 'cloudflare-tunnel.log')}`,
    cwd: PROJECT_DIR,
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '150M',
    error_file: path.join(LOGS_DIR, 'tunnel-error.log'),
    out_file: path.join(LOGS_DIR, 'tunnel-out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  })
}

module.exports = {
  apps
}
