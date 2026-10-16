import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  TL_SMART_SPONSOR_CODE,
  TL_SMART_CHANNEL,
  TL_SMART_EVENT,
  TL_SMART_ACTIVITY,
  tlSmartEventId,
  tlSmartConfig,
  buildTlSmartApplication,
  sendToTlSmart,
  issueAgentCode,
} from '@/lib/tlSmart';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recruit/apply — ใบสมัคร "รับสมัครตัวแทน" จากลิงก์สาธารณะ /recruit
// (ไม่ต้องล็อกอิน · consent-gated ตาม PDPA · กันสแปมด้วย rate limit)
//
// ที่มา: คัดลอกโครงข้อมูลจาก AgentRecruitmentPortal (OS app) 4 ขั้นตอน
//   ① ข้อมูลส่วนตัว ② การศึกษา/ประวัติงาน ③ ใบอนุญาตตัวแทนประกันชีวิต (คปภ.)
//   ④ ผู้แนะนำ (Sponsor) + เป้าหมายเส้นทางอาชีพ → สิ้นสุดที่การสมัครสมาชิก
// ปลายทางข้อมูล: Prospect (คิวผู้มุ่งหวัง) + ProspectActivity (รายละเอียดครบ JSON)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RL = new Map<string, number[]>();
function allow(key: string, max = 8, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const arr = (RL.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { RL.set(key, arr); return false; }
  arr.push(now);
  RL.set(key, arr);
  if (RL.size > 5000) RL.clear();
  return true;
}
function s(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function digits(v: unknown, max = 20): string | null {
  const t = typeof v === 'string' ? v.replace(/\D/g, '') : '';
  return t ? t.slice(0, max) : null;
}
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function newProspectCode(): string {
  return 'P-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/recruit/apply',
    methods: ['POST'],
    requires: { consentPDPA: true, contact: 'เบอร์โทร หรือ อีเมล อย่างน้อย 1 อย่าง', name: 'firstName + lastName' },
    steps: ['ข้อมูลส่วนตัว', 'การศึกษาและประวัติการทำงาน', 'สถานะใบอนุญาต (คปภ.)', 'ผู้แนะนำและเป้าหมายอาชีพ'],
    tlSmart: {
      sponsorCode: TL_SMART_SPONSOR_CODE,
      channel: TL_SMART_CHANNEL,
      eventType: TL_SMART_EVENT,
      worker: '/api/cron/tl-smart-sync',
      status: '/api/tl-smart/status',
    },
  });
}

