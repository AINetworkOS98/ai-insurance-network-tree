'use client';
// ─────────────────────────────────────────────────────────────────────────────
// /admin/line-oa — LINE OA Studio
//   1) ข้อความต้อนรับ   2) ตอบกลับอัตโนมัติ (+กล่องทดลอง)   3) ริชเมนู (สร้างภาพ+อัปโหลดจริง)
//   4) ผู้ติดตาม/บรอดแคสต์   5) เชื่อมต่อ/สถานะ (webhook, โควตา, OA)
//   ใช้ได้ทั้งคอมและมือถือ — ทุกอย่างบันทึกผ่าน /api/admin/line-oa/*
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LineOaAiPanel from '@/components/LineOaAiPanel';

export const dynamic = 'force-dynamic';

type Msg = { type: 'text'; text: string } | { type: 'image'; originalContentUrl: string; previewImageUrl: string } | { type: 'sticker'; packageId: string; stickerId: string };

const TABS = [
  { id: 'welcome', label: '👋 ข้อความต้อนรับ' },
  { id: 'rules', label: '🤖 ตอบกลับอัตโนมัติ' },
  { id: 'ai', label: '🧠 AI ตอบอัตโนมัติ' },
  { id: 'richmenu', label: '🎛 ริชเมนู' },
  { id: 'followers', label: '👥 ผู้ติดตาม / บรอดแคสต์' },
  { id: 'settings', label: '🔌 เชื่อมต่อ / สถานะ' },
] as const;

const MATCH_LABEL: Record<string, string> = {
  CONTAINS: 'มีคำนี้อยู่ในข้อความ',
  EXACT: 'ตรงทั้งข้อความ',
  STARTS_WITH: 'ขึ้นต้นด้วย',
  REGEX: 'นิพจน์ regex',
};
const KIND_LABEL: Record<string, { t: string; c: string }> = {
  rule: { t: 'เข้าเงื่อนไขกฎ', c: 'bg-emerald-100 text-emerald-700' },
  menu: { t: 'คำลัด "เมนู"', c: 'bg-sky-100 text-sky-700' },
  fallback: { t: 'ข้อความสำรอง', c: 'bg-amber-100 text-amber-700' },
  offline: { t: 'นอกเวลาทำการ', c: 'bg-indigo-100 text-indigo-700' },
  welcome: { t: 'ต้อนรับสมาชิกใหม่', c: 'bg-violet-100 text-violet-700' },
  ai: { t: 'AI ตอบ', c: 'bg-fuchsia-100 text-fuchsia-700' },
  'ai-fail': { t: 'AI ตอบไม่ได้ (ใช้ข้อความสำรอง)', c: 'bg-rose-100 text-rose-700' },
  'ai-limit': { t: 'ครบโควตา AI/ชั่วโมง', c: 'bg-amber-100 text-amber-700' },
  handoff: { t: 'ขอคุยกับเจ้าหน้าที่', c: 'bg-violet-100 text-violet-700' },
  greet: { t: 'ทักทาย', c: 'bg-violet-100 text-violet-700' },
  broadcast: { t: 'บรอดแคสต์', c: 'bg-slate-100 text-slate-600' },
  test: { t: 'ทดสอบ', c: 'bg-slate-100 text-slate-600' },
  none: { t: 'ไม่ตอบ (ไม่มีเงื่อนไขตรง)', c: 'bg-slate-100 text-slate-500' },
};

