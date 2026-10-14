'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// ─────────────────────────────────────────────────────────────────────────────
// 🛰️ ศูนย์ควบคุม AI (AI Control Tower) — หน้าผู้ดูแลระบบ
// ภาพรวมทุกระบบของธุรกิจ + สั่งงานจากที่ไหนก็ได้ (มือถือ/iPad ก็ใช้ได้)
//  • ข้อมูลจาก GET /api/ops/state (ศูนย์ควบคุมในเครื่องส่งขึ้นทุก 1 นาที)
//  • สั่งงานด้วย POST /api/ops/command → ฝากเข้าคิว → ตัวรันในเครื่องรับไปทำใน ≤ 1 นาที
// ─────────────────────────────────────────────────────────────────────────────

type SysStatus = 'up' | 'down' | 'warn';

interface SystemRow {
  id: string; name: string; group: string; status: SysStatus; critical: boolean;
  fix?: string | null; latencyMs?: number | null; detail?: string | null; checkedAt?: string | null;
}
interface ActionRow { id: string | null; label: string | null; group?: string | null; danger?: boolean; system?: string | null }
interface CmdRow {
  id: string; at: string; status: string; action?: string | null; text?: string | null;
  by?: string | null; result?: string | null; ms?: number | null;
}
interface OpsState {
  ok?: boolean; ready?: boolean; note?: string;
  receivedAt?: string; ageSeconds?: number; fresh?: boolean; host?: string;
  summary?: { total: number; up: number; down: number; warn: number };
  systems?: SystemRow[]; actions?: ActionRow[]; logs?: string[]; commands?: CmdRow[];
  snapshotCount?: number; error?: string;
}

const STATUS_TH: Record<SysStatus, string> = { up: 'ทำงานปกติ', down: 'ล่ม', warn: 'เฝ้าระวัง' };
const DOT: Record<SysStatus, string> = { up: 'bg-emerald-500', down: 'bg-red-500', warn: 'bg-amber-500' };
const BORDER: Record<SysStatus, string> = { up: 'border-l-emerald-500', down: 'border-l-red-500', warn: 'border-l-amber-500' };

function agoTH(sec?: number | null) {
  if (sec == null) return '—';
  if (sec < 60) return `${sec} วินาทีที่แล้ว`;
  if (sec < 3600) return `${Math.floor(sec / 60)} นาทีที่แล้ว`;
  return `${Math.floor(sec / 3600)} ชั่วโมงที่แล้ว`;
}

