'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ===== Types =====
type SearchMode = 'FAST' | 'SMART' | 'DEEP';
type DataType = 'plain' | 'table' | 'csv' | 'json' | 'url' | 'mixed';
type Intent = 'GENERAL_QUERY'|'SEARCH'|'ANALYZE'|'SUMMARIZE'|'COMPARE'|'CALCULATE'|'SEARCH_MEMBER'|'SEARCH_TEAM'|'SEARCH_PERFORMANCE'|'SEARCH_NETWORK'|'GENERATE_REPORT'|'OPEN_PAGE'|'IMPORT_DATA'|'VALIDATE_DATA';

interface PasteInfo { type: DataType; rows: number; cols: string[]; preview: string[][]; raw: string; detected: string; }
interface ChatMsg { role:'user'|'ai'; text:string; meta?: string; actions?: string[]; links?: {title:string; url:string; source:string}[]; trace?: { intent?: string; skills?: string[]; tools?: string[]; toolResults?: {tool:string;ok:boolean;elapsedMs:number;data:any}[]; memoryUsed?: number; via?: string }; steps?: {label:string;detail?:string}[]; }

function detectPaste(raw: string): PasteInfo {
  const t = raw.trim();
  if (!t) return { type:'plain', rows:0, cols:[], preview:[], raw, detected:'ข้อความทั่วไป' };
  const urlRe = /^https?:\/\/\S+$/m;
  if (urlRe.test(t.split('\n')[0].trim()) && t.split('\n').length <= 3) {
    return { type:'url', rows:1, cols:['URL'], preview:[[t.split('\n')[0]]], raw, detected:'URL' };
  }
  try { const j = JSON.parse(t); if (Array.isArray(j) && j.length>0 && typeof j[0]==='object') {
    const cols = Object.keys(j[0]); const preview = j.slice(0,8).map((r:any)=> cols.map(c=> String(r[c]??'')));
    return { type:'json', rows: j.length, cols, preview, raw, detected:'JSON Dataset' };
  } if (!Array.isArray(j) && typeof j==='object'){ const cols=Object.keys(j); return { type:'json', rows:1, cols, preview:[cols.map(c=>String((j as any)[c]))], raw, detected:'JSON Object' };}} catch {}
  const lines = t.split('\n').filter(l=>l.trim());
  if (lines.length >= 2) {
    const delim = t.includes('\t') ? '\t' : t.includes(',') ? ',' : t.includes('|') ? '|' : null;
    if (delim) {
      const rows = lines.map(l=> l.split(delim).map(s=>s.trim()));
      const colCount = Math.max(...rows.map(r=>r.length));
      if (colCount >= 2 && rows.length >= 2) {
        const cols = rows[0];
        const isHeader = cols.some(c=> isNaN(Number(c)) && c.length>0 && c.length<30);
        const dataRows = isHeader ? rows.slice(1) : rows;
        const preview = (isHeader ? rows.slice(0,9) : rows.slice(0,8));
        return { type: delim===','?'csv':'table', rows: dataRows.length, cols: isHeader? cols : cols.map((_,i)=>`คอลัมน์ ${i+1}`), preview, raw, detected: delim===','?'CSV / ตาราง': 'ตาราง' };
      }
    }
    if (lines.length>=3) {
      const cols = lines[0].split(/\s{2,}|\t/).filter(Boolean);
      if (cols.length>=2) return { type:'table', rows: lines.length-1, cols, preview: lines.slice(0,8).map(l=>l.split(/\s{2,}|\t/)), raw, detected:'ตาราง' };
    }
  }
  return { type:'plain', rows: t.split('\n').length, cols:[], preview:[], raw, detected:'ข้อความ' };
}

function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/(คำนวณ|ยอดรวม|รวม.*บาท|sum|total|เฉลี่ย)/.test(s)) return 'CALCULATE';
  if (/(เปรียบเทียบ|compare|เทียบ)/.test(s)) return 'COMPARE';
  if (/(สรุป|summarize|ย่อ)/.test(s)) return 'SUMMARIZE';
  if (/(วิเคราะห์|analyze|ตรวจ.*ข้อมูล|ใคร.*เกิน|ใคร.*สูงสุด)/.test(s)) return 'ANALYZE';
  if (/(นำเข้า|import|บันทึกเข้าระบบ)/.test(s)) return 'IMPORT_DATA';
  if (/(ตรวจสอบ|validate|ตรวจ.*ใบเสร็จ)/.test(s)) return 'VALIDATE_DATA';
  if (/(สมาชิก|member|รหัสสมาชิก)/.test(s)) return 'SEARCH_MEMBER';
  if (/(ทีม|สายงาน|ผัง.*5|network)/.test(s)) return 'SEARCH_NETWORK';
  if (/(ผลงาน|ยอดขาย|performance|เบี้ย)/.test(s)) return 'SEARCH_PERFORMANCE';
  if (/(เปิด.*หน้า|open page|ไปที่)/.test(s)) return 'OPEN_PAGE';
  if (/(ค้นหา|หา.*ให้|search|find)/.test(s)) return 'SEARCH';
  return 'GENERAL_QUERY';
}

