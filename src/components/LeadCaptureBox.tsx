'use client';

/**
 * LeadCaptureBox — กล่องลงทะเบียนผู้สนใจ (Lead) แบบ mobile-first
 * ------------------------------------------------------------------
 * • ฟอร์มเดียวจบ ใช้ได้ทั้งหน้าสาธารณะและหน้าในระบบ (สเปกส่วน 2)
 * • มี "กล่องยินยอม" บังคับก่อนส่งทุกครั้ง (กติกาข้อ ①) — ไม่ติ๊กส่งไม่ได้
 * • ส่งไป POST /api/lead/register ด้วยฟิลด์ครบตามสเปก:
 *   name, phone, line_id, age_range, occupation, interests[],
 *   financial_goal, insurance_interest, contact_requested,
 *   preferred_channel, channel_preference{line,email,sms,web_push}, consent
 * • ไม่เพิ่ม dependency — ใช้ fetch + Tailwind เท่านั้น
 * • ผูกกับสคริปต์ /track.js (ถ้าอยู่ในหน้า) เพื่อยิง form_open / form_submit
 */

import { useRef, useState } from 'react';
import { utmFormFields } from '@/lib/utm';

// ── ตัวเลือกทั้งหมด (ภาษาไทย) ────────────────────────────────────────────────
const AGE_OPTIONS = ['ต่ำกว่า 20 ปี', '20-29 ปี', '30-39 ปี', '40-49 ปี', '50-59 ปี', '60 ปีขึ้นไป'];

const OCCUPATION_OPTIONS = [
  'พนักงานประจำ',
  'ธุรกิจส่วนตัว / เจ้าของกิจการ',
  'อาชีพอิสระ / ฟรีแลนซ์',
  'รับราชการ / รัฐวิสาหกิจ',
  'นักศึกษา',
  'แม่บ้าน / เกษียณอายุ',
  'อื่น ๆ',
];

const INTEREST_OPTIONS = [
  'ประกันชีวิต',
  'ประกันสุขภาพ',
  'ประกันอุบัติเหตุ',
  'ประกันบำนาญ / เกษียณ',
  'การออมและการลงทุน',
  'วางแผนภาษี',
  'สร้างรายได้เสริม',
  'สนใจเป็นตัวแทน',
];

const GOAL_OPTIONS = [
  'ป้องกันความเสี่ยงให้ครอบครัว',
  'ลดหย่อนภาษี',
  'เก็บเงินเพื่อเกษียณ',
  'เก็บเงินเพื่อการศึกษา',
  'สร้างรายได้เสริม',
  'วางแผนมรดก',
];

const INSURANCE_OPTIONS = [
  'ประกันชีวิต',
  'ประกันสุขภาพ',
  'ประกันอุบัติเหตุ',
  'ประกันบำนาญ',
  'ประกันกลุ่ม',
  'ยังไม่แน่ใจ',
];

const CHANNEL_OPTIONS: { key: 'line' | 'email' | 'sms' | 'web_push'; label: string }[] = [
  { key: 'line', label: 'LINE' },
  { key: 'email', label: 'อีเมล' },
  { key: 'sms', label: 'SMS' },
  { key: 'web_push', label: 'แจ้งเตือนในเว็บ' },
];

type ChannelPreference = { line: boolean; email: boolean; sms: boolean; web_push: boolean };

export interface LeadCaptureBoxProps {
  title?: string;
  subtitle?: string;
  className?: string;
  /** หัวข้อที่ตั้งต้นให้เลือกไว้ (เช่น มาจากหน้าที่ผู้ใช้กำลังดู) */
  defaultInterests?: string[];
  /** ช่องทางที่ตั้งต้น */
  defaultChannel?: 'line' | 'email' | 'sms' | 'web_push';
  /** เรียกหลังส่งสำเร็จ */
  onSuccess?: (lead: any) => void;
  /** ย่อขนาดสำหรับวางในSidebar/การ์ดเล็ก */
  compact?: boolean;
}

// ── helper เล็ก ๆ ────────────────────────────────────────────────────────────
function track(kind: 'form_open' | 'form_submit', name: string) {
  try {
    const t = (window as any).AIN_TRACK;
    if (!t) return;
    if (kind === 'form_open') t.formOpen?.(name);
    else t.formSubmit?.(name);
  } catch {
    /* ไม่มีสคริปต์ tracking ก็ทำงานปกติ */
  }
}

const inputCls =
  'w-full rounded-xl border border-[#dbeafe] bg-white px-4 py-3 text-base text-slate-700 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300';

const labelCls = 'block text-sm font-medium text-slate-700 mb-1.5';

