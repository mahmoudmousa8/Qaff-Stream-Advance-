import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { db } from '@/lib/db'

const CLIENT_ID = process.env.QAFF_CLIENT_ID || ''
const COOKIE_NAME = CLIENT_ID ? `qaff_auth_${CLIENT_ID}` : 'qaff_auth'
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-to-a-random-secure-string'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET — validate current session
export async function GET(request: NextRequest) {
    try {
        const cookie = request.cookies.get(COOKIE_NAME)
        if (!cookie?.value) {
            return NextResponse.json({ authenticated: false }, { status: 401 })
        }

        const parts = cookie.value.split('|')
        if (parts.length !== 2) {
            return NextResponse.json({ authenticated: false }, { status: 401 })
        }

        const [username, sessionHash] = parts

        // Fetch User from database
        const user = await db.user.findUnique({
            where: { username }
        })

        if (!user) {
            return NextResponse.json({ authenticated: false }, { status: 401 })
        }

        // Verify session hash
        const rawToken = `${user.username}:${user.password}:${user.role}:${SESSION_SECRET}`
        const expectedHash = createHash('sha256').update(rawToken).digest('hex')

        if (sessionHash !== expectedHash) {
            return NextResponse.json({ authenticated: false }, { status: 401 })
        }

        return NextResponse.json({
            authenticated: true,
            user: {
                username: user.username,
                role: user.role,
                slotsLimit: user.slotsLimit,
                renewalDate: user.renewalDate,
                securityKey: user.securityKey
            }
        })
    } catch (error) {
        console.error('Auth Check API error:', error)
        return NextResponse.json({ authenticated: false, error: 'Internal error' }, { status: 500 })
    }
}
