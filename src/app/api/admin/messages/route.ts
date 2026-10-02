import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isSystemAdmin } from '@/lib/admin';

// GET /api/admin/messages — รายการข้อความสมาชิก (admin เท่านั้น) + filter + search
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = payload.sub || payload.id;
    const adm = await isSystemAdmin(userId);
    if (!adm.ok) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const q = (sp.get('q') || '').trim();
    const status = sp.get('status'); // PENDING | REPLIED
    const where: any = {};
    if (status === 'PENDING' || status === 'REPLIED') where.status = status;
    if (q) {
      where.OR = [
        { message: { contains: q, mode: 'insensitive' } },
        { member: { displayName: { contains: q, mode: 'insensitive' } } },
        { member: { firstName: { contains: q, mode: 'insensitive' } } },
        { member: { lastName: { contains: q, mode: 'insensitive' } } },
        { member: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const list: any = await prisma.memberMessage.findMany({
      where,
      include: {
        member: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true, memberCode: true } },
        replies: { include: { replier: { select: { displayName: true, firstName: true, lastName: true, email: true } } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const pending = await prisma.memberMessage.count({ where: { status: 'PENDING' } }).catch(() => 0);

    return NextResponse.json({ ok: true, messages: list, pending });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
