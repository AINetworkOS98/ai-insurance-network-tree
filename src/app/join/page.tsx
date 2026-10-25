'use client';
// /join — หน้าสาธารณะ "สมัครเข้าใช้ระบบ" (ลิงก์ชวนจากแท็บคีย์แมน/เพจ/โฆษณา)
//
// เป้าหมาย: ให้ "คนสนใจ" ฝากข้อมูลเพื่อขอเข้าใช้ app + ให้ทีมติดต่อกลับ
// PDPA: เก็บเท่าที่จำเป็นต่อการติดต่อ (ชื่อ/เบอร์/อีเมล/จังหวัด/อาชีพ/ช่วงรายได้/ความสนใจ)
//       ไม่เก็บเลขบัตรประชาชน/เงินเดือนเป็นตัวเลขจริง · มี consent + marketing แยก + ถอนได้
// ปลายทางข้อมูล: POST /api/lead/register (สาธารณะ, rate-limit + consent-gated ในตัว route)
// แล้วทีมเห็นในหน้า /prospects (ผู้สนใจ) พร้อมคะแนนความสนใจจากหัวข้อที่เลือก
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import InstallAppCard from '@/components/InstallAppCard';

const INTERESTS = [
  'ขอเข้าใช้ระบบ (ทดลองใช้)',
  'ประกันคีย์แมน (ธุรกิจ)',
  'วางแผนลดหย่อนภาษี',
  'สมัครเป็นตัวแทน / ร่วมทีม',
  'เครื่องคำนวณเบี้ยประกันชีวิต',
  'ระบบเครือข่าย 1 แตก 5',
];
const INCOME_RANGES = ['ต่ำกว่า 20,000', '20,000–35,000', '35,001–60,000', '60,001–100,000', 'มากกว่า 100,000'];
const CALL_WINDOWS = ['09:00–12:00', '13:00–17:00', '17:00–20:00', 'วันหยุด (เสาร์–อาทิตย์)'];
const PROVINCES = ['กรุงเทพมหานคร', 'ปทุมธานี', 'นนทบุรี', 'สมุทรปราการ', 'เชียงใหม่', 'เชียงราย', 'ขอนแก่น', 'นครราชสีมา', 'อุดรธานี', 'ชลบุรี', 'ระยอง', 'สงขลา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'อื่น ๆ'];

const inputCls =
  'mt-1 w-full rounded-xl border border-[#dbeafe] bg-white px-3.5 py-2.5 text-sm text-slate-700 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300';

function JoinInner() {
  const sp = useSearchParams();
  const src = (sp.get('src') || 'app_signup_keyman').slice(0, 60);
  const [form, setForm] = useState({ first: '', last: '', phone: '', email: '', province: '', occupation: '', income: '', callWindow: '', note: '' });
  const [interests, setInterests] = useState<string[]>(['ขอเข้าใช้ระบบ (ทดลองใช้)']);
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState<any>(null);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const toggle = (t: string) => setInterests((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  useEffect(() => { setErr(''); }, []);

  const valid = Boolean(form.first.trim() && form.phone.replace(/\D/g, '').length >= 9 && consent);

  async function submit() {
    if (!valid) { setErr('กรอกชื่อ + เบอร์โทร และติ๊กยินยอม (PDPA) ก่อนส่ง'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/lead/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.first.trim(),
          lastName: form.last.trim() || undefined,
          phone: form.phone.replace(/\D/g, ''),
          email: form.email.trim() || undefined,
          province: form.province || undefined,
          occupation: form.occupation.trim() || undefined,
          ageRange: form.income || undefined, // ใช้ช่องช่วงรายได้ของระบบเดิม (ไม่เก็บตัวเลขจริง)
          interests,
          note: form.note.trim() || undefined,
          callbackRequested: true,
          source: src,
          consent: { pdpa: true, marketing, version: '1.0' },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่'); return; }
      setDone(j);
    } catch {
      setErr('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✅</div>
          <h1 className="text-xl font-bold text-slate-800 sm:text-2xl">รับข้อมูลแล้ว — ทีมงานจะติดต่อกลับ</h1>
          <p className="mt-2 text-sm text-slate-500">
            เราได้รับความสนใจของคุณแล้ว (หัวข้อ: {interests.length} รายการ) · ทีมงานจะติดต่อภายใน 1 วันทำการ
          </p>

          <div className="mt-5 rounded-xl border border-[#dbeafe] bg-sky-50/60 p-4 text-left">
            <div className="text-sm font-bold text-[#0b2b5b]">หลังสมัครแล้ว — ทำ 3 ขั้นนี้ (ไม่มีอะไรต้องอัปโหลด/ติดตั้ง)</div>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700">
              <li><b>1)</b> สร้างบัญชี/เข้าสู่ระบบ (อีเมล + รหัสผ่าน)</li>
              <li><b>2)</b> ไปเมนู <b>“สแกนใบเสร็จ”</b> → การ์ด <b>📤 อัปโหลดใบเสร็จ</b> อยู่บนสุดของหน้า → กด <b>“📷 ถ่าย/เลือกใบเสร็จ”</b> แล้วถ่ายหรือเลือกไฟล์รูป</li>
              <li><b>3)</b> ตรวจยอดที่ระบบอ่านได้ → กดบันทึก ระบบจะผูกยอดกับรหัสของคุณและตรวจคุณสมบัติตำแหน่งให้</li>
            </ol>
            <div className="mt-2 text-[11px] text-slate-500">
              ระบบนี้ทำงานบนเว็บเบราว์เซอร์ — <b>ไม่ต้องอัปโหลดโปรแกรมใด ๆ</b> สิ่งที่อัปโหลดคือ <b>รูปใบเสร็จ/สลิป</b> เท่านั้น
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href="/register" className="rounded-xl bg-[#0b2b5b] px-4 py-3 text-sm font-semibold text-white no-underline">① สร้างบัญชี / เข้าสู่ระบบ</Link>
            <Link href="/documents?m=1&cam=1" className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white no-underline">② ไปหน้าอัปโหลดใบเสร็จ →</Link>
            <Link href="/apply" className="rounded-xl border px-4 py-3 text-sm font-semibold text-slate-700 no-underline">③ คำนวณเบี้ย / ทำเคส</Link>
            <Link href="/recruit" className="rounded-xl border px-4 py-3 text-sm font-semibold text-slate-700 no-underline">④ สมัครเป็นตัวแทน</Link>
          </div>
          {done?.notify && (
            <p className="mt-3 text-[11px] text-slate-500">
              แจ้งเตือนทีมงาน: LINE OA {done.notify?.line?.sent ? 'ส่งแล้ว ✓' : (done.notify?.line?.configured ? 'ส่งไม่สำเร็จ (เก็บคิวไว้)' : 'ยังไม่ตั้งค่า')}
              {' · '}อีเมล {done.notify?.email?.sent ? 'ส่งแล้ว ✓' : (done.notify?.email?.configured ? 'ส่งไม่สำเร็จ' : 'ยังไม่ตั้งค่า')}
            </p>
          )}
          <div className="mt-4 text-left">
            <InstallAppCard compact />
          </div>
          <p className="mt-3 text-[11px] text-slate-400">ต้องการถอนความยินยอม/ลบข้อมูล แจ้งทีมงานได้ทุกเมื่อ (PDPA)</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-4">
        <InstallAppCard />
        <div className="mt-1 text-right text-[10px]">
          <a href="/app" className="font-semibold text-sky-700 underline">วิธีติดตั้งแบบละเอียด (Android/iPhone) →</a>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-sky-100 shadow-sm">
        <div className="bg-gradient-to-r from-[#0b2b5b] via-[#123a73] to-[#1d4ed8] px-6 py-7 text-white">
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]">AI Insurance Network</span>
          <h1 className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">สมัครเข้าใช้ระบบ — ฟรี</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/85">
            เครื่องคำนวณเบี้ยประกันชีวิตและภาษี · คลังใบเสร็จอัจฉริยะ · ระบบเครือข่าย 1 แตก 5 · เปรียบเทียบประกันคีย์แมน
            สำหรับตัวแทนและเจ้าของธุรกิจ — กรอกไม่ถึง 1 นาที ทีมงานติดต่อกลับเพื่อเปิดสิทธิ์ให้
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[{ k: 'ฟรี', v: 'ทดลองใช้' }, { k: '1 นาที', v: 'กรอกข้อมูล' }, { k: '1 วันทำการ', v: 'ติดต่อกลับ' }].map((c) => (
              <div key={c.v} className="rounded-xl bg-white/10 px-2 py-2">
                <div className="text-sm font-bold">{c.k}</div>
                <div className="text-[10px] text-white/75">{c.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-medium text-slate-600">ชื่อ <b className="text-rose-500">*</b>
              <input className={inputCls} value={form.first} onChange={(e) => set('first', e.target.value)} placeholder="เช่น สมชาย" />
            </label>
            <label className="text-[11px] font-medium text-slate-600">นามสกุล
              <input className={inputCls} value={form.last} onChange={(e) => set('last', e.target.value)} placeholder="เช่น ใจดี" />
            </label>
            <label className="text-[11px] font-medium text-slate-600">เบอร์โทร / LINE <b className="text-rose-500">*</b>
              <input className={inputCls} inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="081-234-5678" />
            </label>
            <label className="text-[11px] font-medium text-slate-600">อีเมล (ไม่บังคับ)
              <input className={inputCls} inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
            </label>
            <label className="text-[11px] font-medium text-slate-600">จังหวัด
              <select className={inputCls} value={form.province} onChange={(e) => set('province', e.target.value)}>
                <option value="">— เลือกจังหวัด —</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-600">อาชีพ
              <input className={inputCls} value={form.occupation} onChange={(e) => set('occupation', e.target.value)} placeholder="เช่น เจ้าของธุรกิจ, พนักงานบริษัท" />
            </label>
            <label className="text-[11px] font-medium text-slate-600">ช่วงรายได้ต่อเดือน
              <select className={inputCls} value={form.income} onChange={(e) => set('income', e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {INCOME_RANGES.map((r) => <option key={r} value={r}>{r} บาท</option>)}
              </select>
            </label>
            <label className="text-[11px] font-medium text-slate-600">เวลาที่สะดวกให้ติดต่อ
              <select className={inputCls} value={form.callWindow} onChange={(e) => set('callWindow', e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {CALL_WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4">
            <div className="text-[11px] font-medium text-slate-600">สนใจเรื่องอะไร (เลือกได้หลายข้อ)</div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {INTERESTS.map((t) => (
                <label key={t} className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] px-3 py-2 text-xs text-slate-700">
                  <input type="checkbox" className="h-4 w-4" checked={interests.includes(t)} onChange={() => toggle(t)} />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="mt-3 block text-[11px] font-medium text-slate-600">หมายเหตุเพิ่มเติม
            <textarea rows={3} className={inputCls} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="เช่น ต้องการใช้ระบบคำนวณภาษีให้ลูกค้า / สนใจคีย์แมนสำหรับธุรกิจ 20 คน" />
          </label>

          <div className="mt-4 space-y-2">
            <label className="flex items-start gap-2 rounded-xl border border-[#dbeafe] bg-sky-50/50 px-3 py-2.5 text-xs text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>ข้าพเจ้ายินยอมให้เก็บและใช้ข้อมูล (ชื่อ/เบอร์/อีเมล/จังหวัด/อาชีพ/ช่วงรายได้) เพื่อติดต่อกลับและเปิดสิทธิ์ใช้งานระบบ ตามนโยบาย PDPA — ถอนความยินยอมได้ทุกเมื่อ <b className="text-rose-500">*</b></span>
            </label>
            <label className="flex items-start gap-2 rounded-xl border border-[#e2e8f0] px-3 py-2.5 text-xs text-slate-700">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
              <span>ยินยอมรับข่าวสาร/โปรโมชันเพิ่มเติม (ไม่บังคับ)</span>
            </label>
          </div>

          {err && <p className="mt-3 whitespace-pre-line rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={submit} disabled={busy || !valid}
              className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-40">
              {busy ? 'กำลังส่ง…' : 'สมัครเข้าใช้ระบบ (ฟรี)'}
            </button>
            <Link href="/documents" className="text-xs font-semibold text-[#0b2b5b] underline">ดูตัวอย่างระบบก่อน</Link>
            <span className="text-[10px] text-slate-400">ไม่เก็บเลขบัตรประชาชน/เลขบัญชี · เก็บเท่าที่จำเป็นต่อการติดต่อ · <b>ไม่ต้องอัปโหลดโปรแกรม</b> (ใช้ผ่านเว็บ)</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function JoinPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<main className="mx-auto max-w-4xl px-4 py-10 text-sm text-slate-500">กำลังโหลด…</main>}>
        <JoinInner />
      </Suspense>
    </>
  );
}
