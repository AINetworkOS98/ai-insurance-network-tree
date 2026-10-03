'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type Step = { step: number; key: string; label: string; status: 'ok' | 'warn' | 'skipped' | 'error'; count: number; detail: string; items?: any[] };
type State = {
  ok: boolean; canAdmin: boolean; period: string; now: string;
  deadline: { iso: string; daysLeft: number; passed: boolean; label: string };
  rules: any;
  summary: any;
  tree: { roots: any[]; perLevel: { level: number; count: number; capacity: number }[]; branchLimit: number };
  members: any[]; checks: any[]; failed: any[]; vacancies: any[]; candidates: any[];
  lastRun: any | null; logs: any[]; testAccounts: number; disclaimer?: string; error?: string; message?: string;
};

const PIPELINE = [
  { key: 'verify', label: 'ตรวจสอบเงื่อนไข', icon: '🔎' },
  { key: 'identify', label: 'ระบุผู้ไม่ผ่าน', icon: '⚠️' },
  { key: 'cut', label: 'นำออกจากตำแหน่ง', icon: '⛔' },
  { key: 'search', label: 'หาผู้มีคุณสมบัติครบ', icon: '🎯' },
  { key: 'promote', label: 'เลื่อนขึ้นแทน', icon: '⬆️' },
  { key: 'relink', label: 'จัดสายงาน 1:5', icon: '🧩' },
  { key: 'recalc', label: 'อัปเดตทุกระดับ + Log', icon: '🔄' },
];

const statusStyle: Record<string, string> = {
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
  skipped: 'bg-slate-50 border-slate-200 text-slate-600',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
};

