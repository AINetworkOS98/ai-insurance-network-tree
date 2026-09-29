import { cookies } from 'next/headers';
import { verifyToken, type AuthPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isAdminEmail, isAdminRole } from '@/lib/access-rules';
import { canViewProgress } from '@/lib/progressAccess';
import ProgressView from './ProgressView';
import ProgressLocked from './ProgressLocked';

// หน้านี้ต้องอ่าน cookie + DB ทุกครั้ง (ห้าม cache — ไม่งั้นสิทธิ์ค้างเก่า)
export const dynamic = 'force-dynamic';

/**
 * /progress — โมเดลธุรกิจ + ตัวเลขระดับบริหาร
 * กั้นสิทธิ์ที่ฝั่งเซิร์ฟเวอร์: เฉพาะ "หัวหน้าหน่วย" (level ≥ 2) ขึ้นไป หรือ Admin
 * - อ่าน rank สดจาก DB (token อาจเก่าหลังผู้ดูแลปรับตำแหน่ง) แล้วค่อยใช้ค่าใน token เป็น fallback
 * - ผู้ที่ไม่ผ่าน จะไม่ได้รับเนื้อหาหน้านี้เลย (ไม่ใช่แค่ซ่อนด้วย CSS/JS)
 */
export default async function ProgressPage() {
  const jar = await cookies();
  const token = jar.get('token')?.value || jar.get('auth_token')?.value || '';
  const payload = token ? (verifyToken(token) as AuthPayload | null) : null;

  const userId = payload?.sub;
  let rankLevel = typeof payload?.rankLevel === 'number' ? payload.rankLevel : 0;

  if (userId) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { rankLevel: true } }).catch(() => null);
    if (me && typeof me.rankLevel === 'number') rankLevel = me.rankLevel;
  }

  const isAdmin = isAdminEmail(payload?.email) || isAdminRole(payload?.roles);

  if (canViewProgress(rankLevel, isAdmin)) return <ProgressView />;
  return <ProgressLocked rankLevel={rankLevel < 0 ? 0 : rankLevel} />;
}
