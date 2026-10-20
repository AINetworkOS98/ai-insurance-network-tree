'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AdminRightsPanel, { useAdminMe } from '@/components/AdminRightsPanel';

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
  // ผลตรวจกติกาจาก /api/ocr (ระบบสแกนใบเสร็จแบบตรวจไขว้) — ไม่มีข้อมูลส่วนบุคคล
  verification?: {
    summary?: string;
    issues?: { code: string; level: 'error' | 'warn' | 'info'; message: string }[];
    amountCrossCheck?: { digits: number | null; words: number | null; matched: boolean };
    installmentLabel?: string | null;
    paymentMethod?: string | null;
    planName?: string | null;
    policyTermYears?: number | null;
    insuredNameMasked?: string | null;
    taxIdMasked?: string | null;
    dedupKey?: string | null;
    network?: { countsToward1x5: boolean; verifiedAmount: number; reason: string };
  };
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
  // ── ผลตรวจกติกาที่บันทึกไว้กับใบเสร็จ (ระบบสแกนแบบตรวจไขว้) ──
  receiptNumber?: string | null;
  policyNo?: string | null;
  company?: string | null;
  paidAt?: string | null;
  installmentLabel?: string | null;
  paymentMethod?: string | null;
  planName?: string | null;
  policyTermYears?: number | null;
  docType?: string | null;
  provider?: string | null;
  confidence?: number | null;
  countsToward1x5?: boolean;
  verifiedAmount?: number;
  needsManualReview?: boolean;
  verificationStatus?: string | null;
  dedupKey?: string | null;
  receiverName?: string | null;
};

