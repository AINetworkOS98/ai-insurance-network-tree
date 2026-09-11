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
