import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

export interface ImageOptimizationResult {
  success: boolean
  originalSize: number
  optimizedSize: number
  savedBytes: number
  savedPercent: number
  format: string
  width?: number
  height?: number
  error?: string
}

const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080

/**
 * Optimizes an image file in-place safely.
 * Keeps the original extension and file format, preserving high visual quality
 * while minimizing file size. Only overwrites if the resulting file is smaller.
 */
export async function optimizeImageFile(filePath: string): Promise<ImageOptimizationResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        originalSize: 0,
        optimizedSize: 0,
        savedBytes: 0,
        savedPercent: 0,
        format: '',
        error: 'File does not exist'
      }
    }

    const stat = fs.statSync(filePath)
    const originalSize = stat.size
    const ext = path.extname(filePath).toLowerCase()

    if (!['.png', '.jpg', '.jpeg'].includes(ext)) {
      return {
        success: false,
        originalSize,
        optimizedSize: originalSize,
        savedBytes: 0,
        savedPercent: 0,
        format: ext,
        error: 'Unsupported image format'
      }
    }

    let pipeline = sharp(filePath, { failOnError: false })
    const metadata = await pipeline.metadata()

    const width = metadata.width || 0
    const height = metadata.height || 0

    // Downscale if unreasonably large (YouTube thumbnails max 1920x1080)
    // without enlarging smaller images
    if (width > MAX_WIDTH || height > MAX_HEIGHT) {
      pipeline = pipeline.resize({
        width: width > MAX_WIDTH ? MAX_WIDTH : undefined,
        height: height > MAX_HEIGHT ? MAX_HEIGHT : undefined,
        fit: 'inside',
        withoutEnlargement: true
      })
    }

    let optimizedBuffer: Buffer

    if (ext === '.png') {
      if (originalSize > 1.2 * 1024 * 1024) {
        // Large PNG (e.g. 1.5MB - 2MB): directly apply high-quality 8-bit palette quantization
        // This yields crystal clear crispness at 400-650KB, well under YouTube's 2MB limit
        optimizedBuffer = await pipeline
          .clone()
          .png({ compressionLevel: 9, effort: 7, palette: true, quality: 92 })
          .toBuffer()
      } else {
        // Smaller PNG: try standard lossless first
        let candidate = await pipeline
          .clone()
          .png({ compressionLevel: 9, effort: 7 })
          .toBuffer()

        if (candidate.length > 1.2 * 1024 * 1024) {
          candidate = await pipeline
            .clone()
            .png({ compressionLevel: 9, effort: 7, palette: true, quality: 92 })
            .toBuffer()
        }
        optimizedBuffer = candidate
      }
    } else {
      // JPEG format (.jpg, .jpeg)
      optimizedBuffer = await pipeline
        .clone()
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer()
    }

    // Only overwrite if optimized version is smaller
    if (optimizedBuffer.length > 0 && optimizedBuffer.length < originalSize) {
      const tempPath = `${filePath}.opt_tmp_${Date.now()}`
      fs.writeFileSync(tempPath, optimizedBuffer)
      fs.renameSync(tempPath, filePath)

      const savedBytes = originalSize - optimizedBuffer.length
      const savedPercent = Math.round((savedBytes / originalSize) * 100)

      return {
        success: true,
        originalSize,
        optimizedSize: optimizedBuffer.length,
        savedBytes,
        savedPercent,
        format: metadata.format || ext.replace('.', ''),
        width,
        height
      }
    }

    // Original was already as small or smaller
    return {
      success: true,
      originalSize,
      optimizedSize: originalSize,
      savedBytes: 0,
      savedPercent: 0,
      format: metadata.format || ext.replace('.', ''),
      width,
      height
    }
  } catch (err: any) {
    console.error(`[image-optimizer] Error optimizing ${filePath}:`, err?.message || err)
    return {
      success: false,
      originalSize: 0,
      optimizedSize: 0,
      savedBytes: 0,
      savedPercent: 0,
      format: '',
      error: err?.message || String(err)
    }
  }
}
