'use client';
// JoinSignupsPanel — รายชื่อ + รหัส ของ "คนที่สมัครเข้าใช้ app จากลิงก์ /join"
// แสดงบนหน้า /notifications ตามคำสั่งเจ้าของระบบ
// ที่มา: /api/dashboard/leads (ต้องล็อกอิน) · กรองด้วย source ที่ขึ้นต้นด้วย app_signup (ลิงก์ /join)
// PDPA: เบอร์โทรแสดงแบบปิดบังบางส่วน
import { useEffect, useMemo, useState } from 'react';

type Lead = {
  id: string; prospectCode?: string; prospectId?: string; name?: string; firstName?: string; lastName?: string;
  phone?: string | null; email?: string | null; province?: string | null; occupation?: string | null;
  ageRange?: string | null; interest?: string | null; topics?: string[]; source?: string | null; sourceName?: string | null;
  status?: string; createdAt?: string; score?: number; leadScore?: number;
};

function maskPhone(p?: string | null): string {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '-';
  if (d.length < 8) return d;
  return `${d.slice(0, 3)}-${'x'.repeat(Math.max(1, d.length - 6))}-${d.slice(-3)}`;
}
function fmtDate(v?: string): string {
  if (!v) return '-';
  try { return new Date(v).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }); } catch { return '-'; }
}

