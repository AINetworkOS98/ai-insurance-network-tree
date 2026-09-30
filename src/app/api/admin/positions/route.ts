import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';
import { DEFAULT_POSITIONS, PositionId } from '@/lib/compensationRules';

/**
 * GET /api/admin/positions — สรุปตำแหน่งในเครือข่าย + โครงสร้างผัง (admin เท่านั้น)
 *
 * แหล่งข้อมูลหลักคือ **Postgres (ตาราง User)** เพราะเป็นทะเบียนจริงที่ระบบล็อกอินใช้
 * (เดิมอ่านจาก Firestore collection `members` อย่างเดียว ทำให้ตัวเลข "มีผู้ดำรง" เป็น 0
 *  ทั้งที่ผู้ใช้จริงมีตำแหน่งอยู่ — Firestore เป็นเพียงข้อมูลเดิม/สำรอง)
 *
 * แปลงระดับสายงาน (User.rankLevel ตาม rankCatalog) → ตำแหน่งในผัง (DEFAULT_POSITIONS):
 *   1 = ตัวแทน(agent) · 2 = ผู้บริหารหน่วย(unit_manager) · 3 = ผู้บริหารศูนย์(center_manager) · 4 = ผู้บริหารภาค(region_manager)
 *
 * ข้อมูลเดิมใน Firestore (ถ้ามี) จะถูกนำมารวมด้วยโดยไม่นับซ้ำ (เทียบ memberCode) และ
 * ถ้า Firestore ใช้งานไม่ได้ (ไม่มี credential / ถูกปิด) ยังตอบข้อมูลจาก Postgres ได้ตามปกติ
 */

interface RegistryMember {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  positionId?: PositionId;
  status?: string;
  personalFYC?: number;
  personalCOM?: number;
  parentMemberId?: string;
  unitId?: string;
  centerId?: string;
  regionId?: string;
  source?: 'postgres' | 'firestore';
}

const RANK_TO_POSITION: Record<number, PositionId> = {
  1: 'agent' as PositionId,
  2: 'unit_manager' as PositionId,
  3: 'center_manager' as PositionId,
  4: 'region_manager' as PositionId,
};

const isActive = (status?: string) => String(status || '').toLowerCase() === 'active';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;

    if (!token) {
      return NextResponse.json({ ok: false, error: 'ไม่พบโทเค็นการยืนยันตัวตน' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status: 401 });
    }

    // กติกากลาง: roles ในโทเคน → อีเมล Admin → role ใน DB (โทเคนไม่มี roles จึงต้องมี fallback)
    const isAdmin = await isAdminFromPayload(decoded);
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
    }

    // ── 1) แหล่งหลัก: Postgres (ทะเบียนจริง)
    const users = await prisma.user.findMany({
      select: {
        id: true, memberCode: true, displayName: true, firstName: true, lastName: true,
        rankLevel: true, status: true, sponsorId: true, placementParentId: true,
      },
    });

    const pgMembers: RegistryMember[] = users.map((u) => ({
      id: u.id,
      memberCode: u.memberCode || undefined,
      displayName: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || undefined,
      positionId: RANK_TO_POSITION[Number(u.rankLevel)] as PositionId | undefined,
      status: u.status,
      personalFYC: 0,
      personalCOM: 0,
      parentMemberId: u.placementParentId || u.sponsorId || undefined,
      source: 'postgres',
    }));

    // ── 2) แหล่งเดิม: Firestore (ถ้ามี) — รวมแบบไม่นับซ้ำ
    let fsMembers: RegistryMember[] = [];
    try {
      const { getDb } = await import('@/lib/firebase-admin');
      const snap = await getDb().collection('members').get();
      fsMembers = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any), source: 'firestore' as const }));
    } catch {
      // ไม่มี credential / ปิด Firestore — ข้ามได้ ไม่ให้ทั้งคำขอพัง
    }

    const knownCodes = new Set(pgMembers.map((m) => m.memberCode).filter(Boolean) as string[]);
    const knownIds = new Set(pgMembers.map((m) => m.id));
    const members: RegistryMember[] = [...pgMembers, ...fsMembers.filter((m) => !(m.memberCode && knownCodes.has(m.memberCode)) && !knownIds.has(m.id))];

    // ── 3) สรุปตามตำแหน่ง
    const positionData = DEFAULT_POSITIONS.map((pos) => {
      const membersInPos = members.filter((m) => m.positionId === pos.id && isActive(m.status));
      const totalFYC = membersInPos.reduce((sum, m) => sum + (m.personalFYC || 0), 0);
      const totalCOM = membersInPos.reduce((sum, m) => sum + (m.personalCOM || 0), 0);

      return {
        positionId: pos.id,
        positionName: pos.name,
        positionNameEn: pos.nameEn,
        level: pos.level,
        color: pos.color,
        badgeBg: pos.badgeBg,
        badgeBorder: pos.badgeBorder,
        qualification: pos.qualification,
        memberCount: membersInPos.length,
        totalFYC,
        totalCOM,
        members: membersInPos.map((m) => ({
          id: m.id,
          memberCode: m.memberCode,
          name: m.displayName || m.name,
          personalFYC: m.personalFYC || 0,
          personalCOM: m.personalCOM || 0,
          status: m.status,
          parentMemberId: m.parentMemberId,
          unitId: m.unitId,
          centerId: m.centerId,
          regionId: m.regionId,
          source: m.source,
        })),
      };
    });

    // ── 4) โครงสร้างผัง
    const rootMembers = members.filter((m) => !m.parentMemberId && isActive(m.status));

    function buildTree(member: RegistryMember, depth = 0): any {
      const children = members.filter((m) => m.parentMemberId === member.id && isActive(m.status));
      return {
        id: member.id,
        memberCode: member.memberCode,
        name: member.displayName || member.name,
        positionId: member.positionId,
        positionName: DEFAULT_POSITIONS.find((p) => p.id === member.positionId)?.name || member.positionId || 'agent',
        personalFYC: member.personalFYC || 0,
        personalCOM: member.personalCOM || 0,
        status: member.status,
        depth,
        children: children.map((c) => buildTree(c, depth + 1)),
      };
    }

    const treeStructure = rootMembers.map((m) => buildTree(m));

    return NextResponse.json({
      ok: true,
      positions: positionData,
      treeStructure,
      source: { postgres: pgMembers.length, firestore: fsMembers.length },
      summary: {
        totalActiveMembers: members.filter((m) => isActive(m.status)).length,
        totalMembers: members.length,
        byPosition: positionData.map((p) => ({
          positionId: p.positionId,
          positionName: p.positionName,
          count: p.memberCount,
          totalFYC: p.totalFYC,
          totalCOM: p.totalCOM,
        })),
      },
    });
  } catch (error: any) {
    console.error('Admin positions API error:', error);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตำแหน่ง' }, { status: 500 });
  }
}
