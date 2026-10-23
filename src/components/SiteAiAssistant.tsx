'use client';
// ─────────────────────────────────────────────────────────────────────────────
// SiteAiAssistant — ผู้ช่วย AI ลอยได้ทุกหน้า (Hermes · DeepSeek)
//   • ใช้ API เดียวกับหน้า /contact (/api/contact/ai) → คำตอบชุดเดียวกันทั้งเว็บและ LINE OA
//   • ตอบจากฐานความรู้ทีม + ข้อมูลสดในระบบ + ลิงก์/เมนูทั้งหมด (อัปเดตเองเมื่อแอปเพิ่มหน้าใหม่)
//   • ซ่อนในหน้าผู้ดูแล (/admin*) และหน้า /contact (มีกล่องแชทอยู่ในหน้าแล้ว), ซ่อนเมื่อพิมพ์อยู่
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Turn = { role: 'user' | 'ai'; text: string };

const QUICK = ['มีเมนูอะไรบ้าง', 'สมัครเป็นตัวแทนต้องทำยังไง', 'รายได้โอนเมื่อไหร่', 'ขอลิงก์ทั้งหมด'];

export default function SiteAiAssistant() {
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'ai', text: 'สวัสดีครับ 🙏 ผมคือผู้ช่วย AI ของทีม ตอบจากข้อมูลจริงในระบบ\nถามเรื่องเมนู สมัครตัวแทน หรือรายได้ได้เลยครับ' },
  ]);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hide = path.startsWith('/admin') || path.startsWith('/contact') || path.startsWith('/login') || path.startsWith('/no-access');

  useEffect(() => { if (hide) setOpen(false); }, [hide]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setMsg('');
    setBusy(true);
    try {
      const r = await fetch('/api/contact/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }) });
      const j = await r.json().catch(() => null);
      const answer = j?.ok ? j.text : (j?.fallback || j?.error || 'ขออภัยครับ ระบบขัดข้องชั่วคราว');
      setTurns((t) => [...t, { role: 'ai', text: String(answer) }]);
    } catch {
      setTurns((t) => [...t, { role: 'ai', text: 'เชื่อมต่อไม่ได้ครับ ลองใหม่อีกครั้ง หรือพิมพ์หาทีมงานใน LINE OA' }]);
    } finally {
      setBusy(false);
      setTimeout(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }), 60);
    }
  }

  if (hide) return null;

  return (
    <div className="fixed right-3 z-[70] print:hidden" style={{ bottom: 'calc(var(--visitor-h, 56px) + 12px)' }}>
      {open ? (
        <div className="w-[92vw] max-w-[360px] rounded-2xl bg-white border border-[#dbeafe] shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#0b2b5b] text-white">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate">🤖 ผู้ช่วย AI ของทีม</div>
              <div className="text-[10px] opacity-80">ตอบจากข้อมูลจริงในระบบ · อัตโนมัติ 24 ชม.</div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="ปิด" className="px-2 py-1 rounded-lg bg-white/15 text-xs">✕</button>
          </div>

          <div ref={boxRef} className="px-3 py-2 space-y-2 max-h-[46vh] overflow-y-auto bg-[#f0f7ff]">
            {turns.map((t, i) => (
              <div key={i} className={'flex ' + (t.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={'max-w-[88%] px-3 py-2 rounded-2xl text-[12.5px] leading-relaxed whitespace-pre-wrap ' +
                  (t.role === 'user' ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-[#e6f0fb]')}>
                  {t.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-[11px] text-slate-500">กำลังคิด…</div>}
          </div>

          <div className="px-2 pt-2 flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button key={q} onClick={() => ask(q)} disabled={busy}
                className="px-2 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] border border-sky-100 disabled:opacity-50">{q}</button>
            ))}
          </div>

          <div className="p-2 flex gap-2">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(msg)}
              placeholder="พิมพ์คำถาม…" className="flex-1 px-3 py-2 rounded-xl border border-[#dbeafe] text-[13px] focus:outline-none focus:ring-2 focus:ring-sky-300" />
            <button onClick={() => ask(msg)} disabled={busy || !msg.trim()} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[13px] disabled:opacity-50">{busy ? '…' : 'ถาม'}</button>
          </div>
          <div className="px-2 pb-2 text-[10px] text-slate-400">AI อาจคลาดเคลื่อนในรายละเอียดเฉพาะราย · เรื่องเงิน/กรมธรรม์ยึดเอกสารบริษัท</div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="เปิดผู้ช่วย AI" title="ผู้ช่วย AI ของทีม"
          className="w-14 h-14 rounded-full bg-[#0b2b5b] text-white shadow-lg hover:bg-[#123a75] flex items-center justify-center text-[26px] leading-none">
          🤖
        </button>
      )}
    </div>
  );
}