type ReceiptSummary = {
  total: number;
  countedCount: number;
  countedAmount: number;
  pendingReview: number;
  lastScanAt: string | null;
  scope: 'mine' | 'all';
  memberName?: string;
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
  const [summary, setSummary] = useState<ReceiptSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const phoneCamRef = useRef<HTMLInputElement>(null);
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  // 📱 โหมดมือถือ (ตรวจจาก UA/ความกว้างจอ หรือบังคับด้วย ?m=1) + QR สำหรับส่งงานจากคอมไปมือถือ
  const [isPhone, setIsPhone] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  // in-app browser (LINE/Facebook/Instagram) บล็อกกล้องเสมอ → ต้องเปิดด้วย Chrome/Safari
  const [inApp, setInApp] = useState(false);
  const [camFallback, setCamFallback] = useState(false);
  // สิทธิ์ผู้ดูแลระบบ — ใช้ซ่อน/แสดงปุ่มลบ (ฝั่งเซิร์ฟเวอร์บังคับซ้ำเสมอ)
  const me = useAdminMe();
  const isAdmin = me?.isAdmin === true;

  const loadReceipts = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents?memberId=${encodeURIComponent(memberId)}`);
      const data = await res.json();
      if (data.ok) { setReceipts(data.receipts || []); setSummary(data.summary || null); }
    } catch {
      /* ignore */
    }
  }, [memberId]);

  useEffect(() => {
    const saved = localStorage.getItem('memberId');
    if (saved) setMemberId(saved);
  }, []);

  // 📱 ตรวจโหมดมือถือ + เตรียมลิงก์/QR สำหรับส่งงานสแกนจากคอมพิวเตอร์ไปมือถือ
  useEffect(() => {
    setOrigin(window.location.origin);
    const force = new URLSearchParams(window.location.search).get('m') === '1';
    const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const narrow = window.matchMedia('(max-width: 768px)').matches;
    setIsPhone(force || ua || narrow);
    setInApp(/Line\/|FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger|; wv\)/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!origin || isPhone) { setQrUrl(null); return; }
    let alive = true;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(`${origin}/documents?m=1`, {
          width: 280,
          margin: 1,
          color: { dark: '#475569', light: '#ffffff' },
        });
        if (alive) setQrUrl(url);
      } catch {
        /* QR ไม่ขึ้น = ยังใช้ลิงก์ตรงได้ */
      }
    })();
    return () => { alive = false; };
  }, [origin, isPhone]);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  // ลบใบเสร็จออกจากระบบ — ยืนยันก่อนลบทุกครั้ง และบันทึก audit ฝั่งเซิร์ฟเวอร์
  const removeReceipt = async (receiptId: string, filename?: string) => {
    if (!isAdmin) { setError('ลบได้เฉพาะผู้ดูแลระบบ — กรุณาติดต่อผู้ดูแลให้ลบเอกสารให้'); return; }
    if (!window.confirm(`ลบใบเสร็จ "${filename || receiptId}" ออกจากระบบ?\n\nการลบย้อนกลับไม่ได้`)) return;
    try {
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (j.ok) { setNotice('ลบใบเสร็จออกจากระบบแล้ว'); setError(null); loadReceipts(); }
      else setError(j.error || 'ลบใบเสร็จไม่สำเร็จ');
    } catch {
      setError('ลบใบเสร็จไม่สำเร็จ');
    }
  };

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setOcr(null);
    setPosition(null);
    setError(null);
    setNotice(null);
    setEditing(false);
    setStage('idle');
    setCamOpen(false);
    setCapturedPhoto(null);
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const acceptFile = useCallback((f: File) => {
    if (!f) return;
    const okType = /^(image\/(jpeg|png|webp))$/i.test(f.type) || /\\.(jpe?g|png|webp)$/i.test(f.name);
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

  // --- กล้องมือถือ ---
  const openCamera = async () => {
    setCamError(null);
    setCamFallback(false);
    try {
      if (!window.isSecureContext) {
        setCamError('เปิดกล้องไม่ได้: หน้านี้ไม่ได้อยู่ใน HTTPS');
        setCamFallback(true);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        // in-app browser (LINE/Facebook) และ WebView หลายตัวไม่มี getUserMedia
        setCamError(
          inApp
            ? 'ในแอป LINE/Facebook กล้องถูกบล็อก — กดปุ่มด้านล่างเพื่อเปิดใน Chrome/Safari หรือใช้ "ถ่ายรูป/แกลเลอรี" ของเครื่อง'
            : 'เบราว์เซอร์นี้ไม่รองรับกล้องในเว็บ — ใช้ปุ่ม "ถ่ายรูป (กล้องเครื่อง)" แทนได้เลย'
        );
        setCamFallback(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      camStreamRef.current = stream;
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
        await camVideoRef.current.play();
      }
      setCamOpen(true);
    } catch (err: any) {
      const name = String(err?.name || '');
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCamError('ยังไม่ได้อนุญาตสิทธิ์กล้อง — แตะไอคอน 🔒/⚙️ ข้างที่อยู่เว็บ แล้วตั้ง กล้อง = อนุญาต (หรือใช้ปุ่ม "ถ่ายรูป (กล้องเครื่อง)" ด้านล่าง)');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setCamError('ไม่พบกล้องที่ใช้ได้ — ใช้ปุ่ม "ถ่ายรูป (กล้องเครื่อง)" ด้านล่างแทน');
      } else if (name === 'NotReadableError') {
        setCamError('กล้องถูกแอปอื่นใช้งานอยู่ — ปิดแอปกล้องแล้วลองใหม่ หรือใช้ "ถ่ายรูป (กล้องเครื่อง)"');
      } else {
        setCamError(`เปิดกล้องในเว็บไม่ได้ (${name || 'unknown'}) — ใช้ปุ่ม "ถ่ายรูป (กล้องเครื่อง)" ด้านล่างแทน`);
      }
      setCamFallback(true);
    }
  };

  // ปุ่มสแกนหลักบนมือถือ: ลอง getUserMedia ก่อน แล้วถ้าไม่พร้อมใช้กล้อง native ของเครื่องทันที
  const phoneScan = async () => {
    if (inApp) { phoneCamRef.current?.click(); return; }
    await openCamera();
  };

  const closeCamera = () => {
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
    }
    setCamOpen(false);
    setCapturedPhoto(null);
  };

  const capturePhoto = async () => {
    const video = camVideoRef.current;
    if (!video || !video.videoWidth) {
      setCamError('กล้องยังไม่พร้อม');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setCamError('ไม่สามารถสร้าง canvas ได้'); return; }
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92));
      if (!blob) { setCamError('ถ่ายภาพไม่สำเร็จ'); return; }
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
      closeCamera();
      acceptFile(file);
    } catch (err: any) {
      setCamError('ถ่ายภาพไม่สำเร็จ: ' + (err.message || ''));
    }
  };

  useEffect(() => {
    return () => {
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
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
        const isKeyError = data.code === 'INVALID_KEY' || data.code === 'MISSING_KEY' || data.code === 'QUOTA_EXCEEDED';
        if (isKeyError && file) {
          setError(null);
          setNotice(null);
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
    // ส่งผลตรวจกติกา (จากระบบสแกน) ติดไปกับใบเสร็จ เพื่อเก็บไว้ในคลังของสมาชิก
    {
      const v: any = (ocr as any)?.verification || {};
      const fdExtra = new FormData();
      fdExtra.append('receiptNumber', (ocr as any)?.receiptNumber || '');
      fdExtra.append('policyNo', (ocr as any)?.policyNo || '');
      fdExtra.append('company', (ocr as any)?.companyName || '');
      fdExtra.append('paidAt', (ocr as any)?.date || '');
      fdExtra.append('installmentLabel', v.installmentLabel || '');
      fdExtra.append('paymentMethod', v.paymentMethod || '');
      fdExtra.append('planName', v.planName || '');
      fdExtra.append('policyTermYears', v.policyTermYears ? String(v.policyTermYears) : '');
      fdExtra.append('docType', (ocr as any)?.documentType || '');
      fdExtra.append('dedupKey', v.dedupKey || '');
      fdExtra.append('provider', (ocr as any)?.provider || '');
      fdExtra.append('confidence', String((ocr as any)?.confidence ?? ''));
      fdExtra.append('countsToward1x5', String(!!v.network?.countsToward1x5));
      fdExtra.append('verifiedAmount', String(v.network?.verifiedAmount || 0));
      fdExtra.append('needsManualReview', String((ocr as any)?.needsManualReview ?? true));
      fdExtra.append('issues', JSON.stringify(v.issues || []));
      for (const [k, val] of fdExtra.entries()) formData.append(k, val as string);
    }

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
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">สแกนใบเสร็จรับเงิน เข้าระบบ</h1>
          </div>

          {/* ── แผงสิทธิ์: แสดงให้ "ผู้ดูแลระบบ" เห็นว่าตัวเองมีสิทธิอะไรในหน้านี้ (ผู้ใช้ทั่วไปไม่เห็น) ── */}
          <AdminRightsPanel
            scope="เห็นคลังใบเสร็จของสมาชิกทุกคนในระบบ (ไม่จำกัดเฉพาะของตัวเอง)"
            rights={[
              { icon: '🗑', label: 'ลบใบเสร็จ/เอกสารออกจากคลังได้ทุกใบ', detail: 'ลบทั้งข้อมูลในคลังและไฟล์ต้นฉบับใน Storage พร้อมบันทึก Audit Log (receipt.deleted)' },
              { icon: '📚', label: 'ดูคลังใบเสร็จทั้งหมด + สรุปยอดเข้าเครือข่าย 1 แตก 5' },
              { icon: '🧾', label: 'สแกน/บันทึกใบเสร็จให้สมาชิกคนใดก็ได้ผ่านช่องรหัสสมาชิก' },
            ]}
            note="ลบเป็นสิทธิ์ของผู้ดูแลระบบเท่านั้น — เจ้าของใบเสร็จทั่วไปจะไม่เห็นปุ่มลบ และถ้าเรียก API ลบตรง ๆ เซิร์ฟเวอร์จะตอบ 403"
          />

          {/* สแกน + อัปโหลดใบเสร็จ */}
          <div className="card p-5">
            <h2 className="font-semibold text-[#475569] mb-1">↑ อัปโหลดสลิป/ใบเสร็จ — สแกนยอดเงินจริง</h2>
            <p className="text-xs text-slate-500 mb-4">
              ระบบจะสแกนยอดเงินจริงด้วย AI (Gemini Vision) แล้วตรวจคุณสมบัติเลื่อนตำแหน่งให้อัตโนมัติ
            </p>

            {/* in-app browser (LINE/Facebook) บล็อกกล้อง — เตือนก่อนผู้ใช้กดแล้วเงียบ */}
            {inApp && (
              <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                ⚠️ คุณเปิดจากเบราว์เซอร์ในแอป (LINE/Facebook) — กล้องมักถูกบล็อก ·
                กด <b>⋯</b> แล้วเลือก <b>เปิดในเบราว์เซอร์</b> (Chrome/Safari) หรือ
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${origin}/documents?m=1`);
                    setNotice('คัดลอกลิงก์แล้ว — เปิดใน Chrome/Safari บนมือถือ');
                  }}
                  className="underline font-semibold ml-1"
                >
                  คัดลอกลิงก์ไปเปิดเอง
                </button>
              </div>
            )}

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
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && acceptFile(e.target.files[0])}
                />
                {/* กล้องมือถือแบบ native — เสถียรที่สุดบน iOS/Android (capture=environment) */}
                <input
                  ref={phoneCamRef}
                  id="mobile-gallery-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) acceptFile(f);
                  }}
                />

                <div
                  onDragOver={(e) => { if (isPhone) return; e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { if (isPhone) return; onDrop(e); }}
                  className={`border-2 border-dashed rounded-xl p-5 sm:p-8 text-center transition ${
                    dragOver ? 'border-[#c8a84e] bg-amber-50' : 'border-slate-300 bg-slate-50'
                  }`}
                >
                  {previewUrl ? (
                    <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded-lg shadow" />
                  ) : isPhone ? (
                    <div>
                      <div className="text-3xl mb-1">📱</div>
                      <div className="text-sm font-semibold text-slate-600 mb-3">สแกนใบเสร็จด้วยกล้องมือถือ</div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={phoneScan}
                          className="w-full py-3.5 rounded-xl bg-[#475569] text-white text-sm font-bold"
                        >
                          📷 ถ่ายรูปใบเสร็จ (เปิดกล้อง)
                        </button>
                        <button
                          type="button"
                          onClick={() => phoneCamRef.current?.click()}
                          className="w-full py-3 rounded-xl bg-[#c8a84e] text-[#3f3a2f] text-sm font-bold"
                        >
                          📷 ถ่ายด้วยกล้องเครื่อง (ใช้เมื่อกล้องในเว็บไม่เปิด)
                        </button>
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="w-full py-3.5 rounded-xl border border-slate-300 bg-white text-[#475569] text-sm font-semibold"
                        >
                          🖼 เลือกรูปจากแกลเลอรี
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-2">
                        รองรับ JPG / PNG / WEBP · รูปจะถูกอ่านยอดเงินอัตโนมัติ
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500">
                      <div className="text-3xl mb-2">📄</div>
                      <div className="font-medium">
                        ลากไฟล์มาวางที่นี่ หรือ{' '}
                        <button type="button" onClick={() => inputRef.current?.click()} className="text-[#475569] underline font-semibold">เลือกไฟล์</button>
                        {' · '}
                        <button type="button" onClick={openCamera} className="text-[#475569] underline font-semibold">ถ่ายด้วยเว็บแคม</button>
                      </div>
                      <div className="text-xs mt-1">รองรับ JPG / PNG / WEBP</div>
                    </div>
                  )}
                </div>

                {/* แจ้ง error ของกล้อง + ทางออกสำรอง (เดิมข้อความนี้ซ่อนอยู่ใต้ overlay กล้องเท่านั้น) */}
                {!camOpen && camError && (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="font-semibold mb-1">กล้องไม่เปิด</div>
                    <div>{camError}</div>
                    {camFallback && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => phoneCamRef.current?.click()}
                          className="px-3 py-2 rounded-lg bg-[#475569] text-white font-semibold"
                        >
                          📷 ถ่ายรูป (กล้องเครื่อง)
                        </button>
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="px-3 py-2 rounded-lg border border-amber-300 bg-white font-semibold"
                        >
                          🖼 เลือกจากแกลเลอรี
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 📱 ส่งงานไปสแกนที่มือถือ (QR) — เฉพาะเมื่อเปิดบนคอมพิวเตอร์ */}
                {!isPhone && !previewUrl && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-[#475569] mb-1">📱 สแกนด้วยมือถือ</div>
                    <p className="text-xs text-slate-500 mb-3">
                      เปิดกล้องมือถือสแกน QR นี้ แล้วถ่ายใบเสร็จจากมือถือได้เลย — บันทึกเข้าโปรไฟล์เดิม (ต้องล็อกอินบัญชีเดียวกันบนมือถือ)
                    </p>
                    <div className="flex items-start gap-4">
                      {qrUrl ? (
                        <img
                          src={qrUrl}
                          alt="QR เปิดหน้าสแกนใบเสร็จบนมือถือ"
                          className="w-[132px] h-[132px] rounded-lg border border-slate-200"
                          data-mobile-qr="documents"
                        />
                      ) : (
                        <div className="w-[132px] h-[132px] rounded-lg bg-slate-100 animate-pulse" data-mobile-qr="pending" />
                      )}
                      <div className="text-xs text-slate-500 space-y-1.5 min-w-0">
                        <div className="break-all">
                          ลิงก์ตรง:{' '}
                          <a href={`${origin}/documents?m=1`} className="underline text-[#475569]">
                            {origin ? `${origin}/documents?m=1` : '…'}
                          </a>
                        </div>
                        <div>มือถือต้องล็อกอินบัญชีเดียวกันก่อนถ่าย</div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(`${origin}/documents?m=1`);
                            setNotice('คัดลอกลิงก์สำหรับมือถือแล้ว — เปิดในเบราว์เซอร์มือถือแล้วล็อกอิน');
                          }}
                          className="underline text-[#475569] font-semibold"
                        >
                          คัดลอกลิงก์
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
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

            {/* Overlay กล้องมือถือ */}
            {camOpen && (
              <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
                <video
                  ref={camVideoRef}
                  playsInline
                  muted
                  className="w-full max-w-[520px] rounded-xl bg-black aspect-video object-cover"
                />
                {camError && <div className="mt-2 text-xs text-red-300 text-center">{camError}</div>}
                <div className="mt-3 flex gap-2">
                  <button onClick={capturePhoto} className="px-8 py-2.5 rounded-full bg-white text-sm font-bold shadow-lg">
                    📷 ถ่าย
                  </button>
                  <button onClick={closeCamera} className="px-6 py-2.5 rounded-full border border-white text-white text-sm font-semibold">
                    ปิด
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-white/70 text-center">
                  วางใบเสร็จให้เต็มจอ แล้วกด "ถ่าย" เพื่อสแกน
                </div>
              </div>
            )}

            {/* Preview ผลลัพธ์ OCR */}
            {ocr && (
              <div className="mt-4 space-y-3">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    {previewUrl && (
                      <img src={previewUrl} alt="ต้นฉบับ" className="w-full rounded-lg border shadow-sm" />
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className={`rounded-full px-3 py-1 text-xs inline-block ${ocr.needsManualReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {ocr.status} (ความมั่นใจ {confPct}%)
                    </div>

                    {ocr.companyWarning && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">⚠️ {ocr.companyWarning}</div>
                    )}

                    {ocr.verification && (
                      <div className="rounded-xl border border-[#f3e8d3] bg-[#FCFBF6] p-3 space-y-2">
                        <div className="text-xs font-semibold text-[#57534e]">🧾 ผลตรวจกติกา — สแกนใบเสร็จแบบตรวจไขว้</div>
                        <div className="text-xs text-slate-600">
                          งวด/วิธีชำระ: {ocr.verification.installmentLabel || '—'} · {ocr.verification.paymentMethod || '—'}
                          {ocr.verification.planName ? ` · แบบ ${ocr.verification.planName}` : ''}
                          {ocr.verification.policyTermYears ? ` · ${ocr.verification.policyTermYears} ปี` : ''}
                        </div>
                        <div className="text-xs text-slate-600">
                          ตรวจไขว้ยอดเงิน: ตัวเลข {ocr.verification.amountCrossCheck?.digits != null ? `฿${Number(ocr.verification.amountCrossCheck?.digits).toLocaleString('th-TH')}` : '—'}
                          {' · '}คำอ่านจำนวนเงิน {ocr.verification.amountCrossCheck?.words != null ? `฿${Number(ocr.verification.amountCrossCheck?.words).toLocaleString('th-TH')}` : '—'}
                          {' '}{ocr.verification.amountCrossCheck?.matched
                            ? <span className="text-emerald-700 font-semibold">✓ ตรงกัน</span>
                            : <span className="text-amber-700 font-semibold">⚠ ยังไม่ตรง</span>}
                        </div>
                        <div className={`rounded-lg p-2 text-xs border ${ocr.verification.network?.countsToward1x5 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                          <b>{ocr.verification.network?.countsToward1x5 ? '✅ นับยอดเข้าเครือข่าย 1 แตก 5' : '⏳ ยังไม่นับยอดเข้าเครือข่าย'}</b>
                          <div className="mt-0.5">{ocr.verification.network?.reason}</div>
                        </div>
                        {!!ocr.verification.issues?.length && (
                          <ul className="text-xs space-y-1">
                            {ocr.verification.issues.map((it, i) => (
                              <li key={i} className={it.level === 'error' ? 'text-red-700' : it.level === 'warn' ? 'text-amber-700' : 'text-slate-500'}>
                                {it.level === 'error' ? '✕' : it.level === 'warn' ? '!' : 'i'} {it.message}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="text-[11px] text-slate-400">
                          🔒 PDPA: ไม่เก็บข้อมูลส่วนบุคคลของลูกค้าในระบบ{ocr.verification.insuredNameMasked ? ` · ผู้เอาประกัน ${ocr.verification.insuredNameMasked}` : ''}
                        </div>
                      </div>
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

          {/* คลังใบเสร็จที่สแกนแล้ว — เก็บใบเสร็จของสมาชิกพร้อมผลตรวจกติกา */}
          <div className="card p-5" data-section="receipt-store">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="font-semibold text-[#475569]">📚 คลังใบเสร็จที่สแกนแล้ว</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {summary?.scope === 'all'
                    ? 'มุมมองผู้ดูแลระบบ — เห็นใบเสร็จของสมาชิกทุกคน'
                    : `ใบเสร็จของ ${summary?.memberName || 'บัญชีที่ล็อกอิน'} — บันทึกอัตโนมัติเมื่อสแกนสำเร็จ`}
                </p>
              </div>
              <button onClick={loadReceipts} className="text-xs text-[#475569] underline">รีเฟรช</button>
            </div>

            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <div className="rounded-xl border border-[#f3e8d3] bg-[#FCFBF6] p-3">
                  <div className="text-[11px] text-slate-500">ใบเสร็จที่สแกนแล้ว</div>
                  <div className="text-lg font-bold text-[#475569]">{summary.total} ใบ</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[11px] text-emerald-700">นับยอดเข้าเครือข่าย 1 แตก 5</div>
                  <div className="text-lg font-bold text-emerald-800">{summary.countedCount} ใบ</div>
                  <div className="text-[11px] text-emerald-700">฿{summary.countedAmount.toLocaleString('th-TH')}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="text-[11px] text-amber-700">รอตรวจสอบ</div>
                  <div className="text-lg font-bold text-amber-800">{summary.pendingReview} ใบ</div>
                </div>
                <div className="rounded-xl border border-[#f3e8d3] bg-[#FCFBF6] p-3">
                  <div className="text-[11px] text-slate-500">สแกนล่าสุด</div>
                  <div className="text-sm font-semibold text-[#475569]">
                    {summary.lastScanAt ? new Date(summary.lastScanAt).toLocaleString('th-TH') : '—'}
                  </div>
                </div>
              </div>
            )}

            {receipts.length === 0 ? (
              <p className="text-sm text-slate-400">ยังไม่มีใบเสร็จในคลัง — สแกนใบเสร็จด้านบน ระบบจะบันทึกไว้ที่นี่อัตโนมัติ</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#475569] text-white">
                    <tr>
                      <th className="text-left p-2">วันที่สแกน</th>
                      <th className="text-left p-2">เลขที่ใบเสร็จ</th>
                      <th className="text-left p-2">กรมธรรม์</th>
                      <th className="text-left p-2">บริษัท</th>
                      <th className="text-left p-2">ยอด (฿)</th>
                      <th className="text-left p-2">วันที่ชำระ</th>
                      <th className="text-left p-2">งวด</th>
                      <th className="text-left p-2">สถานะตรวจ</th>
                      <th className="text-left p-2">1 แตก 5</th>
                      <th className="text-left p-2">ไฟล์</th>
                      <th className="p-2">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {receipts.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="p-2 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString('th-TH') : '—'}</td>
                        <td className="p-2 font-mono">{r.receiptNumber || r.referenceNumber || '—'}</td>
                        <td className="p-2 font-mono">{r.policyNo || '—'}</td>
                        <td className="p-2 max-w-[180px] truncate" title={r.company || r.receiverName || ''}>{r.company || r.receiverName || '—'}</td>
                        <td className="p-2 font-semibold">{(r.verifiedAmount || r.amount || 0).toLocaleString('th-TH')}</td>
                        <td className="p-2">{r.paidAt || r.date || '—'}</td>
                        <td className="p-2">{r.installmentLabel || '—'}{r.paymentMethod ? ` (${r.paymentMethod})` : ''}</td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-0.5 whitespace-nowrap ${
                            r.countsToward1x5 && !r.needsManualReview ? 'bg-emerald-100 text-emerald-800'
                            : r.countsToward1x5 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                          }`}>{r.verificationStatus || (r.countsToward1x5 ? 'รอตรวจสอบ' : 'ไม่เข้าเกณฑ์')}</span>
                        </td>
                        <td className="p-2">{r.countsToward1x5 ? '✅' : '—'}</td>
                        <td className="p-2">
                          {r.storageUrl
                            ? <a href={r.storageUrl} target="_blank" rel="noreferrer" className="text-[#475569] underline">{r.filename}</a>
                            : <span className="text-slate-400">{r.filename}</span>}
                        </td>
                        <td className="p-2 text-center">
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => removeReceipt(r.id, r.filename)}
                              title="ลบใบเสร็จออกจากคลัง (ผู้ดูแลระบบเท่านั้น)"
                              className="px-2.5 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                            >
                              🗑 ลบ
                            </button>
                          ) : (
                            <span
                              className="text-[11px] text-slate-400 whitespace-nowrap"
                              title="การลบเอกสารเป็นสิทธิ์ของผู้ดูแลระบบเท่านั้น"
                            >
                              🔒 ผู้ดูแลเท่านั้น
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">
              🔒 PDPA: คลังนี้เก็บเฉพาะข้อมูลธุรกรรม (เลขที่ใบเสร็จ กรมธรรม์ วันที่ ยอดเงิน สถานะตรวจ) — ไม่เก็บชื่อ-นามสกุล เลขภาษี ที่อยู่ หรือเลขบัตรของลูกค้า
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