const MODE_LABEL: Record<SearchMode,string> = { FAST:'เร็ว', SMART:'อัจฉริยะ', DEEP:'วิเคราะห์เชิงลึก' };

export default function AIIntelligentSearch({ variant='hero', topContent }: { variant?: 'hero' | 'chat', topContent?: React.ReactNode }){
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<SearchMode>('SMART');
  const [pasteInfo, setPasteInfo] = useState<PasteInfo|null>(null);
  const [contextDataset, setContextDataset] = useState<PasteInfo|null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [traceSteps, setTraceSteps] = useState<{label:string;detail?:string;status:string}[]>([]);
  const [lastTrace, setLastTrace] = useState<ChatMsg["trace"]|null>(null);
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [abortFlag, setAbortFlag] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number|null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<{file:File; name:string; size:number; type:string; url:string|null}[]>([]);
  const [fetchedUrl, setFetchedUrl] = useState<string|null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(()=>{ if(taRef.current){ taRef.current.style.height='auto'; const h=Math.min(taRef.current.scrollHeight, 260); taRef.current.style.height= h+'px'; } },[input]);
  useEffect(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; },[msgs, loading, pasteInfo, streaming]);
  // เลื่อนลงล่างสุดอัตโนมัติเมื่อมีข้อความใหม่ — ช่องพิมพ์อยู่ล่างสุดเสมอ
  useEffect(()=>{ if(scrollRef.current && msgs.length>0){ requestAnimationFrame(()=>{ if(scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }); } },[msgs]);

  const handlePaste = useCallback((e: React.ClipboardEvent)=>{
    const pasted = e.clipboardData.getData('text');
    if (pasted && pasted.length>30){
      const info = detectPaste(pasted);
      if (info.rows>1 || info.type!=='plain') setPasteInfo(info);
    }
  },[]);

  const handleInputChange = (v: string)=>{
    setInput(v);
    if (v.trim().length>40){
      const info = detectPaste(v);
      if (info.rows>1 || info.type==='url') setPasteInfo(info);
      else if (pasteInfo && v.length<30) setPasteInfo(null);
    } else if (v.trim().length===0) setPasteInfo(null);
    // ถ้าพิมพ์ URL เดี่ยวๆ — เตรียมให้กดดึงข้อความได้ทันที
    const urlMatch = v.trim().match(/^https?:\/\/\S+$/);
    if(urlMatch && v.trim().length<2000) setPasteInfo({ type:'url', rows:1, cols:['URL'], preview:[[v.trim()]], raw: v.trim(), detected:'URL' });
  };

  const handleFile = async (f: File)=>{
    const text = await f.text().catch(()=> '');
    const info = detectPaste(text || f.name);
    if (text) { setPasteInfo({ ...info, raw: text, detected: `${f.name} • ${info.detected}` }); }
    setInput(prev=> prev? prev+'\n'+f.name : f.name);
  };

  const handleFiles = async (files: FileList)=>{
    const arr = Array.from(files);
    if(arr.length===0) return;
    const names = arr.map(f=> f.name).join(', ');
    // โชว์ชิปไฟล์ก่อน
    setAttachedFiles(prev=> [...prev, ...arr.map(f=> ({ file:f, name:f.name, size:f.size, type:f.type, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }))]);
    setInput(prev=> prev? prev+'\n'+names : names);
    // อ่านข้อความในไฟล์จริงผ่าน /api/read-file (รองรับ PDF/DOCX/XLSX/รูป OCR)
    try{
      const fd = new FormData();
      arr.forEach(f=> fd.append('files', f));
      const res = await fetch('/api/read-file', { method:'POST', body: fd });
      const j = await res.json().catch(()=>null);
      if(j?.ok && Array.isArray(j.files)){
        const combined = j.files.map((x:any)=> `=== ${x.name} (${x.chars} ตัวอักษร) ===\n${x.text}`).join('\n\n').slice(0, 20000);
        const previewText = combined.slice(0, 8000);
        // สร้าง PasteInfo จากข้อความที่อ่านได้ เพื่อส่งให้ AI ต่อ
        const info = detectPaste(previewText || combined);
        setPasteInfo({ ...info, raw: combined, detected: arr.length>1 ? `${arr.length} ไฟล์ • อ่านข้อความแล้ว` : `${arr[0].name} • อ่านข้อความแล้ว` });
        // เก็บข้อความเต็มไว้ใน attachedFiles สำหรับส่งให้ AI
        // ใช้ datasetRaw ตอน runQuery จะอ่านจาก pasteInfo.raw อยู่แล้ว
      } else {
        // fallback เดิม — ถ้าอ่านไม่สำเร็จ
        let combinedRaw = '';
        let detected = '';
        for(const f of arr){
          const isText = /\.(txt|csv|json|md)$/i.test(f.name) || f.type.startsWith('text/');
          if(isText){
            const t = await f.text().catch(()=> '');
            if(t){ combinedRaw += (combinedRaw? '\n':'') + t; if(!detected) detected = f.name; }
          } else if(f.type.startsWith('image/')){
            if(!detected) detected = 'รูปภาพ';
          } else {
            if(!detected) detected = 'ไฟล์';
          }
        }
        if(combinedRaw){
          const info = detectPaste(combinedRaw);
          setPasteInfo({ ...info, raw: combinedRaw, detected: arr.length>1 ? `${arr.length} ไฟล์ • ${info.detected}` : `${arr[0].name} • ${info.detected}` });
        } else {
          setPasteInfo({ type:'plain', rows: arr.length, cols:['ชื่อไฟล์','ขนาด'], preview: arr.slice(0,8).map(f=> [f.name, (f.size/1024).toFixed(1)+' KB']), raw: names, detected: arr.length>1 ? `${arr.length} ไฟล์ • รูป/ไฟล์` : `${arr[0].name} • รูป/ไฟล์` });
        }
      }
    } catch{
      // fallback เงียบ
    }
  };

  const clearContext = ()=>{ setContextDataset(null); setPasteInfo(null); setMsgs([]); setTraceSteps([]); setLastTrace(null); setInput(''); setAttachedFiles([]); setFetchedUrl(null); };

  const copyText = async (text: string, idx: number)=>{
    try{ await navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(()=> setCopiedIdx(null), 1600); } catch{}
  };
  const copyAll = async ()=>{
    const all = msgs.map(m=> `${m.role==='user'?'คุณ':'AI'}: ${m.text}`).join('\n\n');
    try{ await navigator.clipboard.writeText(all); setCopiedAll(true); setTimeout(()=> setCopiedAll(false), 1600); } catch{}
  };

  const runQuery = async (queryOverride?: string)=>{
    const q = (queryOverride ?? input).trim();
    if (!q && !pasteInfo) return;
    const effectiveDataset = pasteInfo ?? contextDataset;
    if (pasteInfo) setContextDataset(pasteInfo);
    // เก็บ URL ที่ดึงมาเพื่อแนบลิงก์ไปกับข้อความ
    const urlToAttach = fetchedUrl || (pasteInfo?.type==='url' ? pasteInfo.raw.trim() : null);
    const metaSuffix = urlToAttach ? ` • 🔗 ${urlToAttach}` : '';
    const intent = detectIntent(q || 'วิเคราะห์ข้อมูลที่วาง');
    // ถ้าเป็นค้นหา (เพลง/ทั่วไป) — ดึงลิงก์เว็บ/YouTube มาแนบก่อน
    let searchLinks: {title:string; url:string; snippet:string; source:string}[] = [];
    let searchYoutubeUrl: string | null = null;
    const isSearchIntent = /(ค้นหา|หา.*ให้|search|find|เพลง|music|song|youtube|ยูทูป|อริสมันต์)/i.test(q) || intent==='SEARCH' || intent==='SEARCH_MEMBER';
    if (q && isSearchIntent) {
      try{
        const sr = await fetch('/api/search', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query: q, mode})});
        const sj = await sr.json().catch(()=>null);
        if(sj?.ok && Array.isArray(sj.links)){ searchLinks = sj.links.slice(0,6); searchYoutubeUrl = sj.youtubeUrl||null; }
      } catch{}
    }
    const userMsg: ChatMsg = { role:'user', text: q || '(วางข้อมูลให้วิเคราะห์)', meta: effectiveDataset? `${effectiveDataset.detected}${metaSuffix} • ${effectiveDataset.rows} รายการ` : (urlToAttach ? `🔗 ${urlToAttach}` : (searchLinks.length>0 ? `🔍 พบ ${searchLinks.length} ลิงก์` : undefined)) };
    setMsgs(m=> [...m, userMsg]);
    setInput('');
    setPasteInfo(null);
    setLoading(true); setStreaming(true); setAbortFlag(false);
    const abort = new AbortController();
    const aiIndexRef = { idx: -1 };
    // เพิ่มกรอบ AI ว่างไว้ก่อน แล้วค่อยเติมทีละ token แบบ Hermes streaming
    setMsgs(m=> { const copy=[...m, {role:'ai' as const, text:'', actions: []}]; aiIndexRef.idx = copy.length-1; return copy; });
    // ถ้ามีลิงก์ค้นหา — ฉีดเข้าไปในกรอบ AI ทันที ก่อนสตรีม
    if(searchLinks.length>0){
      const linkBlock = `\n\n🔗 ลิงก์ที่เกี่ยวข้อง:\n` + searchLinks.map((l,i)=> `${i+1}. ${l.title} — ${l.url}`).join('\n');
      // เก็บไว้เติมท้ายหลังสตรีมจบ
      (aiIndexRef as any).pendingLinks = linkBlock;
      (aiIndexRef as any).links = searchLinks;
    }
    setLoading(false);
    let fullText = '';
    let gotToken = false;
    try{
      const res = await fetch('/api/ai/stream', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: q, mode, intent, contextRows: effectiveDataset?.rows ?? 0, contextType: effectiveDataset?.type ?? null, hasDataset: !!effectiveDataset, datasetRaw: effectiveDataset?.raw?.slice(0,8000) }), signal: abort.signal });
      if (!res.ok || !res.body) throw new Error('no stream');
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf='';
      while(true){
        if (abortFlag) { abort.abort(); break; }
        const {done, value} = await reader.read(); if(done) break;
        buf += dec.decode(value, {stream:true});
        const parts = buf.split('\n\n'); buf = parts.pop() || '';
        for(const part of parts){
          const lines = part.split('\n').filter(l=> l.startsWith('data: '));
          for(const l of lines){
            const jsonStr = l.slice(6);
            try{
              const evt = JSON.parse(jsonStr);
              if(evt.type==='token' && evt.text){
                gotToken=true; fullText+=evt.text;
                setMsgs(m=> { const copy=[...m]; if(aiIndexRef.idx>=0) copy[aiIndexRef.idx]={...copy[aiIndexRef.idx], text: fullText}; return copy; });
              } else if(evt.type==='done'){
                if(evt.answer && !gotToken) { fullText=evt.answer; setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText}; return c; }); }
                else if(evt.answer) fullText=evt.answer;
              } else if(evt.type==='step'){
                const st = { label: evt.label || evt.step, detail: evt.detail, status: evt.status || 'done' };
                setTraceSteps(prev=> {
                  const idx = prev.findIndex(s=> s.label===st.label);
                  if(idx>=0){ const c=[...prev]; c[idx]=st; return c; }
                  return [...prev, st];
                });
              } else if(evt.type==='tool_result'){
                setLastTrace(prev=> {
                  const tr = prev ?? { toolResults: [] } as any;
                  const list = [...(tr.toolResults ?? []), { tool: evt.tool, ok: evt.ok, elapsedMs: evt.elapsedMs, data: evt.data }];
                  return { ...tr, toolResults: list };
                });
              } else if(evt.type==='meta'){
                setLastTrace({ intent: evt.intent, skills: evt.skills, tools: evt.tools, memoryUsed: evt.memoryUsed, toolResults: [] });
                if(evt.intent || evt.tools){
                  const steps: any[] = [];
                  if(evt.intent) steps.push({label:'วิเคราะห์เจตนา', detail: evt.intent, status:'done'});
                  if(evt.tools) steps.push({label:'เครื่องมือ', detail: (evt.tools as string[]).join(' + '), status:'done'});
                  if(evt.skills?.length) steps.push({label:'Skill', detail: (evt.skills as string[]).join(', '), status:'done'});
                  setTraceSteps(steps);
                }
              } else if(evt.type==='start'){
                if(evt.trace) setLastTrace(evt.trace);
              } else if(evt.type==='done'){
                if(evt.trace) setLastTrace(evt.trace);
                if(evt.answer && !gotToken) { fullText=evt.answer; setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText, trace: evt.trace ?? lastTrace ?? undefined}; return c; }); }
                else if(evt.answer) { fullText=evt.answer; setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText, trace: evt.trace ?? lastTrace ?? undefined}; return c; }); }
              }
            }catch{}
          }
        }
      }
    }catch{
      // fallback เดิม — ถ้า stream ล้ม ให้เรียก /api/ai/query แบบไม่ stream
      if(!gotToken){
        try{
          const res2 = await fetch('/api/ai/query', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query: q, mode, intent, contextRows: effectiveDataset?.rows ?? 0, contextType: effectiveDataset?.type ?? null, hasDataset: !!effectiveDataset, datasetRaw: effectiveDataset?.raw?.slice(0,8000) }) });
          if(res2.ok){ const j=await res2.json(); fullText = j.answer || ''; setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText}; return c; }); }
        }catch{}
      }
    }
    if(!fullText){
      // last resort local template
      if (effectiveDataset){
        fullText = `เข้าใจคำสั่ง: "${q}" — Intent: ${intent}\nโหมด: ${MODE_LABEL[mode]} • Context: ${effectiveDataset.rows} รายการ\nพร้อมประมวลผลข้อมูลที่วางไว้`;
      } else {
        if (/ผัง.*5|เครือข่าย|ทีม/.test(q)) fullText = `กำลังเปิดผังเครือข่าย 1 แตก 5 ให้ — พิมพ์รหัสสมาชิกหรือชื่อเพื่อค้นหาในผังได้ทันที`;
        else if (/ใบเสร็จ|receipt/.test(q)) fullText = `ระบบตรวจสอบใบเสร็จพร้อมใช้งาน — วางข้อมูลใบเสร็จหรือแนบไฟล์ PDF/รูปภาพ แล้วเลือก "วิเคราะห์" หรือ "ตรวจสอบ"`;
        else fullText = `ระบบค้นหาด้วย AI อัจฉริยะพร้อมช่วยคุณ — พิมพ์คำถาม ค้นหา หรือวางข้อมูล (CSV/ตาราง/JSON) แล้ว AI จะตรวจรูปแบบ วิเคราะห์ และเสนอขั้นตอนถัดไปให้อัตโนมัติ`;
      }
      setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText}; return c; });
    }
    // แนบลิงก์ค้นหาไว้ท้ายข้อความ AI (YouTube + เว็บ) — เสมอเมื่อพบ
    if(searchLinks.length>0){
      const linkBlock = `\n\n🔗 ลิงก์ที่เกี่ยวข้อง:\n` + searchLinks.map((l,i)=> `${i+1}. ${l.title} — ${l.url}`).join('\n');
      fullText = (fullText || '') + linkBlock;
      const linksCopy = [...searchLinks];
      setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText, links: linksCopy as any}; return c; });
    } else if(urlToAttach){
      // ถ้าดึง URL มา — แนบลิงก์ต้นฉบับด้วย
      if(!fullText.includes(urlToAttach)){
        fullText = (fullText || '') + `\n\n🔗 แหล่งข้อมูล: ${urlToAttach}`;
        setMsgs(m=>{ const c=[...m]; if(aiIndexRef.idx>=0) c[aiIndexRef.idx]={...c[aiIndexRef.idx], text: fullText}; return c; });
      }
    }
    setStreaming(false); setLoading(false);
  };

  // ===== Render parts (reuse) =====
  const ModeSwitch = (
    <div className="flex justify-center mb-3">
      <div className="inline-flex p-1 rounded-full bg-[#f0f7ff] border border-blue-100 gap-1">
        {(['FAST','SMART','DEEP'] as SearchMode[]).map(m=>(
          <button key={m} onClick={()=> setMode(m)} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${mode===m? 'bg-white border border-blue-200 text-sky-700 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>{MODE_LABEL[m]}</button>
        ))}
      </div>
    </div>
  );

  const InputCard = (
    <div className="relative rounded-[28px] border border-blue-100 bg-white shadow-[0_8px_40px_rgba(59,130,246,.10)] overflow-hidden">
      <div className="flex items-start gap-3 p-3 md:p-4">
        <button onClick={()=> fileRef.current?.click()} className="shrink-0 w-10 h-10 rounded-full bg-[#f0f7ff] border border-blue-100 flex items-center justify-center text-sky-600 hover:bg-blue-50 transition" title="แนบไฟล์หลายไฟล์">+</button>
        <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.docx,.txt,.csv,.xlsx,.json,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif" onChange={e=>{ const f=e.target.files; if(f && f.length>0) handleFiles(f); e.target.value=''; }} />
        <textarea
          ref={taRef}
          value={input}
          onChange={e=> handleInputChange(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); runQuery(); }}}
          rows={1}
          placeholder="พิมพ์คำถาม ค้นหา วาง URL หรือวางข้อมูลที่นี่..."
          className="flex-1 bg-transparent outline-none resize-none text-[15px] leading-6 placeholder:text-slate-400 py-2 min-h-[40px] max-h-[260px]"
        />
        <button onClick={()=> runQuery()} disabled={loading || streaming} className="shrink-0 w-11 h-11 rounded-full bg-sky-500 text-white flex items-center justify-center hover:bg-sky-600 disabled:opacity-50 transition shadow-[0_4px_12px_rgba(14,165,233,.35)]" aria-label="ค้นหา">↑</button>
      </div>
      <div className="px-4 pb-3 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-400">
          <span className="hidden sm:inline">แนบได้หลายไฟล์ • CSV • ตาราง • JSON • รูป • ไฟล์</span>
          <span className="sm:hidden">แนบหลายไฟล์ได้</span>
        </div>
        <div className="flex items-center gap-2">
          {contextDataset && <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700">Context: {contextDataset.rows} รายการ</span>}
          {(contextDataset || msgs.length>0 || attachedFiles.length>0) && <button onClick={clearContext} className="px-3 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50">ล้างข้อมูลการวิเคราะห์</button>}
        </div>
      </div>
      {attachedFiles.length>0 && (
        <div className="mx-3 mb-3 flex flex-wrap gap-2">
          {attachedFiles.map((af, idx)=>(
            <div key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f0f7ff] border border-blue-100 text-xs text-slate-700">
              {af.url ? <img src={af.url} alt={af.name} className="w-6 h-6 rounded-full object-cover border border-white shadow-sm"/> : <span className="w-6 h-6 rounded-full bg-white border flex items-center justify-center text-[10px]">📄</span>}
              <span className="max-w-[140px] truncate">{af.name}</span>
              <span className="text-[10px] text-slate-400">{(af.size/1024).toFixed(0)}KB</span>
              <button onClick={()=> setAttachedFiles(prev=> prev.filter((_,i)=> i!==idx))} className="w-5 h-5 rounded-full bg-white border flex items-center justify-center hover:bg-slate-50">×</button>
            </div>
          ))}
        </div>
      )}
      {pasteInfo && (
        <div className="mx-3 mb-3 rounded-2xl border border-sky-100 bg-[#f0f7ff] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold text-sky-700">ตรวจพบ{ pasteInfo.detected } {pasteInfo.rows} รายการ</span>
              <span className="text-slate-500 ml-2 text-xs">{pasteInfo.cols.slice(0,4).join(' • ')}{pasteInfo.cols.length>4?' • ...':''}</span>
            </div>
            <button onClick={()=> setPasteInfo(null)} className="text-xs text-slate-400 hover:text-slate-600">ปิด</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {pasteInfo.type==='url' ? (
              <>
                <button onClick={async ()=>{
                  const url = pasteInfo.raw.trim();
                  setPasteInfo({...pasteInfo, detected: 'URL • กำลังดึงข้อความ...'});
                  try{
                    const r = await fetch('/api/fetch-url', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({url})});
                    const j = await r.json();
                    if(j.ok){
                      const info = detectPaste(j.text.slice(0,8000));
                      setPasteInfo({ ...info, raw: `URL: ${url}\n\n${j.text}`.slice(0,20000), detected: `URL • อ่านแล้ว ${j.chars} ตัวอักษร` });
                      setFetchedUrl(url);
                    } else {
                      setPasteInfo({...pasteInfo, detected: `URL • ${j.error||'ดึงไม่สำเร็จ'}`});
                    }
                  } catch{ setPasteInfo({...pasteInfo, detected:'URL • ดึงไม่สำเร็จ'}) }
                }} className="px-3 py-1.5 rounded-full text-xs font-medium border bg-sky-500 border-sky-500 text-white hover:bg-sky-600">🔍 ดึงข้อความจาก URL</button>
                <button onClick={()=> runQuery(`ค้นหาและวิเคราะห์ข้อความจาก URL: ${pasteInfo.raw}`)} className="px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-blue-100 hover:bg-sky-50 text-slate-700">ค้นหาในระบบ</button>
              </>
            ) : (
              ['วิเคราะห์','สรุป','จัดเป็นตาราง','ค้นหาในระบบ','เปรียบเทียบ','บันทึกเข้าระบบ'].map(a=>(
                <button key={a} onClick={()=> runQuery(a==='วิเคราะห์'? 'วิเคราะห์ข้อมูลที่วางไป': a)} className="px-3 py-1.5 rounded-full text-xs font-medium border bg-white border-blue-100 hover:bg-sky-50 text-slate-700">{a}</button>
              ))
            )}
          </div>
        </div>
      )}
      {pasteInfo && pasteInfo.preview.length>0 && (
        <div className="mx-3 mb-3 rounded-2xl border border-blue-100 bg-white overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between bg-[#f0f7ff]/60 border-b border-blue-50">
            <div>
              <div className="text-xs font-semibold text-slate-700">ประเภทข้อมูล: {pasteInfo.detected}</div>
              <div className="text-[11px] text-slate-500">จำนวนรายการ: {pasteInfo.rows} • ฟิลด์: {pasteInfo.cols.join(', ') || '—'}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=> runQuery('จัดเป็นตารางแล้วแสดงทั้งหมด')} className="px-3 py-1 rounded-full bg-sky-500 text-white text-xs">ดูทั้งหมด</button>
              <button onClick={()=> runQuery('วิเคราะห์')} className="px-3 py-1 rounded-full border border-blue-200 bg-white text-sky-700 text-xs">วิเคราะห์</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500">{pasteInfo.cols.slice(0,6).map((c,i)=><th key={i} className="text-left px-3 py-2 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>{pasteInfo.preview.slice(0,7).map((row,ri)=>(<tr key={ri} className={ri%2? 'bg-white':'bg-[#f8fbff]'}>{row.slice(0,6).map((cell,ci)=><td key={ci} className="px-3 py-1.5 border-t border-blue-50 whitespace-nowrap max-w-[160px] truncate">{cell||'—'}</td>)}</tr>))}</tbody>
            </table>
          </div>
          <div className="px-4 py-2 flex gap-2 border-t border-blue-50 bg-white text-xs">
            <button onClick={()=> runQuery('ตรวจสอบข้อมูล')} className="px-3 py-1 rounded-full border border-slate-200">ตรวจสอบ</button>
            <button onClick={()=> runQuery('นำเข้าระบบ')} className="px-3 py-1 rounded-full border border-slate-200">นำเข้าระบบ</button>
            <span className="ml-auto text-[11px] text-slate-400">พรีวิว {Math.min(7, pasteInfo.preview.length)} จาก {pasteInfo.rows} แถว</span>
          </div>
        </div>
      )}
    </div>
  );

