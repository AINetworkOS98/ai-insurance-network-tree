export interface DemoMember {
  id: string;
  memberCode: string;
  name: string;
  rankName: string;
  status: 'active' | 'pending' | 'inactive' | 'vacant';
  avatarUrl?: string;
  memberId?: string;
  positionId?: string;
  role?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  addressLine?: string;
  zipCode?: string;
  lineId?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  referralCode?: string;
  branch?: string;
  email?: string;
  phone?: string;
  sponsorId?: string;
  joinDate?: string;
  personalFYC?: number;
  personalCOM?: number;
  displayName?: string;
}

// ข้อมูลสมาชิกจำลอง 11 คน (5 ตำแหน่งหลัก + 5 ลูก + 1 ตำแหน่งว่าง)
export const DEMO_MEMBERS: DemoMember[] = [
  { id:'m1', memberCode:'MEM-001', name:'สมชาย ใจดี', rankName:'ประธาน', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=man1' },
  { id:'m2', memberCode:'MEM-002', name:'สมหญิง รักสุข', rankName:'รองประธาน', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=woman1' },
  { id:'m3', memberCode:'MEM-003', name:'นางธนัญชัย ทองคำ', rankName:'เหรัญญิก', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=man2' },
  { id:'m4', memberCode:'MEM-004', name:'นางสาวพรทิพย์ วัฒนะ', rankName:'เลขานุการ', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=woman2' },
  { id:'m5', memberCode:'MEM-005', name:'นายเอกพล ใจกล้า', rankName:'สมาชิก', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=man3' },
  { id:'m6', memberCode:'MEM-006', name:'นางสาวจิตต์ภา ขจร', rankName:'สมาชิก', status:'pending', avatarUrl:'https://i.pravatar.cc/150?u=woman3' },
  { id:'m7', memberCode:'MEM-007', name:'นายกมล ใจดี', rankName:'สมาชิก', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=man4' },
  { id:'m8', memberCode:'MEM-008', name:'นางสาวน้ำฝน ใจสุข', rankName:'สมาชิก', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=woman4' },
  { id:'m9', memberCode:'MEM-009', name:'นายศุภวิทย์ ใจกล้า', rankName:'สมาชิก', status:'inactive', avatarUrl:'https://i.pravatar.cc/150?u=man5' },
  { id:'m10', memberCode:'MEM-010', name:'นางสาวรัตนา ใจดี', rankName:'สมาชิก', status:'active', avatarUrl:'https://i.pravatar.cc/150?u=woman5' },
  { id:'m11', memberCode:'MEM-011', name:'ตำแหน่งว่าง', rankName:'(ว่าง)', status:'vacant', avatarUrl:'' },
];
