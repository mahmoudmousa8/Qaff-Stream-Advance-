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

const LOGS_DIR = process.env.LOGS_DIR || path.join(PROJECT_DIR, 'data/logs')

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
    },
    error_file: path.join(LOGS_DIR, 'stream-manager-error.log'),
    out_file: path.join(LOGS_DIR, 'stream-manager-out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  },
]

if (hasCloudflared) {
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
