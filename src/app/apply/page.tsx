'use client';
// ฟอร์มกรอกข้อมูลเพื่อทำประกันชีวิต (โครงตามหน้าคำนวณเบี้ย/ใบเสนอขาย ของ TL PRO PLUS)
// ผู้ใช้: ตัวแทนที่ล็อกอินแล้ว — เลือกแบบประกันจากตารางค่าคอมจริง เลือกทุน/อายุ/เพศ กรอกข้อมูลผู้เอาประกัน
// แล้วสร้าง "ลิงก์เคส" ที่บรรจุข้อมูลทั้งหมด (อยู่ใน hash ของ URL — ไม่ส่งขึ้นเซิร์ฟเวอร์) เพื่อส่งต่อ/เปิดทำใน TL PRO PLUS
import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import PremiumPaymentPicture from '@/components/PremiumPaymentPicture';
import { buildProjectSamples, condText, isRiderProduct } from '@/lib/projectSamples';
import { estimatePremium, LIFE_PREMIUM_TAX_CAP, PREMIUM_RATE_VERSION } from '@/lib/premiumEstimate';

const fmt = (n: number) => Number(n || 0).toLocaleString('th-TH');
const PAGE_SIZE = 10;

const AGENT = {
  code: '01759064',
  role: 'ผู้บริหารหน่วย',
  license: '6801062317',
};

const TITLES = ['นาย', 'นาง', 'นางสาว'];
const OCCUPATIONS = ['พนักงานบริษัท', 'ข้าราชการ', 'ธุรกิจส่วนตัว', 'ค้าขาย', 'ครู/อาจารย์', 'แพทย์/พยาบาล', 'วิศวกร', 'เกษตรกร', 'พนักงานรัฐวิสาหกิจ', 'อื่น ๆ'];
const RELATIONS = ['คู่สมรส', 'บุตร', 'บิดา', 'มารดา', 'พี่/น้อง', 'ตัวผู้เอาประกันภัย'];

type CaseData = {
  code: string; name: string; cat: string;
  gender: 'ชาย' | 'หญิง'; age: number; cover: number; payYears: number;
  title: string; first: string; last: string; birth: string;
  occupation: string; phone: string; citizenId: string;
  beneficiary: string; relation: string; note: string;
  riders?: { code: string; name: string; cat: string }[];
};

const b64encode = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64decode = (s: string) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(t + '='.repeat((4 - (t.length % 4)) % 4))));
};

