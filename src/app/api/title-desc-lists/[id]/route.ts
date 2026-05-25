import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id
    const body = await request.json()
    const { name, items } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 })
    }

    if (!items || typeof items !== 'string') {
      return NextResponse.json({ success: false, error: 'Items payload (JSON string) is required' }, { status: 400 })
    }

    // Check if another list has the same name
    const existing = await db.titleDescList.findUnique({ where: { name } })
    if (existing && existing.id !== id) {
      return NextResponse.json({ success: false, error: 'Another list with this name already exists' }, { status: 400 })
    }

    const updatedList = await db.titleDescList.update({
      where: { id },
      data: {
        name,
        items
      }
    })

    return NextResponse.json({ success: true, data: updatedList })
  } catch (error: any) {
    console.error('Error updating title desc list:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id

    await db.titleDescList.delete({
      where: { id }
    })

    // Also nullify references in StreamSlot
    await db.streamSlot.updateMany({
      where: { titleDescListId: id },
      data: { titleDescListId: null }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting title desc list:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
