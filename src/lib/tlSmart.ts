// ─────────────────────────────────────────────────────────────────────────────
// tlSmart.ts — สะพานส่งใบสมัครตัวแทน → app "TL SMART" (บริษัทไทยประกันชีวิต)
//
// ใช้ที่:  POST /api/recruit/apply (สร้างคำขอ) → EventOutbox channel 'tl_smart'
//          /api/cron/tl-smart-sync (ส่งซ้ำ/ส่งต่อ)  ·  /api/tl-smart/status (ดูสถานะ)
//
// การส่งออกมี 2 ช่องทาง ตั้งค่าผ่าน env (ไม่ตั้ง = เก็บคิวไว้ ไม่หาย):
//   ① TLSMART_WEBHOOK_URL              → POST JSON ดิบ (ต่อกับ n8n / Make / bridge ได้ทันที)
//   ② TLSMART_API_URL + TLSMART_API_KEY → POST แบบ Authorization: Bearer (API ทางการในอนาคต)
//   TLSMART_WEBHOOK_SECRET (ออปชัน)     → ส่ง header x-hermes-secret ให้ปลายทางตรวจ
//
// ห้าม import prisma ที่ไฟล์นี้ (ถูก import จาก client component ได้)
// ─────────────────────────────────────────────────────────────────────────────

/** รหัสผู้แนะนำ/รหัสตัวแทนของเจ้าของลิงก์รับสมัคร (ดีฟอลต์ 01759064) */
export const TL_SMART_SPONSOR_CODE: string =
  (typeof process !== 'undefined'
    ? process.env.TL_SMART_SPONSOR_CODE || process.env.NEXT_PUBLIC_TL_SMART_SPONSOR_CODE || ''
    : ''
  ).trim() || '01759064';

/** เลขตัวแทนเริ่มต้นของสายงาน — เลขใหม่จะรันต่อจากนี้ (01759064 → 01759065 → …) */
export const TL_SMART_AGENT_CODE_START: number =
  Number(typeof process !== 'undefined' ? process.env.TL_SMART_AGENT_CODE_START || 1759064 : 1759064) || 1759064;

export const TL_SMART_CHANNEL = 'tl_smart';
export const TL_SMART_EVENT = 'tl_smart.agent_application';
export const AGENT_CODE_ACTIVITY = 'tl_smart_agent_code';
export const TL_SMART_ACTIVITY = 'tl_smart_application';

export type TlSmartSendResult = {
  ok: boolean;
  skipped?: boolean;
  mode?: 'webhook' | 'api';
  status?: number;
  body?: string;
  error?: string;
};

export function tlSmartConfig() {
  const webhook = (process.env.TLSMART_WEBHOOK_URL || '').trim();
  const api = (process.env.TLSMART_API_URL || '').trim();
  const key = (process.env.TLSMART_API_KEY || '').trim();
  return { webhook, api, key, hasSecret: Boolean(process.env.TLSMART_WEBHOOK_SECRET), configured: Boolean(webhook || (api && key)) };
}

/** รหัสตัวแทน 8 หลักรูปแบบไทยประกันชีวิต: 01759064 */
export function formatAgentCode(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(8, '0');
}

/**
 * รันเลขออกโค้ดตัวแทนใหม่ต่อจากเลขล่าสุดที่เคยออก
 * เก็บลำดับไว้ที่ ProspectActivity(type='tl_smart_agent_code') — append-only จึงไม่ต้องแก้โครง DB
 */
