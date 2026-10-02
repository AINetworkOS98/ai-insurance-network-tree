// หน้าแจ้งสิทธิ์กลาง — middleware rewrite มาที่นี่เมื่อ "ล็อกอินแล้วแต่ไม่มีสิทธิ์" เข้าหน้าสงวนสิทธิ์
// (กติกาอยู่ที่ lib/access-rules.ts → ADMIN_ONLY_PAGE_PREFIXES) — URL บนเบราว์เซอร์ยังเป็นหน้าต้นทางเดิม
import Link from 'next/link';
import { cookies } from 'next/headers';
import { verifyToken, type AuthPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rankNameSafe } from '@/lib/progressAccess';
import { ADMIN_ONLY_PAGE_PREFIXES } from '@/lib/access-rules';
import DeniedPath from './DeniedPath';

export const dynamic = 'force-dynamic';

export default async function NoAccessPage() {
  const jar = await cookies();
  const token = jar.get('token')?.value || jar.get('auth_token')?.value || '';
  const payload = token ? (verifyToken(token) as AuthPayload | null) : null;

  let email = payload?.email || '';
  let rankLevel = typeof payload?.rankLevel === 'number' ? payload.rankLevel : 0;
  if (payload?.sub) {
    const me = await prisma.user.findUnique({ where: { id: String(payload.sub) }, select: { email: true, rankLevel: true } }).catch(() => null);
    if (me?.email) email = me.email;
    if (typeof me?.rankLevel === 'number') rankLevel = me.rankLevel;
  }

  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-[#f3e8d3] bg-white p-8 text-center shadow-sm">
        <div className="mb-3 text-4xl">🔒</div>
        <h1 className="mb-2 text-lg font-bold text-navy">หน้านี้ไม่มีสิทธิ์เข้าถึง</h1>
        <p className="text-sm text-slate-500">
          บัญชีของคุณเข้าหน้านี้ไม่ได้ — เป็นหน้าสงวนสิทธิ์สำหรับผู้ดูแลระบบ
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-xs">
          <div className="flex justify-between gap-3 py-1">
            <span className="text-slate-500">บัญชีที่ใช้อยู่</span>
            <span className="break-all font-semibold text-slate-700">{email || 'ยังไม่ได้เข้าสู่ระบบ'}</span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-slate-500">ระดับตำแหน่ง</span>
            <span className="font-semibold text-slate-700">{rankNameSafe(rankLevel)} (level {rankLevel})</span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-slate-500">สิทธิ์ที่ต้องมี</span>
            <span className="font-semibold text-slate-700">ผู้ดูแลระบบ (admin)</span>
          </div>
        </div>

        <DeniedPath />

        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-full bg-[#c8a84e] px-4 py-2 text-sm font-semibold text-[#475569]">กลับหน้าแรก</Link>
          <Link href="/dashboard" className="rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700">แดชบอร์ดของฉัน</Link>
          <Link href="/contact" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600">ติดต่อผู้ดูแลระบบ</Link>
        </div>

        <details className="mt-6 text-left">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">หน้าสงวนสิทธิ์ทั้งหมด ({ADMIN_ONLY_PAGE_PREFIXES.length})</summary>
          <ul className="mt-2 grid gap-1">
            {ADMIN_ONLY_PAGE_PREFIXES.map((p) => (
              <li key={p} className="font-mono text-[11px] text-slate-500">• {p}</li>
            ))}
          </ul>
        </details>

        <p className="mt-4 text-[11px] text-slate-400">
          หากเพิ่งได้รับสิทธิ์ผู้ดูแล ให้ออกจากระบบแล้วเข้าสู่ระบบใหม่ (สิทธิ์จะอัปเดตตามข้อมูลล่าสุด)
        </p>
      </div>
    </div>
  );
}
