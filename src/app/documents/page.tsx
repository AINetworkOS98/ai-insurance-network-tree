'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

type OCRData = {
  documentType: string | null;
  amount: number | null;
  currency: string | null;
  date: string | null;
  time: string | null;
  referenceNumber: string | null;
  payerName: string | null;
  receiverName: string | null;
  bank: string | null;
  receiptNumber: string | null;
  companyName: string | null;
  confidence: number;
  status: string;
  companyWarning: string | null;
  needsManualReview: boolean;
};

type PositionResult = {
  current: string;
  currentNameTh: string;
  qualified: boolean;
  target?: { targetNameTh: string; reqFyc: number; reqUnits: number; reqCenters: number; period: string };
  fycProgressPct: number;
  unitsProgressPct: number;
  centersProgressPct: number;
  gapFyc: number;
  gapUnits: number;
  gapCenters: number;
  summary: string;
};

type ReceiptRecord = {
  id: string;
  memberId: string;
  filename: string;
  storageUrl: string;
  amount: number;
  date: string;
  referenceNumber: string;
  createdAt: string;
};

type Stage = 'idle' | 'uploading' | 'reading' | 'verifying' | 'preview' | 'saving';

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  uploading: 'กำลังอัปโหลด…',
  reading: 'กำลังอ่านเอกสาร…',
  verifying: 'กำลังตรวจสอบยอดเงิน…',
  preview: '',
  saving: 'กำลังบันทึก…',
};