export default function OpsControlTowerPage() {
  const [data, setData] = useState<OpsState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/ops/state', { cache: 'no-store', credentials: 'include' });
      const j = await r.json();
      if (!j.ok) { setErr(j.error || 'อ่านสถานะไม่สำเร็จ'); return; }
      setErr(null); setData(j);
    } catch (e: any) { setErr(String(e?.message || e)); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [auto, load]);

  async function order(action?: string, text?: string) {
    const key = action || text || 'x';
    setBusy(key); setNote(null);
    try {
      const r = await fetch('/api/ops/command', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
      });
      const j = await r.json();
      setNote(`${j.ok ? '✅' : '❌'} ${j.note || j.error || ''}`);
      setTimeout(load, 1500);
    } catch (e: any) { setNote('❌ ' + String(e?.message || e)); }
    setBusy(null);
  }

  const s = data?.summary;
  const systems = data?.systems || [];
  const groups = Array.from(new Set(systems.map((x) => x.group))).filter(Boolean);
  const stale = data?.ready && data?.fresh === false;

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 bg-slate-50">
          {/* ── หัวเรื่อง + ตัวเลขรวม ─────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800">🛰️ ศูนย์ควบคุม AI — ทุกระบบในที่เดียว</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                ตัวควบคุมในเครื่อง ({data?.host || '—'}) ส่งสถานะขึ้นทุก 1 นาที · ตรวจ{' '}
                {data?.receivedAt ? new Date(data.receivedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—'}{' '}
                ({agoTH(data?.ageSeconds)}) · รีเฟรชอัตโนมัติทุก 15 วินาที
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-slate-600 flex items-center gap-1">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> รีเฟรชอัตโนมัติ
              </label>
              <button onClick={load} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:border-blue-400">
                ↻ รีเฟรชเดี๋ยวนี้
              </button>
            </div>
          </div>

          {/* ── แถบเตือนเมื่อขาดการติดต่อ ─────────────────────────────── */}
          {err && (
            <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              ⚠️ {err}
            </div>
          )}
          {data?.ready === false && (
            <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
              ⚠️ {data.note || 'ยังไม่ได้รับสถานะจากศูนย์ควบคุมในเครื่อง'} — ถ้าเครื่องปิดอยู่ ตัวควบคุมจะกลับมาเองเมื่อเปิดเครื่อง
              <div className="text-xs mt-1 text-amber-700">
                เริ่มตัวควบคุมในเครื่อง: ดับเบิลคลิก <code>run-controller-hidden.vbs</code> หรือรันคำสั่ง{' '}
                <code>node C:\Users\User\ai-controller\controller.mjs</code>
              </div>
            </div>
          )}
          {stale && (
            <div className="mb-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">
              ⏳ สถานะล่าสุดเก่ากว่า 5 นาที — ตัวควบคุมในเครื่องอาจถูกปิดหรือเครื่องเข้าโหมดสลีป
            </div>
          )}

          {/* ── การ์ดตัวเลข ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[
              { k: 'ปกติ', v: s?.up, c: 'text-emerald-600' },
              { k: 'ล่ม', v: s?.down, c: 'text-red-600' },
              { k: 'เฝ้าระวัง', v: s?.warn, c: 'text-amber-600' },
              { k: 'ระบบที่เฝ้าทั้งหมด', v: s?.total, c: 'text-slate-700' },
            ].map((c) => (
              <div key={c.k} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                <div className={`text-2xl font-bold ${c.c}`}>{c.v ?? '–'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{c.k}</div>
              </div>
            ))}
          </div>

          {note && <div className="mb-4 p-3 rounded-xl border border-blue-200 bg-blue-50 text-sm text-blue-800">{note}</div>}

          {/* ── ทุกระบบ ───────────────────────────────────────────── */}
          {groups.map((g) => (
            <section key={g} className="mb-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">หมวด {g}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {systems.filter((x) => x.group === g).map((x) => (
                  <div key={x.id} className={`bg-white rounded-xl border border-slate-200 border-l-4 ${BORDER[x.status]} p-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-2.5 h-2.5 rounded-full ${DOT[x.status]}`} />
                        <div className="text-sm font-semibold text-slate-800 leading-snug">{x.name}</div>
                      </div>
                      {x.critical && <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 text-slate-500 whitespace-nowrap">สำคัญ</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-2 break-words">{x.detail || '—'}</div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-slate-400 mt-2">
                      <span>{STATUS_TH[x.status]}</span>
                      {x.latencyMs != null && <span>{x.latencyMs} ms</span>}
                      {x.fix && <span>มีตัวกู้เอง</span>}
                    </div>
                    {x.status !== 'up' && x.fix && (
                      <button
                        onClick={() => order(x.fix!, undefined)}
                        disabled={busy === x.fix}
                        className="mt-2 text-[11px] px-2.5 py-1 rounded-lg border border-slate-300 hover:border-blue-400 text-slate-700 disabled:opacity-40"
                      >
                        {busy === x.fix ? '⏳ กำลังสั่ง…' : 'ซ่อมระบบนี้'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* ── สั่งงานด้วยภาษาคน ─────────────────────────────────── */}
          <section className="mb-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">สั่งงานทันที (จากที่ไหนก็ได้)</h2>
            <div className="flex flex-wrap gap-2">
              {(data?.actions || []).map((a) => (
                <button
                  key={a.id || a.label}
                  onClick={() => order(a.id!, undefined)}
                  disabled={busy === a.id}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold disabled:opacity-40 ${a.danger ? 'border-red-300 text-red-700 bg-red-50 hover:border-red-500' : 'border-slate-300 text-slate-700 bg-white hover:border-blue-400'}`}
                >
                  {busy === a.id ? '⏳' : ''} {a.label}
                </button>
              ))}
              {!(data?.actions || []).length && (
                <span className="text-xs text-slate-400">ยังไม่ได้รับรายการคำสั่งจากตัวควบคุมในเครื่อง</span>
              )}
            </div>
          </section>

          {/* ── ประวัติคำสั่ง + ผลลัพธ์ ───────────────────────────── */}
          <section className="mb-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ประวัติคำสั่งและผลลัพธ์</h2>
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left p-2">เวลา</th>
                    <th className="text-left p-2">คำสั่ง</th>
                    <th className="text-left p-2">สถานะ</th>
                    <th className="text-left p-2">ผลลัพธ์</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.commands || []).map((c) => (
                    <tr key={c.id} className="border-t border-slate-100 align-top">
                      <td className="p-2 text-slate-500 whitespace-nowrap">
                        {new Date(c.at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-2 font-medium text-slate-700">{c.action || c.text || '—'}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${c.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' : c.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {c.status === 'SENT' ? 'สำเร็จ' : c.status === 'FAILED' ? 'ไม่สำเร็จ' : 'รอดำเนินการ'}
                        </span>
                        {c.ms != null && <span className="text-[10px] text-slate-400 ml-1">{c.ms} ms</span>}
                      </td>
                      <td className="p-2 text-slate-600 max-w-[420px] whitespace-pre-wrap break-words">{c.result || '—'}</td>
                    </tr>
                  ))}
                  {!(data?.commands || []).length && (
                    <tr><td colSpan={4} className="p-3 text-slate-400">ยังไม่มีคำสั่ง</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── บันทึกจากตัวควบคุม ─────────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">บันทึกล่าสุดจากศูนย์ควบคุม</h2>
            <div className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[11px] leading-relaxed font-mono max-h-72 overflow-auto whitespace-pre-wrap">
              {(data?.logs || []).join('\n') || '— ยังไม่มีบันทึก'}
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              สถานะถูกเก็บย้อนหลัง 2 วัน (snapshot ทั้งหมด {data?.snapshotCount ?? 0} ชุด) · ระบบนี้ไม่เก็บรหัสผ่าน/คีย์ใด ๆ
              ไว้ในหน้าเว็บ
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
