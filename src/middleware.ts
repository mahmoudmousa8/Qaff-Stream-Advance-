import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.QAFF_CLIENT_ID || ''
const COOKIE_NAME = CLIENT_ID ? `qaff_auth_${CLIENT_ID}` : 'qaff_auth'
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/check']

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Allow public paths
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
        return NextResponse.next()
    }

    // Fast fail if no cookie exists
    const auth = request.cookies.get(COOKIE_NAME)
    if (!auth?.value) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    // Basic structural verification of the cookie: must be "username|sha256Hash"
    // Deep verification will be done securely at the API and page level
    // using the getAuthUser helper which verifies the hash against the database.
    const parts = auth.value.split('|')
    if (parts.length === 2 && parts[0] && parts[1].length === 64) {
        return NextResponse.next()
    }

    // Invalid cookie structure — redirect to login
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
}

export const config = {
    // Exclude /api/upload from middleware — Edge Middleware has a hard 10MB body limit
    // which would truncate large file uploads before they reach the API route handler.
    matcher: ['/((?!_next/static|_next/image|favicon.ico|logo-icon.png|logo-white.png|api/upload).*)'],
}
