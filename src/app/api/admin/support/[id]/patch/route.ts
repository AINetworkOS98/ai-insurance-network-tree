import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { hasPermission } from '@/lib/rbac'

// PATCH /api/admin/support/[id] — แก้สถานะ + admin note
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = req.cookies.get('token')?.value || req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ ok: false, error: 'ไม่พบเซสชัน' }, { status: 401 })
    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ ok: false, error: 'เซสชันไม่ถูกต้อง' }, { status: 401 })

    const userPerms = payload.roles || []
    if (!hasPermission(userPerms, 'member.message.reply')) {
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { status, adminNote } = body

    if (status && !['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id } })
    if (!ticket) return NextResponse.json({ ok: false, error: 'ไม่พบ ticket' }, { status: 404 })

    const updateData: any = {}
    if (status) {
      updateData.status = status
      if (status === 'CLOSED') {
        updateData.closedAt = new Date()
      }
    }
    if (adminNote !== undefined) {
      updateData.adminNote = adminNote
    }

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ ok: true, ticket: updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'เซิร์ฟเวอร์มีปัญหา' }, { status: 500 })
  }
}
