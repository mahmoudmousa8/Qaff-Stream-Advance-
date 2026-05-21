import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { db } from '@/lib/db'

const CLIENT_ID = process.env.QAFF_CLIENT_ID || ''
const COOKIE_NAME = CLIENT_ID ? `qaff_auth_${CLIENT_ID}` : 'qaff_auth'
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-to-a-random-secure-string'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const password = (body.password || '').trim()

        if (!password) {
            return NextResponse.json({ error: 'كلمة المرور مطلوبة' }, { status: 400 })
        }

        // Find the user that matches this exact password
        const user = await db.user.findFirst({
            where: { password }
        })

        if (!user) {
            // Anti-brute-force delay
            await new Promise(r => setTimeout(r, 2000))
            return NextResponse.json({ error: 'كلمة المرور غير صحيحة' }, { status: 401 })
        }

        // Generate session token: sha256(username + ":" + password + ":" + role + ":" + SESSION_SECRET)
        const rawToken = `${user.username}:${user.password}:${user.role}:${SESSION_SECRET}`
        const sessionHash = createHash('sha256').update(rawToken).digest('hex')

        // Cookie value stores the username and session hash
        const cookieValue = `${user.username}|${sessionHash}`

        const response = NextResponse.json({ success: true, role: user.role })
        response.cookies.set(COOKIE_NAME, cookieValue, {
            httpOnly: true,
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            sameSite: 'lax',
        })
        return response
    } catch (error) {
        console.error('Login API error:', error)
        return NextResponse.json({ error: 'خطأ في النظام' }, { status: 500 })
    }
}
