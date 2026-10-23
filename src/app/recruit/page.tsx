'use client';
// /recruit — "ลิงก์รับสมัครตัวแทน" (หน้าสาธารณะ ไม่ต้องล็อกอิน)
//
// ใบสมัคร 5 ขั้นตอน ตรงกับ "คำขอรับใบอนุญาตเป็นตัวแทนประกันชีวิต" (แบบ ตช.1 ของ คปภ.)
// ที่ไทยประกันชีวิตใช้ยื่นขอเลขตัวแทน:
//   ① ข้อมูลส่วนตัว (ชื่อไทย/อังกฤษ · เลขบัตร · วันเกิด · อายุ)
//   ② ที่อยู่และการติดต่อ (ที่อยู่ตามทะเบียนบ้าน + ที่อยู่ที่ติดต่อได้)
//   ③ การศึกษาและประวัติการทำงาน (วุฒิ → ระดับการศึกษา 3 ระดับของ ตช.1)
//   ④ ใบอนุญาตและสถานะการอบรม/สอบ (จุดประสงค์ · ประเภท · ใบเดิม · สถานะอบรม)
//   ⑤ คุณสมบัติ/ลักษณะต้องห้าม + เอกสารประกอบ + ผู้แนะนำ → ออกโค้ดตัวแทน
//
// ตรรกะสำคัญ: ระบบตรวจคุณสมบัติก่อน (src/lib/agentLicense.ts) แล้วจึงบันทึก + ออกโค้ดตัวแทน
// ถ้าติดคุณสมบัติ ระบบจะไม่บันทึกเป็นใบสมัครและไม่ออกโค้ด — แจ้งว่าให้แก้อะไร
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import { RECRUIT_STAGES } from '@/lib/recruitPipeline';
import { TL_SMART_SPONSOR_CODE } from '@/lib/tlSmart';
import {
  LICENSE_PURPOSES, LICENSE_KINDS, EDUCATION_DETAIL, EXISTING_LICENSES, TRAINING_STATUS,
  QUALIFICATION_ACKS, DISQUALIFICATIONS, MIN_AGE, evaluateEligibility, thaiIdValid, ageAt,
  oicEducationLevel,
} from '@/lib/agentLicense';
import { searchAddress, resolvePostal, resolveDistrict, autoFillFromQuery, type AddressHit } from '@/lib/thaiAddress';
import LineOaCard from '@/components/LineOaCard';

type Any = Record<string, any>;

const STEPS = [
  { n: 1, title: 'ข้อมูลส่วนตัว', sub: 'ชื่อ–นามสกุลไทย/อังกฤษ · เลขบัตรประชาชน · วันเกิด (ต้องครบ 20 ปี)' },
  { n: 2, title: 'ที่อยู่และการติดต่อ', sub: 'ที่อยู่ตามทะเบียนบ้าน และที่อยู่ที่ติดต่อได้' },
  { n: 3, title: 'การศึกษาและประวัติการทำงาน', sub: 'วุฒิการศึกษา (ขั้นต่ำ ม.6/ปวช.) และประสบการณ์เดิม' },
  { n: 4, title: 'ใบอนุญาตและการอบรม', sub: 'จุดประสงค์การขอ · ประเภทใบอนุญาต · สถานะอบรม/สอบ' },
  { n: 5, title: 'คุณสมบัติ เอกสาร และผู้แนะนำ', sub: 'คุณสมบัติตามกฎหมาย · เอกสารประกอบ · ผู้แนะนำ' },
];

const EXPERIENCE = [
  ['newcomer', 'มือใหม่ (ยังไม่เคยทำประกัน)'], ['1_3_years', '1–3 ปี'],
  ['3_5_years', '3–5 ปี'], ['5_years_plus', 'มากกว่า 5 ปี'],
];
const POSITIONS = [
  ['agent', 'ตัวแทน (Agent)'], ['senior_agent', 'ตัวแทนอาวุโส'],
  ['unit_manager', 'หัวหน้าหน่วย (UM)'], ['branch_manager', 'ผู้จัดการศูนย์'],
];
const CHANNELS = [
  ['direct_referral', 'ผู้แนะนำโดยตรง'], ['line', 'LINE'], ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'], ['event', 'งานสัมมนา / อีเวนต์'], ['other', 'อื่น ๆ'],
];
const MARITAL = [['single', 'โสด'], ['married', 'สมรส'], ['divorced', 'หย่า'], ['widowed', 'หม้าย']];

const inputCls =
  'w-full rounded-xl border border-[#dbeafe] bg-white px-4 py-3 text-base text-slate-700 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300';