export default function LeadCaptureBox({
  title = 'ลงทะเบียนรับคำปรึกษา',
  subtitle = 'กรอกข้อมูลสั้น ๆ ทีมงานจะติดต่อกลับตามช่องทางที่คุณสะดวก',
  className = '',
  defaultInterests = [],
  defaultChannel = 'line',
  onSuccess,
  compact = false,
}: LeadCaptureBoxProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const opened = useRef(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    line_id: '',
    age_range: '',
    occupation: '',
    financial_goal: '',
    insurance_interest: '',
    contact_requested: false,
    preferred_channel: defaultChannel as 'line' | 'email' | 'sms' | 'web_push',
    consent: false,
  });
  const [interests, setInterests] = useState<string[]>(defaultInterests);
  const [channelPreference, setChannelPreference] = useState<ChannelPreference>({
    line: defaultChannel === 'line',
    email: defaultChannel === 'email',
    sms: defaultChannel === 'sms',
    web_push: defaultChannel === 'web_push',
  });

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleFirstFocus() {
    // ยิง form_open ครั้งเดียวต่อฟอร์ม
    if (opened.current) return;
    opened.current = true;
    track('form_open', 'lead_capture');
  }

  function toggleInterest(item: string) {
    setInterests((arr) => (arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]));
  }

  function toggleChannel(key: keyof ChannelPreference) {
    setChannelPreference((c) => ({ ...c, [key]: !c[key] }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return 'กรุณากรอกชื่อของคุณ';
    const digits = form.phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 10) return 'กรุณากรอกเบอร์โทรให้ถูกต้อง (9-10 หลัก)';
    if (!form.consent) return 'กรุณายินยอมให้เก็บข้อมูลก่อนส่งแบบฟอร์ม';
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setError(null);
    setSending(true);
    track('form_submit', 'lead_capture');

    const payload = {
      // ── ฟิลด์ตามสเปก (snake_case) ───────────────────────────────────────
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ''),
      line_id: form.line_id.trim() || undefined,
      age_range: form.age_range || undefined,
      occupation: form.occupation || undefined,
      interests,
      financial_goal: form.financial_goal || undefined,
      insurance_interest: form.insurance_interest || undefined,
      contact_requested: form.contact_requested,
      preferred_channel: form.preferred_channel,
      channel_preference: channelPreference,
      consent: form.consent,
      // ── alias ที่ /api/lead/register อ่านจริง (camelCase + channels) ──────
      fullName: form.name.trim(),
      lineId: form.line_id.trim() || undefined,
      ageRange: form.age_range || undefined,
      financialGoal: form.financial_goal || undefined,
      insuranceInterest: form.insurance_interest || undefined,
      callbackRequested: form.contact_requested,
      preferredChannel: form.preferred_channel,
      channels: { ...channelPreference },
      // ── ที่มาแคมเปญ (UTM / ttclid) — เก็บไว้ทั้ง session แล้วแนบไปด้วย ────
      ...utmFormFields(),
    };

    try {
      const res = await fetch('/api/lead/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (j?.ok) {
        setDone(true);
        onSuccess?.(j.lead ?? j);
        try {
          (window as any).AIN_TRACK?.track?.('form_submit', { form: 'lead_capture', result: 'success' });
        } catch {}
      } else {
        setError(j?.error || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } catch {
      setError('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally {
      setSending(false);
    }
  }

  // ── สถานะส่งสำเร็จ ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className={`card p-5 sm:p-6 text-center ${className}`}>
        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center text-3xl">✅</div>
        <h3 className="text-lg font-bold text-slate-800">ลงทะเบียนเรียบร้อยแล้ว</h3>
        <p className="mt-1 text-sm text-slate-500">
          ขอบคุณที่ให้ความสนใจ ทีมงานจะติดต่อกลับตามช่องทางที่คุณเลือกไว้โดยเร็วที่สุด
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(false);
            setForm((f) => ({ ...f, contact_requested: false, consent: false }));
          }}
          className="mt-4 text-sm text-sky-600 underline"
        >
          ส่งข้อมูลของคนอื่นอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      data-form="lead_capture"
      onSubmit={submit}
      onFocus={handleFirstFocus}
      className={`card p-4 sm:p-6 ${className}`}
      noValidate
    >
      <div className="mb-4">
        <h3 className="text-lg sm:text-xl font-bold text-slate-800">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className={`space-y-4 ${compact ? 'text-sm' : ''}`}>
        {/* ชื่อ + เบอร์โทร */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lead-name">ชื่อ <span className="text-red-500">*</span></label>
            <input
              id="lead-name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="เช่น สมชาย ใจดี"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="lead-phone">เบอร์โทร <span className="text-red-500">*</span></label>
            <input
              id="lead-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="เช่น 0812345678"
              className={inputCls}
            />
          </div>
        </div>

        {/* LINE ID */}
        <div>
          <label className={labelCls} htmlFor="lead-line">LINE ID <span className="text-slate-400 font-normal">(ไม่บังคับ)</span></label>
          <input
            id="lead-line"
            type="text"
            value={form.line_id}
            onChange={(e) => set('line_id', e.target.value)}
            placeholder="เช่น myline123"
            className={inputCls}
          />
        </div>

        {/* ช่วงอายุ + อาชีพ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lead-age">ช่วงอายุ</label>
            <select id="lead-age" value={form.age_range} onChange={(e) => set('age_range', e.target.value)} className={inputCls}>
              <option value="">เลือกช่วงอายุ</option>
              {AGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="lead-occ">อาชีพ</label>
            <select id="lead-occ" value={form.occupation} onChange={(e) => set('occupation', e.target.value)} className={inputCls}>
              <option value="">เลือกอาชีพ</option>
              {OCCUPATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* ความสนใจ (เลือกได้หลายข้อ) */}
        <div>
          <span className={labelCls}>เรื่องที่คุณสนใจ <span className="text-slate-400 font-normal">(เลือกได้หลายข้อ)</span></span>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map((item) => {
              const active = interests.includes(item);
              return (
                <button
                  type="button"
                  key={item}
                  onClick={() => toggleInterest(item)}
                  aria-pressed={active}
                  className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                    active
                      ? 'bg-sky-500 border-sky-500 text-white font-medium'
                      : 'bg-white border-[#dbeafe] text-slate-600 hover:bg-sky-50'
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>

        {/* เป้าหมายการเงิน + ความสนใจด้านประกัน */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="lead-goal">เป้าหมายทางการเงิน</label>
            <select id="lead-goal" value={form.financial_goal} onChange={(e) => set('financial_goal', e.target.value)} className={inputCls}>
              <option value="">เลือกเป้าหมาย</option>
              {GOAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="lead-ins">ความสนใจด้านประกัน</label>
            <select id="lead-ins" value={form.insurance_interest} onChange={(e) => set('insurance_interest', e.target.value)} className={inputCls}>
              <option value="">เลือกประเภท</option>
              {INSURANCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>

        {/* ช่องทางที่สะดวกให้ติดต่อ */}
        <div>
          <label className={labelCls} htmlFor="lead-channel">ช่องทางที่สะดวกให้ติดต่อ</label>
          <select
            id="lead-channel"
            value={form.preferred_channel}
            onChange={(e) => set('preferred_channel', e.target.value as 'line' | 'email' | 'sms' | 'web_push')}
            className={inputCls}
          >
            <option value="line">LINE</option>
            <option value="email">อีเมล</option>
            <option value="sms">SMS</option>
            <option value="web_push">แจ้งเตือนในเว็บ</option>
          </select>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {CHANNEL_OPTIONS.map((c) => (
              <label key={c.key} className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={channelPreference[c.key]}
                  onChange={() => toggleChannel(c.key)}
                  className="w-4 h-4 rounded border-slate-300 text-sky-500 focus:ring-sky-300"
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        {/* ขอให้ติดต่อกลับ */}
        <label className="flex items-start gap-3 rounded-xl bg-sky-50 border border-sky-100 p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.contact_requested}
            onChange={(e) => set('contact_requested', e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-slate-300 text-sky-500 focus:ring-sky-300"
          />
          <span className="text-sm text-slate-700">
            ต้องการให้ทีมงานติดต่อกลับโดยตรง
            <span className="block text-xs text-slate-500 mt-0.5">ติ๊กถ้าต้องการให้โทรหรือทักกลับโดยเร็ว</span>
          </span>
        </label>

        {/* กล่องยินยอม (บังคับ) */}
        <label className={`flex items-start gap-3 rounded-xl p-3 cursor-pointer border ${form.consent ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => set('consent', e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-300"
            required
          />
          <span className="text-sm text-slate-700">
            ยินยอมให้เก็บและใช้ข้อมูลนี้เพื่อติดต่อกลับและให้คำปรึกษา <span className="text-red-500">*</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              คุณถอนความยินยอมได้ทุกเมื่อ · อ่าน <a href="/privacy" target="_blank" rel="noopener" className="text-sky-600 underline">นโยบายความเป็นส่วนตัว</a>
            </span>
          </span>
        </label>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">⚠️ {error}</div>
        )}

        {/* ปุ่มส่ง */}
        <button
          type="submit"
          disabled={sending || !form.consent}
          className="w-full min-h-[48px] rounded-xl bg-sky-500 px-4 py-3 text-base font-semibold text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending ? 'กำลังส่ง…' : '📩 ส่งข้อมูลให้ติดต่อกลับ'}
        </button>
        {!form.consent && (
          <p className="text-center text-xs text-slate-400">กรุณาติ๊กยินยอมก่อน จึงจะส่งแบบฟอร์มได้</p>
        )}
      </div>
    </form>
  );
}
