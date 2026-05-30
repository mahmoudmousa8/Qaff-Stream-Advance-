import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || ''

export async function GET(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'http'
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin
  
  const redirectUri = `${origin}/api/auth/youtube/callback`

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const customName = searchParams.get('state') || 'YouTube Channel'
    const errorParam = searchParams.get('error')

    if (errorParam) {
      console.error('[YouTube Auth Callback] Access denied:', errorParam)
      return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent(errorParam)}`)
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent('No authorization code provided')}`)
    }

    // Exchange authorization code for tokens
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
      return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent('Token exchange failed: ' + errorMsg)}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    if (!access_token) {
      return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent('Missing access token')}`)
    }

    // Fetch the YouTube Channel profile info to get the unique Channel ID and title
    const channelProfileResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${access_token}` }
    })

    if (!channelProfileResponse.ok) {
      const profileError = await channelProfileResponse.text()
      console.error('[YouTube Auth Callback] Profile fetch failed:', profileError)
      return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent('Failed to fetch YouTube channel profile')}`)
    }

    const channelProfileData = await channelProfileResponse.json()
    const profile = channelProfileData.items?.[0]

    if (!profile) {
      return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent('No YouTube Live channels found under this Google account')}`)
    }

    const channelId = profile.id
    const channelTitle = profile.snippet?.title || 'YouTube Broadcast Channel'
    const expiryDate = new Date(Date.now() + (expires_in || 3600) * 1000)

    // Save or update in database
    // We check if a channel with this channelId already exists to avoid duplication
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
          // Only update refresh token if Google returned it (usually on the first prompt)
          ...(refresh_token ? { refreshToken: refresh_token } : {}),
          expiryDate,
          createdAt: new Date() // Reset the 7-day manual authorization countdown
        }
      })
      console.log(`[YouTube Auth Callback] Updated existing channel: ${channelTitle}`)
    } else {
      if (!refresh_token) {
        // If it's a new channel, we MUST have a refresh token!
        // We can prompt again if needed, but since we use prompt=consent in redirect, it should always be here.
        console.warn('[YouTube Auth Callback] Warning: No refresh token returned. Re-authorization might be needed later.')
      }

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
      console.log(`[YouTube Auth Callback] Successfully created new channel: ${channelTitle}`)
    }

    return NextResponse.redirect(`${origin}/?youtube_auth=success`)
  } catch (error: any) {
    console.error('[YouTube Auth Callback] Unexpected Error:', error)
    return NextResponse.redirect(`${origin}/?youtube_auth=error&msg=${encodeURIComponent(error.message || 'Unexpected auth callback error')}`)
  }
}
