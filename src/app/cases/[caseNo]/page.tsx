'use client';
// รายละเอียดเคสทำประกัน (ถอดรหัสฝั่งเซิร์ฟเวอร์ เฉพาะผู้มีสิทธิ์) + เปลี่ยนสถานะ + พิมพ์
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { buildProjectSamples } from '@/lib/projectSamples';

const fmt = (n: number) => Number(n || 0).toLocaleString('th-TH');
const STATUS: Record<string, string> = { DRAFT: 'ฉบับร่าง', SENT: 'ส่งใบเสนอขายแล้ว', ISSUED: 'ออกกรมธรรม์แล้ว', CANCELLED: 'ยกเลิก' };

export default function CaseDetailPage() {
  const params = useParams<{ caseNo: string }>();
  const caseNo = String(params?.caseNo || '');
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<any>(null);

  async function load() {
    try {
      const r = await fetch(`/api/insurance-cases/${encodeURIComponent(caseNo)}`, { credentials: 'include' });
      const j = await r.json();
      if (j.ok) { setData(j); setMsg(''); } else setMsg(j.error || 'เปิดเคสไม่สำเร็จ');
    } catch { setMsg('เปิดเคสไม่สำเร็จ'); }
  }
  useEffect(() => { if (caseNo) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [caseNo]);

  useEffect(() => {
    if (!data?.case) return;
    const c = data.case;
    (async () => {
      try {
        const r = await fetch('/api/commissions?q=' + encodeURIComponent(c.productCode), { credentials: 'include' });
        const j = await r.json();
        if (j.ok) {
          const p = (j.products || []).find((x: any) => x.c === c.productCode);
          if (p) setSample(buildProjectSamples([p], { startGender: c.gender, age: c.age, cover: c.cover })[0]);
        }
      } catch { /* ไม่เป็นไร — แสดงเฉพาะข้อมูลเคส */ }
    })();
  }, [data]);

  async function setStatus(status: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/insurance-cases/${encodeURIComponent(caseNo)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status }),
      });
      const j = await r.json();
      if (j.ok) await load(); else setMsg(j.error || 'เปลี่ยนสถานะไม่สำเร็จ');
    } catch { setMsg('เปลี่ยนสถานะไม่สำเร็จ'); }
    setBusy(false);
  }

  const c = data?.case;
  const a = data?.applicant;

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-navy">เคส <span className="font-mono">{caseNo}</span></h1>
              <p className="text-xs text-slate-500 mt-1">ข้อมูลผู้เอาประกันถูกถอดรหัสเพื่อแสดงผล — การเปิดเคสครั้งนี้ถูกบันทึกใน log</p>
            </div>
            <div className="flex gap-2">
              <Link href="/cases" className="px-3 py-2 rounded-full border text-xs">‹ รายการเคส</Link>
              <button type="button" onClick={() => window.print()} className="px-3 py-2 rounded-full bg-navy text-white text-xs">พิมพ์/PDF</button>
            </div>
          </div>

          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
          {!c && !msg && <div className="card p-4 text-xs text-slate-400">กำลังโหลด…</div>}

          {c && (
            <div className="card p-4">
              <div className="grid md:grid-cols-2 gap-3 text-[12px]">
                <div className="space-y-1">
                  <div className="font-semibold text-sm">สัญญาหลัก</div>
                  <div>{c.productCode} — {c.productName} <span className="text-slate-500">({c.productCat})</span></div>
                  <div>ทุนประกัน <b>฿{fmt(c.cover)}</b> · ชำระเบี้ย {c.payYears} ปี</div>
                  <div>ผู้เอาประกัน: {c.gender} · อายุ {c.age} ปี</div>
                  <div className="pt-1 font-semibold text-sm">สัญญาเพิ่มเติม / อนุสัญญา</div>
                  <div>{Array.isArray(c.riders) && c.riders.length ? c.riders.map((r: any) => `${r.code} ${r.name}`).join(' + ') : '— ไม่ได้เลือก'}</div>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-sm">ผู้เอาประกันภัย</div>
                  {a ? (
                    <>
                      <div>{a.title}{a.first} {a.last} · วันเกิด {a.birth || '-'} · อาชีพ {a.occupation || '-'}</div>
                      <div>มือถือ {a.phone} · เลขบัตร {a.citizenId}</div>
                      <div>ผู้รับผลประโยชน์ {a.beneficiary} ({a.relation})</div>
                      {a.note ? <div className="text-slate-600">หมายเหตุ: {a.note}</div> : null}
                    </>
                  ) : <div className="text-amber-700">ถอดรหัสข้อมูลไม่สำเร็จ (กุญแจ CASE_SECRET เปลี่ยน?) — ข้อมูลยังอยู่แต่ต้องใช้กุญแจเดิม</div>}
                  <div className="pt-1">ตัวแทน: <b>{c.agentCode}</b> · ใบอนุญาต 6801062317</div>
                  <div>สร้างเมื่อ {new Date(c.createdAt).toLocaleString('th-TH')} · ลบอัตโนมัติ {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('th-TH') : '-'}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                <span>สถานะ: <b>{STATUS[c.status] || c.status}</b></span>
                {['DRAFT', 'SENT', 'ISSUED', 'CANCELLED'].map(s => (
                  <button key={s} type="button" disabled={busy || c.status === s} onClick={() => setStatus(s)}
                    className={`px-3 py-1 rounded-full border disabled:opacity-40 ${c.status === s ? 'bg-navy text-white border-navy' : 'bg-white'}`}>
                    {STATUS[s]}
                  </button>
                ))}
              </div>

              {sample && (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-slate-700">ผลประโยชน์ (โครงสร้างตัวอย่าง)</div>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                    {sample.benefits.map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ul>
                  <div className="mt-2 text-[11px] font-semibold text-slate-700">เงินคืนระหว่างสัญญา / การจ่ายผลประโยชน์</div>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                    {sample.cashback.lines.map((b: string, i: number) => <li key={i}>{b}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
