import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { db } from './db'

const CLIENT_ID = process.env.QAFF_CLIENT_ID || ''
const COOKIE_NAME = CLIENT_ID ? `qaff_auth_${CLIENT_ID}` : 'qaff_auth'
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-to-a-random-secure-string'

export interface AuthUserInfo {
    id: number
    username: string
    role: string
    slotsLimit: number
    renewalDate: string
    securityKey: string
}

export async function getAuthUser(request: NextRequest): Promise<AuthUserInfo | null> {
    try {
        const cookie = request.cookies.get(COOKIE_NAME)
        if (!cookie?.value) return null

        const parts = cookie.value.split('|')
        if (parts.length !== 2) return null

        const [username, sessionHash] = parts

        const user = await db.user.findUnique({
            where: { username }
        })

        if (!user) return null

        // Verify session hash
        const rawToken = `${user.username}:${user.password}:${user.role}:${SESSION_SECRET}`
        const expectedHash = createHash('sha256').update(rawToken).digest('hex')

        if (sessionHash !== expectedHash) return null

        return {
            id: user.id,
            username: user.username,
            role: user.role,
            slotsLimit: user.slotsLimit,
            renewalDate: user.renewalDate,
            securityKey: user.securityKey
        }
    } catch (err) {
        console.error('getAuthUser helper error:', err)
        return null
    }
}