export async function POST(req: NextRequest) {
  const b: any = await req.json().catch(() => ({}));
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (!allow(ip)) {
    return NextResponse.json({ ok: false, error: 'ส่งข้อมูลบ่อยเกินไป กรุณาลองใหม่ในอีกสักครู่' }, { status: 429 });
  }

  const firstName = s(b.firstName, 80);
  const lastName = s(b.lastName, 80);
  const phone = digits(b.phone, 15);
  const email = s(b.email, 200)?.toLowerCase() || null;
  const consent = (b?.consent && typeof b.consent === 'object') ? b.consent : { pdpa: b.pdpaConsent === true };

  if (!firstName || !lastName) {
    return NextResponse.json({ ok: false, error: 'กรุณากรอกชื่อและนามสกุล' }, { status: 400 });
  }
  if (!phone && !email) {
    return NextResponse.json({ ok: false, error: 'กรุณากรอกเบอร์โทรหรืออีเมลอย่างน้อย 1 อย่าง' }, { status: 400 });
  }
  if (consent.pdpa !== true) {
    return NextResponse.json({ ok: false, error: 'ต้องให้ความยินยอม (PDPA) ก่อนส่งใบสมัคร' }, { status: 400 });
  }

  const province = s(b.province, 120);
  // รหัสผู้แนะนำ: ใช้รหัสที่แนบมากับลิงก์ (?ref=) ถ้าไม่มี → รหัสตัวแทนเจ้าของสายงาน 01759064
  const refCode = (s(b.sponsorCode || b.referralCode, 40) || '').toUpperCase() || TL_SMART_SPONSOR_CODE;
  const occupation = s(b.currentOccupation, 120);

  // ── หา sponsor (รหัสแนะนำ/รหัสสมาชิก ของสมาชิกเจ้าของลิงก์) ──────────────────
  let sponsorUserId: string | null = null;
  if (refCode) {
    try {
      const u = await prisma.user.findFirst({
        where: { OR: [{ referralCode: refCode }, { memberCode: refCode }] },
        select: { id: true },
      });
      sponsorUserId = u?.id ?? null;
    } catch { /* ไม่เจอผู้แนะนำ = ยังบันทึกได้ */ }
  }

  // ── ข้อมูลรายละเอียดทั้ง 4 ขั้นตอน (เก็บครบเป็น JSON) ────────────────────────
  const details = {
    prefix: s(b.prefix, 20),
    nickname: s(b.nickname, 80),
    nationalId: digits(b.nationalId, 13),
    birthDate: s(b.birthDate, 20),
    gender: s(b.gender, 20),
    lineId: s(b.lineId, 80),
    currentAddress: s(b.currentAddress, 300),
    district: s(b.district, 120),
    province,
    postalCode: digits(b.postalCode, 10),
    // ② การศึกษา/งาน
    educationLevel: s(b.educationLevel, 40),
    major: s(b.major, 120),
    university: s(b.university, 160),
    currentOccupation: occupation,
    experienceLevel: s(b.experienceLevel, 40),
    insuranceExperienceYears: num(b.insuranceExperienceYears),
    previousCompany: s(b.previousCompany, 160),
    // ③ ใบอนุญาต
    licenseStatus: s(b.licenseStatus, 40),
    licenseNumber: s(b.licenseNumber, 40),
    licenseExpiryDate: s(b.licenseExpiryDate, 20),
    examDate: s(b.examDate, 20),
    hasICLicense: b.hasICLicense === true,
    hasGeneralInsuranceLicense: b.hasGeneralInsuranceLicense === true,
    // ④ ผู้แนะนำ + เป้าหมาย
    sponsorCode: refCode,
    sponsorAgentCode: /^\d{8}$/.test(refCode || '') ? refCode : TL_SMART_SPONSOR_CODE,
    sponsorResolved: Boolean(sponsorUserId),
    targetPositionPreference: s(b.targetPositionPreference, 40),
    targetMonthlyIncomeGoal: num(b.targetMonthlyIncomeGoal),
    targetYearlyFYCGoal: num(b.targetYearlyFYCGoal),
    expectedStartDate: s(b.expectedStartDate, 20),
    recruitmentChannel: s(b.recruitmentChannel, 40),
    motivationNote: s(b.motivationNote, 1200),
    consentMarketing: consent.marketing === true,
    consentVersion: s(consent.version, 20) || '1.0',
    submittedFrom: 'recruit_link',
    submittedAt: new Date().toISOString(),
  };

  const interest = [
    ...(Array.isArray(b.interests) ? b.interests.slice(0, 5).map((x: any) => String(x).slice(0, 40)) : []),
    details.targetPositionPreference ? `ตำแหน่งเป้าหมาย: ${details.targetPositionPreference}` : null,
  ].filter(Boolean).join(', ').slice(0, 400) || 'สมัครเป็นตัวแทน';

  const core: any = {
    firstName: firstName!,
    lastName: lastName!,
    nickname: details.nickname ?? undefined,
    phone: phone ?? undefined,
    email: email ?? undefined,
    province: province ?? undefined,
    occupation: occupation ?? undefined,
    referralCode: refCode ?? undefined,
    sponsorId: sponsorUserId ?? undefined,
    interest,
    consentStatus: 'granted',
  };

  // ── กันซ้ำ: เบอร์/อีเมลเดิม → อัปเดตใบเดิม, ใหม่ → สร้างผู้มุ่งหวัง ────────────
  let existing: any = null;
  try {
    const or: any[] = [];
    if (phone) or.push({ phone });
    if (email) or.push({ email });
    if (or.length) existing = await prisma.prospect.findFirst({ where: { OR: or } });
  } catch { /* ไม่มีคิวเดิม = สร้างใหม่ */ }

  let saved: any = null;
  try {
    if (existing) {
      saved = await prisma.prospect.update({ where: { id: existing.id }, data: { ...core, leadScore: Math.max(existing.leadScore || 0, 30) } });
    } else {
      for (let i = 0; i < 3 && !saved; i++) {
        try {
          saved = await prisma.prospect.create({ data: { prospectId: newProspectCode(), status: 'NEW', leadScore: 30, ...core } });
        } catch (e: any) {
          if (String(e?.code) === 'P2002' && i < 2) continue;
          throw e;
        }
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'บันทึกใบสมัครไม่สำเร็จ: ' + (e?.message || 'unknown') }, { status: 500 });
  }
  if (!saved) {
    return NextResponse.json({ ok: false, error: 'บันทึกใบสมัครไม่สำเร็จ (รหัสซ้ำ) กรุณาลองใหม่' }, { status: 500 });
  }

  // ── แนบรายละเอียดทั้งใบสมัครไว้กับผู้มุ่งหวัง (ประวัติกิจกรรม) ────────────────
  await prisma.prospectActivity
    .create({ data: { prospectId: saved.id, type: 'recruit_application', content: JSON.stringify(details).slice(0, 8000) } })
    .catch(() => null);

  // ── รันเลขออกโค้ดตัวแทนใหม่ + ส่งข้อมูลทั้งหมดไป app TL SMART ──────────────────
  let agentCodeIssued: string | null = null;
  let tlSmart: Record<string, any> = { queued: false, sent: false, configured: false };
  try {
    agentCodeIssued = await issueAgentCode(prisma, saved.id);

    const application = buildTlSmartApplication({
      prospectId: saved.prospectId,
      firstName: firstName!,
      lastName: lastName!,
      phone,
      email,
      sponsorCode: refCode,
      agentCodeIssued,
      details: { ...details, tlSmartAgentCodeIssued: agentCodeIssued },
    });

    // สำเนา payload สำหรับ TL SMART (audit + คัดลอกส่งมือได้)
    await prisma.prospectActivity
      .create({ data: { prospectId: saved.id, type: TL_SMART_ACTIVITY, content: JSON.stringify(application).slice(0, 8000) } })
      .catch(() => null);

    const eventId = tlSmartEventId(saved.prospectId);
    await prisma.eventOutbox
      .create({
        data: {
          eventId,
          eventType: TL_SMART_EVENT,
          channel: TL_SMART_CHANNEL,
          recipientId: sponsorUserId ?? undefined,
          payload: application as any,
          status: 'pending',
        },
      })
      .catch(() => null);

    const cfg = tlSmartConfig();
    if (cfg.configured) {
      const sent = await sendToTlSmart(application);
      await prisma.eventOutbox
        .update({
          where: { eventId },
          data: { status: sent.ok ? 'sent' : 'pending', attempts: { increment: 1 }, sentAt: sent.ok ? new Date() : null },
        })
        .catch(() => null);
      tlSmart = { queued: true, sent: sent.ok, configured: true, mode: sent.mode ?? null, status: sent.status ?? null, error: sent.ok ? null : (sent.error ?? `ปลายทางตอบ ${sent.status}`) };
    } else {
      tlSmart = { queued: true, sent: false, configured: false, error: 'ยังไม่ได้ตั้งค่า TLSMART_WEBHOOK_URL หรือ TLSMART_API_URL — เก็บคิวไว้แล้ว จะส่งทันทีเมื่อตั้งค่า' };
    }
  } catch (e: any) {
    tlSmart = { queued: false, sent: false, configured: false, error: String(e?.message || e).slice(0, 200) };
  }

  // ── แจ้งเตือนทันที: LINE + กระดิ่งในแอป (ไม่บล็อกการบันทึกใบสมัครถ้าส่งไม่สำเร็จ) ──
  let notify: Record<string, any> = { line: { configured: false, sent: false }, inApp: { notified: 0 } };
  try {
    const { notifyNewRecruitApplication } = await import('@/lib/recruitNotify');
    notify = await notifyNewRecruitApplication({
      prospect: { id: saved.id, prospectId: saved.prospectId, firstName, lastName },
      phone: saved.phone,
      email: saved.email,
      sponsorCode: refCode,
      queueRef: agentCodeIssued,
      province: saved.province,
      occupation: saved.occupation,
      isUpdate: Boolean(existing),
    });
  } catch (e: any) {
    notify = { line: { configured: false, sent: false, error: String(e?.message || e).slice(0, 200) }, inApp: { notified: 0 } };
  }

  return NextResponse.json({
    ok: true,
    prospectId: saved.prospectId,
    id: saved.id,
    status: saved.status,
    updated: Boolean(existing),
    /** เลขรันคิวภายในของเรา (ใช้ติดตามระหว่างรอ) — ไม่ใช่เลขตัวแทนจริง */
    queueRef: agentCodeIssued,
    /** เลขตัวแทนจริง: ออกโดยระบบ TL SMART เท่านั้น (ยังไม่มี = null) */
    agentCodeFromTlSmart: null,
    agentCodeSource: 'tl_smart',
    agentCodeNote: 'เลขตัวแทนจริงออกโดยระบบ TL SMART — กรอกข้อมูลเข้า TL SMART แล้วระบบจะคืนเลขมาให้ (ดูคิวที่ /api/tl-smart/queue)',
    tlSmart,
    notify,
    message: tlSmart.sent
      ? 'ส่งใบสมัครเรียบร้อย — ส่งข้อมูลเข้า TL SMART แล้ว รอเลขตัวแทนจากระบบบริษัท'
      : 'ส่งใบสมัครเรียบร้อย — เข้าคิวส่งเข้า TL SMART แล้ว (ยังไม่เชื่อมต่อปลายทาง) ทีมงานจะติดต่อกลับตามช่องทางที่ให้ไว้',
  });
}
