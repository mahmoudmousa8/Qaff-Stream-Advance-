import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID || ''

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name') || 'YouTube Channel'
    
    // Extract the origin dynamically to support both localhost and production VPS IP/domain
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'http'
    const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : request.nextUrl.origin
    
    const redirectUri = `${origin}/api/auth/youtube/callback`

    const scopes = [
      'https://www.googleapis.com/auth/youtube.force-ssl',
      'https://www.googleapis.com/auth/youtube'
    ]

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    googleAuthUrl.searchParams.set('client_id', CLIENT_ID)
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
    googleAuthUrl.searchParams.set('response_type', 'code')
    googleAuthUrl.searchParams.set('scope', scopes.join(' '))
    googleAuthUrl.searchParams.set('access_type', 'offline')
    googleAuthUrl.searchParams.set('prompt', 'consent')
    googleAuthUrl.searchParams.set('state', name) // Pass user's custom channel name in state

    return NextResponse.redirect(googleAuthUrl.toString())
  } catch (error: any) {
    console.error('[YouTube Auth Redirect] Error:', error)
    return NextResponse.json({ error: 'Failed to initiate Google OAuth redirect: ' + error.message }, { status: 500 })
  }
}
