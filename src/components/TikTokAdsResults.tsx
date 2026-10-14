'use client';
// TikTokAdsResults — "ผลการทำงานโฆษณา TikTok" (แสดงล่างสุดของหน้า /expand-team)
//
// คำสั่งเจ้าของระบบ (13 ต.ค. 2026): "ให้แสดงผลการทำงานนี้ในหน้านี้ เอาไว้ล่างสุด"
//   อ้างถึงหน้า TikTok Ads Manager → Campaigns ของบัญชีจริง (aadvid 7251807874932883457)
//
// กติกาที่โค้ดนี้ยึด:
//  1) ตัวเลขทุกช่องต้องมาจาก "ของจริง" เท่านั้น — บัญชีนี้ยังไม่มีสิทธิ์ Marketing API
//     จึงอ่านจากหน้า Ads Manager แล้วเก็บเป็น snapshot (src/lib/tiktokAdsSnapshot.json)
//     พร้อมระบุเวลาที่จับข้อมูลและแนบภาพหน้าจอจริงเป็นหลักฐาน
//  2) ช่องที่ยังไม่มีค่าจริง = "ยังไม่มีข้อมูล" (ไม่ใส่ 0 แทน เพราะแคมเปญยังไม่เริ่มใช้จ่าย)
//  3) เมื่อบัญชีได้รับสิทธิ์ API แล้ว ปุ่ม "ดึงรายงานจาก API" จะทำงานได้ทันที (ตอนนี้จะบอกตรง ๆ ว่ายังไม่มีสิทธิ์)
import { useState } from 'react';
import { useT } from '@/i18n';
import snap from '@/lib/tiktokAdsSnapshot.json';

type Any = Record<string, any>;