/* ── ตัวอย่างหน้าจอ LINE (มือถือ) ─────────────────────────────────────── */
function LinePreview({ messages, title = 'Akarapol OA' }: { messages: Msg[]; title?: string }) {
  return (
    <div className="w-full max-w-[340px] mx-auto rounded-[26px] border-4 border-slate-800 bg-[#8cabd9] overflow-hidden shadow-lg">
      <div className="bg-slate-800 text-white text-[11px] px-3 py-1 flex items-center justify-between">
        <span>9:41</span><span>{title}</span><span>▮▮▮</span>
      </div>
      <div className="p-3 space-y-2 min-h-[220px]">
        {(!messages || messages.length === 0) && <div className="text-center text-white/80 text-xs py-8">— ยังไม่มีข้อความ —</div>}
        {(messages || []).map((m, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-full bg-[#06C755] text-white text-[10px] flex items-center justify-center shrink-0">AI</div>
            <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap shadow max-w-[250px]">
              {m.type === 'text' ? (m as any).text : m.type === 'image' ? '🖼 [รูปภาพ]' : '🎟 [สติกเกอร์]'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── ตัวแก้ข้อความหลายก้อน (สูงสุด 5 ต่อการส่ง 1 ครั้ง) ─────────────────── */
function MessageEditor({ value, onChange, max = 5 }: { value: Msg[]; onChange: (v: Msg[]) => void; max?: number }) {
  const texts = (value || []).map((m) => (m.type === 'text' ? m.text : ''));
  const setAt = (i: number, t: string) => {
    const next = [...texts]; next[i] = t;
    onChange(next.map((x) => ({ type: 'text', text: x })) as Msg[]);
  };
  return (
    <div className="space-y-2">
      {texts.map((t, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="mt-2 text-xs text-slate-400 w-5 text-right">{i + 1}</span>
          <textarea
            value={t} onChange={(e) => setAt(i, e.target.value)} rows={3}
            className="flex-1 px-3 py-2 rounded-xl border border-[#dbeafe] bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300"
            placeholder="พิมพ์ข้อความที่ต้องการให้ LINE ส่งให้ลูกค้า…"
          />
          <button onClick={() => onChange(texts.filter((_, j) => j !== i).map((x) => ({ type: 'text', text: x })) as Msg[])}
            className="mt-2 px-2 py-1 rounded-lg text-rose-600 bg-rose-50 text-xs">ลบ</button>
        </div>
      ))}
      {texts.length < max && (
        <button onClick={() => onChange([...texts, ''].map((x) => ({ type: 'text', text: x })) as Msg[])}
          className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-xs font-medium border border-sky-100">+ เพิ่มข้อความ ({texts.length}/{max})</button>
      )}
    </div>
  );
}

export default function LineOaStudioPage() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('welcome');
  const [toast, setToast] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // กฎตอบกลับ
  const [ruleDraft, setRuleDraft] = useState<any>(null);
  const [simInput, setSimInput] = useState('');
  const [simResult, setSimResult] = useState<any>(null);

  // ริชเมนู
  const [rmSize, setRmSize] = useState('2500x1686');
  const [rmCols, setRmCols] = useState(3);
  const [rmRows, setRmRows] = useState(1);
  const [rmBar, setRmBar] = useState('เมนูคุยกับทีมงาน');
  const [rmTiles, setRmTiles] = useState<any[]>([]);
  const [rmBusy, setRmBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ผู้ติดตาม / บรอดแคสต์
  const [followers, setFollowers] = useState<any[]>([]);
  const [fQuery, setFQuery] = useState('');
  const [bcast, setBcast] = useState('');
  const [bcastResult, setBcastResult] = useState<any>(null);
  const [bcastBusy, setBcastBusy] = useState(false);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 4500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/line-oa', { credentials: 'include' });
      const j = await r.json();
      if (!j.ok) { flash('❌ ' + (j.error || 'โหลดไม่สำเร็จ')); return; }
      setData(j); setCfg(j.config || {});
    } catch { flash('❌ เชื่อมต่อไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const size = useMemo(() => {
    const s = data?.sizes?.[rmSize] || { width: 2500, height: 1686 };
    return s;
  }, [data, rmSize]);

  // สร้าง/ปรับช่องของริชเมนูตามจำนวนคอลัมน์×แถว
  const buildTiles = (cols: number, rows: number) => {
    const w = size.width, h = size.height;
    const base = [
      { emoji: '💰', title: 'สอบถามรายได้', sub: 'ค่าคอม · รายได้', action: 'สอบถามรายได้และค่าคอมมิชชั่น' },
      { emoji: '🤝', title: 'สมัครเป็นตัวแทน', sub: 'ขั้นตอน · เอกสาร', action: 'ต้องการสมัครเป็นตัวแทนประกัน' },
      { emoji: '🛠', title: 'แจ้งปัญหาระบบ', sub: 'เข้าใช้ไม่ได้ · ข้อมูลไม่ตรง', action: 'แจ้งปัญหาการใช้งานระบบ' },
      { emoji: '📊', title: 'ดูแผนตำแหน่ง', sub: 'เครือข่าย · ระดับตำแหน่ง', action: 'ขอดูแผนตำแหน่งของฉัน' },
      { emoji: '📄', title: 'ใบเสร็จ/สลิป', sub: 'ตรวจใบเสร็จเบี้ย', action: 'ตรวจสอบใบเสร็จและสลิป' },
      { emoji: '🔗', title: 'ลิงก์แนะนำเพื่อน', sub: 'QR · การ์ดแชร์', action: 'ขอลิงก์แนะนำเพื่อน' },
    ];
    const out: any[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = Math.round((w / cols) * c);
        const y = Math.round((h / rows) * r);
        const width = Math.round((w / cols) * (c + 1)) - x;
        const height = Math.round((h / rows) * (r + 1)) - y;
        const b = base[out.length % base.length];
        out.push({ x, y, width, height, ...b });
      }
    }
    setRmTiles(out);
  };
  useEffect(() => { buildTiles(rmCols, rmRows); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rmCols, rmRows, size.width, size.height]);

  /* ── วาดภาพริชเมนูด้วย canvas (แล้วส่งเป็น PNG ขึ้น LINE) ─────────────── */
  const drawCanvas = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const w = size.width, h = size.height;
    // วาดย่อเฉพาะตอนแสดงผล แต่ส่ง PNG ขนาดจริง
    const scale = cv.width / w;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b2b5b'; ctx.fillRect(0, 0, cv.width, cv.height);
    const pad = Math.round(26 * scale);
    ctx.fillStyle = '#ffffff'; ctx.font = `700 ${Math.round(40 * scale)}px "Leelawadee UI", "Sarabun", Tahoma, sans-serif`;
    ctx.fillText('AI INSURANCE NETWORK TREE', pad, Math.round(70 * scale));
    ctx.fillStyle = '#06C755'; ctx.font = `600 ${Math.round(24 * scale)}px "Leelawadee UI", Tahoma, sans-serif`;
    ctx.fillText('ทีมงาน + AI ผู้ช่วยอัตโนมัติ · ' + rmBar, pad, Math.round(108 * scale));

    for (const t of rmTiles) {
      const x = t.x * scale, y = (t.y + (h * 0.09)) * scale, tw = t.width * scale, th = t.height * scale * 0.91;
      ctx.fillStyle = '#ffffff';
      const r2 = Math.round(18 * scale);
      ctx.beginPath();
      // @ts-ignore
      if (ctx.roundRect) ctx.roundRect(x + pad, y, tw - pad * 2, th - pad, r2);
      else ctx.rect(x + pad, y, tw - pad * 2, th - pad);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0b1f12';
      ctx.font = `${Math.round(Math.min(78, th * 0.26))}px "Segoe UI Emoji", "Leelawadee UI", sans-serif`;
      ctx.fillText(t.emoji, x + tw / 2, y + th / 2 - Math.round(th * 0.12));
      ctx.font = `700 ${Math.round(Math.min(46, tw * 0.075))}px "Leelawadee UI", Tahoma, sans-serif`;
      ctx.fillText(String(t.title).slice(0, 18), x + tw / 2, y + th / 2 + Math.round(th * 0.09));
      ctx.font = `400 ${Math.round(Math.min(26, tw * 0.045))}px "Leelawadee UI", Tahoma, sans-serif`;
      ctx.fillStyle = '#41506b';
      ctx.fillText(String(t.sub || '').slice(0, 26), x + tw / 2, y + th / 2 + Math.round(th * 0.2));
      ctx.fillStyle = '#06C755';
      ctx.font = `700 ${Math.round(Math.min(26, tw * 0.045))}px "Leelawadee UI", Tahoma, sans-serif`;
      ctx.fillText('แตะเพื่อคุย ›', x + tw / 2, y + th / 2 + Math.round(th * 0.32));
      ctx.textAlign = 'left';
    }
  }, [rmTiles, rmBar, size.width, size.height]);

  useEffect(() => { drawCanvas(); }, [drawCanvas]);

  async function uploadRichMenu() {
    // วาดที่ขนาดจริงลง canvas แล้วย่อกลับ (ได้ภาพคุณภาพเต็มสำหรับอัปโหลด)
    const parent: HTMLCanvasElement | null = canvasRef.current;
    if (!parent) return;
    const prevW = parent.width, prevH = parent.height;
    parent.width = size.width; parent.height = size.height;
    drawCanvas();
    const blob: Blob | null = await new Promise((res) => parent.toBlob((b) => res(b), 'image/png'));
    parent.width = prevW; parent.height = prevH;
    drawCanvas();
    if (!blob) { flash('❌ สร้างภาพไม่สำเร็จ'); return; }

    const fd = new FormData();
    fd.append('image', blob, 'richmenu.png');
    fd.append('size', rmSize);
    fd.append('name', 'ริชเมนู — ' + rmBar);
    fd.append('chatBarText', rmBar.slice(0, 14));
    fd.append('setDefault', '1');
    fd.append('areas', JSON.stringify(rmTiles.map((t) => ({
      bounds: { x: t.x, y: t.y, width: t.width, height: t.height },
      action: t.uri ? { type: 'uri', uri: t.uri } : t.actionType === 'postback' ? { type: 'postback', data: t.action, displayText: t.title } : { type: 'message', text: t.action },
    }))));

    setRmBusy(true);
    try {
      const r = await fetch('/api/admin/line-oa/richmenu', { method: 'POST', credentials: 'include', body: fd });
      const j = await r.json();
      if (j.ok) { flash('✅ สร้างริชเมนูบน LINE สำเร็จ' + (j.defaultSet ? ' และตั้งเป็นเมนูเริ่มต้นแล้ว' : '')); load(); }
      else flash('❌ ' + (j.error || 'ไม่สำเร็จ'));
    } catch { flash('❌ อัปโหลดไม่สำเร็จ'); }
    finally { setRmBusy(false); }
  }

  async function setDefaultMenu(id: string) {
    const r = await fetch('/api/admin/line-oa/richmenu', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    const j = await r.json();
    flash(j.ok ? '✅ ตั้งเป็นเมนูเริ่มต้นแล้ว' : '❌ ' + (j.error || 'ไม่สำเร็จ'));
    load();
  }
  async function removeMenu(id: string) {
    if (!confirm('ลบฟลิชเมนูนี้จาก LINE?')) return;
    const r = await fetch('/api/admin/line-oa/richmenu?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
    const j = await r.json();
    flash(j.ok ? '🗑 ลบแล้ว' : '❌ ' + (j.error || 'ลบไม่สำเร็จ'));
    load();
  }

  async function saveConfig(patch: any, label = 'บันทึกแล้ว') {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/line-oa', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cfg, ...patch }) });
      const j = await r.json();
      if (j.ok) { setCfg(j.config); flash('✅ ' + label); load(); } else flash('❌ ' + (j.error || 'บันทึกไม่สำเร็จ'));
    } catch { flash('❌ บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  }

  async function saveRule() {
    if (!ruleDraft) return;
    const isNew = !ruleDraft.id;
    const payload = {
      ...ruleDraft,
      keywords: typeof ruleDraft.keywords === 'string' ? ruleDraft.keywords.split(',').map((s: string) => s.trim()).filter(Boolean) : ruleDraft.keywords,
      messages: Array.isArray(ruleDraft.messages) ? ruleDraft.messages : String(ruleDraft.messages || '').split('\n---\n').map((t) => ({ type: 'text', text: t })),
    };
    const r = await fetch('/api/admin/line-oa/rules', { method: isNew ? 'POST' : 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j.ok) { flash('✅ บันทึกกฎแล้ว'); setRuleDraft(null); load(); } else flash('❌ ' + (j.error || 'ไม่สำเร็จ'));
  }
  async function toggleRule(rule: any) {
    await fetch('/api/admin/line-oa/rules', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }) });
    load();
  }
  async function deleteRule(rule: any) {
    if (!confirm('ลบกฎ "' + rule.name + '"?')) return;
    await fetch('/api/admin/line-oa/rules?id=' + rule.id, { method: 'DELETE', credentials: 'include' });
    load();
  }
  async function runSim() {
    const r = await fetch('/api/admin/line-oa/simulate', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: simInput }) });
    const j = await r.json();
    if (j.ok) setSimResult(j); else flash('❌ ' + (j.error || 'ทดลองไม่สำเร็จ'));
  }

  async function loadFollowers(q = '') {
    const r = await fetch('/api/admin/line-oa/followers?limit=100' + (q ? '&q=' + encodeURIComponent(q) : ''), { credentials: 'include' });
    const j = await r.json();
    if (j.ok) setFollowers(j.followers || []);
  }
  useEffect(() => { if (tab === 'followers' && followers.length === 0) loadFollowers(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab]);

  async function sendTest() {
    if (!bcast.trim()) return;
    setBcastBusy(true);
    try {
      const r = await fetch('/api/admin/line-oa/broadcast', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'test', text: bcast }) });
      const j = await r.json();
      setBcastResult(j);
      flash(j.ok ? '✅ ส่งข้อความทดสอบเข้าหา LINE ของคุณแล้ว' : '❌ ' + (j.error || 'ส่งไม่สำเร็จ'));
    } finally { setBcastBusy(false); }
  }
  async function doBroadcast() {
    if (!confirm('ยืนยันส่งข้อความหาผู้ติดตามทุกคน? การส่งจะนับโควตาข้อความรายเดือน')) return;
    setBcastBusy(true);
    try {
      const r = await fetch('/api/admin/line-oa/broadcast', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'broadcast', text: bcast, confirm: true }) });
      const j = await r.json();
      setBcastResult(j);
      flash(j.ok ? `✅ ส่งสำเร็จ ${j.sent} ราย (ล้มเหลว ${j.failed})` : '❌ ' + (j.error || 'ส่งไม่สำเร็จ'));
    } finally { setBcastBusy(false); }
  }

  async function webhookAction(action: 'set' | 'test') {
    const r = await fetch('/api/admin/line-oa/webhook', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
    const j = await r.json();
    if (action === 'set') flash(j.ok ? '✅ ตั้ง Webhook ของ OA มาที่ระบบนี้แล้ว' : '❌ ' + (j.error || 'ไม่สำเร็จ'));
    else flash(j.ok ? '✅ LINE ยิงทดสอบเข้า Webhook ได้สำเร็จ' : '❌ ทดสอบไม่ผ่าน: ' + JSON.stringify(j.test?.detail || j.error || {}).slice(0, 160));
    load();
  }

  const envOk = data?.env?.ready;
  const hookMatch = data?.webhook?.endpoint && data?.expectedWebhookUrl && data.webhook.endpoint === data.expectedWebhookUrl;

  return (
    <div className="flex w-full">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 bg-white min-h-screen">
        <Header />
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">LINE OA Studio</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              จัดการ OA {data?.oa?.basicId ? data.oa.basicId : '—'} · ข้อความต้อนรับ · ตอบกลับอัตโนมัติ · ริชเมนู · ผู้ติดตาม
            </p>
          </div>
          <button onClick={load} className="px-3 py-2 rounded-xl bg-sky-50 text-sky-700 text-sm border border-sky-100">↻ รีเฟรช</button>
        </div>

        {/* แถบสถานะ */}
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className={'px-2 py-1 rounded-full ' + (envOk ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
            {envOk ? '✓ ตั้งค่า LINE ครบ' : '✗ ยังขาด: ' + (data?.env?.missing || []).join(', ')}
          </span>
          {data?.oa && <span className="px-2 py-1 rounded-full bg-sky-100 text-sky-700">OA: {data.oa.displayName} ({data.oa.basicId})</span>}
          {data?.quota && <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">โควตาข้อความ: ใช้ {data.quota.used}{data.quota.limit ? ` / ${data.quota.limit}` : ' (ไม่จำกัด)'}</span>}
          <span className={'px-2 py-1 rounded-full ' + (hookMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
            {hookMatch ? '✓ Webhook ชี้มาที่ระบบนี้' : '⚠ Webhook ยังไม่ชี้มาที่ระบบนี้'}
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600">ผู้ติดตาม {data?.stats?.followers ?? 0} · ตอบกลับแล้ว {data?.stats?.replies ?? 0} ครั้ง</span>
          {data?.lineError && <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-600">{data.lineError}</span>}
        </div>

        {/* แท็บ */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'whitespace-nowrap px-3 py-2 rounded-xl text-sm border ' + (tab === t.id ? 'bg-sky-600 text-white border-sky-600' : 'bg-[#f0f7ff] text-slate-600 border-[#dbeafe]')}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && <div className="text-sm text-slate-500 py-8 text-center">กำลังโหลด…</div>}

        {/* ── 1) ข้อความต้อนรับ ─────────────────────────────────────────── */}
        {!loading && tab === 'welcome' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm text-slate-800">ข้อความต้อนรับ (ส่งเมื่อมีคนแอดเพื่อน)</div>
                  <div className="text-xs text-slate-500 mt-0.5">ใช้ "ข้อความตอบกลับ" — ไม่กินโควตารายเดือน ส่งได้ไม่จำกัด</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!cfg.welcomeEnabled} onChange={(e) => setCfg({ ...cfg, welcomeEnabled: e.target.checked })} /> เปิด
                </label>
              </div>
              <MessageEditor value={cfg.welcomeMessages || []} onChange={(v) => setCfg({ ...cfg, welcomeMessages: v })} />
              <button disabled={saving} onClick={() => saveConfig({ welcomeEnabled: cfg.welcomeEnabled, welcomeMessages: cfg.welcomeMessages }, 'บันทึกข้อความต้อนรับแล้ว')}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium disabled:opacity-50">💾 บันทึกข้อความต้อนรับ</button>

              <hr className="border-[#dbeafe]" />
              <div className="font-semibold text-sm text-slate-800">ข้อความเมื่อพิมพ์คำว่า "เมนู"</div>
              <div className="text-xs text-slate-500 -mt-2">คำลัดที่เปิดใช้: <span className="font-mono">{(cfg.menuKeywords || []).join(', ')}</span></div>
              <MessageEditor value={cfg.menuMessages || []} onChange={(v) => setCfg({ ...cfg, menuMessages: v })} />
              <input value={(cfg.menuKeywords || []).join(', ')} onChange={(e) => setCfg({ ...cfg, menuKeywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 rounded-xl border border-[#dbeafe] bg-white text-sm" placeholder="คำลัด คั่นด้วยจุลภาค" />
              <button disabled={saving} onClick={() => saveConfig({ menuMessages: cfg.menuMessages, menuKeywords: cfg.menuKeywords }, 'บันทึกเมนูลัดแล้ว')}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium disabled:opacity-50">💾 บันทึกเมนูลัด</button>

              <hr className="border-[#dbeafe]" />
              <div className="font-semibold text-sm text-slate-800">ข้อความสำรอง (เมื่อไม่มีกฎไหนเข้าเงื่อนไข)</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!cfg.fallbackEnabled} onChange={(e) => setCfg({ ...cfg, fallbackEnabled: e.target.checked })} /> เปิดใช้ข้อความสำรอง
              </label>
              <MessageEditor value={cfg.fallbackMessages || []} onChange={(v) => setCfg({ ...cfg, fallbackMessages: v })} />
              <button disabled={saving} onClick={() => saveConfig({ fallbackEnabled: cfg.fallbackEnabled, fallbackMessages: cfg.fallbackMessages }, 'บันทึกข้อความสำรองแล้ว')}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium disabled:opacity-50">💾 บันทึกข้อความสำรอง</button>

              <hr className="border-[#dbeafe]" />
              <div className="font-semibold text-sm text-slate-800">นอกเวลาทำการ</div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!cfg.offlineEnabled} onChange={(e) => setCfg({ ...cfg, offlineEnabled: e.target.checked })} /> เปิดใช้ข้อความนอกเวลา
              </label>
              <div className="flex gap-2 items-center text-sm">
                <span className="text-slate-500">เริ่ม</span>
                <input value={cfg.offlineStart || '18:00'} onChange={(e) => setCfg({ ...cfg, offlineStart: e.target.value })} className="w-24 px-2 py-1 rounded-lg border border-[#dbeafe]" />
                <span className="text-slate-500">ถึง</span>
                <input value={cfg.offlineEnd || '08:30'} onChange={(e) => setCfg({ ...cfg, offlineEnd: e.target.value })} className="w-24 px-2 py-1 rounded-lg border border-[#dbeafe]" />
                <span className="text-xs text-slate-400">(เวลาไทย)</span>
              </div>
              <MessageEditor value={cfg.offlineMessages || []} onChange={(v) => setCfg({ ...cfg, offlineMessages: v })} />
              <button disabled={saving} onClick={() => saveConfig({ offlineEnabled: cfg.offlineEnabled, offlineStart: cfg.offlineStart, offlineEnd: cfg.offlineEnd, offlineMessages: cfg.offlineMessages }, 'บันทึกข้อความนอกเวลาแล้ว')}
                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-medium disabled:opacity-50">💾 บันทึกนอกเวลา</button>
            </div>
            <div className="space-y-4">
              <div className="card p-4">
                <div className="font-semibold text-sm text-slate-800 mb-3">ตัวอย่างบนมือถือ (สิ่งที่ลูกค้าเห็น)</div>
                <LinePreview messages={(cfg.welcomeMessages || []) as Msg[]} />
              </div>
              <div className="card p-4">
                <div className="font-semibold text-sm text-slate-800 mb-3">ตัวอย่างเมนูลัด / นอกเวลา</div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LinePreview messages={(cfg.menuMessages || []) as Msg[]} title="พิมพ์ว่า เมนู" />
                  <LinePreview messages={(cfg.offlineMessages || []) as Msg[]} title="นอกเวลาทำการ" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 2) ตอบกลับอัตโนมัติ ───────────────────────────────────────── */}
        {!loading && tab === 'rules' && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div>
                  <div className="font-semibold text-sm text-slate-800">กล่องทดลองตอบกลับอัตโนมัติ</div>
                  <div className="text-xs text-slate-500">พิมพ์ข้อความเหมือนลูกค้า แล้วดูว่าระบบจะตอบอะไร (ใช้กฎจริง ไม่ส่งออก LINE)</div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!cfg.autoReplyEnabled} onChange={(e) => { setCfg({ ...cfg, autoReplyEnabled: e.target.checked }); saveConfig({ autoReplyEnabled: e.target.checked }, 'อัปเดตสถานะตอบกลับอัตโนมัติ'); }} />
                  เปิดตอบกลับอัตโนมัติ
                </label>
              </div>
              <div className="flex gap-2">
                <input value={simInput} onChange={(e) => setSimInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runSim()}
                  className="flex-1 px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" placeholder="เช่น สอบถามรายได้" />
                <button onClick={runSim} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm">ทดลอง</button>
              </div>
              {simResult && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#f0f7ff] border border-blue-100 p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={'px-2 py-0.5 rounded-full text-[11px] ' + (KIND_LABEL[simResult.kind]?.c || 'bg-slate-100 text-slate-600')}>{KIND_LABEL[simResult.kind]?.t || simResult.kind}</span>
                      {simResult.rule && <span className="text-xs text-slate-500">กฎ: {simResult.rule.name} (ลำดับ {simResult.rule.priority})</span>}
                    </div>
                    {simResult.note && <div className="text-xs text-slate-500 mt-1">{simResult.note}</div>}
                    <div className="mt-2 text-xs text-slate-600">คำลัดเมนู: <span className="font-mono">{(simResult.menuKeywords || []).join(', ')}</span></div>
                  </div>
                  <LinePreview messages={(simResult.messages || []) as Msg[]} title="ผลการทดลอง" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">กฎทั้งหมด ({data?.rules?.length || 0}) — ตรวจจากลำดับน้อยไปมาก</div>
              <button onClick={() => setRuleDraft({ name: '', enabled: true, priority: 100, matchType: 'CONTAINS', keywords: [], messages: [{ type: 'text', text: '' }], tag: '' })}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm">+ สร้างกฎใหม่</button>
            </div>

            {ruleDraft && (
              <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={ruleDraft.name} onChange={(e) => setRuleDraft({ ...ruleDraft, name: e.target.value })} placeholder="ชื่อกฎ เช่น สอบถามรายได้"
                    className="px-3 py-2 rounded-xl border border-[#dbeafe] text-sm md:col-span-2" />
                  <select value={ruleDraft.matchType} onChange={(e) => setRuleDraft({ ...ruleDraft, matchType: e.target.value })} className="px-3 py-2 rounded-xl border border-[#dbeafe] text-sm">
                    {Object.entries(MATCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input type="number" value={ruleDraft.priority} onChange={(e) => setRuleDraft({ ...ruleDraft, priority: Number(e.target.value) })}
                    className="px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" placeholder="ลำดับ (น้อย=ก่อน)" />
                </div>
                <input value={Array.isArray(ruleDraft.keywords) ? ruleDraft.keywords.join(', ') : ruleDraft.keywords}
                  onChange={(e) => setRuleDraft({ ...ruleDraft, keywords: e.target.value })} placeholder="คำค้น คั่นด้วยจุลภาค เช่น รายได้, ค่าคอม, commission"
                  className="w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" />
                <div className="text-xs text-slate-500">ข้อความตอบกลับ (สูงสุด 5 ข้อความ)</div>
                <MessageEditor value={Array.isArray(ruleDraft.messages) ? ruleDraft.messages : []} onChange={(v) => setRuleDraft({ ...ruleDraft, messages: v })} />
                <div className="flex gap-2 items-center">
                  <input value={ruleDraft.tag || ''} onChange={(e) => setRuleDraft({ ...ruleDraft, tag: e.target.value })} placeholder="ติดป้ายผู้ติดตาม (ไม่บังคับ) เช่น สนใจสมัคร"
                    className="px-3 py-2 rounded-xl border border-[#dbeafe] text-sm flex-1" />
                  <button onClick={saveRule} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm">💾 บันทึกกฎ</button>
                  <button onClick={() => setRuleDraft(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm">ยกเลิก</button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {(data?.rules || []).map((r: any) => (
                <div key={r.id} className="card p-3 flex flex-wrap items-center gap-3">
                  <span className={'px-2 py-1 rounded-full text-[11px] ' + (r.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>{r.enabled ? 'เปิด' : 'ปิด'}</span>
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm font-semibold text-slate-800">{r.name} <span className="text-xs font-normal text-slate-400">· ลำดับ {r.priority}</span></div>
                    <div className="text-xs text-slate-500">{MATCH_LABEL[r.matchType] || r.matchType}: <span className="font-mono">{(r.keywords || []).join(', ')}</span> · ใช้ไป {r.hits} ครั้ง{r.tag ? ` · ป้าย ${r.tag}` : ''}</div>
                  </div>
                  <div className="text-xs text-slate-500 max-w-[280px] truncate">{(r.messages || []).map((m: any) => m.text).join(' | ')}</div>
                  <button onClick={() => setRuleDraft({ ...r, keywords: (r.keywords || []).join(', ') })} className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs">แก้ไข</button>
                  <button onClick={() => toggleRule(r)} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs">{r.enabled ? 'ปิด' : 'เปิด'}</button>
                  <button onClick={() => deleteRule(r)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs">ลบ</button>
                </div>
              ))}
              {!data?.rules?.length && <div className="text-sm text-slate-500 text-center py-6">ยังไม่มีกฎ — กด "+ สร้างกฎใหม่" เพื่อเริ่ม</div>}
            </div>
          </div>
        )}

        {/* ── 2.5) AI ตอบกลับอัตโนมัติ (Hermes + DeepSeek) ─────────────── */}
        {!loading && tab === 'ai' && <LineOaAiPanel onSaved={load} />}

        {/* ── 3) ริชเมนู ───────────────────────────────────────────────── */}
        {!loading && tab === 'richmenu' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card p-4 space-y-3">
              <div className="font-semibold text-sm text-slate-800">สร้างริชเมนูใหม่ (ระบบวาดภาพให้เอง → อัปโหลดขึ้น LINE)</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-500">ขนาด
                  <select value={rmSize} onChange={(e) => setRmSize(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm">
                    {Object.entries(data?.sizes || {}).map(([k, v]: any) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-500">แถบข้อความใต้เมนู
                  <input value={rmBar} onChange={(e) => setRmBar(e.target.value)} maxLength={14} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" />
                </label>
                <label className="text-xs text-slate-500">คอลัมน์
                  <select value={rmCols} onChange={(e) => setRmCols(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm">
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label className="text-xs text-slate-500">แถว
                  <select value={rmRows} onChange={(e) => setRmRows(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm">
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>

              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {rmTiles.map((t, i) => (
                  <div key={i} className="rounded-xl border border-[#dbeafe] bg-white p-2 grid grid-cols-12 gap-2 items-center">
                    <input value={t.emoji} onChange={(e) => { const n = [...rmTiles]; n[i] = { ...t, emoji: e.target.value }; setRmTiles(n); }} className="col-span-2 px-2 py-1 rounded-lg border border-[#dbeafe] text-center" />
                    <input value={t.title} onChange={(e) => { const n = [...rmTiles]; n[i] = { ...t, title: e.target.value }; setRmTiles(n); }} className="col-span-4 px-2 py-1 rounded-lg border border-[#dbeafe] text-sm" placeholder="หัวข้อ" />
                    <input value={t.action} onChange={(e) => { const n = [...rmTiles]; n[i] = { ...t, action: e.target.value }; setRmTiles(n); }} className="col-span-6 px-2 py-1 rounded-lg border border-[#dbeafe] text-xs" placeholder="ข้อความ/ลิงก์ที่จะส่งเมื่อกด" />
                    <input value={t.sub || ''} onChange={(e) => { const n = [...rmTiles]; n[i] = { ...t, sub: e.target.value }; setRmTiles(n); }} className="col-span-5 px-2 py-1 rounded-lg border border-[#dbeafe] text-xs" placeholder="คำอธิบายย่อย" />
                    <select value={t.uri ? 'uri' : (t.actionType || 'message')} onChange={(e) => { const n = [...rmTiles]; n[i] = { ...t, actionType: e.target.value, uri: e.target.value === 'uri' ? (t.uri || 'https://') : undefined }; setRmTiles(n); }} className="col-span-3 px-2 py-1 rounded-lg border border-[#dbeafe] text-xs">
                      <option value="message">ส่งข้อความ</option>
                      <option value="uri">เปิดลิงก์</option>
                      <option value="postback">postback</option>
                    </select>
                    <div className="col-span-4 text-[10px] text-slate-400 font-mono">{t.width}×{t.height} @ {t.x},{t.y}</div>
                  </div>
                ))}
              </div>

              <button disabled={rmBusy} onClick={uploadRichMenu} className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50">
                {rmBusy ? 'กำลังสร้าง/อัปโหลด…' : '🚀 สร้างริชเมนูบน LINE + ตั้งเป็นเมนูเริ่มต้น'}
              </button>
              <div className="text-[11px] text-slate-500">
                LINE บังคับขนาดภาพเป๊ะตามที่เลือก (ระบบวาดให้ตรงสเปกแล้ว) · ไฟล์ PNG ไม่เกิน 1 MB · ปุ่มแบบ "ส่งข้อความ" จะเข้ากฎตอบกลับอัตโนมัติทันที
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-4">
                <div className="font-semibold text-sm text-slate-800 mb-2">ตัวอย่างที่ระบบจะอัปโหลด ({size.width}×{size.height})</div>
                <canvas ref={canvasRef} width={640} height={Math.round(640 * size.height / size.width)} className="w-full rounded-xl border border-[#dbeafe]" />
              </div>
              <div className="card p-4">
                <div className="font-semibold text-sm text-slate-800 mb-2">ริชเมนูที่มีอยู่บน LINE ({data?.richMenus?.length || 0})</div>
                <div className="space-y-2">
                  {(data?.richMenus || []).map((m: any) => (
                    <div key={m.richMenuId} className="flex items-center gap-3 flex-wrap bg-white rounded-xl border border-[#dbeafe] p-2">
                      <div className="flex-1 min-w-[160px]">
                        <div className="text-sm text-slate-800">{m.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{m.richMenuId} · {m.size?.width}×{m.size?.height} · {(m.areas || []).length} ปุ่ม</div>
                      </div>
                      {data?.defaultRichMenuId === m.richMenuId && <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px]">เมนูเริ่มต้น</span>}
                      <button onClick={() => setDefaultMenu(m.richMenuId)} className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs">ตั้งเป็นเริ่มต้น</button>
                      <button onClick={() => removeMenu(m.richMenuId)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs">ลบ</button>
                    </div>
                  ))}
                  {!data?.richMenus?.length && <div className="text-sm text-slate-500 text-center py-4">ยังไม่มีริชเมนูบน LINE — สร้างจากด้านซ้ายได้เลย</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4) ผู้ติดตาม / บรอดแคสต์ ─────────────────────────────────── */}
        {!loading && tab === 'followers' && (
          <div className="space-y-4">
            <div className="card p-4">
              <div className="font-semibold text-sm text-slate-800 mb-2">ส่งข้อความ (push) — นับโควตารายเดือน {data?.quota?.limit ? `ใช้ ${data.quota.used}/${data.quota.limit}` : ''}</div>
              <textarea value={bcast} onChange={(e) => setBcast(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" placeholder="ข้อความที่ต้องการส่ง…" />
              <div className="flex gap-2 mt-2 flex-wrap">
                <button disabled={bcastBusy} onClick={sendTest} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm disabled:opacity-50">📨 ทดสอบส่งหาตัวเอง</button>
                <button disabled={bcastBusy} onClick={doBroadcast} className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm disabled:opacity-50">📢 ส่งหาผู้ติดตามทุกคน</button>
                <span className="text-xs text-slate-500 self-center">Tips: ใช้ "ตอบกลับอัตโนมัติ" จะไม่กินโควตา</span>
              </div>
              {bcastResult && <pre className="mt-2 text-[11px] bg-[#f0f7ff] rounded-xl p-2 overflow-x-auto">{JSON.stringify(bcastResult, null, 1).slice(0, 800)}</pre>}
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <div className="font-semibold text-sm text-slate-800">ผู้ติดตาม ({data?.stats?.followers ?? 0} คน · เลิกติดตาม {data?.stats?.unfollowed ?? 0})</div>
                <div className="flex gap-2">
                  <input value={fQuery} onChange={(e) => setFQuery(e.target.value)} placeholder="ค้นหาชื่อ" className="px-3 py-1.5 rounded-xl border border-[#dbeafe] text-sm" />
                  <button onClick={() => loadFollowers(fQuery)} className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-sm">ค้นหา</button>
                </div>
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {followers.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 bg-white rounded-xl border border-[#dbeafe] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f.pictureUrl ? <img src={f.pictureUrl} alt="" className="w-9 h-9 rounded-full" /> : <div className="w-9 h-9 rounded-full bg-slate-200" />}
                    <div className="flex-1 min-w-[140px]">
                      <div className="text-sm text-slate-800">{f.displayName || '(ไม่ทราบชื่อ)'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{f.lineUserId.slice(0, 10)}… · ข้อความ {f.messageCount} ครั้ง · {f.followed ? 'ติดตามอยู่' : 'เลิกติดตาม'}</div>
                    </div>
                    <input defaultValue={f.tag || ''} onBlur={async (e) => {
                      await fetch('/api/admin/line-oa/followers', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, tag: e.target.value }) });
                      flash('✅ บันทึกป้ายแล้ว');
                    }} placeholder="ป้าย" className="w-32 px-2 py-1 rounded-lg border border-[#dbeafe] text-xs" />
                  </div>
                ))}
                {!followers.length && <div className="text-sm text-slate-500 text-center py-6">ยังไม่มีผู้ติดตามในระบบ — เมื่อมีคนแอด OA และทัก ระบบจะบันทึกอัตโนมัติ</div>}
              </div>
            </div>

            <div className="card p-4">
              <div className="font-semibold text-sm text-slate-800 mb-2">บันทึกข้อความล่าสุด</div>
              <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                {(data?.logs || []).map((l: any) => (
                  <div key={l.id} className="flex items-start gap-2 text-xs border-b border-[#eef6ff] py-1.5">
                    <span className={'px-1.5 py-0.5 rounded ' + (l.direction === 'IN' ? 'bg-slate-100 text-slate-600' : 'bg-sky-100 text-sky-700')}>{l.direction === 'IN' ? 'เข้า' : 'ออก'}</span>
                    <span className={'px-1.5 py-0.5 rounded ' + (KIND_LABEL[l.matchKind]?.c || 'bg-slate-50 text-slate-400')}>{KIND_LABEL[l.matchKind]?.t || (l.matchKind || '—')}</span>
                    <span className="flex-1 text-slate-600 line-clamp-2">{l.text}</span>
                    <span className="text-slate-400 whitespace-nowrap">{new Date(l.createdAt).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                  </div>
                ))}
                {!data?.logs?.length && <div className="text-sm text-slate-500 text-center py-4">ยังไม่มีบันทึก</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── 5) เชื่อมต่อ / สถานะ ─────────────────────────────────────── */}
        {!loading && tab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-4 space-y-3">
              <div className="font-semibold text-sm text-slate-800">Webhook (ประตูรับข้อความจาก LINE)</div>
              <div className="text-xs text-slate-500">URL ที่ระบบนี้ต้องใช้</div>
              <div className="font-mono text-xs bg-white rounded-xl border border-[#dbeafe] p-2 break-all">{data?.expectedWebhookUrl}</div>
              <div className="text-xs">
                URL ปัจจุบันของ OA: <span className="font-mono">{data?.webhook?.endpoint || '(ยังไม่ตั้ง)'}</span>
                <span className={'ml-2 px-2 py-0.5 rounded-full ' + (hookMatch ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{hookMatch ? 'ตรงกับระบบนี้' : 'ไม่ตรง'}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => webhookAction('set')} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm">🔗 ตั้ง Webhook ให้ OA ชี้มาที่ระบบนี้</button>
                <button onClick={() => webhookAction('test')} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm">🧪 ให้ LINE ยิงทดสอบ</button>
              </div>
              <div className="text-[11px] text-slate-500">LINE จะยิงทดสอบแล้วต้องได้ success:true — นี่คือหลักฐานว่า URL + ลายเซ็นทำงานจริง</div>
            </div>

            <div className="card p-4 space-y-3">
              <div className="font-semibold text-sm text-slate-800">สถานะการเชื่อมต่อ</div>
              <div className="text-sm space-y-1">
                <div>Access token: {data?.env?.tokenConfigured ? '✅ ตั้งแล้ว' : '❌ ยังไม่มี'}</div>
                <div>Channel secret (ตรวจลายเซ็น): {data?.env?.secretConfigured ? '✅ ตั้งแล้ว' : '❌ ยังไม่มี'}</div>
                <div>OA: {data?.oa ? `${data.oa.displayName} · ${data.oa.basicId}` : '—'}</div>
                <div>โควตาข้อความ push: {data?.quota ? `${data.quota.used}${data.quota.limit ? ` / ${data.quota.limit}` : ''}` : '—'}</div>
                <div>ตอบกลับอัตโนมัติ: {cfg.autoReplyEnabled ? 'เปิด' : 'ปิด'} · ข้อความต้อนรับ: {cfg.welcomeEnabled ? 'เปิด' : 'ปิด'}</div>
              </div>
              <hr className="border-[#dbeafe]" />
              <div className="font-semibold text-sm text-slate-800">ทางเข้าจัดการ OA ของ LINE (สำหรับตั้งค่าที่ API ทำไม่ได้)</div>
              <div className="text-xs text-slate-600 leading-relaxed">
                • ข้อความต้อนรับแบบ "เปิดแชทแล้วเห็นทันที" (Greeting) ตั้งได้ที่ OA Manager → ตั้งค่า → ข้อความต้อนรับ<br />
                • ระบบนี้ส่งข้อความต้อนรับอัตโนมัติทันทีเมื่อมีคน "แอดเพื่อน" (ผ่าน Webhook) ซึ่งทำงานแทนได้และนับผลได้
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href="https://manager.line.biz/" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm">OA Manager (ตั้งค่า OA)</a>
                <a href="https://chat.line.biz/" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm">ตอบแชทลูกค้า</a>
                <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm">LINE Developers</a>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm shadow-lg z-50 max-w-[92vw]">{toast}</div>
        )}
      </main>
    </div>
  );
}
