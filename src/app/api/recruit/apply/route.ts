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
  nextAgentCode,
} from '@/lib/tlSmart';
import { evaluateEligibility, thaiIdValid, oicEducationLevel, DISQUALIFICATIONS } from '@/lib/agentLicense';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recruit/apply — ใบสมัคร "รับสมัครตัวแทน" จากลิงก์สาธารณะ /recruit
// (ไม่ต้องล็อกอิน · consent-gated ตาม PDPA · กันสแปมด้วย rate limit)
//
// ★ ลำดับที่ถูกต้อง (แก้ 2026-10): ตรวจคุณสมบัติก่อน → จึงบันทึกและออกโค้ดตัวแทน
//   เดิมระบบบันทึกทุกคนและออกรหัสให้ทุกคน ทั้งที่ยังไม่ครบคุณสมบัติตามแบบ ตช.1
//   (อายุ < 20 · วุฒิต่ำกว่า ม.6 · เป็นนายหน้า · ติดลักษณะต้องห้าม · เลขบัตรปลอม)
//   ⇒ ตอนนี้ถ้าไม่ผ่าน จะตอบ 422 พร้อมรายการที่ติด และ "ไม่เขียนลงฐานข้อมูล/ไม่ออกโค้ด"
//
// ฟิลด์ครบตาม "คำขอรับใบอนุญาตเป็นตัวแทนประกันชีวิต" (แบบ ตช.1 ของ คปภ.)
//   ① ข้อมูลส่วนตัว ② ที่อยู่/การติดต่อ ③ การศึกษา/การทำงาน
//   ④ ใบอนุญาต + สถานะอบรม/สอบ ⑤ คุณสมบัติ (8.1/8.2) + เอกสาร + ผู้แนะนำ
// ปลายทางข้อมูล: Prospect + ProspectActivity (JSON ครบ) + EventOutbox(channel='tl_smart')
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
function bool(v: unknown): boolean {
  return v === true || v === 'true';
}
function newProspectCode(): string {
  return 'P-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/recruit/apply',
    methods: ['POST'],
    requires: {
      consentPDPA: true,
      consentLicenseFiling: true,
      nationalId: '13 หลัก + checksum',
      age: '>= 20 ปีบริบูรณ์',
      education: '>= ม.6 / ปวช.',
      disqualificationDeclaration: 'ยืนยันไม่มีลักษณะต้องห้าม ข้อ 8.2',
    },
    steps: [
      'ข้อมูลส่วนตัว',
      'ที่อยู่และการติดต่อ',
      'การศึกษาและประวัติการทำงาน',
      'ใบอนุญาตและสถานะการอบรม/สอบ',
      'คุณสมบัติ เอกสาร และผู้แนะนำ',
    ],
    eligibilityRules: {
      minAge: 20,
      minEducation: 'ม.6 / ปวช.',
      disqualifications: DISQUALIFICATIONS.map((d) => d.label),
    },
    dryRun: 'ส่ง dryRun:true เพื่อตรวจคุณสมบัติ + ดูโค้ดที่จะออก โดยไม่บันทึกและไม่ออกโค้ดจริง',
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

  const dryRun = bool(b.dryRun);
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
  if (consent.licenseFiling !== true) {
    return NextResponse.json({
      ok: false,
      error: 'ต้องยินยอมให้บริษัทนำข้อมูลไปยื่นคำขอใบอนุญาตต่อนายทะเบียน (คปภ.) ก่อนส่งใบสมัคร',
    }, { status: 400 });
  }

  const province = s(b.province, 120);
  const occupation = s(b.currentOccupation, 120);
  const refCode = (s(b.sponsorCode || b.referralCode, 40) || '').toUpperCase() || TL_SMART_SPONSOR_CODE;
  const nationalId = digits(b.nationalId, 13);
  const educationDetail = s(b.educationDetail, 40) || '';

  // ── รายละเอียดทั้ง 5 ขั้นตอน (เก็บครบเป็น JSON) ──────────────────────────────
  const documents = (b?.documents && typeof b.documents === 'object') ? b.documents : {};
  const details = {
    // ① ข้อมูลส่วนตัว
    prefix: s(b.prefix, 20),
    firstNameEn: s(b.firstNameEn, 80),
    lastNameEn: s(b.lastNameEn, 80),
    previousName: s(b.previousName, 160),
    nickname: s(b.nickname, 80),
    nationalId,
    nationalIdValid: Boolean(nationalId && thaiIdValid(nationalId)),
    birthDate: s(b.birthDate, 20),
    gender: s(b.gender, 20),
    nationality: s(b.nationality, 60),
    maritalStatus: s(b.maritalStatus, 20),
    // ② ที่อยู่และการติดต่อ
    houseAddress: s(b.houseAddress, 300),
    houseMoo: s(b.houseMoo, 10),
    houseSoi: s(b.houseSoi, 120),
    houseStreet: s(b.houseStreet, 160),
    subDistrict: s(b.subDistrict, 120),
    district: s(b.district, 120),
    province,
    postalCode: digits(b.postalCode, 10),
    contactSameAsHouse: b.contactSameAsHouse !== false,
    contactAddress: s(b.contactAddress, 300),
    contactDistrict: s(b.contactDistrict, 120),
    contactProvince: s(b.contactProvince, 120),
    contactPostalCode: digits(b.contactPostalCode, 10),
    currentAddress: s(b.currentAddress, 300),
    phone,
    phoneHome: digits(b.phoneHome, 15),
    lineId: s(b.lineId, 80),
    // ③ การศึกษา/งาน
    educationDetail,
    educationLevel: s(b.educationLevel, 40) || oicEducationLevel(educationDetail) || 'below_bachelor',
    major: s(b.major, 120),
    university: s(b.university, 160),
    currentOccupation: occupation,
    employerName: s(b.employerName, 160),
    monthlyIncome: num(b.monthlyIncome),
    experienceLevel: s(b.experienceLevel, 40),
    insuranceExperienceYears: num(b.insuranceExperienceYears),
    previousCompany: s(b.previousCompany, 160),
    // ④ ใบอนุญาต / การอบรม
    purpose: s(b.purpose, 40),
    licenseKind: s(b.licenseKind, 40),
    existingLicense: s(b.existingLicense, 40),
    existingCompany: s(b.existingCompany, 160),
    existingLicenseNo: s(b.existingLicenseNo, 60),
    existingLicenseExpiry: s(b.existingLicenseExpiry, 20),
    hasReleaseLetter: bool(b.hasReleaseLetter),
    trainingStatus: s(b.trainingStatus, 40),
    examDate: s(b.examDate, 20),
    licenseNumber: s(b.licenseNumber, 60),
    licenseExpiryDate: s(b.licenseExpiryDate, 20),
    // ⑤ คุณสมบัติ (8.1) / ต้องห้าม (8.2) / เอกสาร
    isAdult: b.isAdult !== false,
    hasThaiResidence: b.hasThaiResidence !== false,
    insuranceEducationReady: bool(b.insuranceEducationReady),
    declaredNoDisqualification: bool(b.declaredNoDisqualification),
    disqualifications: DISQUALIFICATIONS.reduce((acc: Record<string, boolean>, d) => {
      acc[d.key] = bool(b[d.key]);
      return acc;
    }, {}),
    documents,
    documentsConfirmed: Object.keys(documents).filter((k) => documents[k] === true),
    // ⑥ ผู้แนะนำ + เป้าหมาย
    sponsorCode: refCode,
    sponsorAgentCode: /^\d{8}$/.test(refCode || '') ? refCode : TL_SMART_SPONSOR_CODE,
    targetPositionPreference: s(b.targetPositionPreference, 40),
    targetMonthlyIncomeGoal: num(b.targetMonthlyIncomeGoal),
    targetYearlyFYCGoal: num(b.targetYearlyFYCGoal),
    expectedStartDate: s(b.expectedStartDate, 20),
    recruitmentChannel: s(b.recruitmentChannel, 40),
    motivationNote: s(b.motivationNote, 1200),
    consentMarketing: consent.marketing === true,
    consentLicenseFiling: true,
    consentVersion: s(consent.version, 20) || '2.0',
    submittedFrom: 'recruit_link',
    submittedAt: new Date().toISOString(),
  };

  // ── ★ ตรวจคุณสมบัติ (แบบ ตช.1): ไม่ผ่าน = ไม่บันทึก ไม่ออกโค้ด ────────────────
  const eligibility = evaluateEligibility({
    nationalId,
    birthDate: details.birthDate,
    educationDetail,
    isAdult: details.isAdult,
    hasThaiResidence: details.hasThaiResidence,
    firstNameEn: details.firstNameEn,
    lastNameEn: details.lastNameEn,
    phone,
    houseAddress: details.houseAddress,
    purpose: details.purpose,
    existingLicense: details.existingLicense,
    existingCompany: details.existingCompany,
    hasReleaseLetter: details.hasReleaseLetter,
    trainingStatus: details.trainingStatus,
    ...DISQUALIFICATIONS.reduce((acc: Record<string, boolean>, d) => {
      acc[d.key] = details.disqualifications[d.key];
      return acc;
    }, {}),
  });

  if (!eligibility.eligible) {
    return NextResponse.json({
      ok: false,
      error: 'ยังไม่ผ่านคุณสมบัติการขอรับใบอนุญาตตัวแทนประกันชีวิต — ระบบยังไม่ออกโค้ดตัวแทนให้',
      blockers: eligibility.blockers,
      warnings: eligibility.warnings,
      eligibility,
      saved: false,
      agentCodeIssued: null,
    }, { status: 422 });
  }

  // ── dryRun: ตรวจ + ดูโค้ดที่จะออก โดยไม่เขียนอะไรลงฐานข้อมูล ──────────────────
  if (dryRun) {
    let preview: string | null = null;
    try { preview = await nextAgentCode(prisma); } catch { preview = null; }
    return NextResponse.json({
      ok: true,
      dryRun: true,
      saved: false,
      eligibility,
      agentCodeIssued: preview,
      wouldIssueAgentCode: preview,
      nextSteps: eligibility.nextSteps,
      requiredDocuments: eligibility.requiredDocuments,
      message: 'ตรวจคุณสมบัติผ่าน (dryRun) — ยังไม่บันทึกและยังไม่ออกโค้ดจริง',
    });
  }

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

  const interest = [
    ...(Array.isArray(b.interests) ? b.interests.slice(0, 5).map((x: any) => String(x).slice(0, 40)) : []),
    details.targetPositionPreference ? `ตำแหน่งเป้าหมาย: ${details.targetPositionPreference}` : null,
    details.educationDetail ? `วุฒิ: ${details.educationDetail}` : null,
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

  // ── แนบรายละเอียดทั้งใบสมัคร + ผลตรวจคุณสมบัติ (ประวัติกิจกรรม) ───────────────
  await prisma.prospectActivity
    .create({ data: { prospectId: saved.id, type: 'recruit_application', content: JSON.stringify(details).slice(0, 8000) } })
    .catch(() => null);
  await prisma.prospectActivity
    .create({
      data: {
        prospectId: saved.id,
        type: 'agent_eligibility',
        content: JSON.stringify({
          eligible: eligibility.eligible,
          readyForAgentCode: eligibility.readyForAgentCode,
          track: eligibility.track,
          trackLabel: eligibility.trackLabel,
          age: eligibility.age,
          blockers: eligibility.blockers,
          warnings: eligibility.warnings,
          requiredDocuments: eligibility.requiredDocuments.map((d) => d.key),
          checkedAt: new Date().toISOString(),
        }).slice(0, 4000),
      },
    })
    .catch(() => null);

  // ── ออกโค้ดตัวแทน + ส่งข้อมูลทั้งหมดไป app TL SMART ──────────────────────────
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
      details: { ...details, tlSmartAgentCodeIssued: agentCodeIssued, eligibility },
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

  // ── แจ้งเตือนทันที: LINE + กระดิ่งในแอป (ไม่บล็อกการบันทึกถ้าส่งไม่สำเร็จ) ──
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
    /** โค้ดตัวแทนที่ระบบออกให้ (8 หลัก รันต่อจากสายงาน 01759064) */
    agentCodeIssued,
    eligibility: {
      eligible: eligibility.eligible,
      readyForAgentCode: eligibility.readyForAgentCode,
      track: eligibility.track,
      trackLabel: eligibility.trackLabel,
      age: eligibility.age,
      blockers: eligibility.blockers,
      warnings: eligibility.warnings,
    },
    nextSteps: eligibility.nextSteps,
    requiredDocuments: eligibility.requiredDocuments,
    agentCodeFromTlSmart: null,
    agentCodeSource: 'network_then_tl_smart',
    agentCodeNote: 'โค้ดนี้คือรหัสตัวแทนในเครือข่าย (รันต่อจาก 01759064) — เลขตัวแทนจริงจากบริษัทจะกลับมาทาง /api/tl-smart/push',
    tlSmart,
    notify,
    message: eligibility.readyForAgentCode
      ? 'ส่งใบสมัครเรียบร้อย — คุณสมบัติครบ ระบบออกโค้ดตัวแทนให้แล้ว และเข้าคิวส่งเข้า TL SMART'
      : 'ส่งใบสมัครเรียบร้อย — เข้าคิวแล้ว แต่ยังต้องอบรม/สอบให้ผ่านก่อนยื่นคำขอใบอนุญาตและยืนยันโค้ดตัวแทน',
  });
}
