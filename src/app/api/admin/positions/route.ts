import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { DEFAULT_POSITIONS, PositionId } from '@/lib/compensationRules';

interface FirestoreMember {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  positionId?: PositionId;
  role?: string;
  status?: string;
  personalFYC?: number;
  personalCOM?: number;
  parentMemberId?: string;
  unitId?: string;
  centerId?: string;
  regionId?: string;
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || (req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value);
    
    if (!token) {
      return NextResponse.json({ ok: false, error: 'ไม่พบโทเค็นการยืนยันตัวตน' }, { status: 401 });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status: 401 });
    }
    
    const roles = (decoded as any).roles || ((decoded as any).role ? [(decoded as any).role] : []);
    const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('auditor');
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
    }
    
    const db = getDb();
    const membersSnap = await db.collection('members').get();
    
    const members: FirestoreMember[] = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreMember));
    
    // Build tree position data
    const positionData = DEFAULT_POSITIONS.map(pos => {
      const membersInPos = members.filter(m => m.positionId === pos.id && m.status === 'active');
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
        members: membersInPos.map(m => ({
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
        }))
      };
    });
    
    // Tree structure - build hierarchy
    const rootMembers = members.filter(m => !m.parentMemberId && m.status === 'active');
    
    function buildTree(member: FirestoreMember, depth = 0): {
        id: string;
        memberCode: string | undefined;
        name: string | undefined;
        positionId: string | undefined;
        positionName: string;
        personalFYC: number;
        personalCOM: number;
        status: string | undefined;
        depth: number;
        children: any[];
      } {
        const children = members.filter(m => m.parentMemberId === member.id && m.status === 'active');
        return {
          id: member.id,
          memberCode: member.memberCode,
          name: member.displayName || member.name,
          positionId: member.positionId,
          positionName: DEFAULT_POSITIONS.find(p => p.id === member.positionId)?.name || member.positionId || 'agent',
          personalFYC: member.personalFYC || 0,
          personalCOM: member.personalCOM || 0,
          status: member.status,
          depth,
          children: children.map(c => buildTree(c, depth + 1))
        };
      }
    
    const treeStructure: {
    id: string;
    memberCode: string | undefined;
    name: string | undefined;
    positionId: string | undefined;
    positionName: string;
    personalFYC: number;
    personalCOM: number;
    status: string | undefined;
    depth: number;
    children: any[];
  }[] = rootMembers.map(m => buildTree(m));
    
    return NextResponse.json({ 
      ok: true, 
      positions: positionData,
      treeStructure,
      summary: {
        totalActiveMembers: members.filter(m => m.status === 'active').length,
        totalMembers: members.length,
        byPosition: positionData.map(p => ({
          positionId: p.positionId,
          positionName: p.positionName,
          count: p.memberCount,
          totalFYC: p.totalFYC,
          totalCOM: p.totalCOM
        }))
      }
    });
    
  } catch (error: any) {
    console.error('Admin positions API error:', error);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลตำแหน่ง' }, { status: 500 });
  }
}