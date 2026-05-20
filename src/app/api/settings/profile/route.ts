import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// POST - Update current user's profile settings (password and security key)
export async function POST(request: NextRequest) {
    const user = await getAuthUser(request)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const { password, securityKey } = body

        if (password !== undefined && password.trim().length < 3) {
            return NextResponse.json({ error: 'يجب أن تكون كلمة المرور 3 أحرف على الأقل' }, { status: 400 })
        }

        const updateData: any = {}
        if (password !== undefined) updateData.password = password.trim()
        if (user.role === 'user' && securityKey !== undefined) updateData.securityKey = securityKey.trim()

        await db.user.update({
            where: { username: user.username },
            data: updateData
        })

        return NextResponse.json({
            success: true,
            message: 'تم تحديث البيانات بنجاح'
        })
    } catch (error) {
        console.error('Failed to update profile settings:', error)
        return NextResponse.json({ error: 'خطأ في تحديث البيانات' }, { status: 500 })
    }
}
