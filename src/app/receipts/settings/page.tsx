'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// เมนูตั้งค่าใบเสร็จ — ดูได้เมื่อล็อกอิน, เปลี่ยนได้เฉพาะผู้บริหารระบบ / Admin Akarapol
export default function ReceiptSettingsPage(){
  const [form, setForm] = useState({ maxAmount:'1000000', autoVerifyLimit:'20000', requirePolicyNo:false, defaultLedgerType:'premium', allowedTypes:['premium','commission'] as string[], countPremiumForRank:true, autoEvaluateAfterVerify:true, maskPayerName:true });
  const [plan, setPlan] = useState<any>(null);
  const [std, setStd] = useState<any>(null);
  const [rankSources, setRankSources] = useState<string[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(){
    try{
      const r = await fetch('/api/receipts/settings',{credentials:'include'});
      const j = await r.json();
      if(j.ok){
        const s = j.settings;
        setForm({
          maxAmount: String(s.maxAmount ?? 1000000),
          autoVerifyLimit: String(s.autoVerifyLimit ?? 20000),
          requirePolicyNo: !!s.requirePolicyNo,
          defaultLedgerType: s.defaultLedgerType || 'premium',
          allowedTypes: s.allowedTypes || ['premium','commission'],
          countPremiumForRank: s.countPremiumForRank !== false,
          autoEvaluateAfterVerify: s.autoEvaluateAfterVerify !== false,
          maskPayerName: s.maskPayerName !== false,
        });
        setCanEdit(!!j.canEdit);
        setPlan(j.activePlan || null);
        setStd(j.receiptStandard || null);
        setRankSources(j.rankSources || []);
      } else setMsg(j.error || 'โหลดไม่สำเร็จ');
    }catch{ setMsg('โหลดไม่สำเร็จ'); }
  }
  useEffect(()=>{ load(); },[]);

  function toggleType(t:string){
    setForm(f=> ({ ...f, allowedTypes: f.allowedTypes.includes(t) ? f.allowedTypes.filter(x=> x!==t) : [...f.allowedTypes, t] }));
  }

  async function save(){
    setLoading(true); setMsg('');
    try{
      const res = await fetch('/api/receipts/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        maxAmount: Number(form.maxAmount), autoVerifyLimit: Number(form.autoVerifyLimit),
        requirePolicyNo: form.requirePolicyNo, defaultLedgerType: form.defaultLedgerType, allowedTypes: form.allowedTypes,
        countPremiumForRank: form.countPremiumForRank, autoEvaluateAfterVerify: form.autoEvaluateAfterVerify, maskPayerName: form.maskPayerName,
      }) });
      const j = await res.json();
      setMsg(j.ok ? 'บันทึกค่าตั้งค่าใบเสร็จแล้ว — มีผลทันที' : (j.error || 'บันทึกไม่สำเร็จ'));
      if(j.ok) load();
    }catch{ setMsg('บันทึกไม่สำเร็จ'); }
    setLoading(false);
  }

  const inp = "w-full px-3 py-2 rounded-xl border text-sm";
  const dis = !canEdit;

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <h1 className="text-xl font-bold text-navy">ตั้งค่าใบเสร็จ</h1>
          <p className="text-xs text-slate-500">กำหนดค่าใบเสร็จลงระบบ — มีผลกับการส่งตรวจ/รับรองยอดทันที {canEdit ? '' : '• ดูได้อย่างเดียว (เปลี่ยนได้เฉพาะผู้บริหารระบบ)'}</p>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
          <div className="card p-5 space-y-3">
            <div>
              <label className="text-xs font-semibold">เพดานรับรองต่อใบ (บาท)</label>
              <input value={form.maxAmount} onChange={e=> setForm({...form, maxAmount:e.target.value})} inputMode="numeric" disabled={dis} className={`${inp} mt-1`} />
              <div className="text-[11px] text-slate-500 mt-1">ยอดเกินนี้กดรับรองไม่ผ่าน (ค่าที่แนะนำ 1,000,000 — ใบเสร็จเบี้ยจริงมักหลักหมื่นถึงแสน)</div>
            </div>
            <div>
              <label className="text-xs font-semibold">รับรองอัตโนมัติเมื่อยอดไม่เกิน (บาท, 0 = ปิด)</label>
              <input value={form.autoVerifyLimit} onChange={e=> setForm({...form, autoVerifyLimit:e.target.value})} inputMode="numeric" disabled={dis} className={`${inp} mt-1`} />
              <div className="text-[11px] text-slate-500 mt-1">ยอดไม่เกินนี้ + OCR มั่นใจ ≥ 0.8 + ประเภทเบี้ย = รับรองทันทีตอนส่งตรวจ</div>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.requirePolicyNo} onChange={e=> setForm({...form, requirePolicyNo:e.target.checked})} disabled={dis} />
              บังคับเลขกรมธรรม์ก่อนส่งตรวจ
            </label>
            <div>
              <label className="text-xs font-semibold">ประเภทผลงานเริ่มต้น</label>
              <select value={form.defaultLedgerType} onChange={e=> setForm({...form, defaultLedgerType:e.target.value})} disabled={dis} className={`${inp} mt-1`}>
                <option value="premium">เบี้ยประกัน</option>
                <option value="commission">ค่าบำเหน็จ</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">ประเภทที่อนุญาต</label>
              <div className="mt-1 flex gap-3 text-xs">
                {['premium','commission'].map(t=>(
                  <label key={t} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={form.allowedTypes.includes(t)} onChange={()=> toggleType(t)} disabled={dis} />
                    {t==='premium' ? 'เบี้ยประกัน' : 'ค่าบำเหน็จ'}
                  </label>
                ))}
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="text-xs font-semibold">ระบบขึ้นตำแหน่งด้วยใบเสร็จ</div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.countPremiumForRank} onChange={e=> setForm({...form, countPremiumForRank:e.target.checked})} disabled={dis} />
                นับเบี้ยจากใบเสร็จที่รับรองแล้วเป็นผลงานขึ้นตำแหน่ง (ใช้กับแผนที่กำหนดเกณฑ์เป็นค่าบำเหน็จ)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.autoEvaluateAfterVerify} onChange={e=> setForm({...form, autoEvaluateAfterVerify:e.target.checked})} disabled={dis} />
                รับรองยอดแล้วประเมิน/เลื่อนตำแหน่งให้ทันที (ไม่ต้องรอตรวจรอบ)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.maskPayerName} onChange={e=> setForm({...form, maskPayerName:e.target.checked})} disabled={dis} />
                ปิดข้อมูลส่วนบุคคล (PDPA): ไม่เก็บชื่อผู้ชำระเงินเต็ม และไม่เก็บเลขบัญชี/เลขบัตร
              </label>
              <div className="text-[11px] text-slate-500">แหล่งผลงานที่ใช้ประเมินตำแหน่งตอนนี้: <b>{rankSources.join(' + ') || '-'}</b></div>
            </div>

            {plan && (
              <div className="rounded-xl border bg-slate-50 p-3 text-[11px] space-y-1">
                <div className="font-semibold text-slate-700">เกณฑ์ขึ้นตำแหน่งที่ใช้อยู่ (แผน Active: {plan.version || String(plan.id||'').slice(0,8)})</div>
                {(plan.rules || []).map((r:any)=>(
                  <div key={r.targetRank} className="text-slate-600">
                    ระดับ {r.targetRank}: {r.personalMin ? `ผลงานส่วนตัว ≥ ${Number(r.personalMin).toLocaleString()}` : 'ไม่กำหนดยอดส่วนตัว'}
                    {r.qualifiedUnits ? ` · หน่วย ≥ ${r.qualifiedUnits}` : ''}
                    {r.qualifiedCenters ? ` · ศูนย์ ≥ ${r.qualifiedCenters}` : ''}
                    {r.durationMinMonths ? ` · อยู่ในตำแหน่ง ≥ ${r.durationMinMonths} เดือน` : ''}
                    {r.licenseRequired ? ' · ต้องมีใบอนุญาตที่อนุมัติแล้ว' : ''}
                    {r.evalType === 'approval' ? ' · ต้องอนุมัติ' : ' · อัตโนมัติ'}
                    {` · วัดจาก ${r.metric}`}
                  </div>
                ))}
              </div>
            )}

            {std && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] space-y-1">
                <div className="font-semibold text-emerald-800">📌 มาตรฐานใบเสร็จที่ระบบยึดถือตอนสมาชิกสแกนเข้าร่วม ({std.version})</div>
                <div className="text-emerald-900">{std.title}</div>
                <div className="text-emerald-800">ช่องทางที่รับ: {(std.acceptedChannels || []).join(' · ')}</div>
                <div className="text-emerald-800">ฟิลด์บังคับ: {(std.required || []).map((r:any)=> r.label).join(' · ')}</div>
                <div className="text-emerald-700">ควรมี: {(std.recommended || []).map((r:any)=> r.label).join(' · ')} (ถ้าขาด = เตือน ไม่บล็อก)</div>
                <div className="text-emerald-700">ใบที่ไม่ตรงมาตรฐานจะส่งตรวจ/รับรองไม่ได้ (ผู้ดูแลใช้ force เพื่อรับรองข้อยกเว้นได้ — มีบันทึกผู้รับรอง)</div>
              </div>
            )}

            {canEdit && (
              <button onClick={save} disabled={loading} className="px-6 py-2 rounded-full bg-navy text-white text-sm disabled:opacity-50">
                {loading ? 'กำลังบันทึก...' : 'บันทึกค่า'}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
