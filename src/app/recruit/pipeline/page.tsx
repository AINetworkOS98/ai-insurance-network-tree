'use client';
// /recruit/pipeline — ติดตามและกรอกข้อมูล "ขั้นตอนรับสมัครตัวแทน" (ผู้มุ่งหวัง) 8 ขั้น
//   1 รอดำเนินการและตรวจสอบ → 2 อนุมัติสมัครตัวแทน → 3 สมัครสอบใต้สังกัด → 4 ใบอนุญาตใต้สังกัด
//   → 5 อนุมัติค้ำประกัน → 6 อนุมัติแต่งตั้ง → 7 สมัครสอบใบอนุญาตตัวแทน → 8 ต่ออายุใบอนุญาต
// ข้อมูลที่กรอกแต่ละขั้นถูกเก็บถาวร (ProspectActivity) + บันทึกการเปลี่ยนขั้น (ProspectStatusHistory)
import { Suspense, useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';

type Any = Record<string, any>;

const inputCls =
  'w-full rounded-xl border border-[#dbeafe] bg-white px-4 py-3 text-sm text-slate-700 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300';

function PipelineInner() {
  const [list, setList] = useState<Any[]>([]);
  const [stages, setStages] = useState<Any[]>([]);
  const [canAdvance, setCanAdvance] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, any> | null>(null);
  const [detail, setDetail] = useState<Record<string, any> | null>(null);
  const [stageKey, setStageKey] = useState<string>('');
  const [data, setData] = useState<Any>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadList() {
    try {
      const r = await fetch('/api/recruit/stage', { credentials: 'include' });
      const j = await r.json();
      if (j?.ok) { setList(j.prospects || []); setStages(j.stages || []); setCanAdvance(Boolean(j.canAdvance)); }
      else setErr(j?.error || 'โหลดรายการไม่สำเร็จ');
    } catch { setErr('เชื่อมต่อไม่สำเร็จ'); } finally { setLoading(false); }
  }
  useEffect(() => { loadList(); }, []);

  async function open(p: Any) {
    setSel(p); setMsg(''); setErr(''); setDetail(null); setData({});
    try {
      const r = await fetch(`/api/recruit/stage?prospectId=${encodeURIComponent(p.id)}`, { credentials: 'include' });
      const j = await r.json();
      if (j?.ok) {
        setDetail(j); setStages(j.stages || stages);
        const idx = (j.stages || []).findIndex((s: Any) => s.key === j.currentStage);
        const next = (j.stages || [])[Math.min(idx + 1, (j.stages || []).length - 1)];
        setStageKey(next?.key || (j.stages?.[0]?.key ?? ''));
        setData((j.steps?.[next?.key]?.data) || {});
      } else setErr(j?.error || 'โหลดรายละเอียดไม่สำเร็จ');
    } catch { setErr('เชื่อมต่อไม่สำเร็จ'); }
  }

  const stage = useMemo(() => stages.find((s) => s.key === stageKey), [stages, stageKey]);
  const doneKeys = useMemo(() => new Set(Object.keys(detail?.steps || {})), [detail]);

  async function save(advance: boolean) {
    if (!sel || !stage) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await fetch('/api/recruit/stage', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: sel.id, stage: stageKey, data }),
      });
      const j = await r.json();
      if (j?.ok) { setMsg(j.message + (j.nextStage ? ` · ขั้นถัดไป: ${j.nextStage.label}` : ' · จบกระบวนการ')); await loadList(); await open(sel); }
      else setErr(j?.error || 'บันทึกไม่สำเร็จ');
    } catch { setErr('เชื่อมต่อไม่สำเร็จ'); } finally { setBusy(false); }
  }

  const filtered = list.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [p.name, p.phone, p.prospectId, p.stageLabel].join(' ').toLowerCase().includes(s);
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-800">ขั้นตอนรับสมัครตัวแทน (ผู้มุ่งหวัง)</h1>
      <p className="mt-1 text-sm text-slate-500">
        8 ขั้นตอน: รอดำเนินการและตรวจสอบ → อนุมัติสมัครตัวแทน → สมัครสอบใต้สังกัด → ใบอนุญาตใต้สังกัด →
        อนุมัติค้ำประกัน → อนุมัติแต่งตั้ง → สมัครสอบใบอนุญาตตัวแทน → ต่ออายุใบอนุญาต
      </p>
      {!canAdvance && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          บัญชีของคุณดูข้อมูลได้ แต่การเลื่อนขั้นต้องเป็น “หัวหน้าหน่วยขึ้นไป” หรือผู้ดูแลระบบ
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ── รายการผู้มุ่งหวัง ─────────────────────────────────── */}
        <section className="card p-4">
          <input className={inputCls} placeholder="ค้นหา ชื่อ / เบอร์ / รหัส" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 space-y-2 max-h-[60vh] overflow-auto">
            {loading && <p className="text-sm text-slate-400">กำลังโหลด…</p>}
            {!loading && !filtered.length && <p className="text-sm text-slate-400">ยังไม่มีผู้มุ่งหวังในคิว</p>}
            {filtered.map((p) => (
              <button key={p.id} onClick={() => open(p)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${sel?.id === p.id ? 'border-[#475569] bg-[#f1f5f9]' : 'border-[#e2e8f0] bg-white hover:bg-[#f8fafc]'}`}>
                <div className="font-semibold text-slate-700">{p.name || '(ไม่มีชื่อ)'}</div>
                <div className="text-xs text-slate-500">{p.prospectId} · {p.phone || '—'}</div>
                <div className="mt-1 text-xs text-emerald-700">{p.stageLabel}</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── รายละเอียด + ฟอร์มกรอกข้อมูลรายขั้น ─────────────────── */}
        <section className="space-y-4">
          {!sel && <div className="card p-6 text-sm text-slate-500">เลือกผู้มุ่งหวังทางซ้ายเพื่อดูขั้นตอนและกรอกข้อมูล</div>}

          {sel && (<>
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{sel.name}</h2>
                  <p className="text-sm text-slate-500">{sel.prospectId} · {sel.phone || '—'} · ผู้แนะนำ: {sel.referralCode || '—'}</p>
                </div>
                <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs text-slate-600">
                  ขั้นปัจจุบัน: <b>{detail?.currentStage ? (stages.find((s) => s.key === detail.currentStage)?.label || detail.currentStage) : 'ยังไม่เริ่ม'}</b>
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {stages.map((s: Any, i: number) => {
                  const done = doneKeys.has(s.key);
                  const cur = detail?.currentStage === s.key;
                  return (
                    <div key={s.key} className={`rounded-xl border px-3 py-2 text-xs ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : cur ? 'border-[#475569] bg-[#475569] text-white' : 'border-[#e2e8f0] bg-white text-slate-500'}`}>
                      <b>{s.icon} ขั้น {s.no}</b>
                      <div className="leading-tight">{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ฟอร์มของขั้นที่เลือก */}
            {stage && (
              <div className="card p-5">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{stage.icon}</span>
                  <div>
                    <div className="font-bold text-slate-800">กรอกข้อมูลขั้นที่ {stage.no}: {stage.label}</div>
                    <div className="text-xs text-slate-500">{stage.sub} · ผู้รับผิดชอบ: {stage.owner}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {stage.fields.map((f: Any) => (
                    <label key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">
                        {f.label} {f.required && <b className="text-rose-500">*</b>}
                      </span>
                      {f.type === 'select' ? (
                        <select className={inputCls} value={data[f.key] ?? ''} onChange={(e) => setData({ ...data, [f.key]: e.target.value })}>
                          <option value="">— เลือก —</option>
                          {(f.options || []).map((o: string) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : f.type === 'textarea' ? (
                        <textarea rows={3} className={inputCls} value={data[f.key] ?? ''} onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
                      ) : (
                        <input type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                          className={inputCls} value={data[f.key] ?? ''} placeholder={f.hint || ''}
                          onChange={(e) => setData({ ...data, [f.key]: e.target.value })} />
                      )}
                      {f.hint && f.type !== 'text' && <span className="mt-1 block text-xs text-slate-400">{f.hint}</span>}
                    </label>
                  ))}
                </div>

                {stage.key !== stageKey && null}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button disabled={busy || !canAdvance} onClick={() => save(true)}
                    className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
                    {busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลขั้นนี้ + บันทึกว่าผ่านขั้น'}
                  </button>
                  <select className={inputCls + ' max-w-[280px]'} value={stageKey} onChange={(e) => { setStageKey(e.target.value); setData(detail?.steps?.[e.target.value]?.data || {}); }}>
                    <option value="">— เลือกขั้นที่ต้องการกรอก/แก้ไข —</option>
                    {stages.map((s: Any) => <option key={s.key} value={s.key}>ขั้น {s.no}: {s.label}</option>)}
                  </select>
                </div>
                {msg && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p>}
                {err && <p className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{err}</p>}
              </div>
            )}

            {/* ประวัติที่กรอกไปแล้ว */}
            {detail && Object.keys(detail.steps || {}).length > 0 && (
              <div className="card p-5">
                <h3 className="font-bold text-slate-800">ข้อมูลที่บันทึกไว้แล้ว</h3>
                <div className="mt-3 space-y-3">
                  {Object.entries(detail.steps).map(([k, v]: any) => {
                    const st = stages.find((s) => s.key === k);
                    return (
                      <div key={k} className="rounded-xl border border-[#e2e8f0] p-3">
                        <div className="text-sm font-semibold text-slate-700">{st?.icon} ขั้น {st?.no}: {st?.label || k}</div>
                        <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                          {Object.entries(v.data || {}).filter(([, val]) => val !== '' && val != null).map(([kk, vv]) => (
                            <div key={kk}><span className="text-slate-400">{st?.fields?.find((f: Any) => f.key === kk)?.label || kk}:</span> {String(vv)}</div>
                          ))}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">บันทึกเมื่อ {new Date(v.at).toLocaleString('th-TH')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>)}
        </section>
      </div>
    </main>
  );
}

export default function PipelinePage() {
  return (
    <>
      <Header />
      <Suspense fallback={<main className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-500">กำลังโหลด…</main>}>
        <PipelineInner />
      </Suspense>
    </>
  );
}
