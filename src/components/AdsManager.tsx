'use client';
// AdsManager — "AI Insurance Ads Manager" (ศูนย์จัดการแคมเปญโฆษณา TikTok เพื่อหาผู้สนใจเป็นตัวแทน)
// คำสั่งเจ้าของระบบ (12 ต.ค. 2026): "สร้างต่อลงมาไว้ล่างสุดในหน้านี้" ของหน้า /expand-team
//
// โครงตามสเปก 10 ข้อ — 8 แท็บ: ภาพรวมโฆษณา · สร้างแคมเปญ · คลังวิดีโอโฆษณา · กลุ่มเป้าหมาย
//              · รายชื่อ Lead · ทีมงานและเครือข่าย · รายงานผลโฆษณา · ตั้งค่าการเชื่อมต่อ TikTok
//
// กติกาที่โค้ดนี้ยึด (สำคัญกว่าความสวย):
//  1) ยังไม่มี API credentials ของ TikTok → เป็น "โหมด Demo" ต้องติดป้ายชัดเจนทุกจุด และ "ห้าม" แสดงว่า
//     ยิงแอดจริง/สร้างแคมเปญจริงสำเร็จ — ปุ่มยืนยันจะรายงานตามจริงว่าไม่ได้สร้างอะไรบน TikTok
//  2) ตัวเลขโฆษณา (ค่าใช้จ่าย, impressions, clicks, CTR, CPL) มาจาก TikTok API เท่านั้น → เมื่อไม่มี
//     ต้องขึ้นว่า "ไม่มีข้อมูล" ห้ามคำนวณหรือเดาตัวเลขขึ้นมาเอง
//  3) ข้อมูลจริงจากฐานข้อมูลระบบใช้ได้: คลังวิดีโอ (Video), ผู้สนใจ (Prospect), ตัวเลขทีม (User)
//     ผ่าน GET /api/ads/overview (อ่านอย่างเดียว)
//  4) ห้ามเก็บ Access Token ฝั่งเบราว์เซอร์ — แท็บตั้งค่าแสดงแค่ "มี/ไม่มี" ของ env ฝั่งเซิร์ฟเวอร์
//  5) วาง URL TikTok ≠ นำไฟล์วิดีโอเข้าระบบ — ระบบไม่ดาวน์โหลดวิดีโอของใคร และต้องยืนยันสิทธิ์ก่อนใช้
//  6) ฉบับร่าง/วิดีโอที่ผู้ใช้อัปโหลด เก็บใน localStorage ของเครื่องนี้ + บอกผู้ใช้ตรง ๆ ว่าเก็บในเครื่อง
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';

type Any = Record<string, any>;
type TabKey = 'overview' | 'create' | 'library' | 'audience' | 'leads' | 'team' | 'reports' | 'settings';
type VideoSel = { kind: 'none' | 'file' | 'tiktok'; url: string; tiktokId?: string; name?: string };
type Form = {
  campaignName: string; objective: string; audienceId: string; area: string; ageRange: string; language: string;
  dailyBudget: string; totalBudget: string; startDate: string; endDate: string; landingPage: string; leadCapture: string;
  videoTitle: string; adText: string; headline: string; cta: string; destinationUrl: string; rights: boolean;
};
type Draft = { id: string; savedAt: string; status: 'draft' | 'active' | 'paused'; form: Form; video: VideoSel };
type LibItem = { id: string; title: string; url: string; tiktokId?: string; kind: 'file' | 'tiktok'; addedAt: string };

const MANAGER_URL = 'https://ads.tiktok.com/i18n/dashboard?aadvid=7251807874932883457&is_from_login=1';
const PROTOTYPE_URL = 'https://www.tiktok.com/@aka989._/video/7692032750454541574';
const PROTOTYPE_ID = '7692032750454541574';
const EMBED = (id: string) => `https://www.tiktok.com/player/v1/${id}?autoplay=0`;
const LS_DRAFTS = 'ads.drafts.v1';
const LS_LIB = 'ads.lib.v1';
const MAX_MB = 200;

const EMPTY_FORM: Form = {
  campaignName: '', objective: 'TRAFFIC', audienceId: 'career', area: 'ทั่วประเทศ', ageRange: '25-44', language: 'th',
  dailyBudget: '', totalBudget: '', startDate: '', endDate: '', landingPage: 'https://ai-insurance-network-tree.vercel.app/',
  leadCapture: 'form',
  videoTitle: '', adText: 'กำลังมองหาโอกาสเติบโตในสายงานที่ปรึกษาการเงินหรือไม่? เรียนรู้ทักษะการขาย การดูแลลูกค้า และการพัฒนาทีมงาน พร้อมพูดคุยเกี่ยวกับเส้นทางอาชีพตัวแทนประกันชีวิต',
  headline: 'เริ่มจาก 0 ก็มีพี่เลี้ยงดูแล', cta: 'LEARN_MORE', destinationUrl: 'https://ai-insurance-network-tree.vercel.app/', rights: false,
};

// สถานะผู้สนใจในระบบ (Prisma ProspectStatus) → 6 สถานะตามสเปกข้อ 7
const STAGE: { key: string; th: string; en: string; codes: string[] }[] = [
  { key: 'new', th: 'ใหม่', en: 'New', codes: ['NEW'] },
  { key: 'contacted', th: 'ติดต่อแล้ว', en: 'Contacted', codes: ['CONTACTED', 'FOLLOW_UP', 'UNREACHABLE'] },
  { key: 'appointment', th: 'นัดหมาย', en: 'Appointment', codes: ['APPOINTMENT'] },
  { key: 'interested', th: 'สนใจสมัคร', en: 'Interested', codes: ['INTERESTED', 'PREPARING_DOCUMENTS'] },
  { key: 'applied', th: 'สมัครแล้ว', en: 'Applied', codes: ['APPLIED', 'CONVERTED'] },
  { key: 'not', th: 'ไม่สนใจ', en: 'Not interested', codes: ['NOT_INTERESTED', 'CANCELLED'] },
];
const stageOf = (code: string) => STAGE.find((s) => s.codes.includes(code)) || null;

const AUDIENCES: { id: string; th: string; en: string; detail: string; interests: string[] }[] = [
  { id: 'career', th: 'คนมองหาอาชีพเสริม / เปลี่ยนสายงาน', en: 'People looking for a side income / career change', detail: '25–44 ปี · ไทย', interests: ['อาชีพขาย', 'รายได้เสริม', 'การเงินส่วนบุคคล'] },
  { id: 'freelance', th: 'ฟรีแลนซ์ / อาชีพอิสระ', en: 'Freelancers / self-employed', detail: '25–44 ปี · ไทย', interests: ['ฟรีแลนซ์', 'ธุรกิจขนาดเล็ก', 'การตลาด'] },
  { id: 'graduate', th: 'นักศึกษา / จบใหม่', en: 'Students / fresh graduates', detail: '20–30 ปี · ไทย', interests: ['หางาน', 'พัฒนาตัวเอง', 'ทักษะการขาย'] },
  { id: 'planner', th: 'ลูกค้าที่สนใจวางแผนการเงิน', en: 'People interested in financial planning', detail: '28–54 ปี · ไทย', interests: ['ประกันชีวิต', 'วางแผนภาษี', 'การออม'] },
];