const checkCls = 'mt-1 h-4 w-4 shrink-0';

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: any; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {required && <b className="text-rose-500">*</b>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

function RecruitInner() {
  const sp = useSearchParams();
  const refFromUrl = (sp.get('ref') || '').trim().toUpperCase();
  const [, setMe] = useState<Record<string, any> | null>(null);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Record<string, any> | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentLicenseFiling, setConsentLicenseFiling] = useState(false);

  // ── ค้นหาที่อยู่อัตโนมัติ: อำเภอ · จังหวัด · รหัสไปรษณีย์ ──────────────────────
  const [addrQ, setAddrQ] = useState('');
  const [addrOpen, setAddrOpen] = useState(false);
  const addrHits: AddressHit[] = useMemo(() => (addrQ.trim().length >= 2 ? searchAddress(addrQ, 8) : []), [addrQ]);

  function applyAddress(h: AddressHit) {
    setF((p) => ({ ...p, province: h.province, district: h.district, postalCode: h.postalCodes[0] || p.postalCode }));
    setAddrQ(`${h.district} · ${h.province} · ${h.postalCodes.join(', ')}`);
    setAddrOpen(false);
  }
  /** พิมพ์คีย์ค้นหา → เติมให้ทันทีเมื่อเจอรายการเดียว แล้วโชว์รายการให้เลือกถ้ามีหลายรายการ */
  function onAddressQuery(v: string) {
    setAddrQ(v);
    setAddrOpen(true);
    const auto = autoFillFromQuery(v, { province: String(f.province || ''), district: String(f.district || ''), postalCode: String(f.postalCode || '') });
    if (auto.province || auto.district || auto.postalCode) {
      setF((p) => ({
        ...p,
        province: auto.province ?? p.province,
        district: auto.district ?? p.district,
        postalCode: auto.postalCode ?? p.postalCode,
      }));
    }
  }
  /** รหัสไปรษณีย์ครบ 5 หลัก → เติมอำเภอ/จังหวัด เมื่อรหัสนั้นชี้ชัดรายการเดียว */
  function onPostal(v: string) {
    const code = v.replace(/\D/g, '').slice(0, 5);
    setF((p) => {
      const next: Any = { ...p, postalCode: code };
      if (code.length === 5) {
        const hits = resolvePostal(code);
        if (hits.length === 1) { next.province = hits[0].province; next.district = hits[0].district; }
      }
      return next;
    });
  }
  /** ชื่ออำเภอ/เขตตรงเป๊ะรายการเดียว → เติมจังหวัด + รหัสไปรษณีย์ */
  function onDistrict(v: string) {
    setF((p) => {
      const next: Any = { ...p, district: v };
      const hits = resolveDistrict(v);
      if (hits.length === 1) { next.province = hits[0].province; next.postalCode = hits[0].postalCodes[0] || p.postalCode; }
      return next;
    });
  }

  const [f, setF] = useState<Any>({
    // ① ข้อมูลส่วนตัว
    prefix: 'นาย', firstName: '', lastName: '', firstNameEn: '', lastNameEn: '', previousName: '',
    nickname: '', nationalId: '', birthDate: '', gender: 'male', nationality: 'ไทย', maritalStatus: 'single',
    // ② ที่อยู่และการติดต่อ
    houseAddress: '', houseMoo: '', houseSoi: '', houseStreet: '', subDistrict: '',
    district: '', province: '', postalCode: '',
    contactSameAsHouse: true, contactAddress: '', contactDistrict: '', contactProvince: '', contactPostalCode: '',
    phone: '', phoneHome: '', email: '', lineId: '', currentAddress: '',
    // ③ การศึกษาและประวัติการทำงาน
    educationDetail: 'bachelor', educationLevel: 'bachelor', major: '', university: '',
    currentOccupation: '', employerName: '', monthlyIncome: '',
    experienceLevel: 'newcomer', insuranceExperienceYears: '', previousCompany: '',
    // ④ ใบอนุญาตและการอบรม
    purpose: 'first', licenseKind: 'life_agent', existingLicense: 'none', existingCompany: '',
    existingLicenseNo: '', existingLicenseExpiry: '', hasReleaseLetter: false,
    trainingStatus: 'none', examDate: '', licenseNumber: '', licenseExpiryDate: '',
    // ⑤ คุณสมบัติ/ต้องห้าม/เอกสาร/ผู้แนะนำ
    isAdult: true, hasThaiResidence: true, insuranceEducationReady: false,
    dqMental: false, dqPropertyCrime: false, dqBankrupt: false, dqBroker: false,
    dqSuspended: false, dqRevoked: false, dqBadRecord: false, declaredNoDisqualification: false,
    documents: {} as Record<string, boolean>,
    sponsorCode: refFromUrl || TL_SMART_SPONSOR_CODE, targetPositionPreference: 'agent',
    targetMonthlyIncomeGoal: '50000', targetYearlyFYCGoal: '360000',
    expectedStartDate: '', recruitmentChannel: 'direct_referral', motivationNote: '',
  });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const setDoc = (k: string, v: boolean) => setF((p) => ({ ...p, documents: { ...(p.documents || {}), [k]: v } }));

  useEffect(() => {
    let alive = true;
    (async () => {
      let user: Record<string, any> | null = null;
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (r.ok) user = (await r.json())?.user || null;
      } catch { /* เปิดแบบไม่ล็อกอินก็ใช้ได้ */ }
      if (!alive) return;
      setMe(user);
      const code = refFromUrl || String(user?.referralCode || user?.memberCode || '').toUpperCase();
      if (code) setLink(`${window.location.origin}/recruit?ref=${encodeURIComponent(code)}`);
      if (!refFromUrl && user?.referralCode) set('sponsorCode', String(user.referralCode));
    })();
    return () => { alive = false; };
  }, [refFromUrl]);

  // วุฒิโดยละเอียด → ระดับ 3 ระดับของแบบ ตช.1 (ข้อ 7)
  useEffect(() => {
    const oic = oicEducationLevel(String(f.educationDetail || ''));
    if (oic !== f.educationLevel) setF((p) => ({ ...p, educationLevel: oic }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.educationDetail]);

  // สถานะอบรม/สอบ → รับรองข้อ 8.1(3) อัตโนมัติเมื่อผ่านแล้ว
  useEffect(() => {
    const ok = ['exam_passed', 'exempt', 'licensed'].includes(String(f.trainingStatus || ''));
    if (ok !== f.insuranceEducationReady) setF((p) => ({ ...p, insuranceEducationReady: ok }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.trainingStatus]);

  const sponsorCode = String(f.sponsorCode || '').toUpperCase();
  const age = ageAt(String(f.birthDate || ''));
  const eligibility = useMemo(() => evaluateEligibility(f), [f]);
  const anyDocMissing = eligibility.requiredDocuments.filter((d) => !(f.documents || {})[d.key]);

  const stepValid = useMemo(() => {
    if (step === 1) {
      return Boolean(
        f.firstName.trim() && f.lastName.trim() && f.firstNameEn.trim() && f.lastNameEn.trim() &&
        thaiIdValid(String(f.nationalId || '')) && age !== null && age >= MIN_AGE && f.birthDate,
      );
    }
    if (step === 2) return Boolean(String(f.houseAddress || '').trim() && String(f.province || '').trim() && String(f.phone || '').replace(/\D/g, '').length >= 9);
    if (step === 3) return Boolean(String(f.educationDetail || '') && String(f.currentOccupation || '').trim());
    if (step === 4) return Boolean(String(f.purpose || '') && String(f.existingLicense || '') && String(f.trainingStatus || ''));
    return Boolean(consent && consentLicenseFiling);
  }, [step, f, consent, consentLicenseFiling, age]);

  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  }

  async function submit() {
    if (!consent) { setError('กรุณาติ๊กยินยอมให้เก็บและใช้ข้อมูล (PDPA) ก่อนส่งใบสมัคร'); return; }
    if (!consentLicenseFiling) { setError('กรุณายินยอมให้บริษัทนำข้อมูลไปยื่นคำขอใบอนุญาตต่อนายทะเบียน (คปภ.)'); return; }
    if (!f.declaredNoDisqualification && !DISQUALIFICATIONS.some((d) => f[d.key] === true)) {
      setError('กรุณายืนยันว่าไม่มีลักษณะต้องห้ามตามข้อ 8.2 ของแบบ ตช.1'); return;
    }
    setSending(true); setError('');
    try {
      const res = await fetch('/api/recruit/apply', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          interests: ['สมัครเป็นตัวแทน'],
          consent: { pdpa: true, marketing: consentMarketing, licenseFiling: true, version: '2.0' },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) setDone(j);
      else setError([j?.error, ...(Array.isArray(j?.blockers) ? j.blockers : [])].filter(Boolean).join('\n') || 'ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่');
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setSending(false); }
  }

  // ── ส่งสำเร็จ ──────────────────────────────────────────────────────────────
  if (done) {
    const code = done.agentCodeIssued || done.networkAgentCode || null;
    return (
      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10">
        <div className="card p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">ส่งใบสมัครเรียบร้อยแล้ว</h1>
            <p className="mt-2 text-sm text-slate-500">{done.message || 'ทีมงานจะติดต่อกลับตามช่องทางที่คุณให้ไว้'}</p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {done.prospectId && (
              <div className="rounded-xl bg-[#f1f5f9] px-4 py-3">
                <div className="text-xs text-slate-500">รหัสผู้มุ่งหวัง</div>
                <div className="font-mono text-base font-semibold text-slate-800">{done.prospectId}</div>
              </div>
            )}
            {code && (
              <div className="rounded-xl bg-emerald-50 px-4 py-3">
                <div className="text-xs text-emerald-700">โค้ดตัวแทนที่ระบบออกให้</div>
                <div className="font-mono text-base font-semibold text-emerald-800">{code}</div>
              </div>
            )}
          </div>

          {done.eligibility && (
            <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${done.eligibility.readyForAgentCode ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
              <b>สถานะคุณสมบัติ:</b> {done.eligibility.trackLabel}
              {done.eligibility.age != null && <span className="text-xs"> · อายุ {done.eligibility.age} ปี</span>}
            </div>
          )}

          {Array.isArray(done.nextSteps) && done.nextSteps.length > 0 && (
            <div className="mt-4">
              <b className="text-sm text-slate-700">ขั้นตอนถัดไป</b>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                {done.nextSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          )}

          <div className="mt-6">
            <b className="text-sm text-slate-700">ขั้นตอนหลังจากนี้ (8 ขั้น)</b>
            <ol className="mt-2 space-y-1 text-sm text-slate-600">
              {RECRUIT_STAGES.map((s) => (
                <li key={s.key} className="flex gap-2">
                  <span>{s.icon}</span>
                  <span><b>ขั้น {s.no}</b> {s.label} <span className="text-slate-400">· {s.sub}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
    );
  }

  const badgeCls = eligibility.readyForAgentCode
    ? 'bg-emerald-100 text-emerald-700'
    : eligibility.eligible ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700';

  return (
    <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
      {/* ── หัวเรื่อง ───────────────────────────────────────────────── */}
      <section
        className="rounded-2xl border border-sky-100 p-6 text-slate-800 shadow-sm sm:p-8"
        style={{ background: 'linear-gradient(135deg, #e0f2fe 0%, #eef2ff 100%)' }}
      >
        <span className="badge-demo">ลิงก์รับสมัครตัวแทน</span>
        <h1 className="mt-3 text-2xl font-bold leading-snug sm:text-3xl">ใบสมัครเป็นตัวแทน (ผู้มุ่งหวัง)</h1>
        <p className="mt-2 text-sm text-slate-600 sm:text-base">
          5 ขั้นตอน ตามแบบคำขอรับใบอนุญาตตัวแทนประกันชีวิต (ตช.1) — ระบบตรวจคุณสมบัติให้ทันที
          ถ้าครบจะออกโค้ดตัวแทนและเข้าคิวส่งเข้า TL SMART ของไทยประกันชีวิต
        </p>
        {sponsorCode && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-sm">
            <span className="text-slate-500">ผู้แนะนำ</span><b className="font-mono tracking-wide text-slate-800">{sponsorCode}</b>
          </div>
        )}
      </section>

      {/* ── ลิงก์สำหรับส่งต่อ (สมาชิก) ──────────────────────────────── */}
      <section className="card mt-5 p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-800">ลิงก์สำหรับส่งต่อ</h2>
        <p className="mt-1 text-sm text-slate-500">
          {link ? 'คัดลอกลิงก์นี้ส่งให้ผู้มุ่งหวัง — เมื่อเขากรอก ระบบบันทึกชื่อคุณเป็น “ผู้แนะนำ”'
                : 'เข้าสู่ระบบเพื่อให้ระบบสร้างลิงก์ที่แนบรหัสผู้แนะนำของคุณอัตโนมัติ'}
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={link} placeholder="/recruit?ref=…" className={inputCls} />
          <button type="button" onClick={copyLink} disabled={!link}
            className="shrink-0 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}
          </button>
        </div>
      </section>

      {/* ── LINE OA: แอดเพื่อนแล้วคุยกับทีมงานผ่านมือถือ ─────────────── */}
      <div className="mt-5">
        <LineOaCard compact />
      </div>

      {/* ── แถบขั้นตอน ─────────────────────────────────────────────── */}
      <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STEPS.map((st) => (
          <li key={st.n}
            className={`rounded-xl border px-3 py-2 text-xs sm:text-sm ${step === st.n ? 'border-sky-500 bg-sky-500 text-white' : step > st.n ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#e2e8f0] bg-white text-slate-500'}`}>
            <b>ขั้น {st.n}</b>
            <div className="truncate">{st.title}</div>
          </li>
        ))}
      </ol>

      {/* ── สรุปคุณสมบัติแบบสด ─────────────────────────────────────── */}
      <section className={`card mt-4 border-l-4 p-4 sm:p-5 ${eligibility.eligible ? 'border-l-emerald-500' : 'border-l-amber-500'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-sm text-slate-800">ตรวจคุณสมบัติอัตโนมัติ</b>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeCls}`}>{eligibility.trackLabel}</span>
          {age != null && <span className="text-xs text-slate-500">อายุ {age} ปี</span>}
          {String(f.nationalId || '').length === 13 && (
            <span className={`text-xs ${thaiIdValid(String(f.nationalId)) ? 'text-emerald-600' : 'text-rose-600'}`}>
              เลขบัตร: {thaiIdValid(String(f.nationalId)) ? 'ถูกต้อง' : 'ไม่ถูกต้อง'}
            </span>
          )}
        </div>
        {eligibility.blockers.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-rose-700">
            {eligibility.blockers.map((b, i) => <li key={i}>• {b}</li>)}
          </ul>
        )}
        {eligibility.warnings.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-amber-700">
            {eligibility.warnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        )}
        {eligibility.readyForAgentCode && (
          <p className="mt-2 text-sm text-emerald-700">✓ คุณสมบัติพร้อม — ส่งใบสมัครแล้วระบบจะออกโค้ดตัวแทนให้ทันที</p>
        )}
      </section>

      {/* ── ฟอร์ม ─────────────────────────────────────────────────── */}
      <section className="card mt-4 p-5 sm:p-7">
        <h2 className="text-lg font-bold text-slate-800">ขั้นตอนที่ {step}: {STEPS[step - 1].title}</h2>
        <p className="mt-1 text-sm text-slate-500">{STEPS[step - 1].sub}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {/* ① ข้อมูลส่วนตัว */}
          {step === 1 && (<>
            <Field label="คำนำหน้า"><select className={inputCls} value={f.prefix} onChange={(e) => set('prefix', e.target.value)}>
              {['นาย', 'นาง', 'นางสาว'].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
            <Field label="เพศ"><select className={inputCls} value={f.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="male">ชาย</option><option value="female">หญิง</option><option value="other">ไม่ระบุ</option></select></Field>
            <Field label="ชื่อ (ไทย)" required><input className={inputCls} placeholder="เช่น ธนภัทร" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
            <Field label="นามสกุล (ไทย)" required><input className={inputCls} placeholder="เช่น สิทธิวงศ์" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
            <Field label="ชื่อ (อังกฤษ)" required hint="ใช้บนคำขอใบอนุญาต + ระบบบริษัท">
              <input className={inputCls + ' uppercase'} placeholder="THANAPAT" value={f.firstNameEn} onChange={(e) => set('firstNameEn', e.target.value.toUpperCase())} /></Field>
            <Field label="นามสกุล (อังกฤษ)" required>
              <input className={inputCls + ' uppercase'} placeholder="SITTIVONG" value={f.lastNameEn} onChange={(e) => set('lastNameEn', e.target.value.toUpperCase())} /></Field>
            <Field label="ชื่อ/นามสกุลเดิม" hint="กรณีเคยเปลี่ยนชื่อ (ข้อ 1 ของแบบ ตช.1)">
              <input className={inputCls} value={f.previousName} onChange={(e) => set('previousName', e.target.value)} /></Field>
            <Field label="ชื่อเล่น"><input className={inputCls} placeholder="เช่น บอล, แพรว" value={f.nickname} onChange={(e) => set('nickname', e.target.value)} /></Field>
            <Field label="เลขประจำตัวประชาชน" required hint="13 หลัก — ระบบตรวจ checksum ให้ทันที">
              <input className={inputCls + ' font-mono'} inputMode="numeric" placeholder="x-xxxx-xxxxx-xx-x"
                value={f.nationalId} onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 13))} />
              {String(f.nationalId || '').length === 13 && (
                <span className={`mt-1 block text-xs ${thaiIdValid(String(f.nationalId)) ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {thaiIdValid(String(f.nationalId)) ? 'เลขบัตรถูกต้องตาม checksum' : 'เลขบัตรไม่ถูกต้อง — ตรวจสอบอีกครั้ง'}
                </span>
              )}
            </Field>
            <Field label="วันเกิด" required hint={`ต้องมีอายุครบ ${MIN_AGE} ปีบริบูรณ์`}>
              <input type="date" className={inputCls} value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              {age != null && <span className={`mt-1 block text-xs ${age >= MIN_AGE ? 'text-emerald-600' : 'text-rose-600'}`}>อายุ {age} ปี</span>}
            </Field>
            <Field label="สัญชาติ"><input className={inputCls} value={f.nationality} onChange={(e) => set('nationality', e.target.value)} /></Field>
            <Field label="สถานภาพ"><select className={inputCls} value={f.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)}>
              {MARITAL.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
          </>)}

          {/* ② ที่อยู่และการติดต่อ */}
          {step === 2 && (<>
            <div className="sm:col-span-2"><b className="text-sm text-slate-700">ที่อยู่ตามทะเบียนบ้าน</b></div>
            <Field label="เลขที่ / อาคาร" required><input className={inputCls} placeholder="เช่น 99/123 อาคารศรีสุข" value={f.houseAddress} onChange={(e) => set('houseAddress', e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="หมู่ที่"><input className={inputCls} placeholder="เช่น 4" value={f.houseMoo} onChange={(e) => set('houseMoo', e.target.value.replace(/\D/g, '').slice(0, 2))} /></Field>
              <Field label="ตรอก / ซอย"><input className={inputCls} placeholder="เช่น ซอย 7" value={f.houseSoi} onChange={(e) => set('houseSoi', e.target.value)} /></Field>
            </div>
            <Field label="ถนน"><input className={inputCls} placeholder="เช่น ถนนพหลโยธิน" value={f.houseStreet} onChange={(e) => set('houseStreet', e.target.value)} /></Field>
            <Field label="ตำบล / แขวง"><input className={inputCls} placeholder="เช่น จตุจักร" value={f.subDistrict} onChange={(e) => set('subDistrict', e.target.value)} /></Field>
            <Field label="ค้นหาที่อยู่ (อำเภอ / จังหวัด / รหัสไปรษณีย์)" hint="พิมพ์รหัสไปรษณีย์ 5 หลัก หรือชื่ออำเภอ/จังหวัด — ระบบเติมให้อัตโนมัติ">
              <div className="relative">
                <input
                  className={inputCls}
                  placeholder="เช่น 10900 / จตุจักร / เชียงใหม่"
                  value={addrQ}
                  onChange={(e) => onAddressQuery(e.target.value)}
                  onFocus={() => setAddrOpen(true)}
                  onBlur={() => setTimeout(() => setAddrOpen(false), 200)}
                />
                {addrOpen && addrHits.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[#dbeafe] bg-white shadow-lg">
                    {addrHits.map((h, i) => (
                      <button
                        key={`${h.province}-${h.district}-${i}`}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); applyAddress(h); }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sky-50"
                      >
                        <span className="text-slate-700">{h.district} · {h.province}</span>
                        <span className="font-mono text-xs text-sky-700">{h.postalCodes.join(', ')}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="อำเภอ / เขต" required><input className={inputCls} placeholder="เช่น จตุจักร" value={f.district} onChange={(e) => onDistrict(e.target.value)} /></Field>
            <Field label="จังหวัด" required><input className={inputCls} placeholder="เช่น กรุงเทพมหานคร" value={f.province} onChange={(e) => set('province', e.target.value)} /></Field>
            <Field label="รหัสไปรษณีย์"><input className={inputCls} inputMode="numeric" maxLength={5} placeholder="เช่น 10900" value={f.postalCode} onChange={(e) => onPostal(e.target.value)} /></Field>

            <div className="sm:col-span-2 mt-2">
              <b className="text-sm text-slate-700">ที่อยู่ที่ติดต่อได้</b>
              <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className={checkCls} checked={!!f.contactSameAsHouse} onChange={(e) => set('contactSameAsHouse', e.target.checked)} />
                เหมือนกับที่อยู่ตามทะเบียนบ้าน
              </label>
            </div>
            {!f.contactSameAsHouse && (<>
              <Field label="ที่อยู่ที่ติดต่อได้"><input className={inputCls} placeholder="เลขที่ / หมู่ / ซอย / ถนน" value={f.contactAddress} onChange={(e) => set('contactAddress', e.target.value)} /></Field>
              <Field label="อำเภอ / เขต (ที่ติดต่อ)"><input className={inputCls} value={f.contactDistrict} onChange={(e) => set('contactDistrict', e.target.value)} /></Field>
              <Field label="จังหวัด (ที่ติดต่อ)"><input className={inputCls} value={f.contactProvince} onChange={(e) => set('contactProvince', e.target.value)} /></Field>
              <Field label="รหัสไปรษณีย์ (ที่ติดต่อ)"><input className={inputCls} inputMode="numeric" maxLength={5} value={f.contactPostalCode} onChange={(e) => set('contactPostalCode', e.target.value.replace(/\D/g, ''))} /></Field>
            </>)}

            <div className="sm:col-span-2 mt-2"><b className="text-sm text-slate-700">ช่องทางติดต่อ</b></div>
            <Field label="โทรศัพท์เคลื่อนที่" required><input className={inputCls} inputMode="tel" placeholder="081-234-5678" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="โทรศัพท์บ้าน / ที่ทำงาน"><input className={inputCls} inputMode="tel" placeholder="02-123-4567" value={f.phoneHome} onChange={(e) => set('phoneHome', e.target.value)} /></Field>
            <Field label="อีเมล" hint="ใช้ติดต่อกลับ + ส่งข้อมูลอบรม"><input className={inputCls} inputMode="email" placeholder="candidate@example.com" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="LINE ID"><input className={inputCls} placeholder="line_agent_id" value={f.lineId} onChange={(e) => set('lineId', e.target.value)} /></Field>
          </>)}

          {/* ③ การศึกษาและประวัติการทำงาน */}
          {step === 3 && (<>
            <Field label="วุฒิการศึกษาสูงสุด" required hint="ขั้นต่ำ ม.6 / ปวช. — ต่ำกว่านี้ระบบจะไม่รับ">
              <select className={inputCls} value={f.educationDetail} onChange={(e) => set('educationDetail', e.target.value)}>
                {EDUCATION_DETAIL.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
            <Field label="ระดับการศึกษาตามแบบ ตช.1 (ข้อ 7)" hint="ระบบแปลงให้อัตโนมัติจากวุฒิที่เลือก">
              <input readOnly className={inputCls + ' bg-slate-50'} value={
                f.educationLevel === 'bachelor' ? 'ปริญญาตรี' : f.educationLevel === 'above_bachelor' ? 'สูงกว่าปริญญาตรี' : 'ต่ำกว่าปริญญาตรี'} />
            </Field>
            <Field label="สาขาที่จบ"><input className={inputCls} placeholder="เช่น บริหารธุรกิจ, การเงิน, การตลาด" value={f.major} onChange={(e) => set('major', e.target.value)} /></Field>
            <Field label="สถาบันการศึกษา"><input className={inputCls} placeholder="เช่น ม.เกษตรศาสตร์, ม.จุฬาฯ, มช." value={f.university} onChange={(e) => set('university', e.target.value)} /></Field>
            <Field label="อาชีพปัจจุบัน" required><input className={inputCls} placeholder="เช่น พนักงานบริษัท, ธุรกิจส่วนตัว, ข้าราชการ" value={f.currentOccupation} onChange={(e) => set('currentOccupation', e.target.value)} /></Field>
            <Field label="ชื่อสถานที่ทำงาน / ธุรกิจ"><input className={inputCls} value={f.employerName} onChange={(e) => set('employerName', e.target.value)} /></Field>
            <Field label="รายได้ต่อเดือน (บาท)"><input className={inputCls} inputMode="numeric" value={f.monthlyIncome} onChange={(e) => set('monthlyIncome', e.target.value.replace(/[^\d]/g, '').slice(0, 8))} /></Field>
            <Field label="ประสบการณ์งานประกัน"><select className={inputCls} value={f.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}>
              {EXPERIENCE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="ประสบการณ์ (ปี)"><input className={inputCls} inputMode="numeric" value={f.insuranceExperienceYears} onChange={(e) => set('insuranceExperienceYears', e.target.value.replace(/[^\d]/g, '').slice(0, 2))} /></Field>
            <Field label="บริษัท/สังกัดเดิม"><input className={inputCls} placeholder="ระบุบริษัทหรือสังกัดเดิม (ถ้ามี)" value={f.previousCompany} onChange={(e) => set('previousCompany', e.target.value)} /></Field>
          </>)}

          {/* ④ ใบอนุญาตและการอบรม */}
          {step === 4 && (<>
            <Field label="จุดประสงค์การขอรับใบอนุญาต" required>
              <select className={inputCls} value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
                {LICENSE_PURPOSES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
            <Field label="ประเภทใบอนุญาตที่ขอ" required>
              <select className={inputCls} value={f.licenseKind} onChange={(e) => set('licenseKind', e.target.value)}>
                {LICENSE_KINDS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
            <Field label="ใบอนุญาตที่มีในปัจจุบัน (ข้อ 6)" required>
              <select className={inputCls} value={f.existingLicense} onChange={(e) => set('existingLicense', e.target.value)}>
                {EXISTING_LICENSES.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
            <Field label="บริษัทที่ใบอนุญาตสังกัดอยู่"><input className={inputCls} placeholder="เช่น บริษัทประกันชีวิตเดิม" value={f.existingCompany} onChange={(e) => set('existingCompany', e.target.value)} /></Field>
            <Field label="เลขที่ใบอนุญาตเดิม"><input className={inputCls} value={f.existingLicenseNo} onChange={(e) => set('existingLicenseNo', e.target.value)} /></Field>
            <Field label="วันหมดอายุใบอนุญาตเดิม"><input type="date" className={inputCls} value={f.existingLicenseExpiry} onChange={(e) => set('existingLicenseExpiry', e.target.value)} /></Field>
            <Field label="สถานะการอบรม / สอบหลักสูตรตัวแทน" required hint="ตัวตัดสินว่าพร้อมยื่นคำขอและออกโค้ดหรือยัง">
              <select className={inputCls} value={f.trainingStatus} onChange={(e) => set('trainingStatus', e.target.value)}>
                {TRAINING_STATUS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}</select></Field>
            <Field label="วันสอบ (ถ้ามี)"><input type="date" className={inputCls} value={f.examDate} onChange={(e) => set('examDate', e.target.value)} /></Field>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" className={checkCls} checked={!!f.hasReleaseLetter} onChange={(e) => set('hasReleaseLetter', e.target.checked)} />
                <span>มีหนังสือ/หลักฐานแสดงการสิ้นสุดความเป็นตัวแทนของบริษัทเดิมแล้ว (กรณีย้ายบริษัท — ข้อ 5 หมายเหตุ 2)</span>
              </label>
            </div>
          </>)}

          {/* ⑤ คุณสมบัติ เอกสาร ผู้แนะนำ */}
          {step === 5 && (<>
            <div className="sm:col-span-2">
              <b className="text-sm text-slate-700">ข้อ 8.1 — ขอรับรองว่ามีคุณสมบัติ</b>
              <div className="mt-2 space-y-2">
                {QUALIFICATION_ACKS.map((q) => (
                  <label key={q.key} className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" className={checkCls} checked={!!f[q.key]} onChange={(e) => set(q.key, e.target.checked)} />
                    <span>{q.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2 mt-2">
              <b className="text-sm text-slate-700">ข้อ 8.2 — ลักษณะต้องห้าม (ถ้ามี ให้ติ๊กตามจริง ระบบจะแจ้งว่ายื่นไม่ได้)</b>
              <div className="mt-2 space-y-2">
                {DISQUALIFICATIONS.map((d) => (
                  <label key={d.key} className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" className={checkCls} checked={!!f[d.key]} onChange={(e) => set(d.key, e.target.checked)} />
                    <span>{d.label}</span>
                  </label>
                ))}
                <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <input type="checkbox" className={checkCls} checked={!!f.declaredNoDisqualification} onChange={(e) => set('declaredNoDisqualification', e.target.checked)} />
                  <span>ข้าพเจ้าขอรับรองว่า <b>ไม่มี</b> ลักษณะต้องห้ามทั้ง 7 ข้อข้างต้น และข้อมูลทั้งหมดเป็นความจริง <b className="text-rose-500">*</b></span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2 mt-2">
              <b className="text-sm text-slate-700">เอกสารประกอบที่ต้องเตรียม ({eligibility.requiredDocuments.length} รายการ)</b>
              <div className="mt-2 space-y-2">
                {eligibility.requiredDocuments.map((d) => (
                  <label key={d.key} className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                    <input type="checkbox" className={checkCls} checked={!!(f.documents || {})[d.key]} onChange={(e) => setDoc(d.key, e.target.checked)} />
                    <span>{d.label}{d.hint && <span className="block text-xs text-slate-400">{d.hint}</span>}</span>
                  </label>
                ))}
              </div>
              {anyDocMissing.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">ยังไม่ได้ยืนยัน {anyDocMissing.length} รายการ — ส่งใบสมัครได้ แต่ทีมงานจะขอเอกสารก่อนยื่นคำขอต่อนายทะเบียน</p>
              )}
            </div>

            <Field label="รหัสผู้แนะนำ (Sponsor)" hint="ระบบเติมให้อัตโนมัติจากลิงก์ที่แชร์ — แก้ได้ถ้าต้องการ">
              <input className={inputCls + ' font-mono uppercase'} placeholder="เช่น 01759064" value={f.sponsorCode} onChange={(e) => set('sponsorCode', e.target.value.toUpperCase())} /></Field>
            <Field label="ตำแหน่งเป้าหมาย" required><select className={inputCls} value={f.targetPositionPreference} onChange={(e) => set('targetPositionPreference', e.target.value)}>
              {POSITIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="เป้าหมายรายได้ต่อเดือน (บาท)"><input className={inputCls} inputMode="numeric" value={f.targetMonthlyIncomeGoal} onChange={(e) => set('targetMonthlyIncomeGoal', e.target.value.replace(/[^\d]/g, '').slice(0, 8))} /></Field>
            <Field label="เป้าหมาย FYC ต่อปี (บาท)"><input className={inputCls} inputMode="numeric" value={f.targetYearlyFYCGoal} onChange={(e) => set('targetYearlyFYCGoal', e.target.value.replace(/[^\d]/g, '').slice(0, 9))} /></Field>
            <Field label="วันที่พร้อมเริ่มงาน"><input type="date" className={inputCls} value={f.expectedStartDate} onChange={(e) => set('expectedStartDate', e.target.value)} /></Field>
            <Field label="ช่องทางที่รู้จักเรา"><select className={inputCls} value={f.recruitmentChannel} onChange={(e) => set('recruitmentChannel', e.target.value)}>
              {CHANNELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <div className="sm:col-span-2">
              <Field label="ความมุ่งหวัง / เหตุผลที่ตัดสินใจเข้าร่วมธุรกิจ">
                <textarea rows={4} className={inputCls} placeholder="เช่น ต้องการสร้างความมั่นคงทางการเงิน ขยายทีมงาน และวางแผนเกษียณด้วย Passive Income จากโครงสร้างองค์กร"
                  value={f.motivationNote} onChange={(e) => set('motivationNote', e.target.value)} />
              </Field>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <label className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" className={checkCls} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>ข้าพเจ้ายินยอมให้จัดเก็บและใช้ข้อมูลส่วนบุคคลเพื่อการพิจารณาใบสมัครและการติดต่อเรื่องการสมัครตัวแทน ตามนโยบาย PDPA <b className="text-rose-500">*</b> (ถอนความยินยอมได้ทุกเมื่อ)</span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" className={checkCls} checked={consentLicenseFiling} onChange={(e) => setConsentLicenseFiling(e.target.checked)} />
                <span>ข้าพเจ้ายินยอมให้บริษัท/ศูนย์ นำข้อมูลและเอกสารของข้าพเจ้าไปยื่นคำขอรับใบอนุญาตเป็นตัวแทนประกันชีวิตต่อนายทะเบียน (คปภ.) แทนข้าพเจ้า <b className="text-rose-500">*</b></span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" className={checkCls} checked={consentMarketing} onChange={(e) => setConsentMarketing(e.target.checked)} />
                <span>ยินยอมรับข่าวสาร/โปรโมชันเพิ่มเติม (ไม่บังคับ)</span>
              </label>
            </div>
          </>)}
        </div>

        {error && <p className="mt-4 whitespace-pre-line rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {step > 1 && (
            <button type="button" onClick={() => { setError(''); setStep(step - 1); }}
              className="rounded-xl border border-[#cbd5e1] px-5 py-3 text-sm font-semibold text-slate-600">← ย้อนกลับ</button>
          )}
          {step < 5 ? (
            <button type="button" disabled={!stepValid}
              onClick={() => { setError(''); if (!stepValid) { setError('กรอกข้อมูลในขั้นนี้ให้ครบก่อนไปขั้นถัดไป'); return; } setStep(step + 1); }}
              className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
              ขั้นตอนถัดไป →
            </button>
          ) : (
            <button type="button" disabled={sending} onClick={submit}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
              {sending ? 'กำลังตรวจคุณสมบัติและส่งใบสมัคร…' : 'ส่งใบสมัคร / ขอออกโค้ดตัวแทน'}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          ระบบตรวจคุณสมบัติก่อนบันทึก: ถ้าครบจะได้โค้ดตัวแทนทันทีและเข้าคิวส่งเข้า TL SMART ของไทยประกันชีวิต ·
          ถ้ายังไม่ครบ ระบบจะแจ้งว่าติดข้อไหนและต้องทำอะไรต่อ
        </p>
      </section>
    </main>
  );
}

export default function RecruitPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">กำลังโหลด…</main>}>
        <RecruitInner />
      </Suspense>
    </>
  );
}
