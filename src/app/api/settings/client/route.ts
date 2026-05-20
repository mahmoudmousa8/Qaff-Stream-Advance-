import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET - Retrieve Client settings (Admin only)
export async function GET(request: NextRequest) {
    const user = await getAuthUser(request)
    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const client = await db.user.findUnique({
            where: { username: 'user' }
        })

        if (!client) {
            return NextResponse.json({ error: 'Client user not found' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            client: {
                username: client.username,
                password: client.password, // Plain text view for Admin as requested
                slotsLimit: client.slotsLimit,
                renewalDate: client.renewalDate,
                securityKey: client.securityKey
            }
        })
    } catch (error) {
        console.error('Failed to get client settings:', error)
        return NextResponse.json({ error: 'خطأ في جلب بيانات العميل' }, { status: 500 })
    }
}

// POST - Update Client settings (Admin only)
export async function POST(request: NextRequest) {
    const user = await getAuthUser(request)
    if (!user || user.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { password, securityKey, slotsLimit, renewalDate } = body

        const updatedClient = await db.user.update({
            where: { username: 'user' },
            data: {
                password: password !== undefined ? password : undefined,
                securityKey: securityKey !== undefined ? securityKey : undefined,
                slotsLimit: slotsLimit !== undefined ? parseInt(slotsLimit, 10) : undefined,
                renewalDate: renewalDate !== undefined ? renewalDate : undefined,
            }
        })

        return NextResponse.json({
            success: true,
            message: 'تم تحديث بيانات العميل بنجاح',
            client: {
                username: updatedClient.username,
                slotsLimit: updatedClient.slotsLimit,
                renewalDate: updatedClient.renewalDate,
                securityKey: updatedClient.securityKey
            }
        })
    } catch (error) {
        console.error('Failed to update client settings:', error)
        return NextResponse.json({ error: 'خطأ في تحديث بيانات العميل' }, { status: 500 })
    }
}
