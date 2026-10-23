'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import LineOaCard from '@/components/LineOaCard';
import Sidebar from '@/components/Sidebar';
import { estimatePremium, LIFE_PREMIUM_TAX_CAP, PREMIUM_RATE_VERSION } from '@/lib/premiumEstimate';
import Link from 'next/link';
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
  // ── สร้างใบเสร็จด้วยรหัสตัวแทนของตัวเอง (TL ProPlus บน iPad) ────────────────
  const [mkOpen, setMkOpen] = useState(false);
  const [mkBusy, setMkBusy] = useState(false);
  const [mkError, setMkError] = useState<string | null>(null);
  const [mkDone, setMkDone] = useState<any>(null);
  const [mk, setMk] = useState<{ agentCode: string; receiptNumber: string; referenceNumber: string; amount: string; paidAt: string; policyNo: string; planName: string }>({
    agentCode: '', receiptNumber: '', referenceNumber: '', amount: '', paidAt: '', policyNo: '', planName: '',
  });
  // ── ตัวช่วยกรอกทีละขั้น "ตามที่โปรแกรม/ใบเสร็จกำหนด" แล้วจบด้วยการสแกน ──────────
  const [wzOpen, setWzOpen] = useState(false);
  const [wzStep, setWzStep] = useState(1);
  const [wzBusy, setWzBusy] = useState(false);
  const [wzErr, setWzErr] = useState<string | null>(null);
  const [wzDone, setWzDone] = useState<any>(null);
  // ── เครื่องคำนวณเบี้ยประกันชีวิต (วางก่อนขั้นสร้าง/อัปโหลดใบเสร็จ) ─────────────
  const [premPlans, setPremPlans] = useState<any[]>([]);
  const [premPicked, setPremPicked] = useState<any>(null);
  const [premGender, setPremGender] = useState<'ชาย' | 'หญิง'>('ชาย');
  const [premAge, setPremAge] = useState('30');
  const [premCover, setPremCover] = useState('1000000');
  const [premPayYears, setPremPayYears] = useState('10');
  const [premResult, setPremResult] = useState<any>(null);
  const [wz, setWz] = useState<any>({
    docType: 'receipt', agentCode: '', planName: '', policyNo: '', policyTermYears: '',
    paymentMethod: 'รายปี', installmentLabel: '01/01', bank: '',
    amount: '', amountLife: '', paidAt: '', receiptNumber: '', referenceNumber: '',
  });
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
  const [camReady, setCamReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  // 📱 โหมดมือถือ (ตรวจจาก UA/ความกว้างจอ หรือบังคับด้วย ?m=1) + QR สำหรับส่งงานจากคอมไปมือถือ
  const [isPhone, setIsPhone] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  // in-app browser (LINE/Facebook/Instagram) บล็อกกล้องเสมอ → ต้องเปิดด้วย Chrome/Safari
  const [inApp, setInApp] = useState(false);
  const [camFallback, setCamFallback] = useState(false);
  // ความพร้อมของกล้องในเว็บ: ตรวจก่อนวาดปุ่ม เพื่อไม่ให้ผู้ใช้กดแล้วเงียบ
  const [camSupport, setCamSupport] = useState<'unknown' | 'ready' | 'unsupported' | 'denied'>('unknown');
  const [isIOS, setIsIOS] = useState(false);
  // สิทธิ์ผู้ดูแลระบบ — ใช้ซ่อน/แสดงปุ่มลบ (ฝั่งเซิร์ฟเวอร์บังคับซ้ำเสมอ)
  const me = useAdminMe();
  // ลบเอกสาร = ผู้ดูแลระบบขั้นสูงเท่านั้น (เซิร์ฟเวอร์บังคับซ้ำเสมอ)
  const canDelete = me?.canDelete === true;

  // วินิจฉัยจากเครื่องผู้ใช้จริง → /api/scan-diag เขียนลง Vercel runtime log (ไม่แตะ DB)
  const diag = useCallback((stage: string, extra: Record<string, any> = {}) => {
    try {
      const body = JSON.stringify({
        stage,
        build: (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
        ua: navigator.userAgent,
        inApp,
        isPhone,
        camSupport,
        ...extra,
      });
      fetch('/api/scan-diag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* ignore */
    }
  }, [inApp, isPhone, camSupport]);

  // แจ้งครั้งเดียวว่าเครื่องไหนเปิดหน้า (build/UA/โหมด) — ใช้ตรวจว่าได้บิลด์ใหม่หรือยัง
  useEffect(() => {
    const t = setTimeout(() => diag('page-loaded', { ok: true }), 900);
    return () => clearTimeout(t);
  }, [diag]);

  // PWA install prompt (Android/Chrome) — ให้มีไอคอนแอป เปิดแล้วกล้องพร้อมถ่าย
  const [installEvt, setInstallEvt] = useState<any>(null);
  useEffect(() => {
    const onPrompt = (e: any) => {
      e.preventDefault();
      setInstallEvt(e);
      diag('install-available', { ok: true });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [diag]);

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
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent));

    // ตรวจความพร้อมของกล้องล่วงหน้า (ทั้ง iPhone และ Android)
    (async () => {
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setCamSupport('unsupported');
          return;
        }
        const Perm: any = (navigator as any).permissions;
        if (Perm?.query) {
          try {
            const st = await Perm.query({ name: 'camera' as any });
            if (st?.state === 'denied') { setCamSupport('denied'); return; }
          } catch {
            /* Safari ไม่รองรับ permissions.query('camera') — ถือว่าพร้อม */
          }
        }
        setCamSupport('ready');
      } catch {
        setCamSupport('ready');
      }
    })();
  }, []);

  useEffect(() => {
    if (!origin || isPhone) { setQrUrl(null); return; }
    let alive = true;
    (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(`${origin}/documents?m=1&cam=1`, {
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

  // ใบเสร็จนี้เป็นของ "รหัสตัวเอง" หรือไม่ (memberId ของใบเสร็จ เทียบกับรหัส/อีเมลของฉัน)
  const isOwnRow = (r: any) => {
    const mid = String(r?.memberId || '');
    if (!mid) return false;
    if (memberId && mid === String(memberId)) return true;
    return !!me?.email && mid === String(me.email);
  };

  // ลบใบเสร็จออกจากระบบ — ยืนยันก่อนลบทุกครั้ง และบันทึก audit ฝั่งเซิร์ฟเวอร์
  const removeReceipt = async (receiptId: string, filename?: string, own?: boolean) => {
    if (!canDelete && !own) { setError('ลบได้เฉพาะใบเสร็จของรหัสตัวเอง (หรือผู้ดูแลระบบ)'); return; }
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


  // แก้ไขใบเสร็จ — ผู้ดูแลระบบเท่านั้น (เซิร์ฟเวอร์บังคับซ้ำที่ PATCH /api/documents)
  const editReceipt = async (r: any) => {
    if (!canDelete) { setError('แก้ไขได้เฉพาะผู้ดูแลระบบ (Admin)'); return; }
    const cur = Number(r.verifiedAmount ?? r.amount ?? 0);
    const amt = window.prompt(`แก้ยอดเงิน (บาท) — ใบเสร็จ ${r.receiptNumber || r.referenceNumber || r.id}
ยอดปัจจุบัน: ${cur.toLocaleString('th-TH')}`, String(cur || ''));
    if (amt === null) return;
    const note = window.prompt('หมายเหตุ/เหตุผลที่แก้ไข (เว้นว่างได้)', String(r.note || ''));
    if (note === null) return;
    try {
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptId: r.id, amount: amt, note }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (j.ok) { setNotice(j.changed ? 'บันทึกการแก้ไขใบเสร็จแล้ว' : 'ไม่มีข้อมูลเปลี่ยนแปลง'); setError(null); loadReceipts(); }
      else setError(j.error || 'แก้ไขใบเสร็จไม่สำเร็จ');
    } catch {
      setError('แก้ไขใบเสร็จไม่สำเร็จ');
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
    diag('file-picked', { ok: true, sizeKb: f.size / 1024, type: f.type || f.name.split('.').pop() });
    const heic = /^image\/(hei[cf])$/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
    const okType = /^(image\/(jpeg|png|webp))$/i.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name) || heic;
    if (!okType) {
      setError(`ไฟล์นี้เป็น "${f.type || f.name.split('.').pop()}" — รองรับ JPG / PNG / WEBP (HEIC จาก iPhone ใช้ได้ผ่านปุ่มถ่ายรูป)`);
      diag('file-rejected', { ok: false, sizeKb: f.size / 1024, type: f.type || f.name.split('.').pop() });
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
      // ลองจากเข้มไปอ่อน — บางรุ่น (Android WebView / iPhone บางเวอร์ชัน) ตกด้วย OverconstrainedError
      const tries: MediaStreamConstraints[] = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false },
        { video: { facingMode: 'environment' }, audio: false },
        { video: true, audio: false },
      ];
      let stream: MediaStream | null = null;
      let lastErr: any = null;
      for (const c of tries) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch (e) { lastErr = e; }
      }
      if (!stream) throw lastErr || new Error('cannot open camera');
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
      diag('camera-error', { ok: false, message: name || 'unsupported' });
    }
  };

  // overlay กล้องถูก mount หลัง setCamOpen(true) → ต้องผูก stream ตอน DOM พร้อมจริง
  // (เดิมผูกตอน overlay ยังไม่มีใน DOM ⇒ video ว่าง ⇒ กดถ่ายแล้วขึ้น "กล้องยังไม่พร้อม")
  useEffect(() => {
    const v = camVideoRef.current;
    const s = camStreamRef.current;
    if (!camOpen || !v || !s) return;
    v.srcObject = s;
    const onReady = () => { if (v.videoWidth > 0) setCamReady(true); };
    v.onloadedmetadata = onReady;
    v.oncanplay = onReady;
    v.play().then(onReady).catch(() => {});
    return () => {
      v.onloadedmetadata = null;
      v.oncanplay = null;
    };
  }, [camOpen]);

  // ?cam=1 → เปิดกล้องให้พร้อมถ่ายทันที (ใช้ได้ใน Chrome/Safari ทุกเครื่อง)
  const autoCamDone = useRef(false);
  useEffect(() => {
    if (autoCamDone.current) return;
    if (camSupport !== 'ready' || inApp) return;
    const want = new URLSearchParams(window.location.search).get('cam') === '1';
    if (!want) return;
    autoCamDone.current = true;
    const t = setTimeout(() => { openCamera(); }, 500);
    return () => clearTimeout(t);
  }, [camSupport, inApp]);

  const closeCamera = () => {
    setCamReady(false);
    if (camStreamRef.current) {
      camStreamRef.current.getTracks().forEach(t => t.stop());
      camStreamRef.current = null;
    }
    setCamOpen(false);
    setCapturedPhoto(null);
  };

  const capturePhoto = async () => {
    // รอให้เฟรมแรกมาถึงก่อน (มือถือใช้ 0.3-2 วิ) แทนการฟันธงว่า "กล้องยังไม่พร้อม" ทันที
    let video = camVideoRef.current;
    for (let i = 0; i < 24 && (!video || !video.videoWidth); i++) {
      await new Promise(r => setTimeout(r, 150));
      video = camVideoRef.current;
    }
    if (!video || !video.videoWidth) {
      setCamError('กล้องยังไม่พร้อม — รอสักครู่แล้วกด "ถ่าย" อีกครั้ง');
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
      // ถ่ายแล้วสแกนต่อทันที (ไม่ต้องกดเพิ่ม) — ยกเลิกได้ด้วยปุ่มยกเลิกในกล่อง error
      setTimeout(() => { scan(file); }, 50);
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

  // ย่อ/บีบอัดรูปก่อนอัปโหลด — กล้องมือถือได้ไฟล์ 3-12 MB ซึ่งเกินขีดจำกัดของ Vercel (4.5 MB)
  // อาการที่เจอจริง: fetch ล้มด้วย "Failed to fetch" เพราะ body ใหญ่เกิน/ฟังก์ชัน timeout
  const shrinkImage = useCallback(async (f: File): Promise<File> => {
    const LIMIT = 3.2 * 1024 * 1024;
    const isHeic = /^image\/(hei[cf])$/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
    if (f.size <= LIMIT && !isHeic) return f;
    try {
      let src: any;
      try {
        src = await createImageBitmap(f);
      } catch {
        const url = URL.createObjectURL(f);
        src = await new Promise<HTMLImageElement>((ok, no) => {
          const img = new Image();
          img.onload = () => ok(img);
          img.onerror = () => no(new Error('decode'));
          img.src = url;
        });
        URL.revokeObjectURL(url);
      }
      const w = src.width as number;
      const h = src.height as number;
      const scale = Math.min(1, 1600 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return f;
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(r => canvas.toBlob(b => r(b), 'image/jpeg', 0.85));
      if (!blob) return f;
      const name = (f.name.replace(/\.[^.]+$/, '') || 'scan') + '.jpg';
      return new File([blob], name, { type: 'image/jpeg' });
    } catch {
      return f; // ย่อไม่ได้ (เช่น HEIC ที่เบราว์เซอร์ถอดไม่ได้) — ส่งไฟล์เดิม
    }
  }, []);

  const scan = async (fileArg?: File) => {
    const src: File | null = fileArg || file;
    if (!src) return;
    setError(null);
    setNotice(null);
    setStage('uploading');
    diag('scan-start', { ok: true, sizeKb: src.size / 1024, type: src.type || src.name.split('.').pop() });
    try {
      const upload = await shrinkImage(src);
      diag('scan-shrunk', { ok: true, sizeKb: upload.size / 1024, type: upload.type });
      if (upload.size > 4.2 * 1024 * 1024) {
        setError(`รูปใหญ่เกินไป (${(upload.size / 1024 / 1024).toFixed(1)} MB) — ถ่ายใหม่ให้ชัดแต่เล็กลง หรือใช้ปุ่ม "ถ่ายจากแอปกล้อง"`);
        setStage('idle');
        return;
      }
      if (/hei[cf]/i.test(upload.type) || /\.hei[cf]$/i.test(upload.name)) {
        setError('รูปเป็น HEIC ของ iPhone ที่เบราว์เซอร์ย่อไม่ได้ — ตั้งค่า → กล้อง → รูปแบบ → "ความเข้ากันได้สูงสุด" แล้วถ่ายใหม่ (หรือใช้ปุ่มถ่ายในหน้าเว็บ)');
        setStage('idle');
        return;
      }
      const formData = new FormData();
      formData.append('file', upload);

      setStage('reading');
      const t0 = Date.now();
      let res: Response;
      try {
        res = await fetch('/api/ocr', { method: 'POST', body: formData });
      } catch (e1: any) {
        // WebView ในแอปมือถือ (LINE/FB) บางรุ่นตัด multipart POST ทิ้ง → ส่ง JSON base64 แทน
        diag('scan-retry-json', { ok: false, message: String(e1?.message || '') });
        const dataUrl = await new Promise<string>((ok, no) => {
          const rd = new FileReader();
          rd.onload = () => ok(String(rd.result || ''));
          rd.onerror = () => no(new Error('read-failed'));
          rd.readAsDataURL(upload);
        });
        res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl, mime: upload.type || 'image/jpeg', filename: upload.name }),
        });
      }
      diag('scan-http', { ok: res.ok, http: res.status, ms: Date.now() - t0 });
      setStage('verifying');
      const data = await res.json().catch(() => ({} as any));
      diag('scan-body', { ok: res.ok, http: res.status, message: String((data as any)?.error || '').slice(0, 120) });
      if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        setError(
          res.status === 413
            ? 'ไฟล์ใหญ่เกินขีดจำกัดของเซิร์ฟเวอร์ (413) — ลองถ่ายใหม่หรือย่อรูป'
            : `เซิร์ฟเวอร์ตอบผิดรูป (HTTP ${res.status}) — ลองกดสแกนอีกครั้ง`
        );
        setStage('idle');
        return;
      }

      if (!res.ok || !data.success) {
        if (res.status === 401) {
          setError('เซสชันหมดอายุ — กรุณาล็อกอินใหม่แล้วสแกนอีกครั้ง');
          setStage('idle');
          return;
        }
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
      diag('scan-ok', { ok: true, http: 200 });
    } catch (e: any) {
      const msg = String(e?.message || '');
      diag('scan-error', { ok: false, message: msg, sizeKb: src.size / 1024, type: src.type || '' });
      if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
        setError(
          `เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (Failed to fetch) — ไฟล์ ${(src.size / 1024 / 1024).toFixed(1)} MB ` +
          'มักเกิดจากไฟล์ใหญ่เกิน 4 MB หรือสัญญาณเน็ตหลุด · ลองกดสแกนอีกครั้ง ถ้ายังไม่ผ่านให้ถ่ายใหม่ให้เล็กลง'
        );
      } else {
        setError(msg || 'เกิดข้อผิดพลาดในการอ่านเอกสาร');
      }
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

  // รายการแบบประกัน (สัญญาหลัก) สำหรับเครื่องคำนวณเบี้ย — API เดียวกับหน้า /apply
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/commissions?q=&category=', { credentials: 'include' });
        const j = await r.json();
        const list = (j?.products || []).filter((x: any) => !/เพิ่มเติม| rider/i.test(String(x?.cat || '')));
        if (alive) setPremPlans(list);
      } catch { /* คำนวณด้วยค่าที่กรอกได้แม้ไม่มีรายการ */ }
    })();
    return () => { alive = false; };
  }, []);

  // เติมรหัสตัวแทนของตัวเองจากเซสชัน (ครั้งแรกที่เปิดฟอร์ม)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (!r.ok) return;
        const u = (await r.json())?.user || null;
        if (!alive || !u) return;
        setMk((prev) => (prev.agentCode ? prev : { ...prev, agentCode: String(u.memberCode || u.referralCode || '') }));
      } catch { /* ไม่ล็อกอิน = ผู้ใช้กรอกรหัสเอง */ }
    })();
    return () => { alive = false; };
  }, [mkOpen]);

  /** สร้างใบเสร็จ: ตรวจฟิลด์ตาม receiptStandard แล้วบันทึกผ่าน /api/documents/create-manual */
  const createManualReceipt = async () => {
    setMkError(null); setMkDone(null);
    const amountNum = Number(String(mk.amount).replace(/[^\d.]/g, ''));
    if (!String(mk.agentCode).trim()) { setMkError('ต้องระบุรหัสตัวแทนของตัวเอง (ดูได้จาก app TL ProPlus บน iPad)'); return; }
    if (!amountNum || amountNum <= 0) { setMkError('ต้องระบุยอดเงินที่ชำระ (มากกว่า 0 บาท)'); return; }
    if (!String(mk.receiptNumber).trim() && !String(mk.referenceNumber).trim()) { setMkError('ต้องมีเลขใบเสร็จ หรือ เลขอ้างอิงรายการ อย่างน้อย 1 อย่าง'); return; }
    if (!String(mk.paidAt).trim()) { setMkError('ต้องระบุวันที่ชำระ'); return; }
    setMkBusy(true);
    try {
      const res = await fetch('/api/documents/create-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...mk, memberId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMkError(j.error || 'บันทึกใบเสร็จไม่สำเร็จ'); return; }
      setMkDone(j.receipt || j);
      setMk({ agentCode: mk.agentCode, receiptNumber: '', referenceNumber: '', amount: '', paidAt: '', policyNo: '', planName: '' });
      await loadReceipts();
    } catch (e: any) {
      setMkError(e?.message || 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setMkBusy(false);
    }
  };

  // ── ตัวเลือกที่ยึดตามรูปแบบใบเสร็จ/โปรแกรมจริง (ไม่แต่งผลิตภัณฑ์ขึ้นเอง) ──────
  const WZ_DOC_TYPES: [string, string][] = [
    ['receipt', 'ใบเสร็จรับเงิน'],
    ['premium_certificate', 'หนังสือรับรองการชำระเบี้ยประกันภัย'],
    ['bank_slip', 'สลิปจ่ายบิล / ใบโอนเงิน'],
  ];
  const WZ_PAY_METHODS = ['รายปี', 'ราย 6 เดือน', 'ราย 3 เดือน', 'รายเดือน', 'ชำระครั้งเดียว'];
  const WZ_BANKS = ['ธ.ก.ส. (BAAC)', 'ธนาคารกรุงเทพ', 'กสิกรไทย', 'ไทยพาณิชย์', 'กรุงไทย', 'กรุงศรีอยุธยา', 'ออมสิน', 'เงินสด/ตัวแทนรับเงิน', 'อื่น ๆ'];
  const wzSet = (k: string, v: any) => setWz((prev: any) => ({ ...prev, [k]: v }));
  const wzValid = (st: number) => {
    if (st === 1) return Boolean(String(wz.agentCode).trim() && String(wz.docType).trim());
    if (st === 2) return Boolean(String(wz.planName).trim());
    if (st === 3) return Boolean(String(wz.paymentMethod).trim());
    if (st === 4) return Boolean(Number(String(wz.amount).replace(/[^\d.]/g, '')) > 0 && String(wz.paidAt).trim() && (String(wz.receiptNumber).trim() || String(wz.referenceNumber).trim()));
    return true;
  };

  /** เปิดตัวช่วยกรอก: ดึงข้อมูลที่ระบบรู้อยู่แล้ว (รหัสตัวแทน/สมาชิก) มาเติมให้ก่อน */
  const openWizard = async () => {
    setWzOpen(true); setWzStep(1); setWzErr(null); setWzDone(null);
    // เติมจากค่าที่หน้านี้ดึงไว้แล้วก่อน (เร็วและไม่ต้องรอเน็ต) แล้วค่อยยืนยันจากเซสชัน
    if (!wz.agentCode && mk.agentCode) setWz((prev: any) => ({ ...prev, agentCode: prev.agentCode || mk.agentCode }));
    if (wz.agentCode || mk.agentCode) return;
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      const u = (await r.json().catch(() => ({})))?.user || null;
      const code = String(u?.memberCode || u?.referralCode || '');
      if (code) setWz((prev: any) => ({ ...prev, agentCode: prev.agentCode || code }));
    } catch { /* กรอกเองได้ */ }
  };

  /** จบกระบวนการ: บันทึกใบเสร็จ (ผูก agentCode) แล้วต่อด้วยการสแกนใบเสร็จรับเงิน */
  const submitWizard = async () => {
    setWzErr(null); setWzBusy(true);
    try {
      const res = await fetch('/api/documents/create-manual', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...wz, memberId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setWzErr(j.error || 'บันทึกไม่สำเร็จ'); return; }
      setWzDone(j.receipt || j);
      await loadReceipts();
    } catch (e: any) {
      setWzErr(e?.message || 'เชื่อมต่อไม่สำเร็จ');
    } finally { setWzBusy(false); }
  };

  const confPct = ocr ? Math.round(ocr.confidence * 100) : 0;
  const busy = stage !== 'idle' && stage !== 'preview';

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 pb-28 space-y-5">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">สแกนใบเสร็จรับเงิน เข้าระบบ</h1>
          </div>

          {/* ── 3 ขั้นตอนสมัคร/ลงทะเบียน (ยกมาไว้บนสุด) + ภาพขั้นตอนจากหน้า /financial-freedom ── */}
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-[#475569]">🧭 3 ขั้นตอนสมัครและลงทะเบียน</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full border bg-white text-slate-500">ก่อนเริ่มสแกนใบเสร็จ</span>
            </div>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              {[
                { n: '1', icon: '📝', t: 'ลงทะเบียนสมัครสมาชิก', d: 'สมัครบัญชีด้วยอีเมลและรหัสผ่าน แล้วยืนยันอีเมล', href: '/register', cta: 'ไปหน้าลงทะเบียน' },
                { n: '2', icon: '🧑‍💼', t: 'สมัครเป็นตัวแทน (ผู้มุ่งหวัง)', d: 'กรอกใบสมัคร/แสดงความสนใจ เข้าสู่การคัดเลือก', href: '/recruit', cta: 'ไปหน้าสมัครตัวแทน' },
                { n: '3', icon: '🧾', t: 'สร้าง/อัปโหลดสลิป / ใบเสร็จ', d: 'สร้างใบเสร็จด้วยรหัสตัวแทนของตัวเอง หรืออัปโหลดสลิปให้ระบบอ่านยอดเงินจริง', href: '/documents', cta: 'อยู่หน้านี้แล้ว' },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border bg-white p-4 flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-[#475569] text-white text-xs font-bold flex items-center justify-center">{s.n}</span>
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-sm font-semibold text-[#475569]">{s.t}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2 flex-1">{s.d}</p>
                  <Link href={s.href} className="mt-3 inline-block px-3 py-1.5 rounded-full border text-xs text-sky-700 hover:bg-sky-50 text-center">
                    {s.cta} →
                  </Link>
                </div>
              ))}
            </div>

            <a href="/steps/3-steps-th.jpg" target="_blank" rel="noreferrer" className="block mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/steps/3-steps-th.webp"
                alt="ภาพ 3 ขั้นตอน: 1) ลงทะเบียนสมัครสมาชิก 2) สมัครเป็นตัวแทน (ผู้มุ่งหวัง) 3) สร้าง/อัปโหลดสลิป/ใบเสร็จ"
                className="w-full max-w-4xl mx-auto rounded-xl border shadow-sm hover:shadow-md transition-shadow"
                loading="lazy"
              />
              <div className="text-center text-[11px] text-slate-500 mt-2">ภาพรวม 3 ขั้นตอน (แตะที่ภาพเพื่อเปิดขนาดเต็ม)</div>
            </a>
          </div>

          {/* ── แผงสิทธิ์: แสดงให้ "ผู้ดูแลระบบ" เห็นว่าตัวเองมีสิทธิอะไรในหน้านี้ (ผู้ใช้ทั่วไปไม่เห็น) ── */}
          <AdminRightsPanel
            scope="เห็นคลังใบเสร็จของสมาชิกทุกคนในระบบ (ไม่จำกัดเฉพาะของตัวเอง)"
            rights={[
              { icon: '🗑', label: 'ลบใบเสร็จ/เอกสารออกจากคลังได้ทุกใบ', detail: 'ลบทั้งข้อมูลในคลังและไฟล์ต้นฉบับใน Storage พร้อมบันทึก Audit Log (receipt.deleted)' },
              { icon: '📚', label: 'ดูคลังใบเสร็จทั้งหมด + สรุปยอดเข้าเครือข่าย 1 แตก 5' },
              { icon: '🧾', label: 'สแกน/บันทึกใบเสร็จให้สมาชิกคนใดก็ได้ผ่านช่องรหัสสมาชิก' },
            ]}
            note="สมาชิกทั่วไปลบได้เฉพาะใบเสร็จของรหัสตัวเอง (เซิร์ฟเวอร์ตรวจเจ้าของทุกครั้ง) · ผู้ดูแลระบบลบและแก้ไขได้ทุกใบ · การลบ/แก้ไขบันทึก Audit Log เสมอ"
          />

          {/* ══ โปรแกรมคำนวณเบี้ยประกันชีวิต (วางไว้ "ก่อน" สร้าง/อัปโหลดใบเสร็จ) ══ */}
          <div className="card overflow-hidden p-0">
            <div className="bg-gradient-to-r from-[#0b2b5b] via-[#123a73] to-[#1d4ed8] px-5 py-4 text-white">
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]">Insurance toolkit</span>
              <h2 className="mt-2 text-base font-bold sm:text-lg">🧮 คำนวณเบี้ยประกันชีวิต — ก่อนสร้าง/อัปโหลดใบเสร็จ</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-white/85">
                เลือกแบบประกัน · เพศ · อายุ · ทุนประกัน · ระยะชำระเบี้ย แล้วระบบประมาณการเบี้ยให้ทันที
                จากนั้นกดปุ่มเพื่อส่งค่าเข้าแบบฟอร์มใบเสร็จด้านล่างได้เลย
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-[11px] font-medium text-slate-600 lg:col-span-2">แบบประกัน (สัญญาหลัก)
                  <select
                    value={premPicked?.c || ''}
                    onChange={(e) => { const hit = premPlans.find((x) => x.c === e.target.value); setPremPicked(hit || null); setPremResult(null); }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="">— เลือกแบบประกัน —</option>
                    {premPlans.slice(0, 150).map((x) => <option key={x.c} value={x.c}>{x.c} · {x.n} ({x.cat})</option>)}
                  </select>
                </label>
                <label className="text-[11px] font-medium text-slate-600">เพศ
                  <select value={premGender} onChange={(e) => { setPremGender(e.target.value as 'ชาย' | 'หญิง'); setPremResult(null); }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                    <option value="ชาย">ชาย</option><option value="หญิง">หญิง</option>
                  </select>
                </label>
                <label className="text-[11px] font-medium text-slate-600">อายุ (ปี)
                  <input value={premAge} inputMode="numeric" onChange={(e) => { setPremAge(e.target.value.replace(/\D/g, '').slice(0, 2)); setPremResult(null); }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="30" />
                </label>
                <label className="text-[11px] font-medium text-slate-600">ทุนประกัน (บาท)
                  <input value={premCover} inputMode="numeric" onChange={(e) => { setPremCover(e.target.value.replace(/[^\d]/g, '').slice(0, 9)); setPremResult(null); }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="1000000" />
                </label>
                <label className="text-[11px] font-medium text-slate-600">ระยะชำระเบี้ย (ปี)
                  <input value={premPayYears} inputMode="numeric" onChange={(e) => { setPremPayYears(e.target.value.replace(/\D/g, '').slice(0, 2)); setPremResult(null); }}
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="10" />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button"
                  onClick={() => setPremResult(estimatePremium({
                    planName: premPicked?.n, planCat: premPicked?.cat,
                    gender: premGender === 'หญิง' ? 'female' : 'male',
                    age: premAge, cover: premCover, payYears: premPayYears,
                  }))}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95">
                  คำนวณเบี้ยประกันชีวิต
                </button>
                {premResult && (
                  <button type="button"
                    onClick={() => {
                      setMkOpen(true);
                      setMk((prev) => ({
                        ...prev,
                        planName: premPicked ? `${premPicked.c} ${premPicked.n}` : prev.planName,
                        amount: String(premResult.perYear || ''),
                      }));
                    }}
                    className="rounded-full bg-[#475569] px-4 py-2 text-xs font-bold text-white">
                    ใช้ค่านี้กรอกใบเสร็จ ↓
                  </button>
                )}
                <a href="/apply" className="rounded-full border px-4 py-2 text-xs font-semibold text-slate-600 no-underline">เปิดหน้าเคสเต็ม (คำนวณ+ใบเสนอขาย)</a>
                <span className="text-[10px] text-slate-400">{PREMIUM_RATE_VERSION}</span>
              </div>

              {premResult && (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { l: 'เบี้ยต่อปี (ประมาณการ)', v: `${Number(premResult.perYear || 0).toLocaleString()} ฿`, s: `${premPicked?.c || '-'} · ${premGender} ${premAge} ปี` },
                      { l: 'เฉลี่ยต่อเดือน', v: `${Number(premResult.perMonth || 0).toLocaleString()} ฿`, s: 'เบี้ยรายปี ÷ 12' },
                      { l: 'ลดหย่อนภาษีได้สูงสุด', v: `${Number(premResult.taxDeductible || 0).toLocaleString()} ฿`, s: `เพดาน ${LIFE_PREMIUM_TAX_CAP.toLocaleString()} ฿/ปี` },
                      { l: `รวมตลอด ${Number(premResult.payYears || 0)} ปี`, v: `${Number(premResult.totalPremium || 0).toLocaleString()} ฿`, s: 'เบี้ยต่อปี × ระยะชำระ' },
                    ].map((k) => (
                      <div key={k.l} className="rounded-xl border bg-white px-3 py-2">
                        <div className="text-[10px] text-slate-500">{k.l}</div>
                        <div className="text-base font-bold text-[#0b2b5b]">{k.v}</div>
                        <div className="text-[10px] text-slate-400">{k.s}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
                    ฐานคำนวณ: {premResult.basis}<br />{premResult.disclaimer}
                  </div>
                  {premResult.warnings?.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[10px] text-amber-700">
                      {premResult.warnings.map((w: string, i: number) => <li key={i}>• {w}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* สแกน + อัปโหลดใบเสร็จ */}
          <div className="card p-5">
            <h2 className="font-semibold text-[#475569] mb-1">↑ สร้าง/อัปโหลดสลิป/ใบเสร็จ — สแกนยอดเงินจริง</h2>
            <p className="text-xs text-slate-500 mb-1">
              ระบบจะสแกนยอดเงินจริงด้วย AI (Gemini Vision) แล้วตรวจคุณสมบัติเลื่อนตำแหน่งให้อัตโนมัติ
            </p>
            <p className="text-[10px] text-slate-400 mb-3">
              build: {(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)} · ถ้าเลขนี้ไม่ตรงกับที่แจ้ง ให้กดรีเฟรชหน้า (ล้างแคช)
            </p>

            {/* ── สร้างใบเสร็จด้วยรหัสตัวแทนของฉัน (ออกจาก TL ProPlus บน iPad) ── */}
            <div className="mb-3 rounded-xl border border-[#c8a84e] bg-[#fffdf5] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#475569]">🧾 สร้างใบเสร็จด้วยรหัสตัวแทนของฉัน</div>
                  <div className="text-[11px] leading-relaxed text-slate-500">
                    ออกใบเสร็จในแอป <b>TL ProPlus บน iPad</b> → คัดลอก <b>เลขใบเสร็จ / เลขอ้างอิงรายการ</b> มากรอกที่นี่
                    ระบบบันทึกเข้าคลังและผูกกับ <b>รหัสตัวแทนของคุณ</b> — ไม่ต้องถ่ายรูป
                  </div>
                </div>
                <button type="button" onClick={() => { setMkOpen(!mkOpen); setMkError(null); }}
                  className="shrink-0 rounded-full bg-[#475569] px-4 py-2 text-xs font-bold text-white">
                  {mkOpen ? 'ปิดฟอร์ม' : 'สร้างใบเสร็จ'}
                </button>
              </div>

              {mkOpen && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-500">รหัสตัวแทนของฉัน *
                    <input value={mk.agentCode} onChange={(e) => setMk({ ...mk, agentCode: e.target.value.trim() })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น 01759064" />
                  </label>
                  <label className="text-xs text-slate-500">ยอดเงินที่ชำระ (บาท) *
                    <input value={mk.amount} inputMode="decimal" onChange={(e) => setMk({ ...mk, amount: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น 66604.00" />
                  </label>
                  <label className="text-xs text-slate-500">เลขใบเสร็จ
                    <input value={mk.receiptNumber} onChange={(e) => setMk({ ...mk, receiptNumber: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="จาก TL ProPlus" />
                  </label>
                  <label className="text-xs text-slate-500">เลขอ้างอิงรายการ
                    <input value={mk.referenceNumber} onChange={(e) => setMk({ ...mk, referenceNumber: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ref./Transaction No." />
                  </label>
                  <label className="text-xs text-slate-500">วันที่ชำระ *
                    <input type="date" value={mk.paidAt} onChange={(e) => setMk({ ...mk, paidAt: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-500">เลขกรมธรรม์ (ถ้ามี)
                    <input value={mk.policyNo} onChange={(e) => setMk({ ...mk, policyNo: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-slate-500 sm:col-span-2">แบบประกัน / หมายเหตุ (ถ้ามี)
                    <input value={mk.planName} onChange={(e) => setMk({ ...mk, planName: e.target.value })}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                  </label>

                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={createManualReceipt} disabled={mkBusy}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                      {mkBusy ? 'กำลังบันทึก…' : 'บันทึกใบเสร็จเข้าคลัง'}
                    </button>
                    <span className="text-[11px] text-slate-400">ผู้ออก/ผู้รับเงิน: บมจ.ไทยประกันชีวิต (ตรวจตามมาตรฐานใบเสร็จอัตโนมัติ)</span>
                  </div>

                  {mkError && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{mkError}</p>}
                  {mkDone && (
                    <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      ✓ สร้างใบเสร็จแล้ว — เลขที่ <b className="font-mono">{mkDone.receiptNumber || mkDone.receiptId}</b>
                      {' '}· ยอด {(Number(mkDone.amount) || 0).toLocaleString()} บาท · รหัสตัวแทน <b className="font-mono">{mkDone.agentCode}</b>
                      <div className="mt-1 text-[11px] text-emerald-700">
                        สถานะ: {mkDone.verificationStatus || 'รอตรวจสอบ'} — ระบบยังไม่นับยอดเข้า FYC/ตำแหน่ง จนกว่าจะแนบหลักฐานหรือผู้ดูแลตรวจทาน
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ติดตั้งเป็นแอป (PWA) — ครั้งต่อไปแตะไอคอนแล้วกล้องพร้อมถ่ายเลย ไม่ต้องผ่าน LINE */}
            {(installEvt || isPhone) && (
              <div className="mb-3 rounded-xl border border-[#c8a84e] bg-amber-50 p-3 text-xs text-[#3f3a2f]">
                <div className="font-semibold mb-1">📲 ใช้เป็นแอปบนมือถือ (กล้องเปิดได้ทันที)</div>
                {installEvt ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await installEvt.prompt();
                        const r = await installEvt.userChoice;
                        diag('install-choice', { ok: r?.outcome === 'accepted', message: r?.outcome });
                        setInstallEvt(null);
                        setNotice(r?.outcome === 'accepted' ? 'ติดตั้งแล้ว — เปิดจากไอคอนบนหน้าจอโฮมได้เลย' : 'ยกเลิกการติดตั้ง');
                      } catch {
                        setNotice('ติดตั้งอัตโนมัติไม่ได้ — ใช้เมนู Chrome → เพิ่มลงในหน้าจอหลัก');
                      }
                    }}
                    className="rounded-full bg-[#475569] px-4 py-2 font-bold text-white"
                  >
                    ติดตั้งแอปสแกนใบเสร็จ
                  </button>
                ) : (
                  <div className="leading-relaxed">
                    {isIOS
                      ? 'iPhone: กดปุ่มแชร์ ⬆️ → “เพิ่มไปที่หน้าจอโฮม”'
                      : 'Android: เปิดหน้านี้ด้วย Chrome → ⋮ → “เพิ่มลงในหน้าจอหลัก”'}
                    {' '}แล้วเปิดจากไอคอน — กล้องจะขึ้นพร้อมถ่ายทุกครั้ง
                  </div>
                )}
              </div>
            )}

            {/* in-app browser (LINE/Facebook) บล็อกกล้อง — เตือนก่อนผู้ใช้กดแล้วเงียบ */}
            {inApp && (
              <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                ✅ <b>ใช้ได้เลยไม่ต้องเปิด Chrome</b> — ในแอป LINE กล้องสดในเว็บถูกบล็อก แต่ใช้ <b>กล้องของเครื่อง</b>ได้:
                กด <b>“📷 ถ่ายด้วยแอปกล้อง”</b> → ถ่ายรูป → กลับมาเลือกภาพ → กดสแกน
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="scan-camera-input"
                    onClick={() => diag('picker-open', { ok: true, target: 'camera' })}
                    className="cursor-pointer rounded-full bg-[#475569] px-3 py-1.5 font-bold text-white"
                  >
                    📷 ถ่ายด้วยแอปกล้อง
                  </label>
                  <label
                    htmlFor="scan-file-input"
                    onClick={() => diag('picker-open', { ok: true, target: 'gallery' })}
                    className="cursor-pointer rounded-full border border-emerald-400 bg-white px-3 py-1.5 font-semibold"
                  >
                    🖼 เลือกจากคลังภาพ
                  </label>
                </div>
                {/Android/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '') && (
                  <a
                    href={`intent://${(origin || 'https://ai-insurance-network-tree.vercel.app').replace(/^https?:\/\//, '')}/documents?m=1&cam=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(`${origin || 'https://ai-insurance-network-tree.vercel.app'}/documents?m=1&cam=1`)};end`}
                    className="mt-2 inline-block rounded-full bg-emerald-700 px-4 py-2 font-bold text-white no-underline"
                  >
                    🌐 เปิดใน Chrome (กล้องจะขึ้น)
                  </a>
                )}
                <div className="mt-2 text-[11px] leading-relaxed">
                  ถ้าหน้าต่างที่เด้งขึ้นเป็น “ค้นรูป/แกลเลอรี” ให้แตะไอคอน <b>📷 กล้อง</b> ที่แถบด้านบนของหน้าต่างนั้น (ไม่ใช่ช่องค้นหา) แล้วถ่ายรูปใหม่ ·
                  {' '}
                  <label htmlFor="scan-camera-legacy" className="cursor-pointer font-semibold underline">
                    ลองปุ่มกล้องแบบเก่า
                  </label>
                </div>
              </div>
            )}

            {/* ── ตัวช่วยกรอกทีละขั้น ตามที่โปรแกรมกำหนด → จบด้วยการสแกนใบเสร็จ ── */}
            <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[#475569]">🧭 กรอกใบเสร็จทีละขั้น (ตามที่โปรแกรมกำหนด)</div>
                  <div className="text-[11px] leading-relaxed text-slate-500">
                    กดปุ่มเดียว ระบบดึงข้อมูลที่รู้อยู่แล้วมาเติม แล้วพาเลือกตัวเลือกตามลำดับ 5 ขั้น
                    (ประเภทเอกสาร → แบบประกัน/กรมธรรม์ → งวดและช่องทางชำระ → ยอด/วันที่/เลขที่ → ตรวจสอบ)
                    จบแล้วต่อด้วย <b>สแกนใบเสร็จรับเงิน</b>ได้ทันที
                  </div>
                </div>
                <button type="button" onClick={() => (wzOpen ? (setWzOpen(false), setWzStep(1)) : openWizard())}
                  className="shrink-0 rounded-full bg-sky-600 px-4 py-2 text-xs font-bold text-white">
                  {wzOpen ? 'ปิด' : 'ดึงข้อมูล + กรอกตามขั้นตอน'}
                </button>
              </div>

              {wzOpen && (
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {['ข้อมูลตัวแทน', 'แบบประกัน/กรมธรรม์', 'งวด/ช่องทาง', 'ยอด/วันที่/เลขที่', 'ตรวจสอบ+สแกน'].map((t, i) => (
                      <span key={t} className={`rounded-full px-2 py-0.5 ${wzStep === i + 1 ? 'bg-sky-600 text-white' : wzStep > i + 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 border'}`}>
                        {i + 1}. {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {wzStep === 1 && (<>
                      <label className="text-xs text-slate-500">ประเภทเอกสาร (ตามที่โปรแกรมออกให้)
                        <select value={wz.docType} onChange={(e) => wzSet('docType', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                          {WZ_DOC_TYPES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-slate-500">รหัสตัวแทนของฉัน *
                        <input value={wz.agentCode} onChange={(e) => wzSet('agentCode', e.target.value.trim())} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น 01759064" />
                      </label>
                      <div className="sm:col-span-2 text-[11px] text-slate-400">รหัสตัวแทนถูกดึงจากบัญชีที่ล็อกอินให้แล้ว — แก้ได้ถ้าใบเสร็จออกในนามรหัสอื่น</div>
                    </>)}

                    {wzStep === 2 && (<>
                      <label className="text-xs text-slate-500">ชื่อแบบประกัน (ตามที่ระบุในกรมธรรม์) *
                        <input value={wz.planName} onChange={(e) => wzSet('planName', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น ไทยประกัน 99/1" list="wz-plans" />
                        <datalist id="wz-plans">
                          {Array.from(new Set((receipts || []).map((r: any) => r.planName).filter(Boolean))).slice(0, 20).map((v: any) => <option key={String(v)} value={String(v)} />)}
                        </datalist>
                      </label>
                      <label className="text-xs text-slate-500">เลขกรมธรรม์
                        <input value={wz.policyNo} onChange={(e) => wzSet('policyNo', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น C8009159" />
                      </label>
                      <label className="text-xs text-slate-500">ระยะชำระ (ปี)
                        <input value={wz.policyTermYears} inputMode="numeric" onChange={(e) => wzSet('policyTermYears', e.target.value.replace(/\D/g, '').slice(0, 2))} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น 10" />
                      </label>
                    </>)}

                    {wzStep === 3 && (<>
                      <label className="text-xs text-slate-500">งวดชำระ *
                        <select value={wz.paymentMethod} onChange={(e) => wzSet('paymentMethod', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                          {WZ_PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </label>
                      <label className="text-xs text-slate-500">งวดที่ / จำนวนงวด (รูปแบบ NN/NN)
                        <input value={wz.installmentLabel} onChange={(e) => wzSet('installmentLabel', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="01/01" />
                      </label>
                      <label className="text-xs text-slate-500">ช่องทางรับชำระ
                        <select value={wz.bank} onChange={(e) => wzSet('bank', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                          <option value="">— เลือก —</option>
                          {WZ_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </label>
                    </>)}

                    {wzStep === 4 && (<>
                      <label className="text-xs text-slate-500">ยอดเงินที่ชำระ (บาท) *
                        <input value={wz.amount} inputMode="decimal" onChange={(e) => wzSet('amount', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น 66604.00" />
                      </label>
                      <label className="text-xs text-slate-500">วันที่ชำระ *
                        <input type="date" value={wz.paidAt} onChange={(e) => wzSet('paidAt', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" />
                      </label>
                      <label className="text-xs text-slate-500">เลขใบเสร็จ
                        <input value={wz.receiptNumber} onChange={(e) => wzSet('receiptNumber', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="จาก TL ProPlus" />
                      </label>
                      <label className="text-xs text-slate-500">เลขอ้างอิงรายการ
                        <input value={wz.referenceNumber} onChange={(e) => wzSet('referenceNumber', e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ref./Transaction No." />
                      </label>
                    </>)}

                    {wzStep === 5 && (
                      <div className="sm:col-span-2 rounded-lg border bg-white p-3 text-xs text-slate-600">
                        <div className="font-semibold text-[#475569] mb-2">ตรวจสอบก่อนบันทึก</div>
                        <div className="grid gap-1 sm:grid-cols-2">
                          <div>ประเภทเอกสาร: <b>{WZ_DOC_TYPES.find(([v]) => v === wz.docType)?.[1]}</b></div>
                          <div>รหัสตัวแทน: <b className="font-mono">{wz.agentCode}</b></div>
                          <div>แบบประกัน: <b>{wz.planName || '-'}</b></div>
                          <div>กรมธรรม์: <b className="font-mono">{wz.policyNo || '-'}</b></div>
                          <div>งวด: <b>{wz.paymentMethod} {wz.installmentLabel || ''}</b></div>
                          <div>ช่องทาง: <b>{wz.bank || '-'}</b></div>
                          <div>ยอดเงิน: <b>{Number(String(wz.amount).replace(/[^\d.]/g, '') || 0).toLocaleString()} บาท</b></div>
                          <div>วันที่ชำระ: <b>{wz.paidAt || '-'}</b></div>
                          <div>เลขใบเสร็จ: <b className="font-mono">{wz.receiptNumber || '-'}</b></div>
                          <div>เลขอ้างอิง: <b className="font-mono">{wz.referenceNumber || '-'}</b></div>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-400">ผู้ออก/ผู้รับเงิน: บมจ.ไทยประกันชีวิต — ระบบตรวจตามมาตรฐานใบเสร็จให้อัตโนมัติ</div>
                      </div>
                    )}

                    {wzErr && <p className="sm:col-span-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{wzErr}</p>}

                    {wzDone && (
                      <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        ✓ บันทึกใบเสร็จแล้ว — เลขที่ <b className="font-mono">{wzDone.receiptNumber || wzDone.receiptId}</b> · ยอด {(Number(wzDone.amount) || 0).toLocaleString()} บาท
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label htmlFor="scan-file-input" onClick={() => diag('picker-open', { ok: true, target: 'wizard-scan' })}
                            className="cursor-pointer rounded-full bg-[#475569] px-3 py-1.5 text-[11px] font-bold text-white">
                            📷 สแกนใบเสร็จรับเงิน (ต่อทันที)
                          </label>
                          <label htmlFor="scan-camera-input" onClick={() => diag('picker-open', { ok: true, target: 'wizard-camera' })}
                            className="cursor-pointer rounded-full border border-slate-400 bg-white px-3 py-1.5 text-[11px] font-semibold">
                            ถ่ายด้วยแอปกล้อง
                          </label>
                          <button type="button" onClick={() => { setWzOpen(false); setWzStep(1); setWzDone(null); }}
                            className="rounded-full border px-3 py-1.5 text-[11px] text-slate-600">ปิด</button>
                        </div>
                      </div>
                    )}

                    <div className="sm:col-span-2 mt-1 flex flex-wrap items-center gap-2">
                      {wzStep > 1 && !wzDone && (
                        <button type="button" onClick={() => { setWzErr(null); setWzStep(wzStep - 1); }}
                          className="rounded-full border px-3 py-1.5 text-xs text-slate-600">← ย้อนกลับ</button>
                      )}
                      {wzStep < 5 && (
                        <button type="button" disabled={!wzValid(wzStep)} onClick={() => { setWzErr(null); if (!wzValid(wzStep)) { setWzErr('กรอกข้อมูลในขั้นนี้ให้ครบก่อน'); return; } setWzStep(wzStep + 1); }}
                          className="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                          ขั้นถัดไป →
                        </button>
                      )}
                      {wzStep === 5 && !wzDone && (
                        <button type="button" disabled={wzBusy} onClick={submitWizard}
                          className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                          {wzBusy ? 'กำลังบันทึก…' : 'บันทึกใบเสร็จ (จบกระบวนการ)'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

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
                  id="scan-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(e) => { diag('file-input-change', { ok: true, sizeKb: (e.target.files?.[0]?.size || 0) / 1024 }); e.target.files?.[0] && acceptFile(e.target.files[0]); }}
                />
                {/* กล้องมือถือแบบ native — เสถียรที่สุดบน iOS/Android (capture=environment) */}
                <input
                  ref={phoneCamRef}
                  id="scan-camera-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onClick={() => diag('camera-input-click', { ok: true })}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    diag('camera-input-change', { ok: !!f, sizeKb: (f?.size || 0) / 1024 });
                    if (f) acceptFile(f);
                  }}
                />
                {/* แบบเก่า: WebView บางตัว (รวม LINE บางเวอร์ชัน) อ่าน capture จาก accept string เท่านั้น */}
                <input
                  id="scan-camera-legacy"
                  type="file"
                  accept="image/*;capture=camera"
                  className="sr-only"
                  onClick={() => diag('camera-legacy-click', { ok: true })}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    diag('camera-legacy-change', { ok: !!f, sizeKb: (f?.size || 0) / 1024 });
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
                      <div className="text-sm font-semibold text-slate-600 mb-1">สแกนใบเสร็จด้วยกล้องมือถือ</div>
                      <div className="text-[11px] text-slate-400 mb-3">
                        เลือกวิธีที่สะดวก — กล้องสดในหน้าเว็บ หรือใช้แอปกล้องของเครื่อง (ได้ทุกiPhone/Android)
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={openCamera}
                          className={`w-full py-3.5 rounded-xl text-sm font-bold ${
                            inApp ? 'bg-slate-200 text-slate-500' : 'bg-[#475569] text-white'
                          }`}
                        >
                          📷 เปิดกล้องสดในหน้านี้
                        </button>
                        {inApp && (
                          <div className="text-[11px] text-amber-700">
                            ปุ่มนี้ไม่ทำงานในเบราว์เซอร์ของ LINE (ระบบบล็อกกล้อง) — เปิดด้วย Chrome/Safari หรือติดตั้งเป็นแอปด้านบน
                          </div>
                        )}
                        <label
                          htmlFor="scan-camera-input"
                          onClick={() => diag('picker-open', { ok: true, target: 'camera' })}
                          className="w-full cursor-pointer py-3 rounded-xl bg-[#c8a84e] text-center text-[#3f3a2f] text-sm font-bold"
                        >
                          📷 ถ่ายด้วยกล้องเครื่อง (เปิดแอปกล้อง)
                        </label>
                        <label
                          htmlFor="scan-file-input"
                          onClick={() => diag('picker-open', { ok: true, target: 'gallery' })}
                          className="w-full cursor-pointer py-2.5 rounded-xl border border-slate-300 bg-white text-center text-[#475569] text-xs font-semibold"
                        >
                          🖼 เลือกรูปจากคลังภาพ
                        </label>
                      </div>
                      {(camSupport === 'unsupported' || camSupport === 'denied') && (
                        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-left text-[11px] text-amber-900">
                          <div className="font-semibold mb-1">
                            {camSupport === 'denied' ? 'สิทธิ์กล้องถูกปิดอยู่' : 'เบราว์เซอร์นี้ไม่รองรับกล้องในเว็บ'}
                          </div>
                          {camSupport === 'denied' ? (
                            <div>
                              {isIOS
                                ? 'เปิด: ตั้งค่า → Safari → กล้อง → อนุญาต (หรือ ตั้งค่า → ' + 'Chrome → กล้อง)'
                                : 'เปิด: แตะ 🔒/⚙️ ข้างที่อยู่เว็บ → สิทธิ์ → กล้อง → อนุญาต แล้วโหลดหน้าใหม่'}
                            </div>
                          ) : (
                            <div>
                              มักเกิดในเบราว์เซอร์ของ LINE/Facebook — ใช้ปุ่มสีทองด้านบนถ่ายจากแอปกล้องได้เลย
                              หรือเปิดลิงก์นี้ใน {isIOS ? 'Safari' : 'Chrome'}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 mt-2">
                        ปุ่มสีทองใช้ได้ทุกเครื่อง (iPhone/Android) ทุกเบราว์เซอร์ · ปุ่มเทา = กล้องสดในหน้าเว็บ
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
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
                <button onClick={() => scan()} disabled={busy} className="px-4 py-2 rounded-full bg-[#475569] text-white text-sm font-semibold disabled:opacity-50">
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
                  autoPlay
                  muted
                  className="w-full max-w-[520px] rounded-xl bg-black aspect-video object-cover"
                />
                {!camReady && !camError && (
                  <div className="mt-2 text-xs text-amber-200 text-center">กำลังเตรียมกล้อง… รอสักครู่</div>
                )}
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
                          <button onClick={() => scan()} className="px-3 py-1.5 rounded-full text-xs border bg-white">🔄 สแกนใหม่</button>
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
                          {(canDelete || isOwnRow(r)) ? (
                            <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => editReceipt(r)}
                                  title="แก้ไขข้อมูลใบเสร็จ (ผู้ดูแลระบบ)"
                                  className="px-2.5 py-1 rounded-full border border-sky-200 text-sky-700 hover:bg-sky-50"
                                >
                                  ✏ แก้ไข
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => removeReceipt(r.id, r.filename, isOwnRow(r))}
                                title={canDelete ? 'ลบใบเสร็จออกจากคลัง (ผู้ดูแลระบบ)' : 'ลบใบเสร็จของรหัสตัวเอง เพื่อสแกนใหม่'}
                                className="px-2.5 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                              >
                                🗑 ลบ
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-[11px] text-slate-400 whitespace-nowrap"
                              title="เห็น/ลบได้เฉพาะใบเสร็จของรหัสตัวเอง — ผู้ดูแลระบบจัดการได้ทุกใบ"
                            >
                              🔒 ของรหัสอื่น
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
              🔒 สิทธิ์การเข้าถึง: สมาชิกเห็นและลบได้เฉพาะใบเสร็จของรหัสตัวเอง (เพื่อแก้ไข/สแกนใหม่) · ผู้ดูแลระบบเห็น ลบ และแก้ไขได้ทุกใบ · ทุกการลบ/แก้ไขถูกบันทึก Audit Log · คลังนี้เก็บเฉพาะข้อมูลธุรกรรม (เลขที่ใบเสร็จ กรมธรรม์ วันที่ ยอดเงิน สถานะตรวจ) ไม่เก็บชื่อ-นามสกุล เลขภาษี ที่อยู่ หรือเลขบัตรของลูกค้า
            </p>
          </div>

        </main>
      </div>
    </div>
  );
}