export async function nextAgentCode(prisma: any): Promise<string> {
  let lastNum = TL_SMART_AGENT_CODE_START;
  try {
    const last = await prisma.prospectActivity.findFirst({
      where: { type: AGENT_CODE_ACTIVITY },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    const parsed = Number(String(last?.content || '').replace(/\D/g, ''));
    if (Number.isFinite(parsed) && parsed > TL_SMART_AGENT_CODE_START) lastNum = parsed;
  } catch { /* ยังไม่เคยออกเลข = ใช้เลขเริ่มต้น */ }

  for (let i = 1; i <= 40; i++) {
    const code = formatAgentCode(lastNum + i);
    try {
      const dup = await prisma.prospectActivity.findFirst({ where: { type: AGENT_CODE_ACTIVITY, content: code }, select: { id: true } });
      if (!dup) return code;
    } catch { return code; }
  }
  return formatAgentCode(lastNum + 41);
}

/** จองเลขตัวแทนให้ผู้สมัคร 1 ราย (เขียนลำดับลง activity) */
export async function issueAgentCode(prisma: any, prospectId: string): Promise<string> {
  const code = await nextAgentCode(prisma);
  await prisma.prospectActivity
    .create({ data: { prospectId, type: AGENT_CODE_ACTIVITY, content: code } })
    .catch(() => null);
  return code;
}

/** แปลงรายละเอียดใบสมัคร → payload ตามฟอร์ม "เพิ่มตัวแทนใหม่" ของ TL SMART */
export function buildTlSmartApplication(input: {
  prospectId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  sponsorCode?: string | null;
  agentCodeIssued?: string | null;
  details: Record<string, any>;
  receivedAt?: string;
}) {
  const d = input.details || {};
  const sponsor = (input.sponsorCode || '').toUpperCase() || TL_SMART_SPONSOR_CODE;
  return {
    source: 'ai-insurance-network-tree',
    sourceRef: input.prospectId,
    receivedAt: input.receivedAt || new Date().toISOString(),
    // ── ผู้แนะนำ / รหัสตัวแทน ──
    sponsorCode: sponsor,
    sponsorAgentCode: /^\d{8}$/.test(sponsor) ? sponsor : TL_SMART_SPONSOR_CODE,
    agentCodeIssued: input.agentCodeIssued || null,
    // ── ผู้สมัคร ──
    applicant: {
      prefix: d.prefix || '',
      firstName: input.firstName,
      lastName: input.lastName,
      nickname: d.nickname || '',
      nationalId: d.nationalId || '',
      birthDate: d.birthDate || '',
      gender: d.gender || '',
      phone: input.phone || '',
      email: input.email || '',
      lineId: d.lineId || '',
      address: {
        current: d.currentAddress || '',
        district: d.district || '',
        province: d.province || '',
        postalCode: d.postalCode || '',
      },
    },
    // ── การศึกษา / การทำงาน ──
    education: { level: d.educationLevel || '', major: d.major || '', university: d.university || '' },
    work: {
      currentOccupation: d.currentOccupation || '',
      experienceLevel: d.experienceLevel || '',
      insuranceExperienceYears: d.insuranceExperienceYears ?? null,
      previousCompany: d.previousCompany || '',
    },
    // ── ใบอนุญาต (คปภ.) ──
    license: {
      status: d.licenseStatus || d.trainingStatus || '',
      number: d.licenseNumber || d.existingLicenseNo || '',
      expiryDate: d.licenseExpiryDate || d.existingLicenseExpiry || '',
      examDate: d.examDate || '',
      hasLifeLicense: d.hasICLicense === true || d.existingLicense === 'life_agent',
      hasGeneralInsuranceLicense: d.hasGeneralInsuranceLicense === true || d.existingLicense === 'nonlife_agent',
    },
    // ── คุณสมบัติ/คำรับรองตามแบบ ตช.1 (ใช้ยื่นคำขอใบอนุญาตตัวแทน) ──
    licensing: {
      form: 'ตช.1',
      purpose: d.purpose || '',
      licenseKind: d.licenseKind || 'life_agent',
      educationDetail: d.educationDetail || '',
      educationLevelOic: d.educationLevel || '',
      existingLicense: d.existingLicense || 'none',
      existingCompany: d.existingCompany || '',
      existingLicenseNo: d.existingLicenseNo || '',
      trainingStatus: d.trainingStatus || '',
      hasReleaseLetter: d.hasReleaseLetter === true,
      declarationsNoDisqualification: d.disqualifications || {},
      documentsConfirmed: d.documentsConfirmed || [],
      nameEn: { first: d.firstNameEn || '', last: d.lastNameEn || '' },
      houseAddress: d.houseAddress || '',
      eligibility: d.eligibility
        ? {
            eligible: d.eligibility.eligible === true,
            readyForAgentCode: d.eligibility.readyForAgentCode === true,
            track: d.eligibility.track || '',
            age: d.eligibility.age ?? null,
            blockers: d.eligibility.blockers || [],
          }
        : null,
    },
    // ── เป้าหมายเส้นทางอาชีพ ──
    goals: {
      positionPreference: d.targetPositionPreference || '',
      monthlyIncomeGoal: d.targetMonthlyIncomeGoal ?? null,
      yearlyFYCGoal: d.targetYearlyFYCGoal ?? null,
      expectedStartDate: d.expectedStartDate || '',
      recruitmentChannel: d.recruitmentChannel || '',
      motivationNote: d.motivationNote || '',
    },
    consent: {
      pdpa: true,
      marketing: d.consentMarketing === true,
      version: d.consentVersion || '1.0',
    },
    // ── ข้อมูลดิบครบทุกช่อง (ตามคำสั่ง "ส่งข้อมูลทั้งหมด") ──
    raw: d,
  };
}

/** ส่ง payload ไป TL SMART — คืน {ok:false, skipped:true} เมื่อยังไม่ได้ตั้งค่า endpoint */
export async function sendToTlSmart(payload: any): Promise<TlSmartSendResult> {
  const cfg = tlSmartConfig();
  if (!cfg.configured) {
    return { ok: false, skipped: true, error: 'ยังไม่ได้ตั้งค่า TLSMART_WEBHOOK_URL หรือ TLSMART_API_URL' };
  }
  const url = cfg.webhook || cfg.api;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const mode: 'webhook' | 'api' = cfg.webhook ? 'webhook' : 'api';
  if (mode === 'api') headers.authorization = `Bearer ${cfg.key}`;
  if (process.env.TLSMART_WEBHOOK_SECRET) headers['x-hermes-secret'] = String(process.env.TLSMART_WEBHOOK_SECRET);

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: ctl.signal });
    const body = (await res.text().catch(() => '')).slice(0, 600);
    return { ok: res.ok, mode, status: res.status, body };
  } catch (e: any) {
    return { ok: false, mode, error: String(e?.message || e).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

/** enqueue ลง EventOutbox — eventId ไม่ซ้ำต่อผู้สมัคร 1 ราย (idempotent) */
export function tlSmartEventId(prospectId: string) {
  return `tl_smart:${prospectId}`;
}
