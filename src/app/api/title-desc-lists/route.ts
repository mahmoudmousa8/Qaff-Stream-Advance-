import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const lists = await db.titleDescList.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, data: lists })
  } catch (error: any) {
    console.error('Error fetching title desc lists:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, items } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }

    if (!items || typeof items !== 'string') {
      return NextResponse.json({ success: false, error: 'Items payload (JSON string) is required' }, { status: 400 })
    }

    // Check if list with name already exists
    const existing = await db.titleDescList.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json({ success: false, error: 'A list with this name already exists' }, { status: 400 })
    }

    const newList = await db.titleDescList.create({
      data: {
        name,
        items
      }
    })

    return NextResponse.json({ success: true, data: newList })
  } catch (error: any) {
    console.error('Error creating title desc list:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
