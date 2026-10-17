'use client';
// ─────────────────────────────────────────────────────────────────────────────
// ContactAiChat — กล่อง "ถามผู้ช่วย AI" บนหน้า /contact
//   ใช้เอนจินเดียวกับ LINE OA (Hermes + DeepSeek) → คำตอบตรงกันทั้งเว็บและ LINE
//   ข้อมูลที่ AI ใช้อ้างอิง = ฐานความรู้ทีม + ข้อมูลสดภาพรวมของระบบ (ไม่มีข้อมูลรายบุคคล)
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';

type Turn = { role: 'user' | 'ai'; text: string };

const QUICK = ['สมัครเป็นตัวแทนต้องทำยังไง', 'มีเมนูอะไรบ้างในระบบ', 'รายได้โอนเมื่อไหร่', 'ทีมมีสมาชิกกี่คน'];

export default function ContactAiChat() {
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'ai', text: 'สวัสดีครับ 🙏 ผมคือผู้ช่วย AI ของทีม (ตอบจากข้อมูลจริงในระบบ) — สอบถามเรื่องสมัครตัวแทน เมนูระบบ หรือรายได้ได้เลยครับ' },
  ]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setMsg('');
    setBusy(true);
    try {
      const r = await fetch('/api/contact/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }),
      });
      const j = await r.json();
      const answer = j?.ok ? j.text : (j?.fallback || j?.error || 'ขออภัยครับ ระบบขัดข้องชั่วคราว');
      setTurns((t) => [...t, { role: 'ai', text: String(answer) }]);
    } catch {
      setTurns((t) => [...t, { role: 'ai', text: 'เชื่อมต่อไม่ได้ครับ ลองอีกครั้ง หรือทัก LINE OA ของทีม' }]);
    } finally {
      setBusy(false);
      setTimeout(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }), 60);
    }
  }

  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold text-sm text-slate-800">🤖 ถามผู้ช่วย AI ของทีม</div>
          <div className="text-xs text-slate-500 mt-0.5">ตอบจากฐานความรู้ + ข้อมูลจริงในระบบ · ไม่เปิดเผยข้อมูลส่วนบุคคล</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="px-3 py-2 rounded-xl bg-sky-600 text-white text-sm">
          {open ? 'ซ่อน' : 'เปิดแชทถาม AI'}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <div ref={boxRef} className="rounded-2xl bg-[#f0f7ff] border border-[#dbeafe] p-3 max-h-[46vh] overflow-y-auto space-y-2">
            {turns.map((t, i) => (
              <div key={i} className={'flex ' + (t.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={'max-w-[86%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ' +
                  (t.role === 'user' ? 'bg-sky-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-[#e6f0fb]')}>
                  {t.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-xs text-slate-500">กำลังคิด…</div>}
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {QUICK.map((q) => (
              <button key={q} onClick={() => ask(q)} disabled={busy}
                className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-xs border border-sky-100 disabled:opacity-50">“{q}”</button>
            ))}
          </div>

          <div className="flex gap-2 mt-2">
            <input
              value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(msg)}
              placeholder="พิมพ์คำถาม เช่น สมัครเป็นตัวแทนต้องเตรียมอะไรบ้าง"
              className="flex-1 px-3 py-2.5 rounded-xl border border-[#dbeafe] text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
            />
            <button onClick={() => ask(msg)} disabled={busy || !msg.trim()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm disabled:opacity-50">{busy ? '…' : 'ถาม'}</button>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            AI อาจตอบคลาดเคลื่อนได้ในรายละเอียดเฉพาะราย — เรื่องเงิน/กรมธรรม์ยึดประกาศของบริษัทและคำยืนยันจากทีมงาน
          </div>
        </div>
      )}
    </div>
  );
}
