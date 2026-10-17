'use client';
// ─────────────────────────────────────────────────────────────────────────────
// LineOaAiPanel — แท็บ "AI ตอบกลับอัตโนมัติ" ของ LINE OA Studio
//   ควบคุมด้วย Hermes + โมเดล DeepSeek (ผ่าน /api/admin/line-oa/ai และบันทึกที่ /api/admin/line-oa)
//   มี: เปิด/ปิด · โหมดตอบ (เมื่อไม่เข้ากฎ / ทุกข้อความ) · คำสั่งระบบ · ฐานความรู้ · ค่าย-รุ่นโมเดล
//        คำที่แปลว่า "ขอคุยกับคน" · จำกัดคำตอบต่อชั่วโมง · กล่องทดลองคุยกับ AI จริง
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';

type Msg = { type: 'text'; text: string } | { type: string; [k: string]: any };

export default function LineOaAiPanel({ onSaved }: { onSaved?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [draft, setDraft] = useState<any>({
    aiEnabled: false, aiMode: 'fallback', aiSystemPrompt: '', aiKnowledge: '', aiProvider: '', aiModel: '',
    aiMaxChars: 900, aiTemperature: 0.3, aiPerHour: 20, aiHandoffKeywords: [], aiHandoffMessage: [], aiFailMessage: [],
  });
  const [testInput, setTestInput] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  // ดัชนีเนื้อหาทุกหน้า (ให้ AI ตอบเจาะเนื้อหาแต่ละหน้า)
  const [idxInfo, setIdxInfo] = useState<any>(null);
  const [idxBusy, setIdxBusy] = useState(false);

  const loadIndex = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/line-oa/site-index', { credentials: 'include' });
      const j = await r.json();
      if (j.ok) setIdxInfo(j);
    } catch { /* ไม่สำคัญต่อการตั้งค่า */ }
  }, []);
  useEffect(() => { loadIndex(); }, [loadIndex]);

  async function rebuildIndex() {
    setIdxBusy(true);
    try {
      const r = await fetch('/api/admin/line-oa/site-index', { method: 'POST', credentials: 'include' });
      const j = await r.json();
      if (j.ok) { flash(`✅ อ่านเนื้อหาเสร็จ ${j.pages} หน้า (ข้าม ${j.skipped})`); loadIndex(); }
      else flash('❌ ' + (j.error || 'อัปเดตดัชนีไม่สำเร็จ'));
    } catch { flash('❌ อัปเดตดัชนีไม่สำเร็จ'); }
    finally { setIdxBusy(false); }
  }

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 5000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/line-oa/ai', { credentials: 'include' });
      const j = await r.json();
      if (!j.ok) { flash('❌ ' + (j.error || 'โหลดไม่สำเร็จ')); return; }
      setInfo(j);
      setDraft({
        ...j.saved,
        aiHandoffMessage: (j.saved?.aiHandoffMessage || []).map((m: any) => m?.text || ''),
        aiFailMessage: (j.saved?.aiFailMessage || []).map((m: any) => m?.text || ''),
        aiHandoffKeywords: (j.saved?.aiHandoffKeywords || []).join(', '),
      });
    } catch { flash('❌ เชื่อมต่อไม่สำเร็จ'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toLines = (v: any) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((s: string) => String(s).trim()).filter(Boolean);
  const payload = () => ({
    aiEnabled: !!draft.aiEnabled,
    aiMode: draft.aiMode,
    aiSystemPrompt: draft.aiSystemPrompt || '',
    aiKnowledge: draft.aiKnowledge || '',
    aiProvider: draft.aiProvider || '',
    aiModel: draft.aiModel || '',
    aiMaxChars: Number(draft.aiMaxChars) || 900,
    aiTemperature: Number(draft.aiTemperature ?? 0.3),
    aiPerHour: Number(draft.aiPerHour) || 20,
    aiHandoffKeywords: toLines(draft.aiHandoffKeywords),
    aiHandoffMessage: toLines(draft.aiHandoffMessage).map((t: string) => ({ type: 'text', text: t })),
    aiFailMessage: toLines(draft.aiFailMessage).map((t: string) => ({ type: 'text', text: t })),
  });

  async function save() {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/line-oa', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
      const j = await r.json();
      if (j.ok) { flash('✅ บันทึกการตั้งค่า AI แล้ว — มีผลกับข้อความถัดไปทันที'); onSaved?.(); load(); }
      else flash('❌ ' + (j.error || 'บันทึกไม่สำเร็จ'));
    } catch { flash('❌ บันทึกไม่สำเร็จ'); }
    finally { setBusy(false); }
  }

  async function test(text: string) {
    if (!text.trim()) return;
    setTestBusy(true); setTestResult(null);
    try {
      const r = await fetch('/api/admin/line-oa/ai', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, draft: payload() }) });
      const j = await r.json();
      setTestResult(j);
      if (!j.ok && j.error) flash('⚠ ' + j.error);
    } catch { flash('❌ ทดสอบไม่สำเร็จ'); }
    finally { setTestBusy(false); }
  }

  const provider = info?.provider || {};
  const keyOk = info?.keyAvailable;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-sm text-slate-800">AI ตอบกลับอัตโนมัติ (Hermes + DeepSeek)</div>
            <div className="text-xs text-slate-500 mt-0.5">ตอบผ่านข้อความตอบกลับ (ไม่กินโควตารายเดือน) · ใช้ฐานความรู้ของทีมเป็นหลัก</div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!draft.aiEnabled} onChange={(e) => setDraft({ ...draft, aiEnabled: e.target.checked })} /> เปิดใช้ AI
          </label>
        </div>

        <div className={'text-xs rounded-xl p-2 border ' + (keyOk ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700')}>
          {keyOk
            ? `ค่ายที่ใช้จริง: ${provider.provider} · รุ่น: ${provider.model} · พร้อมตอบ`
            : `ยังใช้ไม่ได้: ${provider.provider || '?'} — ยังไม่มี API key (ตรวจ AI_PROVIDER / DEEPSEEK_API_KEY ใน Vercel แล้ว deploy ใหม่)`}
          {info?.usage && <span className="ml-2">· ตอบไปแล้ว 24 ชม.: {info.usage.last24h} ครั้ง ({info.usage.users24h} คน)</span>}
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1">โหมดการตอบ</div>
          <div className="flex flex-col sm:flex-row gap-2">
            {[['fallback', 'ตอบเมื่อไม่มีกฎเข้าเงื่อนไข'], ['all', 'AI ตอบทุกข้อความ (ยกเว้นคำลัด "เมนู")']].map(([v, t]) => (
              <button key={v} onClick={() => setDraft({ ...draft, aiMode: v })}
                className={'px-3 py-2 rounded-xl text-xs border text-left ' + (draft.aiMode === v ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-600 border-[#dbeafe]')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">ค่ายโมเดล
            <select value={draft.aiProvider || ''} onChange={(e) => setDraft({ ...draft, aiProvider: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm">
              <option value="">อัตโนมัติ (DeepSeek ก่อน)</option>
              {(info?.providers || ['deepseek']).map((p: string) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">รุ่น (เว้นว่าง = รุ่นเริ่มต้น)
            <input value={draft.aiModel || ''} onChange={(e) => setDraft({ ...draft, aiModel: e.target.value })} placeholder={provider.model || 'deepseek-flash'} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" />
          </label>
          <label className="text-xs text-slate-500">ความยาวคำตอบสูงสุด (ตัวอักษร)
            <input type="number" value={draft.aiMaxChars} onChange={(e) => setDraft({ ...draft, aiMaxChars: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" />
          </label>
          <label className="text-xs text-slate-500">จำกัดคำตอบต่อผู้ใช้/ชั่วโมง
            <input type="number" value={draft.aiPerHour} onChange={(e) => setDraft({ ...draft, aiPerHour: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" />
          </label>
          <label className="text-xs text-slate-500 col-span-2">ความสร้างสรรค์ (0 = ตรงตำรา · 1 = หลากหลาย)
            <input type="range" min={0} max={1} step={0.1} value={draft.aiTemperature} onChange={(e) => setDraft({ ...draft, aiTemperature: e.target.value })} className="mt-2 w-full" />
          </label>
        </div>

        <label className="text-xs text-slate-500 block">คำสั่งระบบ (บทบาท+กติกาของ AI)
          <textarea value={draft.aiSystemPrompt} onChange={(e) => setDraft({ ...draft, aiSystemPrompt: e.target.value })} rows={7}
            placeholder="เว้นว่าง = ใช้คำสั่งมาตรฐานของระบบ (ดูตัวอย่างได้ที่ปุ่มด้านล่าง)"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-xs leading-relaxed font-mono" />
        </label>

        <label className="text-xs text-slate-500 block">ฐานความรู้ของทีม (AI ใช้ตอบเป็นหลัก)
          <textarea value={draft.aiKnowledge} onChange={(e) => setDraft({ ...draft, aiKnowledge: e.target.value })} rows={8}
            placeholder="วางข้อมูลธุรกิจ: ระบบมีอะไรบ้าง · ขั้นตอนสมัคร · เงื่อนไขรายได้ · ลิงก์สำคัญ"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-xs leading-relaxed" />
        </label>

        <label className="text-xs text-slate-500 block">คำที่แปลว่า "ขอคุยกับคน" (คั่นด้วยจุลภาค)
          <input value={draft.aiHandoffKeywords} onChange={(e) => setDraft({ ...draft, aiHandoffKeywords: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" />
        </label>
        <label className="text-xs text-slate-500 block">ข้อความเมื่อขอคุยกับเจ้าหน้าที่ (บรรทัดละข้อความ)
          <textarea value={(draft.aiHandoffMessage || []).join('\n')} onChange={(e) => setDraft({ ...draft, aiHandoffMessage: e.target.value.split('\n') })} rows={2} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-xs" />
        </label>
        <label className="text-xs text-slate-500 block">ข้อความเมื่อ AI ตอบไม่ได้ (บรรทัดละข้อความ)
          <textarea value={(draft.aiFailMessage || []).join('\n')} onChange={(e) => setDraft({ ...draft, aiFailMessage: e.target.value.split('\n') })} rows={2} className="mt-1 w-full px-3 py-2 rounded-xl border border-[#dbeafe] text-xs" />
        </label>

        <div className="flex gap-2 flex-wrap">
          <button disabled={busy} onClick={save} className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm disabled:opacity-50">💾 บันทึกการตั้งค่า AI</button>
          <button onClick={() => setDraft({ ...draft, aiSystemPrompt: info?.defaults?.prompt || '', aiKnowledge: info?.defaults?.knowledge || '' })}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-sm">↺ ใช้คำสั่ง/ฐานความรู้มาตรฐาน</button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-4">
          <div className="font-semibold text-sm text-slate-800 mb-1">ทดลองคุยกับ AI (เรียกโมเดลจริง)</div>
          <div className="text-xs text-slate-500 mb-2">ใช้ค่าในฟอร์มด้านซ้าย (ยังไม่ต้องบันทึก) — ใช้ฐานความรู้ + ประวัติแชทล่าสุดประกอบการตอบ</div>
          <div className="flex gap-2">
            <input value={testInput} onChange={(e) => setTestInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && test(testInput)}
              className="flex-1 px-3 py-2 rounded-xl border border-[#dbeafe] text-sm" placeholder="เช่น ถ้าอยากสมัครเป็นตัวแทนต้องทำยังไง" />
            <button onClick={() => test(testInput)} disabled={testBusy} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm disabled:opacity-50">{testBusy ? 'กำลังคิด…' : 'ถาม AI'}</button>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {['สมัครเป็นตัวแทนต้องทำยังไง', 'รายได้โอนเมื่อไหร่', 'คุยกับเจ้าหน้าที่', 'เมนูทั้งหมด'].map((q) => (
              <button key={q} onClick={() => { setTestInput(q); test(q); }} className="px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 text-xs border border-sky-100">“{q}”</button>
            ))}
          </div>
          {testResult && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <span className={'px-2 py-0.5 rounded-full ' + (testResult.route === 'handoff' ? 'bg-violet-100 text-violet-700' : testResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
                  {testResult.route === 'handoff' ? 'ส่งต่อทีมงาน' : testResult.ok ? 'AI ตอบ' : 'AI ตอบไม่ได้'}
                </span>
                {testResult.provider && <span className="text-slate-500">{testResult.provider}{testResult.model ? ` · ${testResult.model}` : ''}{testResult.ms ? ` · ${testResult.ms} ms` : ''}</span>}
                {testResult.error && <span className="text-rose-600">{String(testResult.error).slice(0, 160)}</span>}
              </div>
              <div className="bg-[#8cabd9] rounded-2xl p-3">
                <div className="bg-white rounded-2xl rounded-bl-sm px-3 py-2 text-[13px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {testResult.text || '(ไม่มีข้อความ)'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-sm text-slate-800">ดัชนีเนื้อหาทุกหน้า (ให้ AI ตอบเจาะหน้า)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {idxInfo ? `อ่านแล้ว ${idxInfo.pageCount} หน้า · อัปเดต ${idxInfo.savedAt ? new Date(idxInfo.savedAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '—'}` : 'ยังไม่ได้สร้างดัชนี'}
              </div>
            </div>
            <button disabled={idxBusy} onClick={rebuildIndex} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs disabled:opacity-50">
              {idxBusy ? 'กำลังอ่านทุกหน้า…' : '🔄 อัปเดตดัชนีทุกหน้า'}
            </button>
          </div>
          {idxInfo?.pages?.length > 0 && (
            <div className="mt-2 max-h-[26vh] overflow-y-auto text-[11px] text-slate-600 space-y-0.5">
              {idxInfo.pages.map((p: any) => (
                <div key={p.path} className="flex items-center gap-2">
                  <span className="font-mono text-slate-400 shrink-0 w-[130px] truncate">{p.path}</span>
                  <span className="flex-1 truncate">{p.title}</span>
                  <span className="text-slate-400 shrink-0">{p.chars}</span>
                </div>
              ))}
            </div>
          )}
          {(idxInfo?.skipped || []).length > 0 && (
            <div className="mt-2 text-[11px] text-amber-600">
              ข้าม {idxInfo.skipped.length} หน้า: {idxInfo.skipped.slice(0, 4).map((s: any) => `${s.path} (${s.reason})`).join(' · ')}
            </div>
          )}
          <div className="text-[11px] text-slate-400 mt-2">กดอัปเดตทุกครั้งที่เพิ่ม/แก้หน้าเว็บ — AI จะตอบโดยอ้างเนื้อหาในหน้านั้นจริง</div>
        </div>

        <div className="card p-4">
          <div className="font-semibold text-sm text-slate-800 mb-2">ลำดับการตอบของระบบ (สั้น ๆ)</div>
          <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
            <li>นอกเวลาทำการ (ถ้าเปิด) → ข้อความนอกเวลา</li>
            <li>คำลัด "เมนู" → ข้อความเมนูรวมทุกเมนูของระบบ</li>
            <li>กฎตอบกลับอัตโนมัติ (ตามลำดับ priority)</li>
            <li><b>AI ตอบ</b> — เมื่อไม่เข้ากฎ (หรือทุกข้อความถ้าตั้งโหมด all)</li>
            <li>AI ตอบไม่ได้ → ข้อความสำรองของ AI → ข้อความสำรองรวม</li>
          </ol>
          <div className="text-[11px] text-slate-500 mt-2">
            AI จะถูกเรียกเฉพาะข้อความตัวอักษร และไม่เกิน {draft.aiPerHour || 20} ครั้งต่อผู้ใช้ต่อชั่วโมง — ป้องกันค่าใช้จ่ายบานปลาย
          </div>
        </div>

        <div className="card p-4">
          <div className="font-semibold text-sm text-slate-800 mb-2">ตัวอย่างคำสั่งระบบมาตรฐาน (แก้ได้)</div>
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap bg-white rounded-xl border border-[#dbeafe] p-2 max-h-[30vh] overflow-y-auto">{info?.defaults?.prompt}</pre>
        </div>
      </div>

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-slate-800 text-white text-sm shadow-lg z-50 max-w-[92vw]">{toast}</div>}
    </div>
  );
}