const AUDIENCE_COPY = 'กำลังมองหาโอกาสเติบโตในสายงานที่ปรึกษาการเงินหรือไม่? เรียนรู้ทักษะการขาย การดูแลลูกค้า และการพัฒนาทีมงาน พร้อมพูดคุยเกี่ยวกับเส้นทางอาชีพตัวแทนประกันชีวิต';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch { return fallback; }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function csvCell(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function nowId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function download(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\ufeff' + content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function AdsManager() {
  const { lang } = useT();
  const L = (th: string, en: string) => (lang === 'en' ? en : th);

  const [tab, setTab] = useState<TabKey>('overview');
  const [api, setApi] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [video, setVideo] = useState<VideoSel>({ kind: 'tiktok', url: PROTOTYPE_URL, tiktokId: PROTOTYPE_ID, name: L('วิดีโอต้นแบบ TikTok', 'TikTok prototype video') });
  const [fileUrl, setFileUrl] = useState('');
  const [fileErr, setFileErr] = useState('');
  const [filePlaying, setFilePlaying] = useState(false);
  const [urlInput, setUrlInput] = useState(PROTOTYPE_URL);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [lib, setLib] = useState<LibItem[]>([]);
  const [check, setCheck] = useState<string[] | null>(null);
  const [copied, setCopied] = useState('');
  const [modal, setModal] = useState<'' | 'preview' | 'confirm' | 'settings' | 'submitResult' | 'dry'>('');
  const [submitMsg, setSubmitMsg] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const fileRef = useRef<HTMLInputElement | null>(null);
  // ── สถานะการยิงจริงผ่าน TikTok Marketing API (POST /api/ads/campaigns) ──
  const lastFile = useRef<File | null>(null);   // ไฟล์ที่ผู้ใช้เลือก (อยู่ในเครื่องเท่านั้น)
  const [busy, setBusy] = useState('');
  const [real, setReal] = useState<Any | null>(null);        // ผลตอบกลับจริงจาก TikTok
  const [dry, setDry] = useState<Any | null>(null);          // payload ที่จะส่ง (dry run)
  const [created, setCreated] = useState<Any | null>(null);  // แคมเปญที่สร้างบน TikTok จริงแล้ว
  const [report, setReport] = useState<Any | null>(null);    // รายงานจริงจาก API
  const [ttData, setTtData] = useState<Any | null>(null);    // accounts / videos / regions / list
  const [areaIds, setAreaIds] = useState('');
  const [videoIdInput, setVideoIdInput] = useState('');
  // ยิงจากโพสต์ TikTok ของเจ้าของเอง (Spark Ads) — ค่าเริ่มต้น = คลิปต้นแบบ @aka989._
  const [sparkItemId, setSparkItemId] = useState(PROTOTYPE_ID);
  const [identityId, setIdentityId] = useState('');

  async function loadApi() {
    setLoading(true); setErr('');
    try {
      const r = await fetch('/api/ads/overview', { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (j?.ok) setApi(j); else setErr(String(j?.error || 'โหลดข้อมูลไม่สำเร็จ'));
    } catch { setErr(L('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — กด ↻ ลองใหม่', 'Cannot reach the server — tap ↻ retry')); }
    setLoading(false);
  }
  useEffect(() => {
    loadApi();
    setDrafts(load<Draft[]>(LS_DRAFTS, []));
    setLib(load<LibItem[]>(LS_LIB, []));
  }, []);

  const demo = api ? !api?.tiktok?.connected : true;

  function copy(text: string, key: string) {
    try { navigator.clipboard.writeText(text); } catch { /* clipboard ถูกบล็อก — ผู้ใช้เลือกคัดลอกจากกล่องข้อความได้ */ }
    setCopied(key); setTimeout(() => setCopied(''), 1800);
  }
  const cLabel = (key: string, base: string) => (copied === key ? L('คัดลอกแล้ว ✓', 'Copied ✓') : base);

  // ── กล่องวิดีโอ ────────────────────────────────────────────────────────────
  function pickFile(f: File | null | undefined) {
    setFileErr('');
    if (!f) return;
    const okType = /video\/(mp4|quicktime|x-m4v)/i.test(f.type) || /\.(mp4|mov|m4v)$/i.test(f.name);
    if (!okType) { setFileErr(L('ไฟล์ไม่ถูกต้อง — รับเฉพาะ MP4 หรือ MOV', 'Invalid file — MP4 or MOV only')); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setFileErr(L(`ไฟล์ใหญ่เกิน ${MAX_MB}MB (ได้ ${(f.size / 1048576).toFixed(1)}MB)`, `File larger than ${MAX_MB}MB (got ${(f.size / 1048576).toFixed(1)}MB)`)); return; }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const u = URL.createObjectURL(f);
    lastFile.current = f;
    setFileUrl(u);
    setVideo({ kind: 'file', url: u, name: f.name });
    setForm((s) => ({ ...s, videoTitle: s.videoTitle || f.name.replace(/\.[^.]+$/, '') }));
    setFilePlaying(false);
  }
  function importTikTok() {
    const raw = urlInput.trim();
    const m = raw.match(/tiktok\.com\/@([A-Za-z0-9._-]+)\/video\/(\d+)/i) || raw.match(/tiktok\.com\/.*video\/(\d+)/i);
    if (!m) { setFileErr(L('ลิงก์ TikTok ไม่ถูกต้อง — ต้องมี /video/<เลขคลิป>', 'Invalid TikTok link — it must contain /video/<id>')); return; }
    const id = m[m.length - 1];
    const owner = m.length === 3 ? `@${m[1]}` : '';
    if (owner && owner !== '@aka989._') {
      setFileErr(L('ลิงก์นี้ไม่ใช่บัญชีของคุณ — ต้องมีสิทธิ์หรือได้รับอนุญาตจากเจ้าของคลิปก่อนใช้เป็นโฆษณา', 'This link is not your account — you need the owner’s permission before using the clip as an ad'));
      return;
    }
    setFileErr('');
    setVideo({ kind: 'tiktok', url: `https://www.tiktok.com/${owner || '@aka989._'}/video/${m[m.length - 1]}`, tiktokId: id, name: L('ลิงก์ TikTok ที่นำเข้า', 'Imported TikTok link') });
    setForm((s) => ({ ...s, videoTitle: s.videoTitle || `TikTok ${id}` }));
  }
  function clearVideo() {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    lastFile.current = null;
    setFileUrl(''); setFilePlaying(false);
    setVideo({ kind: 'none', url: '' });
  }
  function saveToLib() {
    if (!video.url || video.kind === 'none') { setFileErr(L('ยังไม่มีวิดีโอให้บันทึก — อัปโหลดไฟล์หรือนำเข้าลิงก์ก่อน', 'No video to save — upload a file or import a link first')); return; }
    if (!form.videoTitle.trim()) { setFileErr(L('ใส่ชื่อวิดีโอก่อนบันทึกเข้าคลัง', 'Enter a video title before saving')); return; }
    const item: LibItem = { id: nowId(), title: form.videoTitle.trim(), url: video.kind === 'file' ? '(ไฟล์ในเครื่องนี้)' : video.url, tiktokId: video.tiktokId, kind: video.kind === 'file' ? 'file' : 'tiktok', addedAt: new Date().toISOString() };
    const next = [item, ...lib].slice(0, 60);
    setLib(next); save(LS_LIB, next);
    setModal(''); setTab('library');
  }

  // ── แคมเปญ ────────────────────────────────────────────────────────────────
  const issues = useMemo(() => {
    const out: string[] = [];
    if (!form.campaignName.trim()) out.push(L('ยังไม่ได้ใส่ชื่อแคมเปญ', 'Campaign name is missing'));
    if (!form.videoTitle.trim()) out.push(L('ยังไม่ได้ใส่ชื่อวิดีโอ', 'Video title is missing'));
    if (video.kind === 'none' || !video.url) out.push(L('ยังไม่ได้เลือกวิดีโอ (ลิงก์ TikTok หรืออัปโหลดไฟล์)', 'No video selected (TikTok link or uploaded file)'));
    if (!form.headline.trim()) out.push(L('ยังไม่ได้ใส่ข้อความพาดหัว', 'Headline is missing'));
    if (!form.adText.trim()) out.push(L('ยังไม่ได้ใส่ข้อความโฆษณา', 'Ad text is missing'));
    if (!/^https?:\/\//i.test(form.destinationUrl)) out.push(L('URL ปลายทางต้องขึ้นต้นด้วย http(s)://', 'Destination URL must start with http(s)://'));
    if (!/^https?:\/\//i.test(form.landingPage)) out.push(L('หน้า Landing Page ต้องขึ้นต้นด้วย http(s)://', 'Landing page must start with http(s)://'));
    const daily = Number(form.dailyBudget), total = Number(form.totalBudget);
    if (!daily || daily <= 0) out.push(L('งบประมาณต่อวันต้องมากกว่า 0', 'Daily budget must be greater than 0'));
    if (!total || total <= 0) out.push(L('งบประมาณรวมต้องมากกว่า 0', 'Total budget must be greater than 0'));
    if (daily && total && total < daily) out.push(L('งบประมาณรวมน้อยกว่างบต่อวัน', 'Total budget is lower than the daily budget'));
    if (!form.startDate || !form.endDate) out.push(L('ยังไม่ได้เลือกวันที่เริ่ม/สิ้นสุด', 'Start/end date is missing'));
    if (form.startDate && form.endDate && form.endDate < form.startDate) out.push(L('วันสิ้นสุดอยู่ก่อนวันเริ่ม', 'End date is before the start date'));
    if (!form.rights) out.push(L('ยังไม่ได้ยืนยันว่ามีสิทธิ์ใช้คลิปนี้ในโฆษณา', 'You have not confirmed you have the rights to use this clip'));
    return out;
  }, [form, video]);

  function saveDraft(status: Draft['status'] = 'draft') {
    const d: Draft = { id: nowId(), savedAt: new Date().toISOString(), status, form, video: { ...video, url: video.kind === 'file' ? '(ไฟล์ในเครื่องนี้)' : video.url } };
    const next = [d, ...drafts].slice(0, 50);
    setDrafts(next);
    const ok = save(LS_DRAFTS, next);
    setSubmitMsg(ok
      ? L('บันทึกฉบับร่างไว้ในเครื่องนี้แล้ว ✓ (ยังไม่ได้ส่งไป TikTok)', 'Draft saved on this device ✓ (nothing sent to TikTok)')
      : L('บันทึกในเครื่องไม่สำเร็จ — พื้นที่เก็บของเบราว์เซอร์เต็ม', 'Could not save locally — browser storage is full'));
    setTimeout(() => setSubmitMsg(''), 4000);
  }
  function newCampaign() {
    setForm({ ...EMPTY_FORM });
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFileUrl(''); setFileErr(''); setCheck(null);
    setVideo({ kind: 'tiktok', url: PROTOTYPE_URL, tiktokId: PROTOTYPE_ID, name: L('วิดีโอต้นแบบ TikTok', 'TikTok prototype video') });
    setUrlInput(PROTOTYPE_URL);
    setTab('create');
  }
  function toggleDraft(id: string) {
    const next = drafts.map((d) => (d.id === id ? { ...d, status: (d.status === 'paused' ? 'active' : 'paused') as Draft['status'] } : d));
    setDrafts(next); save(LS_DRAFTS, next);
  }
  function removeDraft(id: string) {
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next); save(LS_DRAFTS, next);
  }
  // ── ยิงจริงผ่าน TikTok Marketing API ────────────────────────────────────────
  const areaIdList = () => areaIds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => Number.isFinite(n));
  const adsPayload = () => ({
    payload: {
      campaignName: form.campaignName, objective: form.objective, audienceId: form.audienceId, area: form.area,
      ageRange: form.ageRange, language: form.language, dailyBudget: Number(form.dailyBudget || 0), totalBudget: Number(form.totalBudget || 0),
      startDate: form.startDate, endDate: form.endDate, landingPage: form.landingPage, leadCapture: form.leadCapture,
      videoTitle: form.videoTitle, adText: form.adText, headline: form.headline, cta: form.cta,
      destinationUrl: form.destinationUrl, videoId: videoIdInput.trim(),
      tiktokItemId: sparkItemId.trim(), identityId: identityId.trim(),
    },
    locationIds: areaIdList(),
  });
  async function callAds(body: Any, file?: File | null) {
    let init: RequestInit;
    if (file) {
      const fd = new FormData();
      fd.set('payload', JSON.stringify(body));
      fd.set('video', file);
      init = { method: 'POST', credentials: 'include', body: fd };
    } else {
      init = { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    }
    try { const r = await fetch('/api/ads/campaigns', init); return await r.json(); }
    catch (e) { return { ok: false, error: `เรียกเซิร์ฟเวอร์ไม่สำเร็จ: ${(e as Error).message}` }; }
  }
  async function callAdsGet(qs: string) {
    try { const r = await fetch(`/api/ads/campaigns?${qs}`, { credentials: 'include', cache: 'no-store' }); return await r.json(); }
    catch (e) { return { ok: false, error: `เรียกเซิร์ฟเวอร์ไม่สำเร็จ: ${(e as Error).message}` }; }
  }

  async function runDry() {
    setBusy('dry'); setModal('dry');
    const j = await callAds({ action: 'dryRun', ...adsPayload() });
    setDry(j); setBusy('');
  }
  async function submitCampaign() {
    setModal('submitResult');
    if (demo) {
      // โหมด Demo: ห้ามรายงานว่าสร้างแคมเปญจริง — บอกตามจริงว่ายังไม่ได้ส่งอะไรออกไป
      setSubmitMsg(L('ยังไม่มีการสร้างแคมเปญบน TikTok — บัญชีนี้ยังไม่ได้เชื่อมต่อ Marketing API (ไม่มี Access Token/Advertiser ID ฝั่งเซิร์ฟเวอร์) ระบบจึงไม่ส่งคำสั่งใดออกไป และไม่มีการใช้จ่ายเกิดขึ้น · ถ้าต้องการยิงจริง ต้องตั้ง env TIKTOK_ADS_ACCESS_TOKEN และ TIKTOK_ADS_ADVERTISER_ID ฝั่งเซิร์ฟเวอร์ก่อน (ดูแท็บ «ตั้งค่าการเชื่อมต่อ TikTok»)',
        'No campaign was created on TikTok — this account is not connected to the Marketing API (no server-side Access Token / Advertiser ID), so nothing was sent and no spend occurred'));
      return;
    }
    setBusy('create'); setSubmitMsg('');
    const j = await callAds({ action: 'create', confirm: true, ...adsPayload() }, video.kind === 'file' ? lastFile.current : null);
    setReal(j); setBusy('');
    if (j?.ok) { setCreated(j); setSubmitMsg(L('สร้างบน TikTok จริงแล้ว — สถานะ "หยุดไว้" ยังไม่มีการใช้จ่าย', 'Created on TikTok — status “paused”, no spend yet')); }
    else setSubmitMsg(String(j?.error || 'ไม่สำเร็จ — ดูรายละเอียดผลตอบกลับด้านล่าง'));
  }
  async function setCampaignStatus(status: 'ENABLE' | 'DISABLE') {
    if (!created?.campaignId) return;
    const ask = status === 'ENABLE'
      ? L('ยืนยันเปิดแคมเปญจริง? TikTok จะเริ่มใช้จ่ายตามงบที่ตั้งไว้ทันที', 'Confirm activating the campaign? TikTok will start spending your budget immediately')
      : L('ยืนยันหยุดแคมเปญนี้?', 'Confirm pausing this campaign?');
    if (typeof window !== 'undefined' && !window.confirm(ask)) return;
    setBusy('status');
    const j = await callAds({ action: 'status', confirm: true, campaignId: created.campaignId, status });
    setReal(j); setBusy('');
    setSubmitMsg(j?.ok ? String(j.note || '') : String(j?.error || 'ไม่สำเร็จ'));
  }
  async function loadReport() {
    if (!range.from || !range.to) { setSubmitMsg(L('เลือกช่วงวันที่ก่อนดึงรายงานจริง', 'Pick a date range before loading the report')); return; }
    setBusy('report'); setReport(null);
    const j = await callAdsGet(`action=report&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
    setReport(j); setBusy('');
  }
  async function loadTt(action: 'accounts' | 'videos' | 'list' | 'regions' | 'identities') {
    setBusy(action); setTtData(null);
    const qs = action === 'regions' ? `action=regions&keyword=${encodeURIComponent(form.area)}` : `action=${action}`;
    const j = await callAdsGet(qs);
    setTtData({ action, ...j });
    setBusy('');
  }

  function exportReport() {
    const today = new Date().toISOString().slice(0, 10);
    const rows: string[] = [];
    rows.push(`# รายงานโฆษณา TikTok — AI Insurance Ads Manager (${today})`);
    rows.push(`# สถานะการเชื่อมต่อ: ${demo ? 'Demo — ยังไม่ได้เชื่อมต่อ TikTok Marketing API' : 'เชื่อมต่อแล้ว'}`);
    rows.push('# ตัวชี้วัดของแพลตฟอร์ม (ค่าใช้จ่าย/impressions/clicks/CTR/CPL) = ไม่มีข้อมูล (ยังไม่ได้รับสิทธิ์จาก API)');
    rows.push('');
    rows.push('หมวด,รายการ,ค่า');
    rows.push(['ผู้สนใจในระบบ (Prospect)', 'รวมทั้งหมด', api?.leads?.total ?? 'ไม่มีข้อมูล'].map(csvCell).join(','));
    for (const s of STAGE) {
      const codes = s.codes;
      const n = codes.reduce((sum, c) => sum + Number(api?.leads?.byStatus?.[c] || 0), 0);
      rows.push([`สถานะผู้สนใจ: ${s.th}`, codes.join('|'), n].map(csvCell).join(','));
    }
    for (const src of (api?.leads?.sources || [])) rows.push(['แหล่งที่มา Lead', src.name, src.count].map(csvCell).join(','));
    rows.push('');
    rows.push('ฉบับร่างแคมเปญในเครื่องนี้,สถานะ,งบต่อวัน,งบรวม,วันที่เริ่ม,วันที่สิ้นสุด');
    for (const d of drafts) rows.push([d.form.campaignName || '(ไม่มีชื่อ)', d.status, d.form.dailyBudget || '-', d.form.totalBudget || '-', d.form.startDate || '-', d.form.endDate || '-'].map(csvCell).join(','));
    rows.push('');
    rows.push('ตัวชี้วัดแพลตฟอร์ม,ค่าใช้จ่าย,ไม่มีข้อมูล');
    rows.push('ตัวชี้วัดแพลตฟอร์ม,Impressions,ไม่มีข้อมูล');
    rows.push('ตัวชี้วัดแพลตฟอร์ม,Clicks,ไม่มีข้อมูล');
    rows.push('ตัวชี้วัดแพลตฟอร์ม,CTR,ไม่มีข้อมูล');
    rows.push('ตัวชี้วัดแพลตฟอร์ม,Cost per Lead,ไม่มีข้อมูล');
    if (range.from || range.to) rows.push(['ช่วงวันที่ที่เลือก', range.from || '-', range.to || '-'].map(csvCell).join(','));
    download(`ads-report-${today}.csv`, rows.join('\n'));
  }
  function exportDraftsJson() {
    download(`ads-drafts-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ drafts, savedAt: new Date().toISOString(), mode: demo ? 'demo' : 'connected' }, null, 2), 'application/json');
  }

  const previewSrc = video.kind === 'tiktok' && video.tiktokId ? EMBED(video.tiktokId) : '';
  // ตัวชี้วัดจริงจากรายงาน TikTok (มีค่าก็ต่อเมื่อดึงรายงานสำเร็จ — ไม่มี = "ไม่มีข้อมูล" ไม่แต่งตัวเลข)
  const m = useMemo(() => {
    const rows: Any[] = report?.rows || [];
    const n2 = (v: any) => Number(v || 0);
    const sum = (k: string) => rows.reduce((s, r) => s + n2(r?.metrics?.[k]), 0);
    const spend = sum('spend'), imp = sum('impressions'), clk = sum('clicks'), conv = sum('conversion');
    return { rows, has: rows.length > 0, spend, imp, clk, conv, ctr: imp ? (clk / imp) * 100 : 0, cpl: conv ? spend / conv : 0 };
  }, [report]);
  const numFmt = (n: number, unit = '') => `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}`;
  const num = (v: any) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const leadsTotal = Number(api?.leads?.total || 0);
  const applied = Number(api?.leads?.byStatus?.APPLIED || 0) + Number(api?.leads?.byStatus?.CONVERTED || 0);
  const profileRate = leadsTotal > 0 ? `${((applied / leadsTotal) * 100).toFixed(1)}%` : L('ไม่มีข้อมูล', 'No data');
  const accountLabel = api?.tiktok?.advertiserId ? `Advertiser ${api.tiktok.advertiserId}` : L('ยังไม่ได้เชื่อมต่อ', 'Not connected');
  const ttCampaignCount = Array.isArray(ttData?.campaigns) ? ttData.campaigns.length : 0;

  const TABS: { key: TabKey; icon: string; label: string }[] = [
    { key: 'overview', icon: '📊', label: L('ภาพรวมโฆษณา', 'Ad overview') },
    { key: 'create', icon: '🎬', label: L('สร้างแคมเปญ', 'Create campaign') },
    { key: 'library', icon: '🗂️', label: L('คลังวิดีโอโฆษณา', 'Video library') },
    { key: 'audience', icon: '🎯', label: L('กลุ่มเป้าหมาย', 'Audiences') },
    { key: 'leads', icon: '👤', label: L('รายชื่อ Lead', 'Leads') },
    { key: 'team', icon: '👥', label: L('ทีมงานและเครือข่าย', 'Team & network') },
    { key: 'reports', icon: '📈', label: L('รายงานผลโฆษณา', 'Ad reports') },
    { key: 'settings', icon: '🔌', label: L('ตั้งค่าการเชื่อมต่อ TikTok', 'TikTok connection') },
  ];

  const set = (patch: Partial<Form>) => setForm((s) => ({ ...s, ...patch }));

  // ── UI ชิ้นส่วนใช้ซ้ำ ───────────────────────────────────────────────────────
  const field = 'w-full text-sm rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-slate-700';
  const labelCls = 'text-[11px] font-semibold text-slate-500 uppercase tracking-wide';
  const btnP = 'text-xs px-3 py-2 rounded-full bg-navy text-white disabled:opacity-50';
  const btnS = 'text-xs px-3 py-2 rounded-full border border-[#dbeafe] bg-white text-slate-700';
  const chip = 'text-[11px] px-2.5 py-1 rounded-full';

  function Kpi({ icon, title, value, sub, tone }: { icon: string; title: string; value: string; sub: string; tone?: 'ok' | 'warn' | 'muted' }) {
    const toneCls = tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-navy';
    return (
      <div className="card p-4">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{icon}</span>
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{title}</div>
        </div>
        <div className={`mt-2 text-xl font-bold ${toneCls}`}>{value}</div>
        <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
      </div>
    );
  }

  function VideoFrame({ tall }: { tall?: boolean }) {
    const cls = tall ? 'w-full max-w-[300px]' : 'w-full max-w-[260px]';
    return (
      <div className={`${cls} aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-[#1e293b] relative`}>
        {video.kind === 'file' && fileUrl ? (
          <video
            ref={(el) => { if (el && !filePlaying) el.pause(); }}
            src={fileUrl}
            className="w-full h-full object-cover"
            controls
            playsInline
            onPlay={() => setFilePlaying(true)}
            onPause={() => setFilePlaying(false)}
          />
        ) : video.kind === 'tiktok' && previewSrc ? (
          <iframe src={previewSrc} title={video.name || 'TikTok'} className="w-full h-full" allow="encrypted-media; fullscreen; picture-in-picture" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-2 p-4 text-center">
            <span className="text-3xl">🎞️</span>
            {L('ยังไม่มีวิดีโอ — อัปโหลดไฟล์ MP4/MOV หรือนำเข้าลิงก์ TikTok', 'No video yet — upload an MP4/MOV or import a TikTok link')}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="pt-2">
      {/* ── หัวเรื่อง + ป้ายโหมด ───────────────────────────────────────────── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-navy">🎬 {L('AI Insurance Ads Manager', 'AI Insurance Ads Manager')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {L('จัดการแคมเปญโฆษณา TikTok เพื่อหาผู้สนใจสมัครเป็นตัวแทนประกันชีวิต — ใช้คู่กับช่องขยายทีมด้านบน',
                 'TikTok ad campaign manager for finding agent prospects — used alongside the growth channels above')}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <span className={`${chip} font-semibold ${demo ? 'bg-amber-50 border border-amber-300 text-amber-700' : 'bg-emerald-50 border border-emerald-300 text-emerald-700'}`}>
              {demo ? L('● โหมด Demo — ยังไม่เชื่อมต่อ TikTok Ads', '● Demo mode — TikTok Ads not connected') : L('● เชื่อมต่อ TikTok Ads แล้ว', '● TikTok Ads connected')}
            </span>
            <span className={`${chip} bg-white border border-[#dbeafe] text-slate-600`}>🏦 {accountLabel}</span>
            <button onClick={loadApi} disabled={loading} className={btnS}>{loading ? '…' : L('↻ อัปเดตข้อมูล', '↻ Refresh')}</button>
          </div>
        </div>
        {demo && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800 leading-relaxed">
            {L('หน้านี้ทำงานในโหมด Demo: ยังไม่มี Access Token ของ TikTok Marketing API ฝั่งเซิร์ฟเวอร์ ระบบจึงไม่สร้างแคมเปญและไม่ใช้จ่ายจริงทุกกรณี · ตัวเลขโฆษณาทุกตัวจะขึ้นว่า "ไม่มีข้อมูล" จนกว่าจะเชื่อมต่อสำเร็จ (ห้ามแสดงตัวเลขจำลอง) · ข้อมูลที่บันทึกได้ตอนนี้คือฉบับร่างและคลังวิดีโอของท่านเอง ซึ่งเก็บไว้ในเบราว์เซอร์เครื่องนี้',
               'This page runs in Demo mode: there is no server-side TikTok Marketing API access token, so no campaign is created and nothing is spent · every platform metric shows "No data" until a real connection exists · the only things saved now are your own drafts and video library, stored in this browser')}
          </div>
        )}
        {err && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] text-rose-700">{err}</div>}
        {submitMsg && !modal && <div className="rounded-xl bg-[#eff6ff] border border-[#dbeafe] p-3 text-[11px] text-sky-800">{submitMsg}</div>}

        {/* แท็บ */}
        <div className="flex flex-wrap gap-2 pt-1">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-xs px-3 py-2 rounded-full border ${tab === t.key ? 'bg-navy text-white border-navy' : 'bg-white border-[#dbeafe] text-slate-700 hover:bg-[#eff6ff]'}`}>
              <span className="mr-1">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        {/* ปุ่มควบคุมหลัก (สเปกข้อ 9) */}
        <div className="flex flex-wrap gap-2 border-t border-[#dbeafe] pt-3">
          <button onClick={newCampaign} className={btnP}>＋ {L('สร้างแคมเปญใหม่', 'New campaign')}</button>
          <button onClick={() => saveDraft('draft')} className={btnS}>💾 {L('บันทึกฉบับร่าง', 'Save draft')}</button>
          <button onClick={() => setModal('preview')} className={btnS}>👁 {L('ดูตัวอย่างโฆษณา', 'Preview ad')}</button>
          <button onClick={() => { setCheck(issues); setTab('create'); }} className={btnS}>✅ {L('ตรวจสอบข้อมูล', 'Validate')}</button>
          <a href={api?.tiktok?.managerUrl || MANAGER_URL} target="_blank" rel="noreferrer" className={btnS}>↗ {L('เปิด TikTok Ads Manager', 'Open TikTok Ads Manager')}</a>
          <button onClick={() => setModal('confirm')} className={btnP}>🚀 {L('ส่งแคมเปญเพื่อสร้างผ่าน API', 'Submit campaign via API')}</button>
          <button onClick={() => setTab('reports')} className={btnS}>📈 {L('ดูรายงาน', 'View report')}</button>
          <span className={`${chip} ${issues.length ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
            {issues.length ? `${L('ยังต้องแก้', 'To fix')}: ${issues.length}` : L('ข้อมูลครบถ้วน', 'All required fields done')}
          </span>
        </div>
      </div>

      {/* ── 1) ภาพรวมโฆษณา ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <>
          <div className="grid md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi icon="💸" title={L('งบโฆษณาที่ใช้ไป', 'Ad spend')} value={m.has ? numFmt(m.spend, 'THB') : L('ไม่มีข้อมูล', 'No data')} sub={m.has ? L('รวมจากรายงานจริงของ TikTok', 'Summed from the real TikTok report') : L('ต้องมีสิทธิ์อ่านรายงานจาก TikTok API', 'Requires reporting access from the TikTok API')} tone={m.has ? 'ok' : 'muted'} />
            <Kpi icon="📣" title={L('จำนวนแคมเปญ', 'Campaigns')} value={created ? num(ttCampaignCount) : String(drafts.length)} sub={created ? L('นับจากบัญชีโฆษณาจริง', 'Counted from the real ad account') : L('ฉบับร่างในเครื่องนี้ (ยังไม่ส่งไป TikTok)', 'Drafts on this device (not sent to TikTok)')} />
            <Kpi icon="👤" title={L('จำนวนผู้สนใจ (Lead)', 'Leads')} value={num(api?.leads?.total)} sub={L('นับจากผู้สนใจในระบบจริง (Prospect)', 'Counted from real Prospect records')} tone="ok" />
            <Kpi icon="🧮" title={L('ต้นทุนต่อ Lead', 'Cost per lead')} value={m.has ? numFmt(m.cpl, 'THB') : L('ไม่มีข้อมูล', 'No data')} sub={m.has ? L('ค่าใช้จ่ายจริง ÷ conversions จาก API', 'Real spend ÷ conversions from the API') : L('ต้องมีค่าใช้จ่ายจริงจาก API', 'Needs real spend data from the API')} tone={m.has ? 'ok' : 'muted'} />
            <Kpi icon="🎓" title={L('อัตราการเปลี่ยนเป็นผู้สมัคร', 'Application rate')} value={profileRate} sub={L('คำนวณจากสถานะในระบบ ไม่ใช่จากโฆษณา', 'Computed from system statuses, not from ads')} tone="ok" />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="card p-4 space-y-2">
              <h3 className="font-semibold text-sm text-navy">{L('สถานะผู้สนใจในระบบ', 'Pipeline in the system')}</h3>
              <div className="space-y-1.5">
                {STAGE.map((s) => {
                  const n = s.codes.reduce((sum, c) => sum + Number(api?.leads?.byStatus?.[c] || 0), 0);
                  const pct = leadsTotal > 0 ? Math.round((n / leadsTotal) * 100) : 0;
                  return (
                    <div key={s.key}>
                      <div className="flex justify-between text-[11px] text-slate-600"><span>{L(s.th, s.en)}</span><span>{n}</span></div>
                      <div className="h-1.5 rounded-full bg-white border border-[#dbeafe] overflow-hidden">
                        <div className="h-full bg-[#1e3a8a]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[11px] text-slate-500">{L('ตัวเลขนี้มาจากฐานข้อมูลของผู้สนใจจริงในระบบ — ไม่ใช่ผลจากโฆษณา', 'These numbers come from real prospect records, not from ad results')}</div>
            </div>
            <div className="card p-4 space-y-2">
              <h3 className="font-semibold text-sm text-navy">{L('ฉบับร่างแคมเปญล่าสุด', 'Latest campaign drafts')}</h3>
              {!drafts.length && <div className="text-xs text-slate-500">{L('ยังไม่มีฉบับร่าง — ไปที่ «สร้างแคมเปญ» เพื่อเริ่ม', 'No drafts yet — open “Create campaign” to start')}</div>}
              <div className="space-y-2">
                {drafts.slice(0, 4).map((d) => (
                  <div key={d.id} className="rounded-xl bg-white border border-[#dbeafe] p-2.5 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-navy truncate">{d.form.campaignName || L('(ไม่มีชื่อ)', '(untitled)')}</span>
                      <span className={`${chip} ${d.status === 'paused' ? 'bg-amber-50 text-amber-700' : 'bg-[#eff6ff] text-sky-700'}`}>{d.status === 'paused' ? L('หยุดไว้', 'Paused') : L('ฉบับร่าง', 'Draft')}</span>
                    </div>
                    <div className="text-slate-500 mt-0.5">{L('งบ/วัน', 'Daily')} {d.form.dailyBudget || '-'} · {d.form.startDate || '-'} → {d.form.endDate || '-'}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                <button onClick={() => setTab('create')} className={btnS}>{L('ไปหน้าสร้างแคมเปญ', 'Go to create campaign')}</button>
                <button onClick={exportDraftsJson} className={btnS} disabled={!drafts.length}>{L('ดาวน์โหลดฉบับร่าง (JSON)', 'Download drafts (JSON)')}</button>
              </div>
            </div>
          </div>

          <div className="card p-4 space-y-2">
            <h3 className="font-semibold text-sm text-navy">{L('ขั้นตอนเชื่อมต่อที่ต้องทำต่อ', 'Next steps to connect')}</h3>
            <ol className="grid md:grid-cols-2 gap-2 text-xs text-slate-600">
              {[
                L('ขอสิทธิ์แอป TikTok Marketing API และยืนยันตัวตน advertiser', 'Apply for Marketing API access and verify the advertiser'),
                L('ตั้งค่า env ฝั่งเซิร์ฟเวอร์: Access Token + Advertiser ID (ห้ามใส่ในโค้ดหน้าเว็บ)', 'Set server-side env: Access Token + Advertiser ID (never in frontend code)'),
                L('ตรวจสอบ Advertiser ID และรายการแคมเปญที่บัญชีอนุญาต', 'Verify the Advertiser ID and the campaigns the account may access'),
                L('อัปโหลด/เลือกครีเอทีฟที่มีสิทธิ์ แล้วสร้าง Campaign → Ad Group → Video Ad', 'Upload/select licensed creative, then create Campaign → Ad Group → Video Ad'),
                L('ตรวจสอบข้อมูลทั้งหมดก่อนเผยแพร่ และอ่านรายงานเมื่อได้รับสิทธิ์', 'Review everything before publishing, and read reports once permitted'),
                L('บันทึกผู้สนใจจากโฆษณาเข้าไปป์ไลน์ผู้มุ่งหวังในระบบ (กันซ้ำ + คุมสิทธิ์ PDPA)', 'Feed ad leads into the prospect pipeline (dedupe + PDPA access control)'),
              ].map((t, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-white border border-[#dbeafe] p-2.5">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[#eff6ff] text-sky-700 text-[10px] font-bold flex items-center justify-center mt-[1px]">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
            <div className="flex gap-2 flex-wrap pt-1">
              <button onClick={() => setTab('settings')} className={btnS}>{L('ไปหน้าตั้งค่าการเชื่อมต่อ', 'Open connection settings')}</button>
              <a href="https://business-api.tiktok.com/portal/docs" target="_blank" rel="noreferrer" className={btnS}>{L('เอกสาร Marketing API', 'Marketing API docs')}</a>
            </div>
          </div>
        </>
      )}

      {/* ── 2) สร้างแคมเปญ (กล่องวิดีโอ = องค์ประกอบหลัก) ─────────────────── */}
      {tab === 'create' && (
        <>
          <div className="card p-5 space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm text-navy">{L('กล่องวิดีโอยิงโฆษณา', 'Ad video box')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{L('อัปโหลดไฟล์ MP4/MOV หรือวางลิงก์ TikTok ของคุณเองที่ได้รับอนุญาต · ตัวอย่างแนวตั้ง 9:16', 'Upload an MP4/MOV or paste your own licensed TikTok link · vertical 9:16 preview')}</p>
              </div>
              <span className={`ml-auto ${chip} bg-[#eff6ff] border border-[#dbeafe] text-sky-700`}>{video.kind === 'file' ? L('ไฟล์ในเครื่อง', 'Local file') : video.kind === 'tiktok' ? L('ลิงก์ TikTok', 'TikTok link') : L('ยังไม่มีวิดีโอ', 'No video')}</span>
            </div>

            <div className="grid lg:grid-cols-[auto_1fr] gap-5 items-start">
              <div className="space-y-2">
                <VideoFrame />
                <div className="flex gap-2 justify-center flex-wrap">
                  <button onClick={() => { if (video.kind === 'file' && fileUrl) { const v = document.querySelector<HTMLVideoElement>('video[src="' + fileUrl + '"]'); if (v) { filePlaying ? v.pause() : v.play().catch(() => setFileErr(L('เล่นวิดีโอไม่ได้ในเบราว์เซอร์นี้', 'This browser cannot play the file'))); } } else { setModal('preview'); } }} className={btnS}>
                    {filePlaying ? `⏸ ${L('หยุด', 'Pause')}` : `▶ ${L('เล่น', 'Play')}`}
                  </button>
                  <button onClick={() => setModal('preview')} className={btnS}>🔍 {L('ดูตัวอย่าง', 'Preview')}</button>
                  <button onClick={() => fileRef.current?.click()} className={btnS}>🔁 {L('เปลี่ยนวิดีโอ', 'Replace')}</button>
                  <button onClick={clearVideo} className={btnS}>🗑 {L('ลบวิดีโอ', 'Delete')}</button>
                </div>
              </div>

              <div className="space-y-3 min-w-0">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className={labelCls}>{L('อัปโหลดไฟล์วิดีโอ (MP4/MOV)', 'Upload video file (MP4/MOV)')}</div>
                    <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden"
                      onChange={(e) => pickFile(e.target.files?.[0])} />
                    <button onClick={() => fileRef.current?.click()} className={`${btnP} mt-1 w-full`}>⬆ {L('เลือกไฟล์จากเครื่อง', 'Choose a file')}</button>
                    <div className="text-[11px] text-slate-500 mt-1">{L(`สูงสุด ${MAX_MB}MB · ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ (เก็บในเครื่องเท่านั้น)`, `Max ${MAX_MB}MB · the file is not uploaded to the server (local only)`)}</div>
                  </div>
                  <div>
                    <div className={labelCls}>{L('ลิงก์วิดีโอ TikTok', 'TikTok video URL')}</div>
                    <input className={`${field} mt-1`} value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder={PROTOTYPE_URL} />
                    <button onClick={importTikTok} className={`${btnS} mt-1 w-full`}>⬇ {L('นำเข้าวิดีโอที่ได้รับอนุญาต', 'Import licensed video')}</button>
                    <div className="text-[11px] text-slate-500 mt-1">{L('วางลิงก์ = ยังไม่ได้นำไฟล์เข้าระบบ (ระบบไม่ดาวน์โหลดวิดีโอผู้อื่น)', 'Pasting a link does NOT import a file (the system does not download others’ videos)')}</div>
                  </div>
                </div>

                <label className="flex items-start gap-2 rounded-xl bg-white border border-[#dbeafe] p-3 text-[11px] text-slate-700">
                  <input type="checkbox" checked={form.rights} onChange={(e) => set({ rights: e.target.checked })} className="mt-0.5" />
                  <span>{L('ข้าพเจ้ายืนยันว่ามีสิทธิ์หรือได้รับอนุญาตให้ใช้คลิปนี้ในโฆษณา และข้อความโฆษณาไม่มีคำรับประกันรายได้หรือผลตอบแทนที่ไม่มีหลักฐาน', 'I confirm I own or am licensed to use this clip in ads, and the ad copy makes no unsubstantiated income or return promises')}</span>
                </label>

                {fileErr && <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-[11px] text-rose-700">{fileErr}</div>}

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <div className={labelCls}>{L('ชื่อวิดีโอ', 'Video title')}</div>
                    <input className={`${field} mt-1`} value={form.videoTitle} onChange={(e) => set({ videoTitle: e.target.value })} placeholder={L('เช่น คลิปเล่าเส้นทางตัวแทน', 'e.g. agent-path story clip')} />
                  </div>
                  <div>
                    <div className={labelCls}>{L('ข้อความพาดหัว', 'Headline')}</div>
                    <input className={`${field} mt-1`} value={form.headline} onChange={(e) => set({ headline: e.target.value })} maxLength={40} />
                  </div>
                </div>
                <div>
                  <div className={labelCls}>{L('ข้อความโฆษณา', 'Ad text')}</div>
                  <textarea className={`${field} mt-1`} rows={3} value={form.adText} onChange={(e) => set({ adText: e.target.value })} maxLength={300} />
                  <div className="text-[11px] text-slate-500 mt-1">{form.adText.length}/300 · {L('ห้ามกล่าวอ้างรายได้ — ปรับข้อความให้ตรงกับความเป็นจริงก่อนเผยแพร่', 'Never promise income — keep the copy factual before publishing')}</div>
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <div className={labelCls}>{L('Call to Action', 'Call to action')}</div>
                    <select className={`${field} mt-1`} value={form.cta} onChange={(e) => set({ cta: e.target.value })}>
                      {['LEARN_MORE', 'SIGN_UP', 'CONTACT_US', 'APPLY_NOW', 'MESSAGE'].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <div className={labelCls}>{L('URL ปลายทาง', 'Destination URL')}</div>
                    <input className={`${field} mt-1`} value={form.destinationUrl} onChange={(e) => set({ destinationUrl: e.target.value })} />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={saveToLib} className={btnP}>🗂️ {L('บันทึกวิดีโอเข้าคลัง', 'Save video to library')}</button>
                  <button onClick={() => setModal('preview')} className={btnS}>👁 {L('ดูตัวอย่างโฆษณา', 'Preview ad')}</button>
                </div>
              </div>
            </div>
          </div>

          {/* ฟอร์มแคมเปญ */}
          <div className="card p-5 space-y-3">
            <div>
              <h3 className="font-semibold text-sm text-navy">{L('แบบฟอร์มสร้างแคมเปญ', 'Campaign form')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{L('เลือกเฉพาะวัตถุประสงค์ที่เหมาะกับการหาผู้สนใจ — ตัวเลือกที่ใช้ได้จริงขึ้นกับสิทธิ์ของบัญชีโฆษณา', 'Only objectives suited to lead generation — what is actually available depends on the ad account’s permissions')}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className={labelCls}>{L('ชื่อแคมเปญ', 'Campaign name')}</div>
                <input className={`${field} mt-1`} value={form.campaignName} onChange={(e) => set({ campaignName: e.target.value })} placeholder={L('เช่น หาตัวแทน พื้นที่กรุงเทพ — ต.ค.', 'e.g. Agent recruiting Bangkok — Oct')} />
              </div>
              <div>
                <div className={labelCls}>{L('วัตถุประสงค์โฆษณา', 'Objective')}</div>
                <select className={`${field} mt-1`} value={form.objective} onChange={(e) => set({ objective: e.target.value })}>
                  <option value="TRAFFIC">{L('Traffic (พาคนกดลิงก์เข้ามาดูเว็บ)', 'Traffic (send people to the link)')}</option>
                  <option value="LEAD_GENERATION">{L('Lead Generation (เก็บผู้สนใจ)', 'Lead generation')}</option>
                  <option value="WEBSITE_CONVERSIONS">{L('Website Conversions (กรอกฟอร์มในเว็บ)', 'Website conversions')}</option>
                </select>
              </div>
              <div>
                <div className={labelCls}>{L('กลุ่มเป้าหมาย', 'Audience')}</div>
                <select className={`${field} mt-1`} value={form.audienceId} onChange={(e) => set({ audienceId: e.target.value })}>
                  {AUDIENCES.map((a) => <option key={a.id} value={a.id}>{L(a.th, a.en)}</option>)}
                </select>
              </div>
              <div>
                <div className={labelCls}>{L('พื้นที่โฆษณา', 'Area')}</div>
                <input className={`${field} mt-1`} value={form.area} onChange={(e) => set({ area: e.target.value })} placeholder={L('ทั่วประเทศ / จังหวัด', 'Thailand / province')} />
              </div>
              <div>
                <div className={labelCls}>{L('ช่วงอายุ (แพลตฟอร์มกำหนดขั้นต่ำ 18)', 'Age range (platform minimum 18)')}</div>
                <select className={`${field} mt-1`} value={form.ageRange} onChange={(e) => set({ ageRange: e.target.value })}>
                  {['18-24', '25-34', '25-44', '35-54', '45-64'].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div className={labelCls}>{L('ภาษา', 'Language')}</div>
                <select className={`${field} mt-1`} value={form.language} onChange={(e) => set({ language: e.target.value })}>
                  <option value="th">ไทย</option>
                  <option value="th,en">ไทย + อังกฤษ</option>
                </select>
              </div>
              <div>
                <div className={labelCls}>{L('งบประมาณต่อวัน (บาท)', 'Daily budget (THB)')}</div>
                <input type="number" min={1} className={`${field} mt-1`} value={form.dailyBudget} onChange={(e) => set({ dailyBudget: e.target.value })} />
              </div>
              <div>
                <div className={labelCls}>{L('งบประมาณรวม (บาท)', 'Total budget (THB)')}</div>
                <input type="number" min={1} className={`${field} mt-1`} value={form.totalBudget} onChange={(e) => set({ totalBudget: e.target.value })} />
              </div>
              <div>
                <div className={labelCls}>{L('วันที่เริ่ม', 'Start date')}</div>
                <input type="date" className={`${field} mt-1`} value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              </div>
              <div>
                <div className={labelCls}>{L('วันที่สิ้นสุด', 'End date')}</div>
                <input type="date" className={`${field} mt-1`} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
              </div>
              <div>
                <div className={labelCls}>{L('หน้า Landing Page', 'Landing page')}</div>
                <input className={`${field} mt-1`} value={form.landingPage} onChange={(e) => set({ landingPage: e.target.value })} />
              </div>
              <div>
                <div className={labelCls}>{L('วิธีเก็บข้อมูล Lead', 'Lead capture')}</div>
                <select className={`${field} mt-1`} value={form.leadCapture} onChange={(e) => set({ leadCapture: e.target.value })}>
                  <option value="form">{L('ฟอร์มในระบบ (ลิงก์รับสมัคร)', 'In-system form (recruitment link)')}</option>
                  <option value="message">{L('ข้อความ/LINE ทักเข้ามา', 'Message / LINE inbound')}</option>
                  <option value="phone">{L('เบอร์โทรติดต่อกลับ', 'Phone callback')}</option>
                  <option value="qr">{L('QR ในคลิป → หน้าสมัคร', 'QR in clip → apply page')}</option>
                </select>
              </div>
            </div>

            {/* ── ค่าที่ TikTok ต้องใช้จริง (ห้ามเดา): รหัสพื้นที่ + video_id ในบัญชีโฆษณา ── */}
            <div className="grid md:grid-cols-2 gap-3 rounded-xl bg-white border border-[#dbeafe] p-3">
              <div>
                <div className={labelCls}>{L('รหัสพื้นที่โฆษณา (location_ids)', 'Ad location IDs (location_ids)')}</div>
                <input className={`${field} mt-1`} value={areaIds} onChange={(e) => setAreaIds(e.target.value)} placeholder="เช่น 2764, 2765" />
                <div className="text-[11px] text-slate-500 mt-1">{L('คั่นด้วยจุลภาค · ห้ามเดาเอง — กดปุ่มด้านขวาเพื่อดึงรายการจริงจากบัญชีโฆษณา', 'Comma separated · never guess — use the button to pull the real list from the ad account')}</div>
                <button onClick={() => loadTt('regions')} disabled={busy === 'regions'} className={`${btnS} mt-1`}>{busy === 'regions' ? '…' : `🔎 ${L('ค้นหารหัสพื้นที่จาก TikTok', 'Look up location IDs from TikTok')}`}</button>
              </div>
              <div>
                <div className={labelCls}>{L('video_id ในบัญชีโฆษณา', 'video_id in the ad account')}</div>
                <input className={`${field} mt-1`} value={videoIdInput} onChange={(e) => setVideoIdInput(e.target.value)} placeholder={L('เว้นว่างได้ถ้าจะอัปโหลดไฟล์ตอนยิงแคมเปญ', 'Leave empty if the file is uploaded at launch time')} />
                <div className="text-[11px] text-slate-500 mt-1">{L('ลิงก์ TikTok ไม่เท่ากับ video_id ในบัญชีโฆษณา — ต้องมีคลิปในบัญชีจริง', 'A TikTok link is not an ad-account video_id — the clip must exist in the ad account')}</div>
                <button onClick={() => loadTt('videos')} disabled={busy === 'videos'} className={`${btnS} mt-1`}>{busy === 'videos' ? '…' : `🗂️ ${L('ดึงคลังวิดีโอของบัญชีโฆษณา', 'Load the ad account video library')}`}</button>
              </div>
            </div>

            {/* ── ยิงจากโพสต์ TikTok ของตัวเอง (Spark Ads) → พาคนดูกดลิงก์เข้ามาที่เว็บ ── */}
            <div className="grid md:grid-cols-2 gap-3 rounded-xl bg-white border border-[#dbeafe] p-3">
              <div>
                <div className={labelCls}>{L('โพสต์ TikTok ที่จะยิง (tiktok item id)', 'TikTok post to promote (item id)')}</div>
                <input className={`${field} mt-1`} value={sparkItemId} onChange={(e) => setSparkItemId(e.target.value)} placeholder={PROTOTYPE_ID} />
                <div className="text-[11px] text-slate-500 mt-1">{L('ค่าเริ่มต้น = คลิปต้นแบบของคุณ (@aka989._) · ต้องเป็นคลิปในบัญชี TikTok ของท่านเองเท่านั้น', 'Default = your prototype clip (@aka989._) · must be a clip in your own TikTok account')}</div>
              </div>
              <div>
                <div className={labelCls}>{L('identity_id ของบัญชี TikTok ที่อนุญาต', 'identity_id of the authorized TikTok account')}</div>
                <input className={`${field} mt-1`} value={identityId} onChange={(e) => setIdentityId(e.target.value)} placeholder={L('ดึงจากปุ่มด้านล่าง', 'Load it with the button below')} />
                <button onClick={() => { setSparkItemId(sparkItemId || PROTOTYPE_ID); loadTt('identities'); }} disabled={busy === 'identities'} className={`${btnS} mt-1`}>{busy === 'identities' ? '…' : `🪪 ${L('ดึง identity ของบัญชี', 'Load account identities')}`}</button>
              </div>
            </div>
            {ttData && (
              <div className="rounded-xl bg-white border border-[#dbeafe] p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{L('ผลตอบกลับจาก TikTok', 'TikTok response')} · {String(ttData.action)}</span>
                  <span className={`${chip} ${ttData.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>{ttData.ok ? L('สำเร็จ', 'OK') : L('ไม่สำเร็จ', 'Failed')}</span>
                  <button onClick={() => setTtData(null)} className={`ml-auto ${btnS}`}>✕</button>
                </div>
                {!ttData.ok && <div className="text-[11px] text-rose-700 mt-1">{String(ttData.error || '')}{ttData.missing?.length ? ` (${ttData.missing.join(', ')})` : ''}</div>}
                <pre className="whitespace-pre-wrap text-[11px] font-mono mt-2 max-h-52 overflow-y-auto m-0">{JSON.stringify(ttData.identities || ttData.videos || ttData.regions || ttData.campaigns || ttData.accounts || ttData, null, 1).slice(0, 4000)}</pre>
                {Array.isArray(ttData.identities) && ttData.identities.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {ttData.identities.slice(0, 6).map((idn: Any, i: number) => (
                      <button key={i} onClick={() => setIdentityId(String(idn.identity_id || idn.id || ''))} className={btnS}>
                        {L('ใช้ identity', 'Use identity')} {String(idn.display_name || idn.identity_id || '')}
                      </button>
                    ))}
                  </div>
                )}
                {Array.isArray(ttData.videos) && ttData.videos.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {ttData.videos.slice(0, 8).map((v: Any, i: number) => (
                      <button key={i} onClick={() => setVideoIdInput(String(v.video_id || ''))} className={btnS}>
                        {L('ใช้ video_id', 'Use video_id')} {String(v.video_id || '')}
                      </button>
                    ))}
                  </div>
                )}
                {Array.isArray(ttData.regions) && ttData.regions.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2">
                    {ttData.regions.slice(0, 10).map((rg: Any, i: number) => (
                      <button key={i} onClick={() => setAreaIds(String(rg.location_id || rg.region_id || rg.id || ''))} className={btnS}>
                        {String(rg.name || rg.region_name || rg.location_name || '')} ({String(rg.location_id || rg.region_id || rg.id || '')})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {check && (
              <div className={`rounded-xl p-3 text-[11px] space-y-1 ${check.length ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
                <div className="font-semibold">{check.length ? L('ต้องแก้ก่อนส่งแคมเปญ', 'Fix these before submitting') : L('ตรวจสอบแล้ว — ข้อมูลครบตามที่ระบบต้องการ', 'Validated — all required fields are complete')}</div>
                {check.map((c, i) => <div key={i}>• {c}</div>)}
              </div>
            )}
            <div className="flex gap-2 flex-wrap border-t border-[#dbeafe] pt-3">
              <button onClick={() => setCheck(issues)} className={btnS}>✅ {L('ตรวจสอบข้อมูล', 'Validate')}</button>
              <button onClick={() => setModal('preview')} className={btnS}>👁 {L('ดูตัวอย่างโฆษณา', 'Preview ad')}</button>
              <button onClick={() => saveDraft('draft')} className={btnS}>💾 {L('บันทึกฉบับร่าง', 'Save draft')}</button>
              <button onClick={() => setModal('confirm')} className={btnP}>🚀 {L('ส่งแคมเปญเพื่อสร้างผ่าน API', 'Submit campaign via API')}</button>
              <a href={api?.tiktok?.managerUrl || MANAGER_URL} target="_blank" rel="noreferrer" className={btnS}>↗ {L('เปิด TikTok Ads Manager', 'Open TikTok Ads Manager')}</a>
            </div>
          </div>
        </>
      )}

      {/* ── 3) คลังวิดีโอโฆษณา ──────────────────────────────────────────────── */}
      {tab === 'library' && (
        <>
          <div className="card p-5 space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm text-navy">{L('คลังวิดีโอของระบบ (ข้อมูลจริง)', 'System video library (real data)')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{L('ดึงจากตาราง Video ของระบบ — เลือกใช้เป็นครีเอทีฟได้เฉพาะคลิปที่คุณมีสิทธิ์', 'Read from the system’s Video table — use only clips you are licensed to use')}</p>
              </div>
              <span className={`ml-auto ${chip} bg-white border border-[#dbeafe] text-slate-600`}>{L('ทั้งหมด', 'Total')}: {num(api?.videoTotal)}</span>
            </div>
            {loading && <div className="text-xs text-slate-400">…</div>}
            {!loading && !(api?.videos || []).length && <div className="text-xs text-slate-500">{L('ยังไม่มีวิดีโอในคลังระบบ', 'No videos in the system library yet')}</div>}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(api?.videos || []).map((v: Any) => (
                <div key={v.videoId} className="rounded-xl bg-white border border-[#dbeafe] p-3 space-y-2">
                  <div className="flex justify-between gap-2">
                    <span className="text-xs font-semibold text-navy truncate">{v.title || v.videoId}</span>
                    <span className={`${chip} ${v.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{v.status}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 break-all">{v.url}</div>
                  <div className="text-[11px] text-slate-500">{v.topic || '—'} · {v.durationSec ? `${v.durationSec}s` : '—'} · 👁 {v.viewCount ?? 0}</div>
                  <div className="flex gap-2 flex-wrap">
                    {v.embedUrl && <a href={v.embedUrl} target="_blank" rel="noreferrer" className={btnS}>{L('ดูตัวอย่าง', 'Preview')}</a>}
                    <button onClick={() => { setVideo({ kind: v.tiktokId ? 'tiktok' : 'file', url: v.url, tiktokId: v.tiktokId || undefined, name: v.title }); setForm((s) => ({ ...s, videoTitle: s.videoTitle || v.title || '' })); setTab('create'); }} className={btnS}>
                      {L('ใช้เป็นครีเอทีฟ', 'Use as creative')}
                    </button>
                    <button onClick={() => copy(v.url, v.videoId)} className={btnS}>{cLabel(v.videoId, L('คัดลอกลิงก์', 'Copy link'))}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-navy">{L('วิดีโอที่ฉันบันทึกไว้ (ในเครื่องนี้)', 'My saved videos (on this device)')}</h3>
            {!lib.length && <div className="text-xs text-slate-500">{L('ยังไม่มี — บันทึกจากกล่องวิดีโอในหน้าสร้างแคมเปญ', 'None yet — save from the video box on the create page')}</div>}
            <div className="space-y-2">
              {lib.map((v) => (
                <div key={v.id} className="rounded-xl bg-white border border-[#dbeafe] p-3 flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-navy truncate max-w-[240px]">{v.title}</span>
                  <span className={`${chip} bg-[#eff6ff] text-sky-700`}>{v.kind === 'file' ? L('ไฟล์ในเครื่อง', 'Local file') : 'TikTok'}</span>
                  <span className="text-[11px] text-slate-500 truncate max-w-[280px]">{v.url}</span>
                  <span className="text-[11px] text-slate-400 ml-auto">{new Date(v.addedAt).toLocaleDateString()}</span>
                  <button onClick={() => { const n = lib.filter((x) => x.id !== v.id); setLib(n); save(LS_LIB, n); }} className={btnS}>🗑 {L('ลบ', 'Remove')}</button>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-slate-500">{L('รายการกลุ่มนี้เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น · การลบวิดีโอออกจากคลังระบบต้องทำโดยผู้ดูแลระบบที่หน้า /admin', 'This list lives only in this browser · removing a video from the system library is an admin action on /admin')}</div>
          </div>
        </>
      )}

      {/* ── 4) กลุ่มเป้าหมาย ───────────────────────────────────────────────── */}
      {tab === 'audience' && (
        <>
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-navy">{L('กลุ่มเป้าหมายสำหรับธุรกิจประกันชีวิต', 'Audiences for life-insurance recruiting')}</h3>
            <div className="grid md:grid-cols-2 gap-3">
              {AUDIENCES.map((a) => (
                <div key={a.id} className={`rounded-xl border p-3 space-y-2 ${form.audienceId === a.id ? 'border-navy bg-[#eff6ff]' : 'border-[#dbeafe] bg-white'}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-navy">{L(a.th, a.en)}</div>
                      <div className="text-[11px] text-slate-500">{a.detail}</div>
                    </div>
                    <button onClick={() => set({ audienceId: a.id })} className={`ml-auto ${btnS}`}>{form.audienceId === a.id ? L('เลือกอยู่', 'Selected') : L('เลือก', 'Select')}</button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {a.interests.map((i) => <span key={i} className={`${chip} bg-[#eff6ff] border border-[#dbeafe] text-sky-700`}>{i}</span>)}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
              {L('ข้อกำหนด: ห้ามกำหนดเป้าหมายแบบเลือกปฏิบัติ ห้ามใช้ข้อมูลอ่อนไหว (ศาสนา สุขภาพ ฐานะการเงิน) ห้ามกำหนดอายุต่ำกว่าเกณฑ์ของแพลตฟอร์ม และห้ามรับประกันรายได้หรือผลตอบแทนในข้อความโฆษณา',
                 'Rules: no discriminatory targeting, no sensitive attributes (religion, health, financial status), no age below the platform minimum, and no income or return guarantees in ad copy')}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-navy">{L('ข้อความโฆษณาแนะนำ (พร้อมใช้)', 'Suggested ad copy')}</h3>
            <div className="rounded-xl bg-white border border-[#dbeafe] p-3">
              <pre className="whitespace-pre-wrap text-xs text-slate-700 font-sans m-0">{AUDIENCE_COPY}</pre>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => copy(AUDIENCE_COPY, 'copy-ads')} className={btnS}>{cLabel('copy-ads', L('คัดลอกข้อความ', 'Copy text'))}</button>
              <button onClick={() => { set({ adText: AUDIENCE_COPY }); setTab('create'); }} className={btnP}>{L('ใช้ข้อความนี้ในแคมเปญ', 'Use in campaign')}</button>
            </div>
            <div className="text-[11px] text-slate-500">{L('ตรวจสอบนโยบายโฆษณาและข้อกำหนดทางกฎหมายที่เกี่ยวข้องก่อนเผยแพร่ทุกครั้ง', 'Always review ad policies and applicable legal requirements before publishing')}</div>
          </div>
        </>
      )}

      {/* ── 5) รายชื่อ Lead ────────────────────────────────────────────────── */}
      {tab === 'leads' && (
        <>
          <div className="card p-5 space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm text-navy">{L('สถานะผู้สนใจในไปป์ไลน์', 'Pipeline stages')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{L('ข้อมูลจริงจากระบบผู้มุ่งหวัง — เก็บเท่าที่จำเป็นตาม PDPA และจำกัดสิทธิ์การเข้าถึง', 'Real data from the prospect system — minimum necessary under PDPA, access-controlled')}</p>
              </div>
              <a href="/prospects" className={`ml-auto ${btnS}`}>{L('เปิดระบบผู้มุ่งหวังเต็ม', 'Open full prospect system')}</a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
              {STAGE.map((s) => {
                const n = s.codes.reduce((sum, c) => sum + Number(api?.leads?.byStatus?.[c] || 0), 0);
                return (
                  <div key={s.key} className="rounded-xl bg-white border border-[#dbeafe] p-3">
                    <div className="text-[11px] text-slate-500">{L(s.th, s.en)}</div>
                    <div className="text-lg font-bold text-navy">{n}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-navy">{L('ผู้สนใจล่าสุด (ชื่อย่อตาม PDPA)', 'Latest leads (name abbreviated for PDPA)')}</h3>
            {loading && <div className="text-xs text-slate-400">…</div>}
            {!loading && !(api?.leads?.recent || []).length && <div className="text-xs text-slate-500">{L('ยังไม่มีผู้สนใจในระบบ', 'No leads in the system yet')}</div>}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-[#dbeafe]">
                    <th className="py-1.5 pr-3">{L('ผู้ติดต่อ', 'Contact')}</th>
                    <th className="py-1.5 pr-3">{L('สถานะ', 'Status')}</th>
                    <th className="py-1.5 pr-3">{L('แหล่งที่มา', 'Source')}</th>
                    <th className="py-1.5 pr-3">{L('จังหวัด', 'Province')}</th>
                    <th className="py-1.5">{L('วันที่เข้าระบบ', 'Added')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(api?.leads?.recent || []).map((p: Any, i: number) => {
                    const st = stageOf(String(p.status));
                    return (
                      <tr key={i} className="border-b border-[#eff6ff]">
                        <td className="py-1.5 pr-3 font-semibold text-navy">{p.name || '—'}</td>
                        <td className="py-1.5 pr-3">{st ? L(st.th, st.en) : p.status}</td>
                        <td className="py-1.5 pr-3 text-slate-600">{p.source}</td>
                        <td className="py-1.5 pr-3 text-slate-600">{p.province || '—'}</td>
                        <td className="py-1.5 text-slate-500">{p.createdAt ? new Date(p.createdAt).toLocaleDateString('th-TH') : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-slate-500">
              {L('Lead จากโฆษณาจะถูกบันทึกอัตโนมัติเมื่อเชื่อมต่อ API ปลายทาง (กันสร้างสมาชิกซ้ำ) — ตอนนี้ให้บันทึกผ่านระบบผู้มุ่งหวัง หรือลิงก์รับสมัครของคุณในหน้าด้านบน',
                 'Ad leads will be captured automatically once the endpoint is connected (deduplicated) — for now record them through the prospect system or your recruitment link above')}
            </div>
            <div className="flex gap-2 flex-wrap">
              <a href="/prospects" className={btnP}>{L('บันทึก/ติดตามผู้สนใจ', 'Record / follow up leads')}</a>
              <a href="/recruit" className={btnS}>{L('เปิดลิงก์รับสมัคร', 'Open recruitment link')}</a>
            </div>
          </div>
        </>
      )}

      {/* ── 6) ทีมงานและเครือข่าย ──────────────────────────────────────────── */}
      {tab === 'team' && (
        <>
          <div className="grid md:grid-cols-3 xl:grid-cols-5 gap-3">
            <Kpi icon="👥" title={L('สมาชิกที่ฉันแนะนำ', 'Members I sponsored')} value={num(api?.team?.directMembers)} sub={L('จากฐานข้อมูลสมาชิกจริง', 'From real member records')} tone="ok" />
            <Kpi icon="🌳" title={L('ลูกในผัง 1 แตก 5', 'Placement children')} value={num(api?.team?.placementChildren)} sub={L('ตำแหน่งในผัง 1 แตก 5', 'Position in the 1×5 tree')} tone="ok" />
            <Kpi icon="👤" title={L('ผู้สนใจในความดูแล', 'Prospects I own')} value={num(api?.team?.myProspects)} sub={L('Prospect ที่ ownerId = ฉัน', 'Prospects with ownerId = me')} tone="ok" />
            <Kpi icon="🧾" title={L('ผู้สนใจทั้งระบบ', 'Prospects overall')} value={num(api?.team?.totalProspects)} sub={L('ทุกทีมในระบบ', 'Across all teams')} />
            <Kpi icon="🏢" title={L('สมาชิกทั้งระบบ', 'Members overall')} value={num(api?.team?.totalMembers)} sub={L('ทุกทีมในระบบ', 'Across all teams')} />
          </div>
          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-navy">{L('เชื่อมโฆษณากับการขยายทีม', 'Connect ads to team growth')}</h3>
            <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-600">
              <div className="rounded-xl bg-white border border-[#dbeafe] p-3">{L('ผู้สนใจที่กรอกจากโฆษณา → บันทึกเป็นผู้มุ่งหวัง แล้ววางไว้ในสายงานของคุณ (กันซ้ำด้วยเบอร์/อีเมล)', 'Ad leads → saved as prospects, placed in your downline (deduped by phone/email)')}</div>
              <div className="rounded-xl bg-white border border-[#dbeafe] p-3">{L('ใช้คลิปที่มีสิทธิ์จากคลังวิดีโอ + ลิงก์รับสมัครของคุณเป็น Landing Page', 'Use licensed clips from the library + your recruitment link as the landing page')}</div>
              <div className="rounded-xl bg-white border border-[#dbeafe] p-3">{L('ติดตามผลทุก Lead ภายใน 24–48 ชม. แล้วอัปเดตสถานะในระบบผู้มุ่งหวัง', 'Follow up every lead within 24–48h and update its status in the prospect system')}</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <a href="/tree" className={btnP}>{L('เปิดผังทีม 1:5', 'Open the 1:5 tree')}</a>
              <a href="/prospects" className={btnS}>{L('ระบบผู้มุ่งหวัง', 'Prospect system')}</a>
              <a href="/network/1x5-rules" className={btnS}>{L('หลักเกณฑ์ 1 แตก 5', '1×5 build rules')}</a>
              <button onClick={() => setTab('audience')} className={btnS}>{L('ไปตั้งกลุ่มเป้าหมาย', 'Go to audiences')}</button>
            </div>
          </div>
        </>
      )}

      {/* ── 7) รายงานผลโฆษณา ──────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <>
          <div className="card p-5 space-y-3">
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm text-navy">{L('รายงานผลโฆษณา', 'Ad performance report')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{L('ตัวชี้วัดของแพลตฟอร์มจะแสดงเมื่อได้รับสิทธิ์อ่านรายงานจาก TikTok API เท่านั้น', 'Platform metrics appear only once reporting access is granted by the TikTok API')}</p>
              </div>
              <div className="ml-auto flex items-end gap-2 flex-wrap">
                <div>
                  <div className={labelCls}>{L('จากวันที่', 'From')}</div>
                  <input type="date" className={`${field} mt-1`} value={range.from} onChange={(e) => setRange((s) => ({ ...s, from: e.target.value }))} />
                </div>
                <div>
                  <div className={labelCls}>{L('ถึงวันที่', 'To')}</div>
                  <input type="date" className={`${field} mt-1`} value={range.to} onChange={(e) => setRange((s) => ({ ...s, to: e.target.value }))} />
                </div>
                <button onClick={loadReport} disabled={busy === 'report'} className={btnP}>{busy === 'report' ? L('กำลังดึง…', 'Loading…') : `↻ ${L('ดึงรายงานจริงจาก TikTok', 'Load the real TikTok report')}`}</button>
                <button onClick={exportReport} className={btnS}>⬇ {L('ส่งออกรายงาน (CSV)', 'Export report (CSV)')}</button>
              </div>
            </div>

            {report && !report.ok && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] text-rose-700">
                {String(report.error || 'ดึงรายงานไม่สำเร็จ')}
                {report.tiktokCode !== undefined && report.tiktokCode !== null && <span className="block mt-1 font-mono">TikTok code: {String(report.tiktokCode)}{report.tiktokRequestId ? ` · request_id: ${String(report.tiktokRequestId)}` : ''}</span>}
              </div>
            )}
            {report?.ok && m.has && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-[#dbeafe]">
                      <th className="py-1.5 pr-3">{L('วัน', 'Day')}</th>
                      <th className="py-1.5 pr-3">{L('แคมเปญ', 'Campaign')}</th>
                      <th className="py-1.5 pr-3">{L('ค่าใช้จ่าย', 'Spend')}</th>
                      <th className="py-1.5 pr-3">Impressions</th>
                      <th className="py-1.5 pr-3">Clicks</th>
                      <th className="py-1.5 pr-3">CTR</th>
                      <th className="py-1.5 pr-3">Conversions</th>
                      <th className="py-1.5">CPL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.rows.map((r: Any, i: number) => (
                      <tr key={i} className="border-b border-[#eff6ff]">
                        <td className="py-1.5 pr-3">{String(r?.dimensions?.stat_time_day || '')}</td>
                        <td className="py-1.5 pr-3">{String(r?.dimensions?.campaign_id || '')}</td>
                        <td className="py-1.5 pr-3">{String(r?.metrics?.spend ?? '')}</td>
                        <td className="py-1.5 pr-3">{String(r?.metrics?.impressions ?? '')}</td>
                        <td className="py-1.5 pr-3">{String(r?.metrics?.clicks ?? '')}</td>
                        <td className="py-1.5 pr-3">{String(r?.metrics?.ctr ?? '')}</td>
                        <td className="py-1.5 pr-3">{String(r?.metrics?.conversion ?? '')}</td>
                        <td className="py-1.5">{String(r?.metrics?.cost_per_conversion ?? '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {report?.ok && !m.has && <div className="text-xs text-slate-500">{L('TikTok ตอบสำเร็จแต่ยังไม่มีข้อมูลในช่วงวันที่นี้', 'TikTok responded successfully but has no data in this range')}</div>}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-[#dbeafe]">
                    <th className="py-1.5 pr-3">{L('ตัวชี้วัด', 'Metric')}</th>
                    <th className="py-1.5 pr-3">{L('ค่า', 'Value')}</th>
                    <th className="py-1.5">{L('ที่มา', 'Source')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [L('ค่าใช้จ่าย', 'Spend'), 'THB'],
                    ['Impressions', ''],
                    ['Clicks', ''],
                    ['CTR', '%'],
                    [L('Leads (จากโฆษณา)', 'Leads (from ads)'), ''],
                    ['Cost per Lead', 'THB'],
                    [L('Conversion Rate', 'Conversion rate'), '%'],
                  ].map(([m, u]) => (
                    <tr key={String(m)} className="border-b border-[#eff6ff]">
                      <td className="py-1.5 pr-3 font-semibold text-navy">{m}{u ? ` (${u})` : ''}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`${chip} bg-amber-50 border border-amber-200 text-amber-700`}>{L('ไม่มีข้อมูล', 'No data')}</span>
                      </td>
                      <td className="py-1.5 text-slate-500">{L('ต้องมีสิทธิ์อ่านรายงานจาก TikTok API', 'Requires TikTok API reporting access')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-white border border-[#dbeafe] p-4">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{L('กราฟตามวัน / เปรียบเทียบแคมเปญ', 'Daily chart / campaign comparison')}</div>
              <div className="h-28 mt-2 rounded-lg border border-dashed border-[#dbeafe] flex items-center justify-center text-[11px] text-slate-400 text-center px-4">
                {L('ยังวาดกราฟไม่ได้ — ไม่มีข้อมูลรายวันจาก API (ระบบไม่สร้างตัวเลขขึ้นมาเอง)', 'No chart yet — there is no daily data from the API (the system never makes numbers up)')}
              </div>
            </div>

            <div className="card p-4 space-y-2 bg-white">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{L('ข้อมูลจริงที่ดึงได้ตอนนี้', 'Real data available now')}</div>
              <div className="text-xs text-slate-600">
                {L('ผู้สนใจทั้งระบบ', 'Prospects overall')}: <b>{num(api?.leads?.total)}</b> · {L('สมัครแล้ว', 'Applied+converted')}: <b>{applied}</b> · {L('อัตราเปลี่ยนเป็นผู้สมัคร', 'Application rate')}: <b>{profileRate}</b>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={exportReport} className={btnS}>⬇ {L('ส่งออก CSV', 'Export CSV')}</button>
                <a href="/reports" className={btnS}>{L('เปิดหน้ารายงานของระบบ', 'Open system reports')}</a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 8) ตั้งค่าการเชื่อมต่อ TikTok ──────────────────────────────────── */}
      {tab === 'settings' && (
        <>
          <div className="card p-5 space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h3 className="font-semibold text-sm text-navy">{L('สถานะการเชื่อมต่อ TikTok Marketing API', 'TikTok Marketing API status')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{L('ตรวจจาก env ฝั่งเซิร์ฟเวอร์ — หน้านี้แสดงแค่ "มี/ไม่มี" ไม่เคยแสดงค่าจริง และไม่เก็บโทเคนในเบราว์เซอร์', 'Checked from server-side env — this page shows presence only, never values, and never stores tokens in the browser')}</p>
              </div>
              <button onClick={loadApi} className={`ml-auto ${btnS}`}>↻ {L('ตรวจสอบการเชื่อมต่ออีกครั้ง', 'Re-check connection')}</button>
            </div>
            <div className="grid md:grid-cols-2 gap-2">
              {(api?.tiktok?.keys || []).map((k: Any) => (
                <div key={k.key} className="rounded-xl bg-white border border-[#dbeafe] p-3 flex items-center gap-2">
                  <span className={`${chip} ${k.present ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>{k.present ? L('มีค่าแล้ว', 'Set') : L('ยังไม่มี', 'Missing')}</span>
                  <span className="text-xs font-mono text-slate-700">{k.key}</span>
                  <span className="text-[11px] text-slate-500 ml-auto">{k.scope}</span>
                </div>
              ))}
              {!api && <div className="text-xs text-slate-400">…</div>}
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
              {L('ห้ามใส่ Access Token ลงในโค้ดหน้าเว็บหรือไฟล์ในโปรเจกต์ — ต้องตั้งเป็น Environment Variable ฝั่งเซิร์ฟเวอร์ (Vercel → Settings → Environment Variables) และใช้บัญชีโฆษณาที่ท่านมีสิทธิ์เข้าถึงเท่านั้น',
                 'Never put an access token in frontend code or project files — set it as a server-side environment variable (Vercel → Settings → Environment Variables) and only use ad accounts you may access')}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => loadTt('accounts')} disabled={busy === 'accounts'} className={btnS}>{busy === 'accounts' ? '…' : `🏦 ${L('ตรวจสอบบัญชีโฆษณา', 'Check ad accounts')}`}</button>
              <button onClick={() => loadTt('identities')} disabled={busy === 'identities'} className={btnS}>{busy === 'identities' ? '…' : `🪪 ${L('identity ของบัญชี TikTok', 'TikTok account identities')}`}</button>
              <button onClick={() => loadTt('list')} disabled={busy === 'list'} className={btnS}>{busy === 'list' ? '…' : `📋 ${L('รายการแคมเปญจริงในบัญชี', 'Real campaigns in the account')}`}</button>
              <button onClick={() => setModal('settings')} className={btnS}>📋 {L('ขั้นตอนตั้งค่า (คัดลอกได้)', 'Setup steps (copyable)')}</button>
              <a href={api?.tiktok?.managerUrl || MANAGER_URL} target="_blank" rel="noreferrer" className={btnS}>↗ {L('เปิด TikTok Ads Manager', 'Open TikTok Ads Manager')}</a>
              <a href="https://developers.tiktok.com/apps" target="_blank" rel="noreferrer" className={btnS}>{L('จัดการแอปนักพัฒนา', 'Developer apps')}</a>
            </div>
            {ttData && (
              <div className="rounded-xl bg-white border border-[#dbeafe] p-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{L('ผลตอบกลับจาก TikTok', 'TikTok response')} · {String(ttData.action)}</span>
                  <span className={`${chip} ${ttData.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>{ttData.ok ? L('สำเร็จ', 'OK') : L('ไม่สำเร็จ', 'Failed')}</span>
                  <button onClick={() => setTtData(null)} className={`ml-auto ${btnS}`}>✕</button>
                </div>
                <pre className="whitespace-pre-wrap text-[11px] font-mono mt-2 max-h-52 overflow-y-auto m-0">{JSON.stringify(ttData, null, 1).slice(0, 4000)}</pre>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-semibold text-sm text-navy">{L('ลำดับการสร้างแคมเปญเมื่อเชื่อมต่อแล้ว', 'Campaign creation order once connected')}</h3>
            <ol className="grid md:grid-cols-2 gap-2 text-xs text-slate-600">
              {[
                L('เชื่อมต่อและยืนยันสิทธิ์บัญชีโฆษณา', 'Connect and authorize the ad account'),
                L('ตรวจสอบ Advertiser ID', 'Verify the Advertiser ID'),
                L('อ่านข้อมูลแคมเปญที่บัญชีอนุญาตให้เข้าถึง', 'Read campaigns the account may access'),
                L('อัปโหลด/เลือกครีเอทีฟที่มีสิทธิ์ใช้งาน', 'Upload / select licensed creative'),
                L('สร้าง Campaign', 'Create the campaign'),
                L('สร้าง Ad Group + งบประมาณ/กลุ่มเป้าหมาย', 'Create the ad group with budget and targeting'),
                L('สร้าง Video Ad', 'Create the video ad'),
                L('ตรวจสอบข้อมูลทั้งหมดก่อนเผยแพร่', 'Review everything before publishing'),
                L('แสดงผลตอบกลับ/ข้อผิดพลาดจาก API', 'Show API responses and errors'),
                L('อ่านรายงานผลโฆษณาเมื่อได้รับสิทธิ์', 'Read ad reports once permitted'),
              ].map((t, i) => (
                <li key={i} className="flex gap-2 rounded-xl bg-white border border-[#dbeafe] p-2.5">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[#eff6ff] text-sky-700 text-[10px] font-bold flex items-center justify-center mt-[1px]">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}

      {/* ── ฉบับร่างแคมเปญ (แสดงทุกแท็บเป็นส่วนท้าย) ───────────────────────── */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold text-sm text-navy">💾 {L('ฉบับร่างแคมเปญของฉัน', 'My campaign drafts')}</h3>
          <span className={`${chip} bg-white border border-[#dbeafe] text-slate-600`}>{drafts.length}</span>
          <div className="ml-auto flex gap-2 flex-wrap">
            <button onClick={() => saveDraft('draft')} className={btnS}>{L('บันทึกฟอร์มปัจจุบันเป็นฉบับร่าง', 'Save the current form as a draft')}</button>
            <button onClick={exportDraftsJson} disabled={!drafts.length} className={btnS}>{L('ดาวน์โหลด JSON', 'Download JSON')}</button>
          </div>
        </div>
        {!drafts.length && <div className="text-xs text-slate-500">{L('ยังไม่มีฉบับร่าง', 'No drafts yet')}</div>}
        <div className="space-y-2">
          {drafts.map((d) => (
            <div key={d.id} className="rounded-xl bg-white border border-[#dbeafe] p-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-navy">{d.form.campaignName || L('(ไม่มีชื่อ)', '(untitled)')}</span>
                <span className={`${chip} ${d.status === 'paused' ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-[#eff6ff] border border-[#dbeafe] text-sky-700'}`}>
                  {d.status === 'paused' ? L('หยุดไว้ (ในเครื่อง)', 'Paused (local)') : L('ฉบับร่าง (ในเครื่อง)', 'Draft (local)')}
                </span>
                <span className="text-[11px] text-slate-400">{new Date(d.savedAt).toLocaleString('th-TH')}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                {L('วัตถุประสงค์', 'Objective')}: {d.form.objective} · {L('งบ/วัน', 'Daily')}: {d.form.dailyBudget || '-'} · {L('งบรวม', 'Total')}: {d.form.totalBudget || '-'} · {d.form.startDate || '-'} → {d.form.endDate || '-'} · {L('บัญชีโฆษณา', 'Ad account')}: {accountLabel}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => { setForm(d.form); setVideo(d.video); setTab('create'); }} className={btnS}>{L('โหลดกลับมาแก้', 'Load to edit')}</button>
                <button onClick={() => toggleDraft(d.id)} className={btnS}>{d.status === 'paused' ? `▶ ${L('เปิดแคมเปญ', 'Resume campaign')}` : `⏸ ${L('หยุดแคมเปญ', 'Pause campaign')}`}</button>
                <button onClick={() => removeDraft(d.id)} className={btnS}>🗑 {L('ลบฉบับร่าง', 'Delete draft')}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-slate-500">
          {L('ฉบับร่างเก็บในเบราว์เซอร์เครื่องนี้และยังไม่ถูกส่งไป TikTok · ปุ่มเปิด/หยุดมีผลกับสถานะในเครื่องเท่านั้น จนกว่าจะเชื่อมต่อ API จริง',
             'Drafts live in this browser and are not sent to TikTok · the pause/resume buttons only change the local status until a real API connection exists')}
        </div>
      </div>

      {/* ── ข้อกำกับ (บังคับแสดง) ─────────────────────────────────────────── */}
      <div className="rounded-xl bg-slate-50 border border-[#dbeafe] p-3 text-[11px] text-slate-500">
        {L('โฆษณาต้องไม่รับประกันรายได้หรือผลตอบแทน และต้องไม่ใช้ข้อความที่ทำให้เข้าใจผิด · ใช้เฉพาะคลิปที่ท่านมีสิทธิ์หรือได้รับอนุญาต และห้ามใช้ข้อมูลอ่อนไหวหรือกำหนดเป้าหมายแบบเลือกปฏิบัติ · ต้องตรวจสอบนโยบายโฆษณาและข้อกำหนดทางกฎหมายก่อนเผยแพร่ทุกครั้ง · ตัวเลขโฆษณาจะแสดงเมื่อได้รับสิทธิ์จาก TikTok API เท่านั้น',
           'Ads must not promise income or returns and must not mislead · use only clips you own or are licensed to use, never sensitive data or discriminatory targeting · always review ad policies and legal requirements before publishing · ad metrics appear only once TikTok API access is granted')}
      </div>

      {/* ── Modal: ตัวอย่างโฆษณา ──────────────────────────────────────────── */}
      {modal === 'preview' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setModal('')}>
          <div className="bg-white rounded-2xl p-5 max-w-[92vw] max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="font-semibold text-sm text-navy">{L('ตัวอย่างโฆษณา (แนวตั้ง 9:16)', 'Ad preview (vertical 9:16)')}</h3>
              <button onClick={() => setModal('')} className={`ml-auto ${btnS}`}>✕</button>
            </div>
            <div className="flex flex-col items-center gap-3">
              <VideoFrame tall />
              <div className="w-full max-w-[300px] space-y-1.5">
                <div className="text-xs font-semibold text-navy">{form.headline || L('(ยังไม่มีพาดหัว)', '(no headline)')}</div>
                <div className="text-[11px] text-slate-600 whitespace-pre-wrap">{form.adText || L('(ยังไม่มีข้อความโฆษณา)', '(no ad text)')}</div>
                <div className="text-[11px] text-slate-500">
                  {form.cta} · {form.destinationUrl}
                </div>
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  {L('ตัวอย่างนี้เป็นภาพจำลองในเบราว์เซอร์ ยังไม่ใช่โฆษณาที่เผยแพร่บน TikTok', 'This is a local mock-up in the browser, not a live TikTok ad')}
                </div>
              </div>
              {video.kind === 'tiktok' && <a href={video.url} target="_blank" rel="noreferrer" className={btnS}>{L('เปิดวิดีโอต้นฉบับบน TikTok', 'Open the original on TikTok')}</a>}
              <button onClick={() => setModal('confirm')} className={btnP}>{L('ไปขั้นยืนยันการส่ง', 'Go to submit confirmation')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: ยืนยันก่อนส่ง (ต้องแสดงชื่อ/งบ/ระยะเวลา/บัญชีโฆษณา) ─────── */}
      {modal === 'confirm' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setModal('')}>
          <div className="bg-white rounded-2xl p-5 max-w-[92vw] w-[520px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-navy">{L('ยืนยันก่อนส่งแคมเปญ', 'Confirm before submitting')}</h3>
            <div className="mt-3 rounded-xl bg-white border border-[#dbeafe] p-3 text-xs space-y-1">
              <div>{L('ชื่อแคมเปญ', 'Campaign name')}: <b>{form.campaignName || L('(ยังไม่มี)', '(none)')}</b></div>
              <div>{L('งบประมาณต่อวัน', 'Daily budget')}: <b>{form.dailyBudget || '-'}</b> · {L('งบประมาณรวม', 'Total')}: <b>{form.totalBudget || '-'}</b></div>
              <div>{L('ระยะเวลา', 'Schedule')}: <b>{form.startDate || '-'} → {form.endDate || '-'}</b></div>
              <div>{L('บัญชีโฆษณา', 'Ad account')}: <b>{accountLabel}</b></div>
              <div>{L('วัตถุประสงค์', 'Objective')}: <b>{form.objective}</b> · {L('กลุ่มเป้าหมาย', 'Audience')}: <b>{AUDIENCES.find((a) => a.id === form.audienceId) ? L(AUDIENCES.find((a) => a.id === form.audienceId)!.th, AUDIENCES.find((a) => a.id === form.audienceId)!.en) : form.audienceId}</b></div>
            </div>
            {issues.length > 0 && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
                <div className="font-semibold">{L('ยังต้องแก้ก่อนส่ง', 'Still to fix')}</div>
                {issues.map((c, i) => <div key={i}>• {c}</div>)}
              </div>
            )}
            <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
              {demo
                ? L('ระบบยังไม่ได้เชื่อมต่อ TikTok Marketing API — การกดยืนยันจะ "ไม่" สร้างแคมเปญและไม่มีการใช้จ่ายจริง', 'The TikTok Marketing API is not connected — confirming will NOT create a campaign and no spend occurs')
                : L('กดยืนยันแล้วระบบจะส่งคำสั่งสร้างแคมเปญจริงผ่าน API: campaign → adgroup → ad (สร้างแบบ "หยุดไว้" เสมอ) แล้วรายงานผลตอบกลับจริงจาก TikTok', 'Confirming sends the real create request through the API: campaign → adgroup → ad (always created paused) and reports TikTok’s real response')}
            </div>
            <div className="mt-4 flex gap-2 justify-end flex-wrap">
              <button onClick={runDry} disabled={busy === 'dry'} className={btnS}>{busy === 'dry' ? '…' : L('ดู payload ที่จะส่ง (Dry run)', 'Inspect payload (dry run)')}</button>
              <button onClick={() => setModal('')} className={btnS}>{L('ยกเลิก', 'Cancel')}</button>
              <button onClick={submitCampaign} className={btnP} disabled={issues.length > 0 || busy === 'create'}>
                {busy === 'create' ? L('กำลังส่ง…', 'Submitting…') : L('ยืนยันส่งแคมเปญ', 'Confirm submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: payload ที่จะส่ง (Dry run) ─────────────────────────────── */}
      {modal === 'dry' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setModal('')}>
          <div className="bg-white rounded-2xl p-5 max-w-[92vw] w-[620px] max-h-[86vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-navy">{L('payload ที่จะส่งไป TikTok จริง', 'Payload that will be sent to TikTok')}</h3>
            {busy === 'dry' && <div className="text-xs text-slate-400">…</div>}
            {dry && (
              <>
                <div className="text-[11px] text-slate-600 space-y-1">
                  {(dry.notes || []).map((n: string, i: number) => <div key={i}>• {n}</div>)}
                </div>
                {Array.isArray(dry.errors) && dry.errors.length > 0 && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">
                    <div className="font-semibold">{L('ยังต้องแก้ก่อนยิงจริง', 'Fix before launching')}</div>
                    {dry.errors.map((e: string, i: number) => <div key={i}>• {e}</div>)}
                  </div>
                )}
                <pre className="whitespace-pre-wrap text-[11px] font-mono bg-white border border-[#dbeafe] rounded-xl p-3 m-0 max-h-[50vh] overflow-y-auto">{JSON.stringify(dry.payloads, null, 2)}</pre>
              </>
            )}
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setModal('confirm')} className={btnS}>{L('กลับไปหน้ายืนยัน', 'Back to confirmation')}</button>
              <button onClick={() => copy(JSON.stringify(dry?.payloads || {}, null, 2), 'payload')} className={btnS}>{cLabel('payload', L('คัดลอก payload', 'Copy payload'))}</button>
              <button onClick={() => setModal('')} className={btnP}>{L('ปิด', 'Close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: ผลการส่ง ───────────────────────────────────────────────── */}
      {modal === 'submitResult' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setModal('')}>
          <div className="bg-white rounded-2xl p-5 max-w-[92vw] w-[480px] space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-navy">{L('ผลการส่งแคมเปญ', 'Submit result')}</h3>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-800">{submitMsg}</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => { saveDraft('draft'); setModal(''); }} className={btnS}>{L('บันทึกเป็นฉบับร่างไว้ก่อน', 'Save as a draft instead')}</button>
              <a href={api?.tiktok?.managerUrl || MANAGER_URL} target="_blank" rel="noreferrer" className={btnS}>{L('เปิด TikTok Ads Manager', 'Open TikTok Ads Manager')}</a>
              <button onClick={() => setModal('')} className={btnP}>{L('ปิด', 'Close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: ขั้นตอนตั้งค่า ─────────────────────────────────────────── */}
      {modal === 'settings' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setModal('')}>
          <div className="bg-white rounded-2xl p-5 max-w-[92vw] w-[560px] max-h-[86vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm text-navy">{L('ขั้นตอนตั้งค่า Environment Variables', 'Environment variable setup')}</h3>
            <pre className="whitespace-pre-wrap text-[11px] text-slate-700 bg-white border border-[#dbeafe] rounded-xl p-3 font-mono m-0">
{`# ตั้งค่าฝั่งเซิร์ฟเวอร์เท่านั้น (Vercel → Settings → Environment Variables)
TIKTOK_ADS_ACCESS_TOKEN=<จาก TikTok Marketing API>
TIKTOK_ADS_ADVERTISER_ID=<Advertiser ID ที่มีสิทธิ์>
TIKTOK_MARKETING_APP_ID=<App ID>
TIKTOK_MARKETING_APP_SECRET=<App Secret>
TIKTOK_CLIENT_KEY=<มีอยู่แล้วในระบบ>
TIKTOK_CLIENT_SECRET=<มีอยู่แล้วในระบบ>`}
            </pre>
            <div className="text-[11px] text-slate-600 space-y-1">
              <div>1. {L('ขอสิทธิ์แอป Marketing API และผูกบัญชีโฆษณา (advertiser)', 'Apply for Marketing API access and link the advertiser')}</div>
              <div>2. {L('ตั้งค่า env ข้างบนใน Vercel แล้ว redeploy', 'Set the env above in Vercel and redeploy')}</div>
              <div>3. {L('กลับมาเปิดหน้านี้ → กด «ตรวจสอบการเชื่อมต่ออีกครั้ง» จนขึ้นว่าเชื่อมต่อแล้ว', 'Return here → tap “Re-check connection” until it shows connected')}</div>
              <div>4. {L('จากนั้นแคมเปญจะสร้างผ่าน API ได้จริงและรายงานผลจะแสดงตัวเลขจริง', 'Then campaigns can really be created via the API and reports show real numbers')}</div>
            </div>
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[11px] text-rose-700">
              {L('ห้ามพิมพ์หรือวาง Access Token ในช่องแชท ในโค้ดหน้าเว็บ หรือในไฟล์ที่แชร์ · ระบบนี้จะไม่รับรหัสผ่าน/โทเคนผ่านแชท', 'Never type or paste an access token into chat, frontend code, or shared files · this system will not accept passwords/tokens through chat')}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => copy(`TIKTOK_ADS_ACCESS_TOKEN=\nTIKTOK_ADS_ADVERTISER_ID=\nTIKTOK_MARKETING_APP_ID=\nTIKTOK_MARKETING_APP_SECRET=`, 'env')} className={btnS}>{cLabel('env', L('คัดลอกชื่อคีย์ env', 'Copy env key names'))}</button>
              <button onClick={() => setModal('')} className={btnP}>{L('ปิด', 'Close')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
