// lib/referral.ts — สเปคหมวด 4: รหัสแนะนำ auto unique + QR + กันวงวน

export function generateMemberCode(): string {
  // M-XXXXXX (6 หลัก ตัวเลข+ตัวอักษร)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'M-';
  for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'R-';
  for(let i=0;i<6;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

export function referralLink(baseUrl: string, code: string): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}

// เติมรหัสสมาชิก/รหัสแนะนำอัตโนมัติถ้ายังว่าง (เช่นบัญชี OAuth เก่าที่สมัครก่อนมีระบบรหัส)
// เรียกตอนโหลดโปรไฟล์ (/api/auth/me) เพื่อให้รหัส "รันอัตโนมัติ" ทุกครั้งที่เข้าใช้
export async function ensureMemberCodes(prisma: any, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { memberCode: true, referralCode: true },
  });
  if (!user) return null;

  const data: any = {};
  if (!user.memberCode) data.memberCode = generateMemberCode();
  if (!user.referralCode) data.referralCode = generateReferralCode();

  if (Object.keys(data).length) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await prisma.user.update({ where: { id: userId }, data });
        break;
      } catch (e: any) {
        if (String(e.code) === 'P2002' && attempt < 4) {
          if (data.memberCode) data.memberCode = generateMemberCode();
          if (data.referralCode) data.referralCode = generateReferralCode();
          continue;
        }
        throw e;
      }
    }
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: { memberCode: true, referralCode: true },
  });

  // เก็บรหัสแนะนำลงตาราง ReferralCode (ใช้ตอนสมัครด้วย ref=)
  if (updated?.referralCode) {
    const existing = await prisma.referralCode.findUnique({ where: { userId } }).catch(() => null);
    if (!existing) {
      await prisma.referralCode.create({ data: { userId, code: updated.referralCode } }).catch(() => null);
    }
  }
  return updated;
}

// ตรวจวงวน: เดิน sponsor chain ขึ้นไปว่า child จะกลายเป็นบรรพบุรุษของตนเองหรือไม่
export async function wouldCreateLoop(
  prisma: any,
  childId: string,
  newSponsorId: string,
): Promise<boolean> {
  if (childId === newSponsorId) return true;
  let cur: string | null = newSponsorId;
  const visited = new Set<string>([childId]);
  for (let i = 0; i < 50; i++) {
    if (!cur) break;
    if (visited.has(cur)) return true;
    visited.add(cur);
    const fetched: any = await prisma.user.findUnique({ where: { id: cur }, select: { sponsorId: true } });
    cur = fetched?.sponsorId || null;
  }
  return false;
}