function linkify(text: string){
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((p,i)=> {
    if(/^https?:\/\/\S+$/.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline decoration-sky-200 hover:decoration-sky-400 break-all">{p}</a>;
    return <span key={i}>{p}</span>;
  });
}

  const ChatHistory = (
    <>
      {(loading || streaming) && (
        <div className="rounded-2xl border border-blue-100 bg-[#f8fbff] p-3 mb-3">
          <div className="flex items-center gap-2 text-sm text-sky-700">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            {loading? 'Hermes OS กำลังคิด...' : 'กำลังสังเคราะห์คำตอบ...'}
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-white border border-blue-100 text-slate-500">โหมด {mode==='FAST'?'เร็ว':mode==='SMART'?'อัจฉริยะ':'วิเคราะห์เชิงลึก'}</span>
            {streaming && <button onClick={()=> setAbortFlag(true)} className="ml-2 px-3 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-600">หยุด</button>}
          </div>
          {traceSteps.length>0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {traceSteps.map((s,idx)=>(
                <span key={idx} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${s.status==='error'?'bg-red-50 border-red-200 text-red-700':'bg-white border-blue-100 text-slate-700'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${s.status==='done'?'bg-emerald-500':s.status==='error'?'bg-red-500':'bg-sky-400 animate-pulse'}`} />
                  {s.label}{s.detail ? `: ${String(s.detail).slice(0,80)}` : ''}
                </span>
              ))}
            </div>
          )}
          {lastTrace?.toolResults && lastTrace.toolResults.length>0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {lastTrace.toolResults.map((r,i)=>(
                <span key={i} className={`px-2 py-1 rounded-full text-[11px] border ${r.ok?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-amber-50 border-amber-200 text-amber-700'}`}>{r.tool} {r.ok?'✓':'✗'} {r.elapsedMs}ms</span>
              ))}
            </div>
          )}
        </div>
      )}
      {msgs.length>0 && (
        <>
          <div className="flex justify-end mb-2">
            <button onClick={copyAll} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 shadow-sm">
              <span className="text-[13px]">{copiedAll ? '✓' : '⎘'}</span> {copiedAll ? 'คัดลอกแล้ว' : 'คัดลอกทั้งหมด'}
            </button>
          </div>
          <div className="space-y-4 text-left">
            {msgs.map((m,i)=>(
              <div key={i} className={`group relative rounded-2xl border p-4 ${m.role==='user'? 'bg-[#f8fbff] border-blue-100':'bg-white border-blue-100 shadow-[0_2px_12px_rgba(59,130,246,.06)]'}`}>
                {m.role==='ai' && m.trace && (m.trace.tools?.length || m.trace.skills?.length) && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {m.trace.intent && <span className="px-2 py-1 rounded-full bg-[#f0f7ff] border border-blue-100 text-[11px] text-sky-700">Intent: {m.trace.intent}</span>}
                    {m.trace.skills?.map((s:string)=> <span key={s} className="px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] text-violet-700">Skill:{s}</span>)}
                    {m.trace.tools?.map((tool:string)=> <span key={tool} className="px-2 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600">{tool}</span>)}
                    {m.trace.via && <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] text-slate-500">via:{m.trace.via}</span>}
                    {m.trace.toolResults?.map((r:any)=> <span key={r.tool} className={`px-2 py-1 rounded-full text-[11px] border ${r.ok?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-amber-50 border-amber-200 text-amber-700'}`}>{r.tool} {r.ok?'✓':'✗'}</span>)}
                  </div>
                )}
                {m.meta && <div className="text-[11px] text-slate-400 mb-1 break-all">{m.meta.includes('http') ? linkify(m.meta) : m.meta}</div>}
                <div className="text-sm leading-6 whitespace-pre-wrap text-slate-800 pr-8 break-words">{linkify(m.text)}</div>
                {m.links && m.links.length>0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.links.map(l=>(
                      <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs hover:bg-white ${l.source==='youtube' ? 'bg-red-50 border-red-200 text-red-600' : 'bg-[#f0f7ff] border-blue-100 text-sky-700'}`}>
                        {l.source==='youtube' ? '▶️' : '🔗'} {l.title.length>36 ? l.title.slice(0,36)+'…' : l.title} ↗
                      </a>
                    ))}
                  </div>
                ) : (() => {
                  // หา URL ในข้อความเพื่อแนบลิงก์คลิกได้ใต้ข้อความ
                  const urls = m.text.match(/https?:\/\/\S+/g);
                  return urls && urls.length>0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.from(new Set(urls)).slice(0,3).map(u=>(
                        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f0f7ff] border border-blue-100 text-xs text-sky-700 hover:bg-white">
                          🔗 {u.length>40 ? u.slice(0,40)+'…' : u} ↗
                        </a>
                      ))}
                    </div>
                  ) : null;
                })()}
                <button onClick={()=> copyText(m.text, i)} title="คัดลอกข้อความนี้" className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm opacity-60 group-hover:opacity-100 transition">
                  {copiedIdx===i ? '✓' : '⎘'}
                </button>
                {m.actions && m.actions.length>0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.actions.map(a=> <button key={a} onClick={()=> runQuery(a)} className="px-3 py-1.5 rounded-full text-xs border bg-[#f0f7ff] border-blue-100 text-sky-700 hover:bg-white">{a}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );

  if (variant==='chat'){
    const isCentered = msgs.length===0 && !pasteInfo && !loading && !streaming;
    if (isCentered) {
      // เริ่มต้น — ช่องค้นหาอยู่กลางจอ พิมพ์แล้วจะลงล่างอัตโนมัติเมื่อมีข้อความ
      return (
        <div className="w-full flex flex-col h-full">
          <div className="flex-1 flex flex-col items-center justify-center px-4 md:px-6 py-8">
            <div className="w-full max-w-[760px]">
              {topContent && <div className="mb-4">{topContent}</div>}
              {ModeSwitch}
              <div className="mt-4">{InputCard}</div>
            </div>
          </div>
        </div>
      );
    }
    // มีแชตแล้ว — ช่องพิมพ์ลงล่างอัตโนมัติ ตรึงล่าง แชตกว้างเต็มจอ
    return (
      <div className="w-full flex flex-col h-full">
        <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-none px-4 md:px-6 py-2 space-y-4 min-h-0">
          <div className="shrink-0 max-w-[760px] mx-auto w-full">{ModeSwitch}</div>
          {topContent && <div className="shrink-0 max-w-[760px] mx-auto w-full">{topContent}</div>}
          <div className="w-full">{ChatHistory}</div>
        </div>
        <div className="shrink-0 sticky bottom-0 bg-gradient-to-t from-[#fcfdff] via-[#fcfdff] to-transparent pt-4 pb-2 px-4 md:px-6">
          <div className="max-w-[760px] mx-auto">{InputCard}</div>
        </div>
      </div>
    );
  }

  // hero (เดิม — กลางจอ เต็มจอ)
  return (
    <div className="w-full">
      {ModeSwitch}
      {InputCard}
      {(loading || streaming) && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-sky-700">
          <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
          {loading? 'AI กำลังวิเคราะห์...' : streaming? 'กำลังเตรียมคำตอบ...' : 'กำลังค้นหาข้อมูลที่เกี่ยวข้อง...'}
          {streaming && <button onClick={()=> setAbortFlag(true)} className="ml-3 px-3 py-1 rounded-full border border-slate-200 bg-white text-xs text-slate-600">หยุด</button>}
        </div>
      )}
      {msgs.length>0 && <div className="mt-6">{ChatHistory}</div>}
      {msgs.length===0 && !pasteInfo && <div className="mt-8">{ChatHistory}</div>}
    </div>
  );
}
