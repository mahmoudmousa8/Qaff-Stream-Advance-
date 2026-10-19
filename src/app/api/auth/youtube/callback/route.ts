import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || ''

async function processYouTubeAuth(params: {
  access_token: string,
  refresh_token?: string,
  expires_in?: number,
  customName: string
}) {
  const { access_token, refresh_token, expires_in, customName } = params

  const channelProfileResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: 'Bearer ' + access_token }
  })

  if (!channelProfileResponse.ok) {
    const profileError = await channelProfileResponse.text()
    throw new Error('Failed to fetch YouTube channel profile: ' + profileError)
  }

  const channelProfileData = await channelProfileResponse.json()
  const profile = channelProfileData.items?.[0]

  if (!profile) {
    throw new Error('No YouTube Live channels found under this Google account')
  }

  const channelId = profile.id
  const channelTitle = profile.snippet?.title || 'YouTube Broadcast Channel'
  const expiryDate = new Date(Date.now() + (expires_in || 3600) * 1000)

  const existing = await db.youtubeChannel.findFirst({
    where: { channelId }
  })

  if (existing) {
    await db.youtubeChannel.update({
      where: { id: existing.id },
      data: {
        name: customName,
        channelTitle,
        accessToken: access_token,
        ...(refresh_token ? { refreshToken: refresh_token } : {}),
        expiryDate,
        createdAt: new Date()
      }
    })
    console.log('[YouTube Auth Callback] Updated existing channel: ' + channelTitle)

    try {
      const boundSlots = await db.streamSlot.findMany({
        where: {
          youtubeChannelId: existing.id,
          isRunning: false,
          manuallyStopped: false
        },
        orderBy: { slotIndex: 'asc' }
      })

      if (boundSlots.length > 0) {
        const now = new Date()
        const cairoNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
        let offsetMins = 1
        let batchCount = 0

        for (const slot of boundSlots) {
          const targetDate = new Date(cairoNow.getTime() + offsetMins * 60 * 1000)
          const tMonth = String(targetDate.getMonth() + 1).padStart(2, '0')
          const tDay = String(targetDate.getDate()).padStart(2, '0')
          const tHour = String(targetDate.getHours()).padStart(2, '0')
          const tMinute = String(targetDate.getMinutes()).padStart(2, '0')
          const newSchedStart = tMonth + '-' + tDay + ' ' + tHour + ':' + tMinute

          await db.streamSlot.update({
            where: { slotIndex: slot.slotIndex },
            data: {
              isScheduled: true,
              status: 'Scheduled',
              isRunning: false,
              manuallyStopped: false,
              schedStart: newSchedStart,
              nextRunTime: newSchedStart,
              youtubeBroadcastId: ''
            }
          })

          batchCount++
          if (batchCount >= 2) {
            batchCount = 0
            offsetMins++
          }
        }
        console.log('[YouTube Auth Callback] Auto-rescheduled bound slots for ' + channelTitle)
      }
    } catch (err: any) {
      console.error('[YouTube Auth Callback] Error waking up bound slots:', err.message)
    }
  } else {
    await db.youtubeChannel.create({
      data: {
        name: customName,
        channelId,
        channelTitle,
        accessToken: access_token,
        refreshToken: refresh_token || '',
        expiryDate
      }
    })
    console.log('[YouTube Auth Callback] Successfully created new channel: ' + channelTitle)
  }

  return { success: true, channelId, channelTitle }
}

export async function GET(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http'
  const origin = forwardedHost ? (forwardedProto + '://' + forwardedHost) : request.nextUrl.origin
  const redirectUri = origin + '/api/auth/youtube/callback'

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const customName = searchParams.get('state') || 'YouTube Channel'
    const errorParam = searchParams.get('error')

    if (errorParam) {
      console.error('[YouTube Auth Callback] Access denied:', errorParam)
      return NextResponse.redirect(origin + '/?youtube_auth=error&msg=' + encodeURIComponent(errorParam))
    }

    if (!code) {
      return NextResponse.redirect(origin + '/?youtube_auth=error&msg=No authorization code')
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!tokenResponse.ok) {
      const errorMsg = await tokenResponse.text()
      console.error('[YouTube Auth Callback] Code exchange failed:', errorMsg)
      return NextResponse.redirect(origin + '/?youtube_auth=error&msg=' + encodeURIComponent(errorMsg))
    }

    const tokenData = await tokenResponse.json()
    await processYouTubeAuth({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      customName
    })

    return NextResponse.redirect(origin + '/?youtube_auth=success')
  } catch (error: any) {
    console.error('[YouTube Auth Callback] Unexpected Error:', error)
    return NextResponse.redirect(origin + '/?youtube_auth=error&msg=' + encodeURIComponent(error.message || 'Error'))
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    let { access_token, refresh_token, expires_in, state, name, code, redirect_uri, client_id, client_secret } = body
    const customName = state || name || 'YouTube Channel'

    if (!access_token && code) {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: client_id || CLIENT_ID,
          client_secret: client_secret || CLIENT_SECRET,
          redirect_uri: redirect_uri || 'http://localhost',
          grant_type: 'authorization_code'
        })
      })

      if (!tokenResponse.ok) {
        const errorMsg = await tokenResponse.text()
        return NextResponse.json({ success: false, error: 'Token exchange failed: ' + errorMsg }, { status: 400 })
      }

      const tokenData = await tokenResponse.json()
      access_token = tokenData.access_token
      refresh_token = tokenData.refresh_token
      expires_in = tokenData.expires_in
    }

    if (!access_token) {
      return NextResponse.json({ success: false, error: 'Missing access_token or code' }, { status: 400 })
    }

    const result = await processYouTubeAuth({
      access_token,
      refresh_token,
      expires_in,
      customName
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('[YouTube Auth Callback POST] Error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Unexpected error' }, { status: 500 })
  }
}
