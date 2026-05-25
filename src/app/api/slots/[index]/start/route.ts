import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { STREAM_MANAGER_URL } from '@/lib/paths'

// POST - Start streaming
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ index: string }> }
) {
  try {
    const { index } = await params
    const slotIndex = parseInt(index)

    if (isNaN(slotIndex) || slotIndex < 0 || slotIndex >= 500) {
      return NextResponse.json({ error: 'Invalid slot index' }, { status: 400 })
    }

    const slot = await db.streamSlot.findUnique({
      where: { slotIndex }
    })

    if (!slot) {
      return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
    }

    // Fetch client user to get security key for live streaming
    const clientUser = await db.user.findUnique({
      where: { username: 'user' }
    })
    const securityKey = clientUser?.securityKey || 'qaff-key-123'

    let finalInputPath = slot.filePath
    if (slot.inputType === 'live') {
      finalInputPath = `rtmp://127.0.0.1/live/${securityKey}`
    } else {
      if (!slot.filePath) {
        return NextResponse.json({ error: 'fileNotFound' }, { status: 400 })
      }
    }

    const outputType = slot.outputType || 'youtube'

    // Validate based on output type
    if (outputType === 'youtube' || outputType === 'facebook') {
      // If a youtubeChannelId is set, the stream key will be fetched automatically.
      // Otherwise, the user must provide a stream key manually.
      if (!slot.youtubeChannelId && (!slot.streamKey || slot.streamKey.trim() === '')) {
        return NextResponse.json({ error: 'streamKeyRequired' }, { status: 400 })
      }
    } else {
      // tiktok / custom: rtmpServer must be a valid RTMP URL
      if (!slot.rtmpServer || (!slot.rtmpServer.startsWith('rtmp://') && !slot.rtmpServer.startsWith('rtmps://'))) {
        return NextResponse.json({ error: 'invalidRtmpUrl' }, { status: 400 })
      }
    }

    let updatedSchedStart = slot.schedStart;
    if (!updatedSchedStart) {
      const now = new Date();
      const sMonth = String(now.getMonth() + 1).padStart(2, '0');
      const sDate = String(now.getDate()).padStart(2, '0');
      const sH = String(now.getHours()).padStart(2, '0');
      const sM = String(now.getMinutes()).padStart(2, '0');
      updatedSchedStart = `${sMonth}-${sDate} ${sH}:${sM}`;
    }

    let updatedSchedStop = slot.schedStop;
    if (updatedSchedStop && updatedSchedStop.startsWith('DUR ')) {
      const [hStr, mStr] = updatedSchedStop.replace('DUR ', '').split(':');
      const dursMins = parseInt(hStr || '0') * 60 + parseInt(mStr || '0');
      if (dursMins > 0) {
        // Anchor to schedStart (original scheduled time), NOT to now.
        // This ensures: 8h duration from 00:00 always stops at 08:00,
        // even if the stream is manually started at 03:00.
        let anchor = new Date();
        if (updatedSchedStart) {
          try {
            const parts = updatedSchedStart.split(' ');
            if (parts.length === 2) {
              const [month, day] = parts[0].split('-').map(Number);
              const [hour, minute] = parts[1].split(':').map(Number);
              if (!isNaN(month) && !isNaN(day) && !isNaN(hour) && !isNaN(minute)) {
                const candidate = new Date(anchor.getFullYear(), month - 1, day, hour, minute, 0);
                // Cross-year normalization: pick the year that makes candidate closest to now
                if (anchor.getTime() - candidate.getTime() > 1000 * 60 * 60 * 24 * 180) {
                  candidate.setFullYear(anchor.getFullYear() + 1);
                } else if (candidate.getTime() - anchor.getTime() > 1000 * 60 * 60 * 24 * 180) {
                  candidate.setFullYear(anchor.getFullYear() - 1);
                }
                anchor = candidate;
              }
            }
          } catch { /* keep anchor = now on parse failure */ }
        }
        const targetDate = new Date(anchor.getTime() + dursMins * 60 * 1000);
        const fMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
        const fDate = String(targetDate.getDate()).padStart(2, '0');
        const fH = String(targetDate.getHours()).padStart(2, '0');
        const fM = String(targetDate.getMinutes()).padStart(2, '0');
        updatedSchedStop = `${fMonth}-${fDate} ${fH}:${fM}`;
      }
    }

    // Set status to Starting
    await db.streamSlot.update({
      where: { slotIndex },
      data: {
        status: 'Starting',
        isRunning: false,
        isScheduled: false,
        manuallyStopped: false,
        schedStart: updatedSchedStart,
        schedStop: updatedSchedStop,
        isSwapped: false
      }
    })

    // If a YouTube channel is bound, create a Live Broadcast and fetch the active stream key
    let finalStreamKey = slot.streamKey
    let finalRtmpServer = slot.rtmpServer
    let youtubeBroadcastId = ""
    if (slot.youtubeChannelId && outputType === 'youtube') {
      try {
        console.log(`[Start Route] Slot ${slotIndex}: Setting up YouTube Live broadcast...`)
        const { setupYoutubeLiveStream } = await import('@/lib/youtube-helper')
        const { resolveThumbnailFileFromFolder, activeThumbnails } = await import('@/lib/run-scheduler')
        let resolvedThumbnailPath = slot.youtubeThumbnailPath || undefined
        if (resolvedThumbnailPath) {
          resolvedThumbnailPath = resolveThumbnailFileFromFolder(resolvedThumbnailPath, slotIndex)
          activeThumbnails.set(slotIndex, resolvedThumbnailPath)
        }

        let finalTitle = slot.youtubeTitle || 'Live Stream'
        let finalDescription = slot.youtubeDescription || ''

        if ((slot as any).titleDescListId) {
          try {
            const tdList = await db.titleDescList.findUnique({
              where: { id: (slot as any).titleDescListId }
            })
            if (tdList) {
              const listData = JSON.parse(tdList.items)
              const pairs = Array.isArray(listData) ? listData : (listData.pairs || [])
              if (pairs.length > 0) {
                const titles = pairs.map((p: any) => p.title).filter((t: string) => t.trim() !== '')
                const descs = pairs.map((p: any) => p.description).filter((d: string) => d.trim() !== '')
                if (titles.length > 0) {
                  finalTitle = titles[Math.floor(Math.random() * titles.length)]
                }
                if (descs.length > 0) {
                  finalDescription = descs[Math.floor(Math.random() * descs.length)]
                }
              }
            }
          } catch (e: any) {
            console.error(`[Start Route] Failed to fetch/parse title desc list for slot ${slot.slotIndex}:`, e.message)
          }
        }

        const yt = await setupYoutubeLiveStream(
          slot.youtubeChannelId,
          finalTitle,
          finalDescription,
          resolvedThumbnailPath,
          slot.streamKey
        )
        finalStreamKey = yt.streamKey || finalStreamKey
        finalRtmpServer = yt.rtmpServer || finalRtmpServer
        youtubeBroadcastId = yt.broadcastId || ""
        console.log(`[Start Route] Slot ${slotIndex}: YouTube Live broadcast ready. Stream key: ${finalStreamKey.substring(0, 4)}****`)
      } catch (ytErr: any) {
        console.error(`[Start Route] Slot ${slotIndex}: YouTube setup failed:`, ytErr.message)
        // Reset the slot status to Failed and save
        await db.streamSlot.update({
          where: { slotIndex },
          data: { status: 'Failed', isRunning: false, manuallyStopped: true }
        })
        // Write the error into the System Logs database
        await db.systemLog.create({
          data: { message: `Slot ${slotIndex + 1}: YouTube API Error: ${ytErr.message}` }
        })
        return NextResponse.json({ error: `YouTube API Error: ${ytErr.message}` }, { status: 400 })
      }
    }

    // Call stream manager — zero-transcode, direct copy only
    try {
      let resolvedInputPath = finalInputPath
      if (slot.inputType !== 'live' && slot.filePath) {
        const { resolveVideoFileFromFolder, activeMainVideos } = await import('@/lib/run-scheduler')
        resolvedInputPath = resolveVideoFileFromFolder(slot.filePath, slotIndex, 'main')
        activeMainVideos.set(slotIndex, resolvedInputPath)
      }

      const response = await fetch(`${STREAM_MANAGER_URL}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotIndex,
          outputType,
          rtmpServer: finalRtmpServer,
          streamKey: finalStreamKey,
          filePath: resolvedInputPath
        })
      })

      const result = await response.json()

      if (!result.success) {
        await db.streamSlot.update({
          where: { slotIndex },
          data: { status: 'Failed', isRunning: false, manuallyStopped: true }
        })
        return NextResponse.json({ error: result.message }, { status: 400 })
      }

      const updatedSlot = await db.streamSlot.update({
        where: { slotIndex },
        data: {
          isRunning: true,
          isScheduled: false,
          status: 'Streaming',
          streamKey: finalStreamKey,
          rtmpServer: finalRtmpServer,
          youtubeBroadcastId: youtubeBroadcastId
        }
      })

      const { verifyStreamStatusAfterDelay, lastActionTokens } = await import('@/lib/run-scheduler')
      const token = Math.random().toString(36).substring(7)
      lastActionTokens.set(slotIndex, token)
      verifyStreamStatusAfterDelay(slotIndex, 'start', token)

      return NextResponse.json({
        success: true,
        slot: updatedSlot,
        message: result.message || 'streamRunning'
      })
    } catch (error) {
      console.error('Failed to connect to stream manager:', error)
      await db.streamSlot.update({
        where: { slotIndex },
        data: { status: 'Failed', isRunning: false, manuallyStopped: true }
      })
      return NextResponse.json({ error: 'Stream manager not available' }, { status: 503 })
    }
  } catch (error) {
    console.error('Error starting stream:', error)
    return NextResponse.json({ error: 'streamFailed' }, { status: 500 })
  }
}