export default function JoinSignupsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'join' | 'all'>('join');
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState('');
  const [scope, setScope] = useState<'all' | 'mine'>('mine');
  const [meInfo, setMeInfo] = useState<{ code: string; ip: string; ipMasked: string }>({ code: '', ip: '', ipMasked: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr('');
      try {
        const r = await fetch('/api/dashboard/leads?limit=500', { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.ok === false) { setErr(j?.error || 'โหลดรายชื่อไม่สำเร็จ'); return; }
        const list: Lead[] = j?.leads || j?.data || j?.items || [];
        if (alive) {
          setLeads(list);
          if (j?.scope === 'all' || j?.scope === 'mine') setScope(j.scope);
        }
      } catch {
        if (alive) setErr('เชื่อมต่อไม่สำเร็จ');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // รหัสของตัวเอง (memberCode/referralCode) + IP ของตัวเอง
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [a, b] = await Promise.all([
          fetch('/api/auth/me', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/me/ip', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (!alive) return;
        const u = a?.user || a || {};
        const code = String(u.memberCode || u.referralCode || '').toUpperCase();
        setMeInfo({ code, ip: String(b?.ip || ''), ipMasked: String(b?.masked || '') });
      } catch { /* ไม่ล็อกอิน/เน็ตหลุด = ไม่แสดง */ }
    })();
    return () => { alive = false; };
  }, []);

  const joinLeads = useMemo(
    () => leads.filter((l) => /^app_signup/i.test(String(l.source || l.sourceName || ''))),
    [leads],
  );

  const rows = useMemo(() => {
    const base = filter === 'join' ? joinLeads : leads;
    const k = q.trim().toLowerCase();
    if (!k) return base;
    return base.filter((l) =>
      [l.name, l.firstName, l.lastName, l.prospectCode, l.phone, l.province, l.occupation, l.interest]
        .filter(Boolean).join(' ').toLowerCase().includes(k),
    );
  }, [filter, joinLeads, leads, q]);

  async function copy(code?: string) {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 2000); } catch {}
  }

  const badge = (n: number, active: boolean) =>
    `rounded-full px-3 py-1 text-[11px] font-semibold ${active ? 'bg-[#0b2b5b] text-white' : 'border bg-white text-slate-600'}`;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#475569]">📥 ผู้สนใจที่สมัครจากลิงก์ /join</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            รายชื่อและ <b>รหัสผู้สนใจ (P-XXXXXX)</b> ของคนที่กรอกฟอร์ม “สมัครเข้าใช้ app” ·
            เบอร์โทรแสดงแบบปิดบังตาม PDPA · ข้อมูลเต็มดูได้ที่หน้ารายชื่อผู้สนใจ
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {meInfo.code && (
            <span className="rounded-full border bg-white px-2.5 py-1 text-[10px] text-slate-600">
              รหัสของคุณ: <b className="font-mono text-[#0b2b5b]">{meInfo.code}</b>
            </span>
          )}
          {meInfo.ipMasked && (
            <span className="rounded-full border bg-white px-2.5 py-1 text-[10px] text-slate-600" title={`IP ของคุณ (${meInfo.ip})`}>
              IP ของคุณ: <b className="font-mono text-[#0b2b5b]">{meInfo.ipMasked}</b>
            </span>
          )}
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${scope === 'all' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
            {scope === 'all' ? 'เห็นทุกรหัส (ผู้ดูแลระบบ)' : 'เห็นเฉพาะรหัสของคุณ'}
          </span>
          <button type="button" className={badge(joinLeads.length, filter === 'join')} onClick={() => setFilter('join')}>
            จากลิงก์ /join ({joinLeads.length})
          </button>
          <button type="button" className={badge(leads.length, filter === 'all')} onClick={() => setFilter('all')}>
            ผู้สนใจทั้งหมด ({leads.length})
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา ชื่อ / รหัส P- / เบอร์ / จังหวัด"
          className="min-w-[220px] flex-1 rounded-xl border px-3 py-2 text-xs"
        />
        <a href="/join?src=keyman" target="_blank" rel="noreferrer" className="rounded-full border px-3 py-2 text-[11px] font-semibold text-slate-700 no-underline">
          เปิดหน้าลิงก์ /join ↗
        </a>
      </div>

      {err && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{err}</p>}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b py-1.5 pr-2 font-semibold">#</th>
              <th className="border-b py-1.5 pr-2 font-semibold">ชื่อ</th>
              <th className="border-b py-1.5 pr-2 font-semibold">รหัสผู้สนใจ</th>
              <th className="border-b py-1.5 pr-2 font-semibold">เบอร์ (ปิดบัง)</th>
              <th className="border-b py-1.5 pr-2 font-semibold">ความสนใจ</th>
              <th className="border-b py-1.5 pr-2 font-semibold">ที่มา</th>
              <th className="border-b py-1.5 pr-2 font-semibold">สมัครเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="py-3 text-slate-500">กำลังโหลด…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-slate-500">
                  {filter === 'join'
                    ? 'ยังไม่มีคนสมัครจากลิงก์ /join — แชร์ลิงก์ได้ที่การ์ด “ชวนคนสนใจ” ในแท็บคีย์แมน'
                    : 'ยังไม่มีผู้สนใจในระบบ'}
                </td>
              </tr>
            )}
            {!loading && rows.map((l, i) => (
              <tr key={l.id || l.prospectCode || i} className="align-top">
                <td className="border-b py-1.5 pr-2 text-slate-400">{i + 1}</td>
                <td className="border-b py-1.5 pr-2 font-semibold text-slate-700">
                  {l.name || [l.firstName, l.lastName].filter(Boolean).join(' ') || '-'}
                  {l.province ? <span className="block font-normal text-[10px] text-slate-400">{l.province}</span> : null}
                </td>
                <td className="border-b py-1.5 pr-2">
                  <button type="button" onClick={() => copy(l.prospectCode)} title="คัดลอกรหัส"
                    className="rounded-lg border bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-[#0b2b5b]">
                    {l.prospectCode || '-'}
                  </button>
                  {copied && copied === l.prospectCode && <span className="ml-1 text-[10px] text-emerald-600">คัดลอกแล้ว ✓</span>}
                </td>
                <td className="border-b py-1.5 pr-2 font-mono text-slate-600">{maskPhone(l.phone)}</td>
                <td className="border-b py-1.5 pr-2 text-slate-600">{(l.topics && l.topics.length ? l.topics : String(l.interest || '').split(',').filter(Boolean)).slice(0, 3).join(' · ') || '-'}</td>
                <td className="border-b py-1.5 pr-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{l.source || l.sourceName || 'ไม่ระบุ'}</span>
                </td>
                <td className="border-b py-1.5 pr-2 text-slate-500">{fmtDate(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[10px] text-slate-400">
        หมายเหตุ: “จากลิงก์ /join” = ผู้สนใจที่ระบบบันทึกที่มาว่า <code>app_signup_keyman</code> (ฟอร์มหน้า /join) ·
        ลิงก์รหัสแบบสั้น <code>/P-XXXXXX</code> เปิดได้แล้ว (พาไปหน้ารายชื่อผู้สนใจ)
      </div>
    </div>
  );
}