export default function DocumentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [memberId, setMemberId] = useState<string>('demo-member');
  const [ocr, setOcr] = useState<OCRData | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ amount: string; date: string; payerName: string; receiverName: string; referenceNumber: string }>({ amount: '', date: '', payerName: '', receiverName: '', referenceNumber: '' });
  const [position, setPosition] = useState<PositionResult | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?memberId=${encodeURIComponent(memberId)}`);
      const data = await res.json();
      if (data.ok) setReceipts(data.receipts || []);
    } catch {
      /* ignore */
    }
  }, [memberId]);

  useEffect(() => {
    const saved = localStorage.getItem('memberId');
    if (saved) setMemberId(saved);
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setOcr(null);
    setPosition(null);
    setError(null);
    setNotice(null);
    setEditing(false);
    setStage('idle');
    if (inputRef.current) inputRef.current.value = '';
  };

  const acceptFile = useCallback((f: File) => {
    if (!f) return;
    const okType = /^(image\/(jpeg|png|webp))$/i.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
    if (!okType) {
      setError('รองรับเฉพาะ JPG / PNG / WEBP');
      return;
    }
    setError(null);
    setNotice(null);
    setFile(f);
    setOcr(null);
    setPosition(null);
    setPreviewUrl(URL.createObjectURL(f));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) acceptFile(f);
    },
    [acceptFile]
  );

  const scan = async () => {
    if (!file) return;
    setError(null);
    setNotice(null);
    setStage('uploading');
    try {
      const formData = new FormData();
      formData.append('file', file);

      setStage('reading');
      const res = await fetch('/api/ocr', { method: 'POST', body: formData });
      setStage('verifying');
      const data = await res.json();

      if (!res.ok || !data.success) {
        // ถ้า key ไม่ถูกต้อง / โควตาหมด → เปิดโหมดกรอกเองแทนการบล็อก
        const isKeyError = data.code === 'INVALID_KEY' || data.code === 'MISSING_KEY' || data.code === 'QUOTA_EXCEEDED';
        if (isKeyError && file) {
          setError(null);
          setNotice(null);
          // สร้าง OCR เปล่าให้กรอกเองได้เลย
          setOcr({
            documentType: null, amount: null, currency: 'THB', date: null, time: null,
            referenceNumber: null, payerName: null, receiverName: null, bank: null,
            receiptNumber: null, companyName: null, confidence: 0,
            status: 'กรุณากรอกข้อมูลเอง (ระบบสแกนอัตโนมัติไม่พร้อม)',
            companyWarning: null, needsManualReview: true,
          } as any);
          setForm({ amount: '', date: '', payerName: '', receiverName: '', referenceNumber: '' });
          setEditing(true);
          setStage('preview');
          setError(data.code === 'QUOTA_EXCEEDED' ? 'โควตา OCR หมดชั่วคราว — กรุณากรอกยอดเงินเองแล้วกดยืนยัน' : 'ระบบสแกนอัตโนมัติไม่พร้อม — กรุณากรอกยอดเงินเองแล้วกดยืนยัน');
          return;
        }
        setError(data.error || 'อ่านเอกสารไม่สำเร็จ');
        setStage('idle');
        return;
      }

      setOcr(data);
      setForm({
        amount: data.amount ? String(data.amount) : '',
        date: data.date || '',
        payerName: data.payerName || '',
        receiverName: data.receiverName || '',
        referenceNumber: data.referenceNumber || '',
      });
      setStage('preview');
    } catch (e: any) {
      setError(e.message || 'เกิดข้อผิดพลาดในการอ่านเอกสาร');
      setStage('idle');
    }
  };

  const confirm = async () => {
    if (!file) return;
    const amount = Number(form.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      setError('ไม่สามารถอ่านยอดเงินจากเอกสารได้ กรุณากรอกยอดเงิน');
      return;
    }
    setError(null);
    setStage('saving');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('memberId', memberId);
      formData.append('amount', String(amount));
      formData.append('date', form.date);
      formData.append('payerName', form.payerName);
      formData.append('receiverName', form.receiverName);
      formData.append('referenceNumber', form.referenceNumber);

      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.duplicate) setError('เอกสารนี้อาจถูกบันทึกแล้ว (ตรวจพบรายการซ้ำ)');
        else setError(data.error || 'บันทึกไม่สำเร็จ');
        setStage('preview');
        return;
      }

      localStorage.setItem('memberId', memberId);
      setPosition(data.position);
      setNotice('บันทึกใบเสร็จสำเร็จ');
      setOcr(null);
      setFile(null);
      setPreviewUrl(null);
      setStage('idle');
      if (inputRef.current) inputRef.current.value = '';
      await loadReceipts();
    } catch (e: any) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
      setStage('preview');
    }
  };

  const confPct = ocr ? Math.round(ocr.confidence * 100) : 0;
  const busy = stage !== 'idle' && stage !== 'preview';

  return (
    <div>
      <Header />
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar />
        <main className="flex-1 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">เอกสารทางการเงิน</h1>
          </div>

          {/* สแกน + อัปโหลดใบเสร็จ */}
          <div className="card p-5">
            <h2 className="font-semibold text-[#475569] mb-1">↑ อัปโหลดสลิป/ใบเสร็จ — สแกนยอดเงินจริง</h2>
            <p className="text-xs text-slate-500 mb-4">
              ระบบจะสแกนยอดเงินจริงด้วย AI (Gemini Vision) แล้วตรวจคุณสมบัติเลื่อนตำแหน่งให้อัตโนมัติ
            </p>

            <div className="mb-3">
              <label className="text-xs text-slate-500 block mb-1">รหัสสมาชิก (Member ID)</label>
              <input
                type="text"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs"
                placeholder="เช่น M001"
              />
            </div>

            {!ocr && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                  dragOver ? 'border-[#c8a84e] bg-amber-50' : 'border-slate-300 hover:border-[#475569] bg-slate-50'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && acceptFile(e.target.files[0])}
                />
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded-lg shadow" />
                ) : (
                  <div className="text-slate-500">
                    <div className="text-3xl mb-2">📄</div>
                    <div className="font-medium">ลากไฟล์มาวางที่นี่ หรือ <span className="text-[#475569] underline">เลือกไฟล์ / ถ่ายรูป</span></div>
                    <div className="text-xs mt-1">รองรับ JPG / PNG / WEBP</div>
                  </div>
                )}
              </div>
            )}

            {file && !ocr && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="truncate text-slate-700">
                  <span className="font-mono text-xs">✓ {file.name}</span>
                  <span className="text-xs text-slate-400 ml-2">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button onClick={scan} disabled={busy} className="px-4 py-2 rounded-full bg-[#475569] text-white text-sm font-semibold disabled:opacity-50">
                  🔍 สแกนยอดเงิน
                </button>
              </div>
            )}

            {busy && <div className="mt-3 text-sm text-[#475569] animate-pulse">{STAGE_LABEL[stage]}</div>}

            {error && <div className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</div>}
            {notice && <div className="mt-3 text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3">{notice}</div>}

            {/* Preview ผลลัพธ์ OCR */}
            {ocr && (
              <div className="mt-4 space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  {/* รูปต้นฉบับ */}
                  <div>
                    {previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previewUrl} alt="ต้นฉบับ" className="w-full rounded-lg border shadow-sm" />
                    )}
                  </div>
                  {/* ข้อมูลที่อ่านได้ */}
                  <div className="space-y-2 text-sm">
                    <div className={`rounded-full px-3 py-1 text-xs inline-block ${ocr.needsManualReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {ocr.status} (ความมั่นใจ {confPct}%)
                    </div>

                    {ocr.companyWarning && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ {ocr.companyWarning}</div>
                    )}

                    {editing ? (
                      <div className="space-y-2">
                        <label className="block text-xs text-slate-500">ยอดเงิน (฿)
                          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="block w-full border rounded-lg px-3 py-2" />
                        </label>
                        <label className="block text-xs text-slate-500">วันที่
                          <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="block w-full border rounded-lg px-3 py-2" />
                        </label>
                        <label className="block text-xs text-slate-500">ผู้จ่าย
                          <input value={form.payerName} onChange={(e) => setForm({ ...form, payerName: e.target.value })} className="block w-full border rounded-lg px-3 py-2" />
                        </label>
                        <label className="block text-xs text-slate-500">ผู้รับ
                          <input value={form.receiverName} onChange={(e) => setForm({ ...form, receiverName: e.target.value })} className="block w-full border rounded-lg px-3 py-2" />
                        </label>
                        <label className="block text-xs text-slate-500">เลขอ้างอิง
                          <input value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} className="block w-full border rounded-lg px-3 py-2" />
                        </label>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-slate-500">ยอดเงิน:</span> <b>฿ {ocr.amount?.toLocaleString()}</b></div>
                        <div><span className="text-slate-500">วันที่:</span> {ocr.date || '—'}</div>
                        <div><span className="text-slate-500">ผู้จ่าย:</span> {ocr.payerName || '—'}</div>
                        <div><span className="text-slate-500">ผู้รับ:</span> {ocr.receiverName || '—'}</div>
                        <div><span className="text-slate-500">เลขอ้างอิง:</span> {ocr.referenceNumber || '—'}</div>
                        <div><span className="text-slate-500">ธนาคาร:</span> {ocr.bank || '—'}</div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-2">
                      {editing ? (
                        <>
                          <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-full text-xs border bg-white">บันทึกการแก้ไข</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => setEditing(true)} className="px-3 py-1.5 rounded-full text-xs border bg-white">✏️ แก้ไขข้อมูล</button>
                          <button onClick={scan} className="px-3 py-1.5 rounded-full text-xs border bg-white">🔄 สแกนใหม่</button>
                        </>
                      )}
                      <button onClick={confirm} disabled={stage === 'saving'} className="px-4 py-1.5 rounded-full text-xs bg-[#475569] text-white font-semibold disabled:opacity-50">
                        {stage === 'saving' ? 'กำลังบันทึก…' : '✓ ยืนยันข้อมูล'}
                      </button>
                      <button onClick={reset} className="px-3 py-1.5 rounded-full text-xs border bg-white text-slate-500">ยกเลิก</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ผลลัพธ์ตำแหน่ง */}
            {position && (
              <div className="mt-4 rounded-lg bg-[#475569] text-white p-4 text-sm">
                <div className="text-[11px] opacity-70">ตำแหน่งปัจจุบัน: {position.currentNameTh}</div>
                {position.target && (
                  <>
                    <div className="mt-2 text-xs">
                      ขั้นถัดไป: <b>{position.target.targetNameTh}</b> (เกณฑ์ FYC ฿{position.target.reqFyc.toLocaleString()}
                      {position.target.reqUnits > 0 ? ` + ${position.target.reqUnits} หน่วย` : ''}
                      {position.target.reqCenters > 0 ? ` + ${position.target.reqCenters} ศูนย์` : ''} · {position.target.period})
                    </div>
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-20 text-[11px]">FYC</span>
                        <div className="flex-1 bg-white/20 rounded-full h-2">
                          <div className="bg-[#c8a84e] h-2 rounded-full" style={{ width: `${position.fycProgressPct}%` }} />
                        </div>
                        <span className="text-[11px]">{Math.round(position.fycProgressPct)}%</span>
                      </div>
                    </div>
                    <div className="mt-2 text-xs opacity-90">{position.summary}</div>
                  </>
                )}
                {!position.target && <div className="mt-2 text-xs opacity-80">{position.summary}</div>}
              </div>
            )}
          </div>

          {/* รายการใบเสร็จ */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-[#475569]">ใบเสร็จที่บันทึกแล้ว</h2>
              <button onClick={loadReceipts} className="text-xs text-[#475569] underline">รีเฟรช</button>
            </div>
            {receipts.length === 0 ? (
              <p className="text-sm text-slate-400">ยังไม่มีใบเสร็จ</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-[#475569] text-white">
                  <tr>
                    <th className="text-left p-2">ยอด (฿)</th>
                    <th className="text-left p-2">วันที่</th>
                    <th className="text-left p-2">เลขอ้างอิง</th>
                    <th className="text-left p-2">ไฟล์</th>
                    <th className="p-2">เวลา</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receipts.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="p-2 font-semibold">{r.amount?.toLocaleString()}</td>
                      <td className="p-2">{r.date || '—'}</td>
                      <td className="p-2">{r.referenceNumber || '—'}</td>
                      <td className="p-2">
                        <a href={r.storageUrl} target="_blank" rel="noreferrer" className="text-[#475569] underline">{r.filename}</a>
                      </td>
                      <td className="p-2 text-center">{new Date(r.createdAt).toLocaleString('th-TH')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
