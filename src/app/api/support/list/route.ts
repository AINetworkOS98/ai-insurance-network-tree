import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

// GET /api/support — ดู ticket ของตัวเอง
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!token) return NextResponse.json({ ok: false, error: 'ไม่พบเซสชัน' }, { status: 401 })
    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ ok: false, error: 'เซสชันไม่ถูกต้อง' }, { status: 401 })

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: payload.sub },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, phone: true, lineId: true,
        subject: true, message: true, status: true,
        createdAt: true, updatedAt: true, closedAt: true,
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json({ ok: true, tickets })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'เซิร์ฟเวอร์มีปัญหา' }, { status: 500 })
  }
}
