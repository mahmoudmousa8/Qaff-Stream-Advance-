#!/usr/bin/env node
/**
 * Safe Batch Image Optimizer for Qaff Stream
 * Optimizes all existing PNG and JPG images in-place without reducing visual quality.
 * Preserves original filenames and extensions so zero database/slot references break.
 * 
 * Usage:
 *   node scripts/optimize-all-images.js [target_directory]
 */

const fs = require('fs')
const path = require('path')

// Resolve sharp from node_modules
let sharp
try {
  sharp = require('sharp')
} catch (e) {
  try {
    sharp = require(path.join(process.cwd(), 'node_modules', 'sharp'))
  } catch (e2) {
    console.error('Error: Cannot load sharp. Please run inside project root or ensure sharp is installed.')
    process.exit(1)
  }
}

const targetDir = process.argv[2] || process.env.VIDEOS_DIR || '/var/lib/qaff-stream/videos'
const MAX_WIDTH = 1920
const MAX_HEIGHT = 1080

async function findImages(dir, list = []) {
  if (!fs.existsSync(dir)) return list
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await findImages(full, list)
    } else if (/\.(png|jpg|jpeg)$/i.test(ent.name)) {
      list.push(full)
    }
  }
  return list
}

async function optimizeOne(filePath) {
  const stat = fs.statSync(filePath)
  const originalSize = stat.size
  const ext = path.extname(filePath).toLowerCase()

  let pipeline = sharp(filePath, { failOnError: false })
  const meta = await pipeline.metadata()
  const width = meta.width || 0
  const height = meta.height || 0

  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    pipeline = pipeline.resize({
      width: width > MAX_WIDTH ? MAX_WIDTH : undefined,
      height: height > MAX_HEIGHT ? MAX_HEIGHT : undefined,
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  let optBuffer
  if (ext === '.png') {
    let candidate = await pipeline
      .clone()
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer()

    if (candidate.length > 1.2 * 1024 * 1024) {
      candidate = await pipeline
        .clone()
        .png({ compressionLevel: 9, effort: 10, palette: true, quality: 92 })
        .toBuffer()
    }
    optBuffer = candidate
  } else {
    optBuffer = await pipeline
      .clone()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer()
  }

  if (optBuffer.length > 0 && optBuffer.length < originalSize) {
    const tmp = `${filePath}.opt_tmp_${Date.now()}`
    fs.writeFileSync(tmp, optBuffer)
    fs.renameSync(tmp, filePath)
    return {
      optimized: true,
      originalSize,
      newSize: optBuffer.length,
      saved: originalSize - optBuffer.length
    }
  }

  return {
    optimized: false,
    originalSize,
    newSize: originalSize,
    saved: 0
  }
}

async function main() {
  console.log('=============================================')
  console.log('       Qaff Stream Image Optimizer           ')
  console.log('=============================================')
  console.log(`Scanning directory: ${targetDir}`)

  const images = await findImages(targetDir)
  console.log(`Found ${images.length} images to check and optimize.\n`)

  if (images.length === 0) {
    console.log('No images found to optimize.')
    return
  }

  let totalOriginal = 0
  let totalOptimized = 0
  let optimizedCount = 0
  let errorCount = 0

  const startTime = Date.now()

  for (let i = 0; i < images.length; i++) {
    const imgPath = images[i]
    try {
      const res = await optimizeOne(imgPath)
      totalOriginal += res.originalSize
      totalOptimized += res.newSize
      if (res.optimized) {
        optimizedCount++
      }

      if ((i + 1) % 50 === 0 || i === images.length - 1) {
        const pct = (((i + 1) / images.length) * 100).toFixed(1)
        const savedMb = ((totalOriginal - totalOptimized) / (1024 * 1024)).toFixed(1)
        console.log(`[${i + 1}/${images.length} (${pct}%)] Processed... Current Space Saved: ${savedMb} MB`)
      }
    } catch (err) {
      errorCount++
      console.error(`Error on ${path.basename(imgPath)}:`, err.message)
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  const totalSavedBytes = totalOriginal - totalOptimized
  const totalSavedMb = (totalSavedBytes / (1024 * 1024)).toFixed(2)
  const totalSavedGb = (totalSavedBytes / (1024 * 1024 * 1024)).toFixed(3)
  const savedPct = totalOriginal > 0 ? ((totalSavedBytes / totalOriginal) * 100).toFixed(1) : '0'

  console.log('\n=============================================')
  console.log('           Optimization Finished!            ')
  console.log('=============================================')
  console.log(`Total images scanned:    ${images.length}`)
  console.log(`Images compressed:       ${optimizedCount}`)
  console.log(`Original total size:     ${(totalOriginal / (1024 * 1024)).toFixed(2)} MB`)
  console.log(`New total size:          ${(totalOptimized / (1024 * 1024)).toFixed(2)} MB`)
  console.log(`Total space freed:       ${totalSavedMb} MB (${totalSavedGb} GB) - ${savedPct}% reduction!`)
  console.log(`Time elapsed:            ${durationSec} seconds`)
  if (errorCount > 0) {
    console.log(`Errors encountered:      ${errorCount}`)
  }
  console.log('=============================================\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
