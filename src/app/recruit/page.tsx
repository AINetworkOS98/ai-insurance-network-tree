'use client';
// /recruit — "ลิงก์รับสมัครตัวแทน" (หน้าสาธารณะ ไม่ต้องล็อกอิน)
// ใบสมัคร 4 ขั้นตอน ตามโครงเดียวกับเมนู "เพิ่มผู้มุ่งหวังตัวแทน" (AgentRecruitmentPortal):
//   ① ข้อมูลส่วนตัว ② การศึกษาและประวัติการทำงาน ③ สถานะใบอนุญาตตัวแทนประกันชีวิต (คปภ.)
//   ④ ผู้แนะนำ (Sponsor) + เป้าหมายเส้นทางอาชีพ → สิ้นสุดที่การสมัครสมาชิก
// ปลายทาง: POST /api/recruit/apply → Prospect (คิวผู้มุ่งหวัง) + ProspectActivity (รายละเอียดครบ)
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import { RECRUIT_STAGES } from '@/lib/recruitPipeline';
import { TL_SMART_SPONSOR_CODE } from '@/lib/tlSmart';
import { searchAddress, resolvePostal, resolveDistrict, autoFillFromQuery, type AddressHit } from '@/lib/thaiAddress';

type Any = Record<string, any>;

const STEPS = [
  { n: 1, title: 'ข้อมูลส่วนตัว', sub: 'ข้อมูลประวัติส่วนตัวของผู้สมัคร' },
  { n: 2, title: 'การศึกษาและประวัติการทำงาน', sub: 'วุฒิการศึกษาและประสบการณ์เดิม' },
  { n: 3, title: 'สถานะใบอนุญาต (คปภ.)', sub: 'ใบอนุญาตตัวแทนประกันชีวิต / วินาศภัย' },
  { n: 4, title: 'ผู้แนะนำและเป้าหมายอาชีพ', sub: 'ผู้แนะนำ (Sponsor) และเป้าหมายรายได้' },
];

const EDUCATION = [
  ['high_school', 'มัธยมปลาย / ปวช.'], ['diploma', 'อนุปริญญา / ปวส.'],
  ['bachelor', 'ปริญญาตรี'], ['master', 'ปริญญาโท'], ['doctorate', 'ปริญญาเอก'],
];
const EXPERIENCE = [
  ['newcomer', 'มือใหม่ (ยังไม่เคยทำประกัน)'], ['1_3_years', '1–3 ปี'],
  ['3_5_years', '3–5 ปี'], ['5_years_plus', 'มากกว่า 5 ปี'],
];
const LICENSE = [
  ['needs_training', 'ยังไม่มีใบอนุญาต — ต้องการอบรมเพื่อสอบ'],
  ['exam_passed', 'สอบผ่านแล้ว รอใบอนุญาต'],
  ['licensed', 'มีใบอนุญาตแล้ว (คปภ.)'],
  ['expired', 'เคยมี แต่หมดอายุแล้ว'],
];
const POSITIONS = [
  ['agent', 'ตัวแทน (Agent)'], ['senior_agent', 'ตัวแทนอาวุโส'],
  ['unit_manager', 'หัวหน้าหน่วย (UM)'], ['branch_manager', 'ผู้จัดการศูนย์'],
];
const CHANNELS = [
  ['direct_referral', 'ผู้แนะนำโดยตรง'], ['line', 'LINE'], ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'], ['event', 'งานสัมมนา / อีเวนต์'], ['other', 'อื่น ๆ'],
];