export default function TikTokAdsResults() {
  const { lang } = useT();
  const L = (th: string, en: string) => (lang === 'en' ? en : th);
  const s: Any = snap as Any;
  const c: Any = s.campaign || {};
  const [busy, setBusy] = useState(false);
  const [apiMsg, setApiMsg] = useState('');

  const captured = (() => {
    try { return new Date(String(s.capturedAt)).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch { return String(s.capturedAt); }
  })();

  const statusStyle = (st: string) => {
    const v = String(st || '').toUpperCase();
    if (v.includes('REVIEW')) return 'bg-amber-50 border-amber-200 text-amber-700';
    if (v.includes('ACTIVE')) return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    if (v.includes('REJECT') || v.includes('ERROR')) return 'bg-rose-50 border-rose-200 text-rose-700';
    return 'bg-slate-50 border-slate-200 text-slate-600';
  };

  async function pullFromApi() {
    setBusy(true); setApiMsg('');
    try {
      const r = await fetch(`/api/ads/campaigns?action=report&from=${c.startDate}&to=${new Date().toISOString().slice(0, 10)}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      setApiMsg(j?.ok
        ? L(`ดึงรายงานจาก API สำเร็จ — ${(j.rows || []).length} แถว`, `Report pulled from the API — ${(j.rows || []).length} rows`)
        : L(`ยังดึงจาก API ไม่ได้: ${String(j?.error || 'ไม่ทราบสาเหตุ')}`, `Cannot pull from the API yet: ${String(j?.error || 'unknown')}`));
    } catch (e) {
      setApiMsg(L(`เรียกเซิร์ฟเวอร์ไม่สำเร็จ: ${(e as Error).message}`, `Server call failed: ${(e as Error).message}`));
    }
    setBusy(false);
    setTimeout(() => setApiMsg(''), 9000);
  }

  const metrics: { label: string; value: string }[] = (Array.isArray(c.metrics) ? c.metrics : []).map((m: Any) => ({
    label: String(m.label || ''),
    value: m.value === null || m.value === undefined || m.value === '' ? L('ยังไม่มีข้อมูล', 'No data yet') : String(m.value),
  }));

  const chip = 'text-[11px] px-2.5 py-1 rounded-full border';

  return (
    <section className="pt-2" id="tiktok-ads-results">
      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-navy">📈 {L('ผลการทำงานโฆษณา TikTok', 'TikTok ad performance')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {L('แคมเปญที่ยิงจริงจาก Ads Manager ของบัญชีเรา — สรุปสถานะและตัวชี้วัดไว้ที่ล่างสุดของหน้านี้',
                 'The campaign we actually launched from our Ads Manager account — status and metrics summarised at the bottom of this page')}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <span className={`${chip} ${statusStyle(c.status)} font-semibold`}>● {L(String(c.statusTh || c.status), String(c.status))}</span>
            <span className={`${chip} bg-white border-[#dbeafe] text-slate-600`}>🏦 {String(s.accountName || '')} · aadvid {String(s.advertiserId || '')}</span>
            {s.accountSnapshot?.availableBalanceThb != null && (
              <span className={`${chip} bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold`}>
                {L('ยอดคงเหลือ', 'Balance')} ฿{Number(s.accountSnapshot.availableBalanceThb).toLocaleString('th-TH')}
              </span>
            )}
            {s.accountSnapshot?.todaySpendThb != null && (
              <span className={`${chip} bg-[#eff6ff] border-[#dbeafe] text-sky-700 font-semibold`}>
                {L('ใช้ไปวันนี้', 'Spent today')} ฿{Number(s.accountSnapshot.todaySpendThb).toLocaleString('th-TH')}
              </span>
            )}
          </div>
        </div>

        {/* การ์ดแคมเปญ */}
        <div className="rounded-xl bg-white border border-[#dbeafe] p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-navy font-mono">{String(c.name || '-')}</span>
            <span className={`${chip} bg-[#eff6ff] border-[#dbeafe] text-sky-700`}>{L(String(c.objectiveTh || c.objective), String(c.objective))}</span>
            <span className={`${chip} bg-white border-[#dbeafe] text-slate-600`}>{L('งบ', 'Budget')} ฿{String(c.dailyBudgetThb ?? '-')}/{L('วัน', 'day')}</span>
            <span className={`${chip} bg-white border-[#dbeafe] text-slate-600`}>{String(c.startDate || '')} → {String(c.endDate || '')}</span>
          </div>
          <div className="grid md:grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div className="rounded-lg bg-[#f8fbff] border border-[#dbeafe] p-2.5">
              <div><b>{L('โฆษณา', 'Ad')}:</b> {String(c.adName || '-')}</div>
              <div><b>{L('ครีเอทีฟ', 'Creative')}:</b> {String(c.creative || '-')}</div>
              <div><b>{L('ปุ่ม Call to Action', 'Call to action')}:</b> {String(c.callToAction || '-')}</div>
            </div>
            <div className="rounded-lg bg-[#f8fbff] border border-[#dbeafe] p-2.5">
              <div><b>{L('ปลายทาง', 'Destination')}:</b> <a href={String(c.landingPage || '')} target="_blank" rel="noreferrer" className="text-sky-700 underline break-all">{String(c.landingPage || '-')}</a></div>
              <div><b>{L('พื้นที่/ตำแหน่ง', 'Area & placements')}:</b> {String(c.location || '-')} · {String(c.placements || '-')}</div>
              <div><b>{L('ช่วงอายุ', 'Age range')}:</b> {String(c.ageRange || '-')}</div>
            </div>
          </div>
        </div>

        {/* ตัวชี้วัด */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-xl bg-white border border-[#dbeafe] p-3">
              <div className="text-[11px] text-slate-500">{m.label}</div>
              <div className={`text-sm font-bold mt-1 ${m.value === L('ยังไม่มีข้อมูล', 'No data yet') ? 'text-slate-400' : 'text-navy'}`}>{m.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">{String(c.metricsNote || '')}</div>

        {/* หลักฐานจาก Ads Manager */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            {L(`หลักฐานจาก TikTok Ads Manager — จับข้อมูลเมื่อ ${captured}`, `Evidence from TikTok Ads Manager — captured ${captured}`)}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {(s.evidence || []).map((e: Any, i: number) => (
              <figure key={i} className="m-0 rounded-xl border border-[#dbeafe] bg-white overflow-hidden">
                <img src={String(e.file)} alt={String(e.caption)} className="w-full h-auto block" />
                <figcaption className="text-[11px] text-slate-600 p-2.5 border-t border-[#dbeafe]">{String(e.caption)}</figcaption>
              </figure>
            ))}
          </div>
          <div className="text-[11px] text-slate-500">{String(s.source || '')}</div>
        </div>

        {(s.notes || []).length > 0 && (
          <div className="rounded-xl bg-slate-50 border border-[#dbeafe] p-3 text-[11px] text-slate-500 space-y-1">
            {(s.notes || []).map((n: string, i: number) => <div key={i}>• {n}</div>)}
          </div>
        )}

        <div className="flex gap-2 flex-wrap border-t border-[#dbeafe] pt-3">
          <a href={String(s.managerUrl || '')} target="_blank" rel="noreferrer" className="text-xs px-3 py-2 rounded-full bg-navy text-white">
            ↗ {L('เปิดแคมเปญนี้ใน TikTok Ads Manager', 'Open this campaign in TikTok Ads Manager')}
          </a>
          <button onClick={pullFromApi} disabled={busy} className="text-xs px-3 py-2 rounded-full border border-[#dbeafe] bg-white text-slate-700 disabled:opacity-50">
            {busy ? '…' : `↻ ${L('ดึงรายงานจาก API ล่าสุด', 'Pull the latest report from the API')}`}
          </button>
          <span className={`${chip} bg-white border-[#dbeafe] text-slate-600`}>
            {L(`แคมเปญทั้งหมดในบัญชี: ${s.totalCampaignsInAccount ?? '-'}`, `Campaigns in account: ${s.totalCampaignsInAccount ?? '-'}`)}
          </span>
        </div>
        {apiMsg && <div className="rounded-xl bg-[#eff6ff] border border-[#dbeafe] p-3 text-[11px] text-sky-900">{apiMsg}</div>}
      </div>
      <div className="rounded-xl bg-slate-50 border border-[#dbeafe] p-3 text-[11px] text-slate-500 mt-3">
        {L('โฆษณาต้องไม่รับประกันรายได้หรือผลตอบแทน · คลิปที่ใช้เป็นของเจ้าของบัญชีเอง · ห้ามใช้ข้อมูลอ่อนไหวหรือกำหนดเป้าหมายแบบเลือกปฏิบัติ · ตัวเลขทั้งหมดจะอัปเดตอัตโนมัติเมื่อบัญชีได้รับสิทธิ์ Marketing API',
           'Ads make no income or return promises · the creative is our own · no sensitive data or discriminatory targeting · all metrics will update automatically once the account is granted Marketing API access')}
      </div>
    </section>
  );
}
