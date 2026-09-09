import { NextRequest, NextResponse } from 'next/server'
import { createReadStream, statSync, existsSync } from 'fs'
import path, { resolve, extname } from 'path'
import { VIDEOS_DIR } from '@/lib/paths'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.ts': 'video/mp2t',
  '.m4v': 'video/x-m4v',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

const ALLOWED_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.m2ts', '.mts', '.m4v', '.3gp', '.ogv', '.mpeg', '.mpg',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'
])

// GET /api/videos/stream?path=relative/or/absolute/file.mp4&download=1
// Streams video and image files for in-browser preview and direct download with Range support
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const pathParam = url.searchParams.get('path')

    if (!pathParam) {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    // Handle both absolute paths within VIDEOS_DIR and relative paths
    const normalizedVideosDir = resolve(VIDEOS_DIR)
    const safePath = pathParam.replace(/\.\.\//g, '').replace(/\.\.\\/g, '')
    const fullPath = path.isAbsolute(safePath) ? resolve(safePath) : resolve(VIDEOS_DIR, safePath)

    // Security check: Ensure the resolved path is inside VIDEOS_DIR
    if (!fullPath.startsWith(normalizedVideosDir)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const ext = extname(fullPath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 })
    }

    if (!existsSync(fullPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const stat = statSync(fullPath)
    const fileSize = stat.size
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const isDownload = url.searchParams.get('download') === '1'
    const filename = path.basename(fullPath) || 'file'

    const rangeHeader = request.headers.get('range')
    const isImage = ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.gif' || ext === '.bmp' || ext === '.svg'

    if (rangeHeader && !isDownload && !isImage) {
      // Support HTTP Range requests (required for video seeking)
      const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-')
      const start = parseInt(startStr, 10)
      const end = endStr ? parseInt(endStr, 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1)
      const chunkSize = end - start + 1

      const stream = createReadStream(fullPath, { start, end })
      const webStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => controller.enqueue(chunk))
          stream.on('end', () => controller.close())
          stream.on('error', (err) => controller.error(err))
        },
      })

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
          'Content-Type': contentType,
          'Cache-Control': 'no-cache',
        },
      })
    } else {
      // Full file response (for images, full video, or downloads)
      const stream = createReadStream(fullPath)
      const webStream = new ReadableStream({
        start(controller) {
          stream.on('data', (chunk) => controller.enqueue(chunk))
          stream.on('end', () => controller.close())
          stream.on('error', (err) => controller.error(err))
        },
      })

      const headers: Record<string, string> = {
        'Content-Length': String(fileSize),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': isDownload ? 'no-cache' : 'public, max-age=86400',
      }

      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
      }

      return new NextResponse(webStream, {
        status: 200,
        headers,
      })
    }
  } catch (error) {
    console.error('[stream] Error:', error)
    return NextResponse.json({ error: 'Stream error' }, { status: 500 })
  }
}