function Tile({ label, value, sub, tone }: { label: string; value: any; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone || 'bg-white border-[#f3e8d3]'}`}>
      <div className="text-[11px] text-[#57534e]">{label}</div>
      <div className="text-xl font-bold text-[#475569] leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-[#78716c] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Net1x5Autopilot() {
  const [state, setState] = useState<State | null>(null);
  const [run, setRun] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'overview' | 'failed' | 'candidates' | 'vacancies' | 'tree' | 'logs'>('overview');
  const [auto, setAuto] = useState(true);
  const [rules, setRules] = useState<any>(null);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/net/1x5/state', { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { setErr(j.message || j.error || 'อ่านสถานะไม่สำเร็จ'); return; }
      setState(j); setRules((prev: any) => prev || j.rules); setErr('');
    } catch (e: any) { setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { clearInterval(timer.current); return; }
    timer.current = setInterval(load, 8000);
    return () => clearInterval(timer.current);
  }, [auto, load]);

  async function callRun(mode: 'preview' | 'apply') {
    if (mode === 'apply' && !confirm('ยืนยันรันจริง? ระบบจะคัดสมาชิกที่ไม่ผ่านเงื่อนไขออกจากตำแหน่ง และเลื่อนผู้ผ่านเงื่อนไขขึ้นแทนทันที (ทุกอย่างถูกบันทึก Log)')) return;
    setBusy(mode); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/net/1x5/run', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, period: state?.period, idempotencyKey: `ui-${mode}-${Date.now()}` }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.message || j.error || 'รันไม่สำเร็จ'); return; }
      setRun(j);
      setMsg(mode === 'apply'
        ? `รันจริงเสร็จแล้ว (run ${String(j.runId || '').slice(0, 8)}…) — คัดออก ${j.summary?.cutLast ?? 0} · เลื่อนตำแหน่ง ${j.summary?.promotedLast ?? 0}`
        : `ตรวจสอบเสร็จ — ไม่ผ่านเงื่อนไข ${j.summary?.failed ?? 0} คน · ตำแหน่งว่าง ${j.summary?.vacancies ?? 0} · ผู้พร้อมเลื่อน ${j.summary?.readyCandidates ?? 0}`);
      setTab('overview');
      await load();
    } catch { setErr('รันไม่สำเร็จ — เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    finally { setBusy(''); }
  }

  async function seed(action: 'create' | 'purge') {
    if (action === 'purge' && !confirm('ลบสมาชิกทดสอบทั้งหมดออกจากโครงสร้าง?')) return;
    setBusy(action); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/net/1x5/seed', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, layers: 2 }),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.message || j.error || 'ไม่สำเร็จ'); return; }
      setMsg(j.message || 'สำเร็จ');
      await load();
    } catch { setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    finally { setBusy(''); }
  }

  async function saveRules() {
    setBusy('rules'); setMsg(''); setErr('');
    try {
      const r = await fetch('/api/net/1x5/rules', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      });
      const j = await r.json();
      if (!j.ok) { setErr(j.message || j.error || 'บันทึกไม่สำเร็จ'); return; }
      setMsg(j.message || 'บันทึกกติกาแล้ว'); setRules(j.rules); await load();
    } catch { setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    finally { setBusy(''); }
  }

  const steps: Step[] | null = run?.steps || null;
  const s = state?.summary || {};
  const deadline = state?.deadline;
  const levelRows = useMemo(() => state?.tree?.perLevel || [], [state]);

  return (
    <div className="min-h-screen bg-[#FCFBF6]">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-5 py-4">
        {/* ── หัวเรื่อง + ลิงก์อ่าน PDF มุมบนขวา ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold text-[#c8a84e] tracking-wide">SYSTEM 1×5 AUTOPILOT · ข้อมูลจริงในฐานข้อมูล</div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#475569] leading-tight">ระบบบริหารเครือข่าย 1 แตก 5 — เชื่อมต่อสายงานทุกระดับอัตโนมัติ</h1>
            <p className="text-xs text-[#57534e] mt-1 max-w-3xl">
              ตรวจใบเสร็จ → คัดสมาชิกที่ไม่ผ่านเงื่อนไข → เลื่อนผู้มีคุณสมบัติขึ้นแทน → จัดสายงาน 1:5 → แจ้งเตือนอัตโนมัติ
              โดยไม่ต้องให้ผู้ดูแลระบบจัดตำแหน่งด้วยมือ (ทุกการเปลี่ยนแปลงถูกบันทึก Log ตรวจสอบย้อนหลังได้)
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {/* ลิงก์อ่าน PDF — มุมบนขวา ตามที่สั่ง */}
            <a
              href="/docs/net-1x5-autopilot.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#c8a84e] text-[#3f3a2e] font-semibold text-sm px-4 py-2 shadow-sm hover:brightness-105"
            >
              📄 อ่าน PDF: สรุประบบ 1 แตก 5
            </a>
            <a href="/network/1x5-rules" className="text-xs text-sky-700 underline">หลักเกณฑ์ 1 แตก 5</a>
          </div>
        </div>

        {err && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm px-3 py-2">{err} {/members_only|session/.test(err) && <Link href="/login" className="underline font-semibold">เข้าสู่ระบบ</Link>}</div>}
        {msg && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm px-3 py-2">{msg}</div>}

        {/* ── แถบควบคุม ── */}
        <div className="mt-4 rounded-2xl border border-[#f3e8d3] bg-white p-3 flex flex-wrap items-center gap-2">
          <button onClick={() => callRun('preview')} disabled={!!busy}
            className="rounded-xl border border-sky-200 bg-[#eff6ff] text-sky-800 text-sm font-semibold px-4 py-2 disabled:opacity-50">
            {busy === 'preview' ? 'กำลังตรวจสอบ…' : '🔎 ตรวจสอบเงื่อนไข (ยังไม่แก้ข้อมูล)'}
          </button>
          <button onClick={() => callRun('apply')} disabled={!!busy || !state?.canAdmin}
            title={state?.canAdmin ? '' : 'สงวนสิทธิ์ผู้ดูแลระบบ'}
            className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-40">
            {busy === 'apply' ? 'กำลังรันจริง…' : '⚡ รันจริง (คัดออก + เลื่อนตำแหน่ง + จัดสายงาน)'}
          </button>
          <span className="mx-1 h-6 w-px bg-[#f3e8d3]" />
          <button onClick={() => seed('create')} disabled={!!busy || !state?.canAdmin}
            className="rounded-xl border border-[#dbeafe] bg-white text-[#475569] text-sm px-3 py-2 disabled:opacity-40">🧪 สร้างเครือข่ายทดสอบ</button>
          <button onClick={() => seed('purge')} disabled={!!busy || !state?.canAdmin}
            className="rounded-xl border border-[#dbeafe] bg-white text-[#475569] text-sm px-3 py-2 disabled:opacity-40">🗑 ลบเครือข่ายทดสอบ</button>
          <span className="mx-1 h-6 w-px bg-[#f3e8d3]" />
          <button onClick={() => load()} className="rounded-xl border border-[#dbeafe] bg-white text-[#475569] text-sm px-3 py-2">↻ รีเฟรช</button>
          <label className="flex items-center gap-1.5 text-xs text-[#57534e] ml-auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> อัปเดตเรียลไทม์ (ทุก 8 วินาที)
          </label>
          {state && !state.canAdmin && <span className="text-[11px] text-amber-700">โหมดผู้ชม — ปุ่มที่เขียนข้อมูลจริงต้องเป็นผู้ดูแลระบบ</span>}
        </div>

        {/* ── กำหนดเวลาที่ต้องดำเนินการ ── */}
        {deadline && (
          <div className={`mt-3 rounded-2xl border p-3 text-sm ${deadline.passed ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-[#dbeafe] bg-white text-[#475569]'}`}>
            <span className="font-semibold">⏰ {deadline.label}</span>
            {state?.testAccounts ? <span className="ml-2 text-[11px] text-[#78716c]">· มีสมาชิกทดสอบในระบบ {state.testAccounts} คน</span> : null}
          </div>
        )}

        {/* ── KPI ── */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Tile label="สมาชิกในโครงสร้าง" value={s.total ?? '—'} sub={`ใช้งาน ${s.active ?? 0} · ปิดจุด ${s.nonActive ?? 0}`} />
          <Tile label="ผ่านเงื่อนไข" value={s.passed ?? '—'} sub="พร้อมขึ้นตำแหน่ง" tone="bg-emerald-50 border-emerald-200" />
          <Tile label="ไม่ผ่านเงื่อนไข" value={s.failed ?? '—'} sub={`รอตรวจใบเสร็จ ${s.pendingReview ?? 0}`} tone="bg-amber-50 border-amber-200" />
          <Tile label="ตำแหน่งว่าง" value={s.vacancies ?? '—'} sub={`ช่อง 1:5 ว่าง ${s.emptySlots ?? 0}`} tone="bg-sky-50 border-sky-200" />
          <Tile label="ผู้มีสิทธิ์เลื่อน" value={s.readyCandidates ?? '—'} sub={`เข้าข่ายทั้งหมด ${s.candidates ?? 0}`} />
          <Tile label="รันล่าสุด" value={state?.lastRun ? `${state.lastRun.promoted}⬆ / ${state.lastRun.cut}⛔` : 'ยังไม่รัน'} sub={state?.lastRun ? new Date(state.lastRun.startedAt).toLocaleString('th-TH') : 'กด "รันจริง" เพื่อเริ่ม'} />
        </div>

        {/* ── ลำดับการทำงาน 7 ขั้น ── */}
        <div className="mt-4 rounded-2xl border border-[#f3e8d3] bg-white p-3">
          <div className="text-sm font-semibold text-[#475569] mb-2">ลำดับการทำงานอัตโนมัติ (ตรวจสอบเงื่อนไข → ระบุผู้ไม่ผ่าน → นำออกจากตำแหน่ง → หาผู้มีคุณสมบัติครบ → เลื่อนขึ้นแทน → ปรับสายงาน → อัปเดตโครงสร้างทุกระดับ)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-2">
            {PIPELINE.map((p, i) => {
              const st = steps?.find((x) => x.key === p.key);
              return (
                <div key={p.key} className={`rounded-xl border p-2.5 ${st ? statusStyle[st.status] : 'bg-white border-[#f3e8d3] text-[#57534e]'}`}>
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span>{p.icon}</span><span>ขั้น {i + 1}</span>
                    {st && <span className="ml-auto">{st.status === 'ok' ? '✓' : st.status === 'warn' ? '!' : st.status === 'error' ? '✕' : '–'}</span>}
                  </div>
                  <div className="text-xs font-semibold mt-1">{p.label}</div>
                  <div className="text-lg font-bold leading-none mt-1">{st ? st.count : '—'}</div>
                  <div className="text-[11px] mt-1 leading-snug">{st ? st.detail.slice(0, 150) : 'ยังไม่ได้รันในรอบนี้'}</div>
                </div>
              );
            })}
          </div>
          {run?.warnings?.length ? (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              {run.warnings.map((w: string, i: number) => <div key={i}>• {w}</div>)}
            </div>
          ) : null}
        </div>

        {/* ── แท็บข้อมูล ── */}
        <div className="mt-4 flex flex-wrap gap-1.5 text-sm">
          {([
            ['overview', `ภาพรวมโครงสร้าง (${levelRows.length} ชั้น)`],
            ['failed', `ไม่ผ่านเงื่อนไข (${state?.failed?.length ?? 0})`],
            ['candidates', `ผู้มีสิทธิ์เลื่อนตำแหน่ง (${state?.candidates?.length ?? 0})`],
            ['vacancies', `ตำแหน่งว่าง (${state?.vacancies?.length ?? 0})`],
            ['tree', 'สมาชิกในผัง 1:5'],
            ['logs', `Log ตรวจสอบย้อนหลัง (${state?.logs?.length ?? 0})`],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={`rounded-full px-3 py-1.5 border ${tab === k ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-[#475569] border-[#f3e8d3]'}`}>{label}</button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 rounded-2xl border border-[#f3e8d3] bg-white p-3 overflow-auto max-h-[560px]">
            {tab === 'overview' && (
              <div>
                <div className="text-sm font-semibold text-[#475569] mb-2">ความจุโครงสร้าง 1 แตก 5 ต่อชั้น (ชั้นละ 5 เท่า)</div>
                <table className="w-full text-xs">
                  <thead className="text-[#78716c]"><tr><th className="text-left py-1">ชั้น</th><th className="text-right">สมาชิกจริง</th><th className="text-right">ความจุตามกติกา</th><th className="text-left pl-2">สัดส่วน</th></tr></thead>
                  <tbody>
                    {levelRows.map((r) => (
                      <tr key={r.level} className="border-t border-[#f7f1e3]">
                        <td className="py-1.5">ชั้น {r.level}</td>
                        <td className="text-right font-semibold">{r.count}</td>
                        <td className="text-right">{r.capacity.toLocaleString('th-TH')}</td>
                        <td className="pl-2">
                          <div className="h-2 w-full max-w-[220px] rounded-full bg-[#f3e8d3] overflow-hidden">
                            <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, (r.count / Math.max(1, r.capacity)) * 100)}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!levelRows.length && <tr><td colSpan={4} className="py-6 text-center text-[#78716c]">ยังไม่มีสมาชิกในโครงสร้าง — กด “สร้างเครือข่ายทดสอบ” เพื่อดูการทำงานครบวงจร</td></tr>}
                  </tbody>
                </table>
                <div className="mt-3 text-[11px] text-[#78716c]">{state?.disclaimer}</div>
              </div>
            )}

            {tab === 'failed' && (
              <table className="w-full text-xs">
                <thead className="text-[#78716c]"><tr><th className="text-left py-1">รหัส</th><th className="text-left">ชื่อ</th><th className="text-left">ชั้น</th><th className="text-left">เหตุผลที่ไม่ผ่าน</th><th className="text-left">สถานะระบบ</th></tr></thead>
                <tbody>
                  {(state?.failed || []).map((f: any) => (
                    <tr key={f.userId} className="border-t border-[#f7f1e3] align-top">
                      <td className="py-1.5 font-mono">{f.code}</td><td>{f.name}</td><td>{f.level}</td>
                      <td className="text-amber-800">{(f.reasons || []).join(' · ')}</td>
                      <td>{f.pendingReview ? <span className="text-sky-700">กันการคัด (รอตรวจใบเสร็จ)</span> : <span className="text-rose-700">พร้อมคัดออก</span>}</td>
                    </tr>
                  ))}
                  {!(state?.failed || []).length && <tr><td colSpan={5} className="py-6 text-center text-[#78716c]">ไม่มีสมาชิกที่ไม่ผ่านเงื่อนไข</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'candidates' && (
              <table className="w-full text-xs">
                <thead className="text-[#78716c]"><tr><th className="text-left py-1">ลำดับ</th><th className="text-left">รหัส</th><th className="text-left">ชื่อ</th><th className="text-right">ยอดรับรอง</th><th className="text-left">คุณสมบัติ</th><th className="text-left">เหตุผลลำดับความสำคัญ</th></tr></thead>
                <tbody>
                  {(state?.candidates || []).map((c: any, i: number) => (
                    <tr key={c.userId} className="border-t border-[#f7f1e3] align-top">
                      <td className="py-1.5 font-semibold">{i + 1}</td><td className="font-mono">{c.code}</td><td>{c.name}</td>
                      <td className="text-right">฿{Number(c.verifiedAmount || 0).toLocaleString('th-TH')}</td>
                      <td>{c.ready ? <span className="text-emerald-700 font-semibold">ครบ</span> : <span className="text-[#78716c]">ยังไม่ครบ</span>}</td>
                      <td className="text-[11px] text-[#57534e]">{c.priorityReason}</td>
                    </tr>
                  ))}
                  {!(state?.candidates || []).length && <tr><td colSpan={6} className="py-6 text-center text-[#78716c]">ยังไม่มีผู้ผ่านเงื่อนไข</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'vacancies' && (
              <table className="w-full text-xs">
                <thead className="text-[#78716c]"><tr><th className="text-left py-1">ประเภท</th><th className="text-left">ตำแหน่ง/ผู้แนะนำ</th><th className="text-left">ช่อง</th><th className="text-left">ชั้น</th><th className="text-left">เหตุผล</th></tr></thead>
                <tbody>
                  {(state?.vacancies || []).map((v: any, i: number) => (
                    <tr key={i} className="border-t border-[#f7f1e3]"><td className="py-1.5">{v.kind === 'slot' ? 'ช่องว่าง 1:5' : 'ตำแหน่งจากการคัดออก'}</td><td>{v.parentName}</td><td>{v.slot}</td><td>{v.level}</td><td className="text-[11px]">{v.reason}</td></tr>
                  ))}
                  {!(state?.vacancies || []).length && <tr><td colSpan={5} className="py-6 text-center text-[#78716c]">ไม่มีตำแหน่งว่าง — โครงสร้างเต็มตามกติกา</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'tree' && (
              <div className="space-y-1.5">
                {(state?.members || []).slice(0, 300).map((m: any) => (
                  <div key={m.userId} className="flex items-center gap-2 text-xs border-b border-[#f7f1e3] pb-1.5">
                    <span className="font-mono text-[#78716c] w-24 shrink-0">{m.code}</span>
                    <span className="truncate w-40 shrink-0">{m.name}</span>
                    <span className="w-16 shrink-0">ชั้น {m.level}</span>
                    <span className="w-20 shrink-0">{m.positionName}</span>
                    <span className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((slot) => (
                        <span key={slot} title={`ช่อง ${slot}`}
                          className={`w-4 h-4 rounded-sm border text-[8px] leading-4 text-center ${m.emptySlots?.includes(slot) ? 'bg-white border-dashed border-[#c8a84e] text-[#c8a84e]' : 'bg-sky-100 border-sky-300'}`}>{slot}</span>
                      ))}
                    </span>
                    <span className="ml-auto shrink-0">
                      {m.status === 'ACTIVE' && m.isActive ? <span className="text-emerald-700">ใช้งาน</span> : <span className="text-rose-700">{m.status}{m.isActive ? '' : ' · ปิดจุด'}</span>}
                    </span>
                  </div>
                ))}
                {!(state?.members || []).length && <div className="py-6 text-center text-[#78716c]">ยังไม่มีสมาชิก</div>}
              </div>
            )}

            {tab === 'logs' && (
              <div className="space-y-1.5">
                {(state?.logs || []).map((l: any) => (
                  <div key={l.id} className="text-[11px] border-b border-[#f7f1e3] pb-1.5">
                    <div className="flex gap-2 items-center">
                      <span className="font-mono text-sky-800">{l.action}</span>
                      <span className="text-[#78716c]">{new Date(l.createdAt).toLocaleString('th-TH')}</span>
                    </div>
                    <div className="text-[#57534e]">{l.reason || ''}</div>
                  </div>
                ))}
                {!(state?.logs || []).length && <div className="py-6 text-center text-[#78716c]">ยังไม่มี Log — ระบบจะบันทึกทุกครั้งที่รัน/คัดออก/เลื่อนตำแหน่ง</div>}
              </div>
            )}
          </div>

          {/* ── กติกา (แก้ไขได้จากหน้าจอ) ── */}
          <div className="rounded-2xl border border-[#f3e8d3] bg-white p-3">
            <div className="text-sm font-semibold text-[#475569] mb-2">กติกาที่ระบบใช้ตัดสิน (แก้ได้จากหน้าจอ เก็บใน DB)</div>
            {rules && (
              <div className="space-y-2 text-xs">
                <label className="block">รอบที่ประเมิน (YYYY-MM)
                  <input type="text" value={rules.period || ''} onChange={(e) => setRules({ ...rules, period: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                </label>
                <label className="block">ต้องส่งใบเสร็จภายใน (วันหลังปิดรอบ)
                  <input type="number" value={rules.receiptDeadlineDays} onChange={(e) => setRules({ ...rules, receiptDeadlineDays: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                </label>
                <label className="block">วัน/เวลาที่ต้องดำเนินการทุกเดือน
                  <div className="flex gap-2 mt-1">
                    <input type="number" min={1} max={28} value={rules.deadlineDayOfMonth} onChange={(e) => setRules({ ...rules, deadlineDayOfMonth: Number(e.target.value) })} className="w-20 rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                    <input type="number" min={0} max={23} value={rules.deadlineHour} onChange={(e) => setRules({ ...rules, deadlineHour: Number(e.target.value) })} className="w-20 rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                    <span className="self-center text-[#78716c]">น.</span>
                  </div>
                </label>
                <label className="block">ยอดรับรองขั้นต่ำต่อรอบ (บาท)
                  <input type="number" value={rules.minVerifiedAmount} onChange={(e) => setRules({ ...rules, minVerifiedAmount: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                </label>
                <label className="block">ผ่อนผันสมาชิกใหม่ (วัน)
                  <input type="number" value={rules.graceDays} onChange={(e) => setRules({ ...rules, graceDays: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                </label>
                <label className="block">ลำดับความสำคัญเมื่อผ่านหลายคน
                  <select value={rules.priority} onChange={(e) => setRules({ ...rules, priority: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#dbeafe] px-2 py-1.5">
                    <option value="proximity">ใกล้ตำแหน่งว่างที่สุดก่อน แล้วค่อยดูผลงาน</option>
                    <option value="performance">ผลงานรับรองสูงสุดก่อน</option>
                    <option value="seniority">อาวุโส (สมัครก่อน) ก่อน</option>
                  </select>
                </label>
                <label className="block">เพดานต่อรอบ: คัดออก / เลื่อนตำแหน่ง
                  <div className="flex gap-2 mt-1">
                    <input type="number" min={1} max={200} value={rules.maxCutPerRun ?? 10} onChange={(e) => setRules({ ...rules, maxCutPerRun: Number(e.target.value) })} className="w-20 rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                    <input type="number" min={1} max={100} value={rules.maxPromotePerRun ?? 3} onChange={(e) => setRules({ ...rules, maxPromotePerRun: Number(e.target.value) })} className="w-20 rounded-lg border border-[#dbeafe] px-2 py-1.5" />
                  </div>
                  <span className="text-[10px] text-[#78716c]">เกินเพดาน ระบบทำต่อในรอบถัดไปอัตโนมัติ (กันรอบทำงานยาวเกินเวลาเซิร์ฟเวอร์)</span>
                </label>
                {([
                  ['requireReceipt', 'บังคับมีใบเสร็จยืนยัน'],
                  ['enforceCut', 'คัดออกอัตโนมัติจริง (ปิดไว้ = ตรวจแล้วรออนุมัติ)'],
                  ['autoPromote', 'เลื่อนตำแหน่งแทนอัตโนมัติ'],
                  ['fillVacancy', 'ห้ามทิ้งตำแหน่งว่าง: เติมช่อง 1:5 อัตโนมัติ'],
                  ['notify', 'แจ้งเตือนอัตโนมัติ (สมาชิก/ผู้แนะนำ/ผู้ดูแล)'],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" checked={!!rules[k]} onChange={(e) => setRules({ ...rules, [k]: e.target.checked })} />
                    {label}
                  </label>
                ))}
                {rules.enforceCut && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 p-2">
                    เปิดคัดออกอัตโนมัติอยู่ — สมาชิกที่ไม่ผ่านเงื่อนไขจะถูกตัดออกจากตำแหน่งทันทีเมื่อรันจริง
                  </div>
                )}
                <button onClick={saveRules} disabled={!state?.canAdmin || busy === 'rules'}
                  className="w-full rounded-xl bg-[#475569] text-white font-semibold py-2 disabled:opacity-40">
                  {busy === 'rules' ? 'กำลังบันทึก…' : 'บันทึกกติกา'}
                </button>
                {!state?.canAdmin && <div className="text-[11px] text-amber-700">อ่านได้อย่างเดียว — การแก้กติกาสงวนสิทธิ์ผู้ดูแลระบบ</div>}
                <div className="text-[11px] text-[#78716c] pt-1 border-t border-[#f7f1e3]">
                  กฎเหล็กที่ระบบบังคับในโค้ด: ห้ามเลื่อนสมาชิกที่ยังไม่ผ่านเงื่อนไข · ห้ามปล่อยตำแหน่งว่างถ้ามีผู้มีคุณสมบัติครบ · เก็บ Log ทุกการเปลี่ยนแปลง
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