export default function ApplyPage() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [page, setPage] = useState(1);
  const [step, setStep] = useState(1);

  const [picked, setPicked] = useState<any>(null);
  const [riders, setRiders] = useState<{ code: string; name: string; cat: string }[]>([]);
  const [rq, setRq] = useState('');
  const [rPage, setRPage] = useState(1);
  const [gender, setGender] = useState<'ชาย' | 'หญิง'>('ชาย');
  const [age, setAge] = useState('30');
  const [cover, setCover] = useState('1000000');
  const [payYears, setPayYears] = useState('10');

  const [form, setForm] = useState({
    title: 'นาย', first: '', last: '', birth: '', occupation: '',
    phone: '', citizenId: '', beneficiary: '', relation: 'คู่สมรส', note: '',
  });
  const [err, setErr] = useState('');
  const [caseLink, setCaseLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<{ caseNo: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/commissions?q=&category=', { credentials: 'include' });
        const j = await r.json();
        if (j.ok) setData(j); else setErr(j.error || 'โหลดรายการแบบประกันไม่สำเร็จ');
      } catch { setErr('โหลดรายการแบบประกันไม่สำเร็จ'); }
    })();
  }, []);

  // เปิดลิงก์เคสเดิม (ถ้ามี) เพื่อกรอกต่อ
  useEffect(() => {
    const m = typeof window !== 'undefined' ? window.location.hash.match(/case=([^&]+)/) : null;
    if (!m) return;
    try {
      const c = JSON.parse(b64decode(m[1])) as CaseData;
      setPicked({ c: c.code, n: c.name, cat: c.cat, v: [] });
      setGender(c.gender); setAge(String(c.age)); setCover(String(c.cover)); setPayYears(String(c.payYears));
      setForm(f => ({ ...f, title: c.title || f.title, first: c.first || '', last: c.last || '', birth: c.birth || '', occupation: c.occupation || '', phone: c.phone || '', citizenId: c.citizenId || '', beneficiary: c.beneficiary || '', relation: c.relation || f.relation, note: c.note || '' }));
      setCaseLink(window.location.href);
      setRiders(c.riders || []);
      setStep(4);
    } catch { /* ลิงก์เสีย — เริ่มใหม่ */ }
  }, []);

  const products = (data?.products || []) as any[];

  // แยก "สัญญาหลัก" กับ "สัญญาเพิ่มเติม" — สัญญาเพิ่มเติมเลือกได้หลายตัวและต้องมีสัญญาหลักก่อน
  // ใช้ isRiderProduct (หมวด + ชื่อ + รหัส) — หมวด LifeVerse มีทั้งสัญญาหลักและอนุสัญญาปนกัน
  const mains = useMemo(() => products.filter(p => !isRiderProduct(p)), [products]);
  const riderPlans = useMemo(() => products.filter(p => isRiderProduct(p)), [products]);

  const match = (p: any, s: string) => !s || String(p.c).toLowerCase().includes(s) || String(p.n).toLowerCase().includes(s) || String(p.cat).toLowerCase().includes(s);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return mains.filter(p => match(p, s) && (!cat || p.cat === cat));
  }, [mains, q, cat]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const rFiltered = useMemo(() => {
    const s = rq.trim().toLowerCase();
    return riderPlans.filter(p => match(p, s));
  }, [riderPlans, rq]);
  const rTotalPages = Math.max(1, Math.ceil(rFiltered.length / PAGE_SIZE));
  const rSafePage = Math.min(rPage, rTotalPages);
  const rPaged = rFiltered.slice((rSafePage - 1) * PAGE_SIZE, rSafePage * PAGE_SIZE);
  const riderCats = Array.from(new Set(riderPlans.map(p => p.cat)));

  const toggleRider = (p: any) => setRiders(rs => rs.some(r => r.code === p.c) ? rs.filter(r => r.code !== p.c) : [...rs, { code: p.c, name: p.n, cat: p.cat }]);

  const sample = useMemo(() => {
    if (!picked) return null;
    const full = products.find((p: any) => p.c === picked.c) || picked;
    return buildProjectSamples([full], { startGender: gender, age: Number(age) || 30, cover: Number(cover) || 1000000 })[0];
  }, [picked, products, gender, age, cover]);

  // ── เครื่องคำนวณเบี้ยประกันชีวิต (ประมาณการ) ──────────────────────────────────
  const [premCalcOpen, setPremCalcOpen] = useState(true);
  const [premRider, setPremRider] = useState<any>(null);
  const [premResult, setPremResult] = useState<any>(null);
  const ageNum = Number(age) || 30;
  const coverNum = Number(String(cover).replace(/[^\d]/g, '')) || 1000000;

  function validate() {
    if (!picked) return 'เลือกแบบประกันก่อน';
    if (!form.first.trim() || !form.last.trim()) return 'กรอกชื่อและนามสกุลผู้เอาประกันภัย';
    if (!/^0\d{8,9}$/.test(form.phone.replace(/\D/g, ''))) return 'เบอร์มือถือควรเป็น 9–10 หลัก เริ่มด้วย 0';
    if (!/^\d{13}$/.test(form.citizenId.replace(/\D/g, ''))) return 'เลขประจำตัวประชาชนต้องเป็น 13 หลัก';
    if (!form.beneficiary.trim()) return 'ระบุชื่อผู้รับผลประโยชน์';
    return '';
  }

  function buildCase() {
    const e = validate();
    if (e) { setErr(e); return; }
    setErr('');
    const c: CaseData = {
      code: picked.c, name: picked.n, cat: picked.cat,
      gender, age: ageNum, cover: coverNum, payYears: Number(payYears) || 10,
      title: form.title, first: form.first.trim(), last: form.last.trim(), birth: form.birth,
      occupation: form.occupation, phone: form.phone.replace(/\D/g, ''), citizenId: form.citizenId.replace(/\D/g, ''),
      beneficiary: form.beneficiary.trim(), relation: form.relation, note: form.note,
      riders,
    };
    const link = `${window.location.origin}/apply#case=${b64encode(JSON.stringify(c))}`;
    setCaseLink(link);
    setStep(4);
    window.history.replaceState(null, '', `#case=${b64encode(JSON.stringify(c))}`);
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(caseLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  }

  const plainText = () => {
    if (!picked) return '';
    return [
      `สัญญาหลัก: ${picked.c} ${picked.n} (${picked.cat})`,
      riders.length ? `สัญญาเพิ่มเติม (${riders.length}): ${riders.map(r => `${r.code} ${r.name}`).join(' + ')}` : 'สัญญาเพิ่มเติม: ไม่ได้เลือก',
      `ทุนประกัน: ${fmt(coverNum)} บาท · ระยะชำระเบี้ย: ${payYears} ปี`,
      `ผู้เอาประกันภัย: ${form.title}${form.first} ${form.last} · ${gender} · อายุ ${ageNum} ปี`,
      `วันเกิด: ${form.birth || '-'} · อาชีพ: ${form.occupation || '-'}`,
      `มือถือ: ${form.phone} · เลขบัตร: ${form.citizenId}`,
      `ผู้รับผลประโยชน์: ${form.beneficiary} (${form.relation})`,
      form.note ? `หมายเหตุ: ${form.note}` : '',
      `ตัวแทน: ${AGENT.code} (${AGENT.role}) · ใบอนุญาตเลขที่ ${AGENT.license}`,
    ].filter(Boolean).join('\n');
  };

  async function saveCase() {
    if (!picked) { setErr('เลือกแบบประกันก่อน'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/insurance-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          product: { code: picked.c, name: picked.n, cat: picked.cat },
          riders,
          gender, age: ageNum, cover: coverNum, payYears: Number(payYears) || 10,
          applicant: { ...form }, agent: AGENT, note: form.note,
        }),
      });
      const j = await r.json();
      if (j.ok) { setSaved({ caseNo: j.caseNo, url: j.url }); }
      else setErr(j.error || 'บันทึกเคสไม่สำเร็จ');
    } catch { setErr('บันทึกเคสไม่สำเร็จ'); }
    setSaving(false);
  }

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div>
            <h1 className="text-xl font-bold text-navy">กรอกข้อมูลเพื่อทำประกันชีวิต</h1>
            <p className="text-xs text-slate-500 mt-1">
              โครงเดียวกับหน้า “คำนวณเบี้ย / ใบเสนอขาย” ของ TL PRO PLUS — เลือกแบบประกัน → เลือกทุน/อายุ → กรอกข้อมูล → ได้ลิงก์เคสพร้อมข้อมูลครบ
            </p>
            <a href="/cases" className="inline-block mt-1 text-[11px] font-semibold text-navy underline">→ ดูเคสที่บันทึกไว้ทั้งหมด</a>
          </div>

          {/* ══ โปรแกรมคำนวณเบี้ยประกันชีวิต (วางไว้ "ก่อน" ขั้นสร้าง/อัปโหลดใบเสร็จ) ══ */}
          <section className="overflow-hidden rounded-2xl border border-[#0b2b5b]/15 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-[#0b2b5b] via-[#123a73] to-[#1d4ed8] px-5 py-5 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">Insurance toolkit</span>
                  <h2 className="mt-2 text-lg font-bold leading-snug sm:text-xl">คำนวณเบี้ยประกันชีวิต — แล้วส่งต่ออัปโหลดใบเสร็จ</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/85">
                    เลือกแบบประกัน · เพศ · อายุ · ทุนประกัน · ระยะชำระเบี้ย แล้วระบบประมาณการเบี้ยให้ทันที
                    พร้อมสิทธิลดหย่อนภาษี และปุ่มส่งต่อไป <b>สร้าง/อัปโหลดสลิป/ใบเสร็จ</b> ในขั้นถัดไป
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-2 text-center">
                  {[
                    { k: 'ทันที', v: 'ประมาณการ' },
                    { k: 'สูงสุด', v: 'ลดหย่อนภาษี' },
                    { k: '1 คลิก', v: 'ต่อใบเสร็จ' },
                  ].map((c) => (
                    <div key={c.v} className="rounded-xl bg-white/10 px-3 py-2">
                      <div className="text-sm font-bold">{c.k}</div>
                      <div className="text-[10px] text-white/75">{c.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-[11px] font-medium text-slate-600 lg:col-span-2">สัญญาหลัก (บังคับเลือก 1 แบบ)
                  <select
                    value={picked?.c || ''}
                    onChange={(e) => { const hit = mains.find((m: any) => m.c === e.target.value); setPicked(hit || null); setPremResult(null); }}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                  >
                    <option value="">— เลือกสัญญาหลัก —</option>
                    {mains.slice(0, 200).map((m: any) => <option key={m.c} value={m.c}>{m.c} · {m.n} ({m.cat})</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-medium text-slate-600 lg:col-span-2">อนุสัญญา / สัญญาเพิ่มเติม (ไม่บังคับ)
                  <select
                    value={premRider?.c || ''}
                    onChange={(e) => { const hit = riderPlans.find((m: any) => m.c === e.target.value); setPremRider(hit || null); setPremResult(null); }}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm"
                  >
                    <option value="">— ไม่มีอนุสัญญา —</option>
                    {riderPlans.slice(0, 300).map((m: any) => <option key={m.c} value={m.c}>{m.c} · {m.n} ({m.cat})</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-medium text-slate-600">เพศ
                  <select value={gender} onChange={(e) => { setGender(e.target.value as 'ชาย' | 'หญิง'); setPremResult(null); }}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm">
                    <option value="ชาย">ชาย</option>
                    <option value="หญิง">หญิง</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium text-slate-600">อายุ (ปี)
                  <input value={age} inputMode="numeric" onChange={(e) => { setAge(e.target.value.replace(/\D/g, '').slice(0, 2)); setPremResult(null); }}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="30" />
                </label>
                <label className="text-[11px] font-medium text-slate-600">ทุนประกัน (บาท)
                  <input value={cover} inputMode="numeric" onChange={(e) => { setCover(e.target.value.replace(/[^\d]/g, '').slice(0, 9)); setPremResult(null); }}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="1000000" />
                </label>
                <label className="text-[11px] font-medium text-slate-600">ระยะชำระเบี้ย (ปี)
                  <input value={payYears} inputMode="numeric" onChange={(e) => { setPayYears(e.target.value.replace(/\D/g, '').slice(0, 2)); setPremResult(null); }}
                    className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm" placeholder="10" />
                </label>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {[1000000, 2000000, 3000000, 5000000].map((c) => (
                  <button key={c} type="button" onClick={() => { setCover(String(c)); setPremResult(null); }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] ${coverNum === c ? 'border-navy bg-navy text-white' : 'bg-white text-slate-600'}`}>
                    {fmt(c)} บาท
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setPremCalcOpen((v) => !v)}
                  className="rounded-full bg-navy px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95">
                  {premCalcOpen ? 'ซ่อนเครื่องคำนวณ' : 'เปิดเครื่องคำนวณเบี้ย'}
                </button>
                <button type="button"
                  onClick={() => setPremResult(estimatePremium({
                    planName: picked?.n, planCat: picked?.cat,
                    riders: premRider ? [{ name: `${premRider.c} ${premRider.n}`, cat: premRider.cat, cover: coverNum }] : [],
                    gender: gender === 'หญิง' ? 'female' : 'male',
                    age: ageNum, cover: coverNum, payYears: Number(payYears) || 10,
                  }))}
                  className="rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:opacity-95">
                  คำนวณเบี้ยประกันชีวิต
                </button>
                <a href="/documents?m=1&cam=1"
                  className="rounded-full border border-emerald-600 px-5 py-2.5 text-xs font-bold text-emerald-700 no-underline hover:bg-emerald-50">
                  🧾 ส่งต่ออัปโหลดใบเสร็จ
                </a>
                <span className="text-[10px] text-slate-400">{PREMIUM_RATE_VERSION}</span>
              </div>

              {premCalcOpen && premResult && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { l: 'เบี้ยต่อปี (ประมาณการ)', v: `${fmt(premResult.perYear)} ฿`, s: `${(picked?.c || '-')}${premRider ? ` + ${premRider.c}` : ''} · ${gender} ${ageNum} ปี` },
                      { l: 'แยก: สัญญาหลัก', v: `${fmt(premResult.mainPremium)} ฿`, s: 'สัญญาหลักเท่านั้น' },
                      { l: 'แยก: อนุสัญญา', v: `${fmt(premResult.riderPremium)} ฿`, s: premResult.ridersUsed?.length ? `${premResult.ridersUsed.length} รายการ` : 'ยังไม่เลือกอนุสัญญา' },
                      { l: 'เฉลี่ยต่อเดือน', v: `${fmt(premResult.perMonth)} ฿`, s: 'เบี้ยรายปี ÷ 12' },
                      { l: 'ลดหย่อนภาษีได้สูงสุด', v: `${fmt(premResult.taxDeductible)} ฿`, s: `เพดาน ${fmt(LIFE_PREMIUM_TAX_CAP)} ฿/ปี` },
                      { l: `รวมตลอด ${premResult.payYears || 0} ปี`, v: `${fmt(premResult.totalPremium)} ฿`, s: 'เบี้ยต่อปี × ระยะชำระ' },
                    ].map((k) => (
                      <div key={k.l} className="rounded-xl border bg-white px-3 py-2">
                        <div className="text-[10px] text-slate-500">{k.l}</div>
                        <div className="text-base font-bold text-navy">{k.v}</div>
                        <div className="text-[10px] text-slate-400">{k.s}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    ฐานคำนวณ: {premResult.basis}<br />
                    {premResult.disclaimer}
                  </div>
                  {premResult.warnings?.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[10px] text-amber-700">
                      {premResult.warnings.map((w: string, i: number) => <li key={i}>• {w}</li>)}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button"
                      onClick={() => {
                        // พาอนุสัญญาที่เลือกไว้เข้าเคสด้วย (กันซ้ำ)
                        if (premRider && !riders.some((r) => r.code === premRider.c)) {
                          setRiders([...riders, { code: premRider.c, name: premRider.n, cat: premRider.cat }]);
                        }
                        setStep(2);
                      }}
                      className="rounded-full bg-navy px-4 py-2 text-[11px] font-bold text-white">
                      ใช้แบบนี้กรอกข้อมูลต่อ →
                    </button>
                    <a href="/documents?m=1&cam=1"
                      className="rounded-full bg-emerald-600 px-4 py-2 text-[11px] font-bold text-white no-underline">
                      🧾 ไปอัปโหลดใบเสร็จขั้นถัดไป
                    </a>
                    <a href="/commissions"
                      className="rounded-full border px-4 py-2 text-[11px] font-semibold text-slate-600 no-underline">
                      ดูตารางค่าคอมมิชชั่น
                    </a>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ══ ขั้นถัดไป: สร้าง/อัปโหลดสลิป/ใบเสร็จ — สแกนยอดเงินจริง ══ */}
          <section className="card border-l-4 border-emerald-500 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-navy">🧾 ขั้นถัดไป: สร้าง/อัปโหลดสลิป/ใบเสร็จ — สแกนยอดเงินจริง</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  คำนวณเบี้ยแล้ว ออกใบเสร็จ/สลิปใน TL ProPlus แล้วบันทึกเข้าคลังได้ทันที —
                  ระบบตรวจยอดเงินจริงด้วย AI และผูกผลงานกับรหัสตัวแทนของคุณ
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a href="/documents?m=1&cam=1" className="rounded-full bg-emerald-600 px-4 py-2 text-[11px] font-bold text-white no-underline">
                  📷 ถ่าย/สแกนใบเสร็จ
                </a>
                <a href="/documents" className="rounded-full border px-4 py-2 text-[11px] font-semibold text-slate-700 no-underline">
                  เปิดหน้าสร้างใบเสร็จ
                </a>
              </div>
            </div>
          </section>

          <div className="card p-2 flex flex-wrap items-center gap-2 text-[11px]">
            {[
              { n: 1, t: 'เลือกแบบประกัน' },
              { n: 2, t: 'ทุน / อายุ / เพศ' },
              { n: 3, t: 'ข้อมูลผู้เอาประกัน' },
              { n: 4, t: 'ลิงก์เคส + สรุป' },
            ].map(s => (
              <button key={s.n} type="button" onClick={() => setStep(s.n)}
                className={`px-3 py-1 rounded-full border ${step === s.n ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600'}`}>
                {s.n}. {s.t}
              </button>
            ))}
          </div>

          {err && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{err}</div>}

          {/* ── ขั้น 1: เลือกสัญญาหลัก + สัญญาเพิ่มเติม ── */}
          {step === 1 && (
            <div className="space-y-3">
              {/* สัญญาหลัก */}
              <div className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-navy">1) สัญญาหลัก <span className="text-[11px] font-normal text-slate-500">(เลือก 1 แบบ — จำเป็น)</span></div>
                  {picked && <div className="text-[11px] text-emerald-700">เลือกแล้ว: <b className="font-mono">{picked.c}</b> {picked.n}</div>}
                </div>
                <div className="mt-2 grid md:grid-cols-3 gap-2">
                  <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="ค้นหารหัส/ชื่อสัญญาหลัก เช่น FA05, เกษมเกษียณ"
                    className="md:col-span-2 px-3 py-2 rounded-xl border text-sm" />
                  <select value={cat} onChange={e => { setCat(e.target.value); setPage(1); }} className="px-3 py-2 rounded-xl border text-sm">
                    <option value="">ทุกหมวดสัญญาหลัก</option>
                    {Array.from(new Set(mains.map((m: any) => m.cat))).map((c: any) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>สัญญาหลัก {filtered.length} แบบ · หน้า {safePage}/{totalPages}</span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2 py-1 rounded-lg border disabled:opacity-40">‹</button>
                    {Array.from({ length: totalPages }).slice(Math.max(0, safePage - 3), Math.max(0, safePage - 3) + 7).map((_, i) => {
                      const n = Math.max(0, safePage - 3) + i + 1;
                      return <button key={n} type="button" onClick={() => setPage(n)} className={`px-2 py-1 rounded-lg border font-mono ${n === safePage ? 'bg-navy text-white border-navy' : ''}`}>{n}</button>;
                    })}
                    <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-2 py-1 rounded-lg border disabled:opacity-40">›</button>
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {paged.map((p: any) => (
                    <button key={p.c} type="button" onClick={() => { setPicked(p); }}
                      className={`w-full text-left px-3 py-2 rounded-xl border hover:bg-slate-50 ${picked?.c === p.c ? 'border-navy bg-navy/5' : ''}`}>
                      <span className="font-mono font-bold text-sm">{p.c}</span>
                      <span className="ml-2 text-sm font-semibold">{p.n}</span>
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-100">{p.cat}</span>
                      <div className="text-[11px] text-slate-500 mt-0.5">{(p.v || [])[0] ? condText((p.v || [])[0]) : 'เงื่อนไขตามตาราง'}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* สัญญาเพิ่มเติม */}
              <div className="card p-4 border-l-4 border-sky-500">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-navy">
                    2) สัญญาเพิ่มเติม / อนุสัญญา <span className="text-[11px] font-normal text-slate-500">(ไม่บังคับ — เลือกได้หลายตัว ต้องต่อพ่วงสัญญาหลัก)</span>
                  </div>
                  <span className="text-[11px] text-slate-500">เลือกแล้ว {riders.length} ตัว</span>
                </div>
                {riders.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {riders.map(r => (
                      <button key={r.code} type="button" onClick={() => setRiders(rs => rs.filter(x => x.code !== r.code))}
                        className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 text-[11px] border border-sky-200">
                        {r.code} {r.name} ✕
                      </button>
                    ))}
                  </div>
                )}
                <input value={rq} onChange={e => { setRq(e.target.value); setRPage(1); }} placeholder="ค้นหาสัญญาเพิ่มเติม เช่น เฮลท์, PA, อ.1"
                  className="mt-2 w-full px-3 py-2 rounded-xl border text-sm" />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>{rFiltered.length} แบบ · หมวด: {riderCats.join(' / ')} · หน้า {rSafePage}/{rTotalPages}</span>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => setRPage(p => Math.max(1, p - 1))} disabled={rSafePage === 1} className="px-2 py-1 rounded-lg border disabled:opacity-40">‹</button>
                    {Array.from({ length: rTotalPages }).slice(Math.max(0, rSafePage - 3), Math.max(0, rSafePage - 3) + 7).map((_, i) => {
                      const n = Math.max(0, rSafePage - 3) + i + 1;
                      return <button key={n} type="button" onClick={() => setRPage(n)} className={`px-2 py-1 rounded-lg border font-mono ${n === rSafePage ? 'bg-sky-600 text-white border-sky-600' : ''}`}>{n}</button>;
                    })}
                    <button type="button" onClick={() => setRPage(p => Math.min(rTotalPages, p + 1))} disabled={rSafePage === rTotalPages} className="px-2 py-1 rounded-lg border disabled:opacity-40">›</button>
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {rPaged.map((p: any) => {
                    const on = riders.some(r => r.code === p.c);
                    return (
                      <button key={p.c} type="button" onClick={() => toggleRider(p)}
                        className={`w-full text-left px-3 py-2 rounded-xl border hover:bg-slate-50 ${on ? 'border-sky-500 bg-sky-50' : ''}`}>
                        <span className={`inline-block w-4 text-center font-bold ${on ? 'text-sky-600' : 'text-slate-300'}`}>{on ? '✓' : '+'}</span>
                        <span className="font-mono font-bold text-sm">{p.c}</span>
                        <span className="ml-2 text-sm font-semibold">{p.n}</span>
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-slate-100">{p.cat}</span>
                      </button>
                    );
                  })}
                </div>
                {!picked && <div className="mt-2 text-[11px] text-amber-700">เลือกสัญญาหลักก่อน จึงจะทำสัญญาเพิ่มเติมได้</div>}
              </div>

              <div className="card p-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-600">
                  {picked ? <>สัญญาหลัก: <b className="font-mono">{picked.c}</b> {picked.n} · สัญญาเพิ่มเติม {riders.length} ตัว</> : 'ยังไม่ได้เลือกสัญญาหลัก'}
                </span>
                <button type="button" onClick={() => setStep(2)} disabled={!picked}
                  className="px-4 py-2 rounded-full bg-navy text-white text-xs disabled:opacity-40">ถัดไป: ทุน / อายุ / เพศ ›</button>
              </div>
            </div>
          )}

          {/* ── ขั้น 2: ทุน/อายุ/เพศ ── */}
          {step === 2 && (
            <div className="card p-4 space-y-3">
              <div className="text-sm font-semibold">
                แบบที่เลือก: <span className="font-mono">{picked?.c}</span> {picked?.n}
                <button type="button" onClick={() => setStep(1)} className="ml-2 text-[11px] underline text-navy">เปลี่ยนแบบ</button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>เพศ</span>
                {(['ชาย', 'หญิง'] as const).map(g => (
                  <button key={g} type="button" onClick={() => setGender(g)}
                    className={`px-3 py-1 rounded-full border ${gender === g ? 'bg-navy text-white border-navy' : 'bg-white'}`}>{g}</button>
                ))}
                <span className="mx-2 h-4 w-px bg-slate-200" />
                <label className="flex items-center gap-1">อายุ
                  <input value={age} onChange={e => setAge(e.target.value)} inputMode="numeric" className="w-16 px-2 py-1 rounded-lg border text-right font-mono" /> ปี
                </label>
                <label className="flex items-center gap-1">ทุนประกัน
                  <input value={cover} onChange={e => setCover(e.target.value)} inputMode="numeric" className="w-28 px-2 py-1 rounded-lg border text-right font-mono" /> บาท
                </label>
                <label className="flex items-center gap-1">ชำระเบี้ย
                  <input value={payYears} onChange={e => setPayYears(e.target.value)} inputMode="numeric" className="w-14 px-2 py-1 rounded-lg border text-right font-mono" /> ปี
                </label>
              </div>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {[500000, 1000000, 2000000, 3000000, 5000000].map(c => (
                  <button key={c} type="button" onClick={() => setCover(String(c))}
                    className={`px-2 py-0.5 rounded-full border ${coverNum === c ? 'bg-navy text-white border-navy' : 'bg-white'}`}>
                    {c >= 1000000 ? `${c / 1000000} ล้าน` : `${c / 1000}พัน`}
                  </button>
                ))}
              </div>
              {sample && (
                <PremiumPaymentPicture payYears={Number(payYears) || sample.payYears} premium={Math.round(coverNum * 0.05)}
                  cover={coverNum} rider={sample.rider} cashback={{ has: !!sample.cashback?.has, title: sample.cashback?.title }} />
              )}
              <div className="text-[11px] text-amber-700">
                เบี้ยในภาพเป็นการประมาณเพื่อให้เห็นภาพการจ่าย (5% ของทุน) — เบี้ยจริงต้องคำนวณใน TL PRO PLUS/ออกใบเสนอขาย
              </div>
              <button type="button" onClick={() => setStep(3)} className="px-4 py-2 rounded-full bg-navy text-white text-xs">ถัดไป: กรอกข้อมูลผู้เอาประกัน ›</button>
            </div>
          )}

          {/* ── ขั้น 3: ข้อมูลผู้เอาประกัน ── */}
          {step === 3 && (
            <div className="card p-4 space-y-3">
              <div className="text-sm font-semibold">ข้อมูลผู้เอาประกันภัย (ข้อมูลส่วนบุคคล — ใช้สำหรับออกใบเสนอขายเท่านั้น)</div>
              <div className="grid md:grid-cols-6 gap-2 text-xs">
                <select value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="px-2 py-2 rounded-xl border">
                  {TITLES.map(t => <option key={t}>{t}</option>)}
                </select>
                <input value={form.first} onChange={e => setForm({ ...form, first: e.target.value })} placeholder="ชื่อ" className="md:col-span-2 px-3 py-2 rounded-xl border" />
                <input value={form.last} onChange={e => setForm({ ...form, last: e.target.value })} placeholder="นามสกุล" className="md:col-span-2 px-3 py-2 rounded-xl border" />
                <input value={form.birth} onChange={e => setForm({ ...form, birth: e.target.value })} type="date" className="px-3 py-2 rounded-xl border" />
                <select value={form.occupation} onChange={e => setForm({ ...form, occupation: e.target.value })} className="md:col-span-3 px-2 py-2 rounded-xl border">
                  <option value="">อาชีพหลัก</option>
                  {OCCUPATIONS.map(o => <option key={o}>{o}</option>)}
                </select>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="เบอร์มือถือ" inputMode="numeric" className="md:col-span-1 px-3 py-2 rounded-xl border" />
                <input value={form.citizenId} onChange={e => setForm({ ...form, citizenId: e.target.value })} placeholder="เลขประจำตัวประชาชน 13 หลัก" inputMode="numeric" className="md:col-span-2 px-3 py-2 rounded-xl border" />
                <input value={form.beneficiary} onChange={e => setForm({ ...form, beneficiary: e.target.value })} placeholder="ชื่อผู้รับผลประโยชน์" className="md:col-span-2 px-3 py-2 rounded-xl border" />
                <select value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })} className="px-2 py-2 rounded-xl border">
                  {RELATIONS.map(r => <option key={r}>{r}</option>)}
                </select>
                <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="หมายเหตุ (เช่น สุขภาพ/ความต้องการพิเศษ)" className="md:col-span-6 px-3 py-2 rounded-xl border" />
              </div>
              <div className="rounded-xl border p-2 text-[11px] text-slate-600 bg-slate-50">
                ตัวแทนผู้รับเคส: <b>{AGENT.code}</b> · {AGENT.role} · ใบอนุญาตเลขที่ <b>{AGENT.license}</b>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-2 rounded-full border text-xs">‹ ย้อนกลับ</button>
                <button type="button" onClick={buildCase} className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs">สร้างลิงก์เคส ›</button>
              </div>
            </div>
          )}

          {/* ── ขั้น 4: ลิงก์เคส + สรุป ── */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="card p-4 border-l-4 border-emerald-600">
                <div className="text-sm font-semibold">ลิงก์เคสพร้อมข้อมูล (ส่งต่อให้ตัวแทน/เปิดทำใน TL PRO PLUS)</div>
                {caseLink ? (
                  <>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <input readOnly value={caseLink} className="flex-1 min-w-[280px] px-3 py-2 rounded-xl border text-[11px] font-mono" />
                      <button type="button" onClick={copyLink} className="px-4 py-2 rounded-full bg-navy text-white text-xs">{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}</button>
                      <button type="button" onClick={() => window.print()} className="px-4 py-2 rounded-full border text-xs">พิมพ์/PDF</button>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      ข้อมูลทั้งหมดถูกเข้ารหัสอยู่ในตัวลิงก์ (หลัง #) — ไม่ถูกส่งหรือเก็บไว้บนเซิร์ฟเวอร์ · เปิดลิงก์ซ้ำได้ ระบบจะกรอกข้อมูลเดิมให้
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-amber-700 mt-1">ยังไม่มีลิงก์ — กลับไปกรอกข้อมูลให้ครบที่ขั้น 3</div>
                )}
              </div>

              <div className="card p-4 border-l-4 border-navy">
                <div className="text-sm font-semibold">บันทึกเคสเข้าฐานข้อมูล (มีเลขเคสค้นย้อนหลัง)</div>
                {saved ? (
                  <div className="mt-1 text-[12px]">
                    บันทึกแล้ว: <b className="font-mono">{saved.caseNo}</b> ·{' '}
                    <a className="underline text-navy" href={saved.url}>เปิดหน้าเคส</a> ·{' '}
                    <a className="underline text-navy" href="/cases">ดูรายการเคสทั้งหมด</a>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={saveCase} disabled={saving}
                      className="px-4 py-2 rounded-full bg-navy text-white text-xs disabled:opacity-50">
                      {saving ? 'กำลังบันทึก…' : 'บันทึกเคส (เข้ารหัส + ออกเลขเคส)'}
                    </button>
                    <span className="text-[11px] text-slate-500">
                      เก็บข้อมูลผู้เอาประกันแบบเข้ารหัส AES-256-GCM · เข้าถึงเฉพาะเจ้าของ/หัวหน้าหน่วย · ลบอัตโนมัติ 180 วัน · มี audit log
                    </span>
                  </div>
                )}
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold">สรุปเคส</div>
                <table className="mt-2 w-full text-[11px]">
                  <tbody>
                    {[
                      ['สัญญาหลัก', `${picked?.c} ${picked?.n} (${picked?.cat})`],
                      ['สัญญาเพิ่มเติม / อนุสัญญา', riders.length ? riders.map(r => `${r.code} ${r.name}`).join(' + ') : '— ไม่ได้เลือก'],
                      ['ทุนประกัน', `฿${fmt(coverNum)}`],
                      ['เพศ / อายุ', `${gender} / ${ageNum} ปี`],
                      ['ระยะชำระเบี้ย', `${payYears} ปี`],
                      ['ผู้เอาประกันภัย', `${form.title}${form.first} ${form.last}`],
                      ['วันเกิด', form.birth || '-'],
                      ['อาชีพ', form.occupation || '-'],
                      ['เบอร์มือถือ', form.phone || '-'],
                      ['เลขประจำตัวประชาชน', form.citizenId || '-'],
                      ['ผู้รับผลประโยชน์', `${form.beneficiary} (${form.relation})`],
                      ['ตัวแทน', `${AGENT.code} · ${AGENT.role} · ใบอนุญาต ${AGENT.license}`],
                    ].map(([k, v]) => (
                      <tr key={k} className="border-b last:border-0">
                        <td className="py-1 pr-3 text-slate-500 w-40">{k}</td>
                        <td className="py-1 font-medium">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sample && (
                  <PremiumPaymentPicture payYears={Number(payYears) || sample.payYears} premium={Math.round(coverNum * 0.05)}
                    cover={coverNum} rider={sample.rider} cashback={{ has: !!sample.cashback?.has, title: sample.cashback?.title }} />
                )}
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-slate-700">ผลประโยชน์ (โครงสร้างตัวอย่าง)</div>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                    {(sample?.benefits || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
                <div className="mt-2">
                  <div className="text-[11px] font-semibold text-slate-700">เงินคืนระหว่างสัญญา / การจ่ายผลประโยชน์</div>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                    {(sample?.cashback?.lines || []).map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              </div>

              <div className="card p-4 border-l-4 border-amber-500">
                <div className="text-sm font-semibold">ขั้นตอนซื้อจริง (ทำในแอป TL PRO PLUS)</div>
                <ol className="mt-1 list-decimal pl-5 text-[11px] text-slate-600 space-y-0.5">
                  <li>เปิด TL PRO PLUS → แท็บ “คำนวณเบี้ย / ใบเสนอขาย”</li>
                  <li>เลือกแบบ <b className="font-mono">{picked?.c}</b> · ใส่ทุน ฿{fmt(coverNum)} · ระยะชำระเบี้ย {payYears} ปี · {gender} อายุ {ageNum} ปี</li>
                  <li>กรอกข้อมูลผู้เอาประกันตาม “สรุปเคส” ด้านบน (กด “คัดลอกข้อมูล” ได้)</li>
                  <li>ตรวจสุขภาพ/แนบเอกสาร → ออกใบเสนอขาย → ยื่นคำขอ (ตัวแทน {AGENT.code} · ใบอนุญาต {AGENT.license})</li>
                </ol>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => { navigator.clipboard.writeText(plainText()); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="px-4 py-2 rounded-full bg-navy text-white text-xs">คัดลอกข้อมูล (ข้อความ)</button>
                  <button type="button" onClick={() => { setStep(1); setPicked(null); setCaseLink(''); }} className="px-4 py-2 rounded-full border text-xs">เริ่มเคสใหม่</button>
                </div>
                <div className="text-[11px] text-amber-700 mt-2">
                  ลิงก์นี้เป็น “ใบงานภายใน” ที่บรรจุข้อมูลเคสครบ ไม่ใช่ระบบยื่นคำขอของบริษัท — การสั่งซื้อ/ออกกรมธรรม์ทำได้เฉพาะในแอป TL PRO PLUS ด้วยรหัสตัวแทนของท่าน
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
