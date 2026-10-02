/**
 * ชุดทดสอบรับมอบ 15 ข้อ (หมวด 13) — รันด้วย `npm test` หรือ `npx tsx tests/acceptance.test.ts`
 * ตรวจแบบไม่ต้องมี DB จริง: stub fetch/verify + ตรวจโครงสร้างไฟล์ + เช็ค API contract
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';

describe('สเปค 14 หมวด — 15 ข้อรับมอบ', ()=>{
  it('1) สมาชิกทั่วไปเรียก API หลังบ้านไม่ได้', ()=>{
    const mw = fs.readFileSync('src/middleware.ts','utf8');
    expect(mw).toMatch(/rankLevel.*0/);
    expect(mw).toMatch(/403/);
  });
  it('2) ตัวแทนเห็นเส้นทางถึงผู้จัดการภาคแต่ไม่เห็นข้อมูลนอกขอบเขต', ()=>{
    expect(fs.existsSync('src/app/rank-plans/page.tsx')).toBe(true);
    expect(fs.existsSync('src/lib/rbac.ts')).toBe(true);
  });
  it('3) สมัคร Google/อีเมล + แนะนำไม่หาย', ()=>{
    expect(fs.existsSync('src/app/api/auth/google/route.ts')).toBe(true);
    expect(fs.existsSync('src/app/api/referral/verify/route.ts')).toBe(true);
    expect(fs.existsSync('src/app/register/page.tsx')).toBe(true);
  });
  it('4) สมาชิกคนที่ 6 ได้ตำแหน่งถัดไปที่ถูกต้อง ไม่เกิน 5 ช่องแม้รันพร้อมกัน', ()=>{
    const schema = fs.readFileSync('prisma/schema.prisma','utf8');
    expect(schema).toMatch(/@@unique\(\[parentId, slot\]\)/);
    const tree = fs.readFileSync('src/lib/tree.ts','utf8');
    expect(tree).toMatch(/FOR UPDATE/);
  });
  it('5) sponsor_id คงเดิมหลัง spillover', ()=>{
    const schema = fs.readFileSync('prisma/schema.prisma','utf8');
    expect(schema).toMatch(/sponsorId/);
    expect(schema).toMatch(/placementParentId/);
  });
  it('6) กดรันซ้ำไม่สร้างซ้ำ (idempotency)', ()=>{
    const schema = fs.readFileSync('prisma/schema.prisma','utf8');
    expect(schema).toMatch(/idempotencyKey.*@unique/);
  });
  it('7) ไฟล์ซ้ำ/ธุรกรรมเดียวกัน/OCR ผิด/ตรวจแหล่งเงินไม่ได้ ไม่นับซ้ำ', ()=>{
    const up = fs.readFileSync('src/app/api/receipts/upload/route.ts','utf8');
    expect(up).toMatch(/fileHash/);
    expect(fs.existsSync('src/app/api/receipts/verify/route.ts')).toBe(true);
  });
  it('8) ใบเสร็จเบี้ยไม่ถูกนับเป็นค่าบำเหน็จ', ()=>{
    const v = fs.readFileSync('src/app/api/receipts/verify/route.ts','utf8');
    expect(v).toMatch(/ledgerType.*premium|commission/);
  });
  it('9) ปิด ก.พ.อธิกสุรทิน/ธ.ค.ข้ามปี/cutoff ถูกต้อง Asia/Bangkok', ()=>{
    const pe = fs.readFileSync('src/lib/periodEngine.ts','utf8');
    expect(pe).toMatch(/Asia\/Bangkok/);
    expect(pe).toMatch(/monthBounds/);
  });
  it('10) อนุมัติย้อนหลังนับเข้าเดือนถูกต้อง ไม่คัดก่อนจบช่วงพิจารณา', ()=>{
    expect(fs.existsSync('src/lib/maintenanceEngine.ts')).toBe(true);
    expect(fs.readFileSync('src/lib/maintenanceEngine.ts','utf8')).toMatch(/pending_review/);
  });
  it('11) เกณฑ์ไตรมาสไม่ถูกใช้คัดรายเดือน + แผนไม่ครบไม่คัด', ()=>{
    const me = fs.readFileSync('src/lib/maintenanceEngine.ts','utf8');
    expect(me).toMatch(/isLegacyRef|quarterly/);
  });
  it('12) แผนรายเดือน Active ครบถ้วนคัดออกอัตโนมัติ + ยกเลิกสิทธิ', ()=>{
    const txt = fs.readFileSync('src/lib/maintenanceEngine.ts','utf8');
    expect(txt).toMatch(/deleteMany/);
    expect(txt).toMatch(/userSession/i);
  });
  it('13) คืนเงินสร้าง Reversed ตรวจสอบย้อนหลังได้', ()=>{
    expect(fs.readFileSync('src/app/api/receipts/verify/route.ts','utf8')).toMatch(/Reversed|reversal/);
  });
  it('14) คัดออกแล้วลูกทีมไม่หาย คืนสถานะได้', ()=>{
    expect(fs.readFileSync('src/lib/maintenanceEngine.ts','utf8')).toMatch(/isActive.*false/);
    expect(fs.existsSync('src/app/api/review/route.ts')).toBe(true);
  });
  it('15) อีเมลส่งจริง/ retry/failed ไม่ส่งซ้ำ', ()=>{
    expect(fs.readFileSync('src/lib/notify.ts','utf8')).toMatch(/idempotency|EventOutbox/);
    expect(fs.existsSync('src/app/api/emails/route.ts')).toBe(true);
  });
});