const inputCls =
  'w-full rounded-xl border border-[#dbeafe] bg-white px-4 py-3 text-base text-slate-700 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300';

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
  const [me, setMe] = useState<Record<string, any> | null>(null);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Record<string, any> | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
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
    prefix: 'นาย', firstName: '', lastName: '', nickname: '', nationalId: '', birthDate: '', gender: 'male',
    phone: '', email: '', lineId: '', currentAddress: '', province: '', district: '', postalCode: '',
    educationLevel: 'bachelor', major: '', university: '', currentOccupation: '',
    experienceLevel: 'newcomer', insuranceExperienceYears: '', previousCompany: '',
    licenseStatus: 'needs_training', licenseNumber: '', licenseExpiryDate: '', examDate: '',
    hasICLicense: false, hasGeneralInsuranceLicense: false,
    sponsorCode: refFromUrl || TL_SMART_SPONSOR_CODE, targetPositionPreference: 'agent',
    targetMonthlyIncomeGoal: '50000', targetYearlyFYCGoal: '360000',
    expectedStartDate: '', recruitmentChannel: 'direct_referral', motivationNote: '',
  });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

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

  const sponsorCode = String(f.sponsorCode || '').toUpperCase();
  const stepValid = useMemo(() => {
    if (step === 1) return Boolean(f.firstName.trim() && f.lastName.trim() && (f.phone.replace(/\D/g, '') || f.email.trim()));
    if (step === 2) return Boolean(f.currentOccupation.trim());
    if (step === 3) return Boolean(f.licenseStatus);
    return consent;
  }, [step, f, consent]);

  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch {}
  }

  async function submit() {
    if (!consent) { setError('กรุณาติ๊กยินยอมให้เก็บและใช้ข้อมูล (PDPA) ก่อนส่งใบสมัคร'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch('/api/recruit/apply', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, interests: ['สมัครเป็นตัวแทน'], consent: { pdpa: true, marketing: consentMarketing, version: '1.0' } }),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) setDone(j);
      else setError(j?.error || 'ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่');
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setSending(false); }
  }

  // ── ส่งสำเร็จ ──────────────────────────────────────────────────────────────
  if (done) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-10">
        <div className="card p-6 sm:p-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">ส่งใบสมัครเรียบร้อยแล้ว</h1>
          <p className="mt-2 text-sm text-slate-500">{done.message || 'ทีมงานจะติดต่อกลับตามช่องทางที่คุณให้ไว้'}</p>
          {done.prospectId && (
            <p className="mt-4 inline-block rounded-xl bg-[#f1f5f9] px-4 py-2 font-mono text-sm text-slate-700">
              รหัสผู้มุ่งหวัง: {done.prospectId}
            </p>
          )}
          {done.queueRef && (
            <p className="mt-2 text-xs text-slate-400">
              เลขคิวในระบบเรา: <b className="font-mono">{done.queueRef}</b> — เลขตัวแทนจริงจะออกโดยระบบ TL SMART ของไทยประกันชีวิต
            </p>
          )}
          <div className="mt-6 text-left">
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
          4 ขั้นตอนสั้น ๆ — กรอกครบแล้วระบบบันทึกเข้าคิวผู้มุ่งหวังทันที และเข้าสู่การสมัครสมาชิก
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

      {/* ── แถบขั้นตอน ─────────────────────────────────────────────── */}
      <ol className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((st) => (
          <li key={st.n}
            className={`rounded-xl border px-3 py-2 text-xs sm:text-sm ${step === st.n ? 'border-sky-500 bg-sky-500 text-white' : step > st.n ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#e2e8f0] bg-white text-slate-500'}`}>
            <b>ขั้น {st.n}</b>
            <div className="truncate">{st.title}</div>
          </li>
        ))}
      </ol>

      {/* ── ฟอร์ม ─────────────────────────────────────────────────── */}
      <section className="card mt-4 p-5 sm:p-7">
        <h2 className="text-lg font-bold text-slate-800">ขั้นตอนที่ {step}: {STEPS[step - 1].title}</h2>
        <p className="mt-1 text-sm text-slate-500">{STEPS[step - 1].sub}</p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {step === 1 && (<>
            <Field label="คำนำหน้า"><select className={inputCls} value={f.prefix} onChange={(e) => set('prefix', e.target.value)}>
              {['นาย', 'นาง', 'นางสาว'].map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
            <Field label="ชื่อ" required><input className={inputCls} placeholder="เช่น ธนภัทร" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} /></Field>
            <Field label="นามสกุล" required><input className={inputCls} placeholder="เช่น สิทธิวงศ์" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} /></Field>
            <Field label="ชื่อเล่น"><input className={inputCls} placeholder="เช่น บอล, แพรว" value={f.nickname} onChange={(e) => set('nickname', e.target.value)} /></Field>
            <Field label="เลขบัตรประชาชน" hint="13 หลัก"><input className={inputCls} inputMode="numeric" placeholder="x-xxxx-xxxxx-xx-x" value={f.nationalId} onChange={(e) => set('nationalId', e.target.value.replace(/[^\d]/g, '').slice(0, 13))} /></Field>
            <Field label="วันเกิด"><input type="date" className={inputCls} value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} /></Field>
            <Field label="เพศ"><select className={inputCls} value={f.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="male">ชาย</option><option value="female">หญิง</option><option value="other">ไม่ระบุ</option></select></Field>
            <Field label="เบอร์โทรศัพท์" required><input className={inputCls} inputMode="tel" placeholder="081-234-5678" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field label="อีเมล" hint="ใช้ติดต่อกลับ + ส่งข้อมูลอบรม"><input className={inputCls} inputMode="email" placeholder="candidate@example.com" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
            <Field label="LINE ID"><input className={inputCls} placeholder="line_agent_id" value={f.lineId} onChange={(e) => set('lineId', e.target.value)} /></Field>
            <Field label="ที่อยู่ปัจจุบัน"><input className={inputCls} placeholder="บ้านเลขที่ อาคาร ถนน" value={f.currentAddress} onChange={(e) => set('currentAddress', e.target.value)} /></Field>
            <div>
              <Field label="ค้นหาที่อยู่ (อำเภอ / จังหวัด / รหัสไปรษณีย์)" hint="พิมพ์รหัสไปรษณีย์ 5 หลัก หรือชื่ออำเภอ/จังหวัด — ระบบเติมอำเภอ จังหวัด รหัสไปรษณีย์ ให้อัตโนมัติ">
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
            </div>
            <Field label="อำเภอ / เขต"><input className={inputCls} placeholder="เช่น จตุจักร" value={f.district} onChange={(e) => onDistrict(e.target.value)} /></Field>
            <Field label="จังหวัด" required><input className={inputCls} placeholder="เช่น กรุงเทพมหานคร" value={f.province} onChange={(e) => set('province', e.target.value)} /></Field>
            <Field label="รหัสไปรษณีย์"><input className={inputCls} inputMode="numeric" maxLength={5} placeholder="เช่น 10900" value={f.postalCode} onChange={(e) => onPostal(e.target.value)} /></Field>
          </>)}

          {step === 2 && (<>
            <Field label="ระดับการศึกษา"><select className={inputCls} value={f.educationLevel} onChange={(e) => set('educationLevel', e.target.value)}>
              {EDUCATION.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="สาขาที่จบ"><input className={inputCls} placeholder="เช่น บริหารธุรกิจ, การเงิน, การตลาด" value={f.major} onChange={(e) => set('major', e.target.value)} /></Field>
            <Field label="สถาบันการศึกษา"><input className={inputCls} placeholder="เช่น ม.เกษตรศาสตร์, ม.จุฬาฯ, มช." value={f.university} onChange={(e) => set('university', e.target.value)} /></Field>
            <Field label="อาชีพปัจจุบัน" required><input className={inputCls} placeholder="เช่น พนักงานบริษัท, ธุรกิจส่วนตัว, ข้าราชการ" value={f.currentOccupation} onChange={(e) => set('currentOccupation', e.target.value)} /></Field>
            <Field label="ประสบการณ์งานประกัน"><select className={inputCls} value={f.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}>
              {EXPERIENCE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="ประสบการณ์ (ปี)"><input className={inputCls} inputMode="numeric" value={f.insuranceExperienceYears} onChange={(e) => set('insuranceExperienceYears', e.target.value.replace(/[^\d]/g, '').slice(0, 2))} /></Field>
            <Field label="บริษัท/สังกัดเดิม"><input className={inputCls} placeholder="ระบุบริษัทหรือสังกัดเดิม (ถ้ามี)" value={f.previousCompany} onChange={(e) => set('previousCompany', e.target.value)} /></Field>
          </>)}

          {step === 3 && (<>
            <Field label="สถานะใบอนุญาตตัวแทน (คปภ.)" required><select className={inputCls} value={f.licenseStatus} onChange={(e) => set('licenseStatus', e.target.value)}>
              {LICENSE.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></Field>
            <Field label="เลขที่ใบอนุญาต (ถ้ามี)"><input className={inputCls} placeholder="เช่น 6401029384" value={f.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} /></Field>
            <Field label="วันหมดอายุใบอนุญาต"><input type="date" className={inputCls} value={f.licenseExpiryDate} onChange={(e) => set('licenseExpiryDate', e.target.value)} /></Field>
            <Field label="วันสอบ (ถ้ามี)"><input type="date" className={inputCls} value={f.examDate} onChange={(e) => set('examDate', e.target.value)} /></Field>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={f.hasICLicense} onChange={(e) => set('hasICLicense', e.target.checked)} />
                มีใบอนุญาตประกันชีวิต (Life)
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={f.hasGeneralInsuranceLicense} onChange={(e) => set('hasGeneralInsuranceLicense', e.target.checked)} />
                มีใบอนุญาตประกันวินาศภัย (Non-Life)
              </label>
            </div>
          </>)}

          {step === 4 && (<>
            <Field label="รหัสผู้แนะนำ (Sponsor)" hint="ระบบเติมให้อัตโนมัติจากลิงก์ที่แชร์ — แก้ได้ถ้าต้องการ">
              <input className={inputCls + ' font-mono uppercase'} placeholder="เช่น R-LZSBQH" value={f.sponsorCode} onChange={(e) => set('sponsorCode', e.target.value.toUpperCase())} /></Field>
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
                <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>ข้าพเจ้ายินยอมให้จัดเก็บและใช้ข้อมูลส่วนบุคคลเพื่อการพิจารณาใบสมัครและการติดต่อเรื่องการสมัครตัวแทน ตามนโยบาย PDPA <b className="text-rose-500">*</b> (ถอนความยินยอมได้ทุกเมื่อ)</span>
              </label>
              <label className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" className="mt-1" checked={consentMarketing} onChange={(e) => setConsentMarketing(e.target.checked)} />
                <span>ยินยอมรับข่าวสาร/โปรโมชันเพิ่มเติม (ไม่บังคับ)</span>
              </label>
            </div>
          </>)}
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {step > 1 && (
            <button type="button" onClick={() => { setError(''); setStep(step - 1); }}
              className="rounded-xl border border-[#cbd5e1] px-5 py-3 text-sm font-semibold text-slate-600">← ย้อนกลับ</button>
          )}
          {step < 4 ? (
            <button type="button" disabled={!stepValid}
              onClick={() => { setError(''); if (!stepValid) { setError('กรอกข้อมูลในขั้นนี้ให้ครบก่อนไปขั้นถัดไป'); return; } setStep(step + 1); }}
              className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
              ขั้นตอนถัดไป →
            </button>
          ) : (
            <button type="button" disabled={sending} onClick={submit}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
              {sending ? 'กำลังส่งใบสมัคร…' : 'ส่งใบสมัคร / สมัครสมาชิก'}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          เมื่อส่งแล้ว ระบบจะสร้างรหัสผู้มุ่งหวังให้อัตโนมัติ และทีมงานจะติดต่อกลับเพื่อนัดหมายเข้าสู่กระบวนการสมัครสมาชิก
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
