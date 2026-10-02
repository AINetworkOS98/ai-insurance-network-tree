// ─────────────────────────────────────────────────────────────────────────────
// ตัวช่วยเก็บ "ที่มาแคมเปญ" (UTM / ttclid) ไว้ระดับ session — ใช้ร่วมกันระหว่าง
// สคริปต์เก็บผู้เข้าชม (public/track.js) กับฟอร์มลีด (src/components/LeadCaptureBox.tsx)
//
// กติกา:
//   • อ่านจาก URL: utm_source / utm_medium / utm_campaign / utm_content / utm_term / ttclid
//   • เก็บไว้ที่ sessionStorage คีย์เดียว (aintree_utm) เพื่อให้หน้าถัดไปใน session ยังรู้ที่มา
//   • มี UTM ชุดใหม่ในลิงก์ → ทับค่าเดิม (แคมเปญล่าสุดที่พามา) แต่คง first_visit ไว้
//   • ไม่มี UTM ชุดใหม่ → ใช้ค่าเดิมที่เก็บไว้ (stickiness) แล้วอัปเดต last_visit
//   • เก็บ first_visit / last_visit เป็น ISO เพื่อส่งไปกับฟอร์มลีด
//   • เป็นข้อมูลระดับ session ไม่ระบุตัวบุคคล — ใช้เพื่อการตลาดของเว็บนี้เท่านั้น
// ─────────────────────────────────────────────────────────────────────────────

export const UTM_KEY = 'aintree_utm';

const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ttclid'] as const;
type Param = (typeof PARAMS)[number];

export type UtmData = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  ttclid: string;
  landing_page: string;
  first_visit: string;
  last_visit: string;
};

function emptyUtm(): UtmData {
  return {
    utm_source: '', utm_medium: '', utm_campaign: '', utm_content: '', utm_term: '',
    ttclid: '', landing_page: '', first_visit: '', last_visit: '',
  };
}

function readRaw(): UtmData | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(UTM_KEY) || 'null');
    if (saved && typeof saved === 'object') return { ...emptyUtm(), ...saved };
  } catch {
    /* sessionStorage ถูกบล็อก/ค่าผิดรูปแบบ — ไม่เป็นไร */
  }
  return null;
}

// ── อ่าน + บันทึกที่มา (เรียกตอนเปิดหน้า และตอนส่งฟอร์ม) ──────────────────────
export function captureUtm(): UtmData | null {
  if (typeof window === 'undefined') return null;

  const saved = readRaw();
  const q = new URLSearchParams(window.location.search);
  const found: Partial<Record<Param, string>> = {};
  for (const p of PARAMS) {
    const v = (q.get(p) || '').trim();
    if (v) found[p] = v.slice(0, 200);
  }

  const now = new Date().toISOString();
  let out: UtmData;

  if (Object.keys(found).length > 0) {
    // มีลิงก์แคมเปญชุดใหม่ → จำชุดล่าสุด แต่คงเวลาที่เข้าครั้งแรกของ session
    out = {
      ...emptyUtm(),
      utm_source: found.utm_source || '',
      utm_medium: found.utm_medium || '',
      utm_campaign: found.utm_campaign || '',
      utm_content: found.utm_content || '',
      utm_term: found.utm_term || '',
      ttclid: found.ttclid || '',
      landing_page: String(window.location.href).slice(0, 500),
      first_visit: saved?.first_visit || now,
      last_visit: now,
    };
  } else if (saved) {
    // ไม่มี UTM ในลิงก์นี้ → ใช้ที่มาที่จำไว้ทั้ง session
    out = { ...saved, last_visit: now };
  } else {
    // เปิดหน้าโดยไม่มีแคมเปญ → เก็บเฉพาะหน้าเข้าครั้งแรกไว้ตรวจย้อนหลัง
    out = { ...emptyUtm(), landing_page: String(window.location.href).slice(0, 500), first_visit: now, last_visit: now };
  }

  try {
    window.sessionStorage.setItem(UTM_KEY, JSON.stringify(out));
  } catch {
    /* เก็บไม่ได้ (โหมดส่วนตัว) — ยังคืนค่าให้ใช้ส่งฟอร์มได้ */
  }
  return out;
}

// ── อ่านค่าที่เก็บไว้ (ไม่แก้ไข) ─────────────────────────────────────────────
export function readUtm(): UtmData | null {
  if (typeof window === 'undefined') return null;
  return readRaw();
}

// ── ชุดฟิลด์ที่แนบไปกับ body ของ POST /api/lead/register ─────────────────────
export function utmFormFields(): Record<string, any> {
  const u = captureUtm();
  if (!u) return {};
  return {
    utm_source: u.utm_source,
    utm_medium: u.utm_medium,
    utm_campaign: u.utm_campaign,
    utm_content: u.utm_content,
    utm_term: u.utm_term,
    ttclid: u.ttclid,
    landing_page: u.landing_page,
    first_visit: u.first_visit,
    last_visit: u.last_visit,
    // alias ที่ /api/lead/register ส่งต่อไป n8n (body.utm)
    utm: {
      source: u.utm_source,
      medium: u.utm_medium,
      campaign: u.utm_campaign,
      content: u.utm_content,
      term: u.utm_term,
      ttclid: u.ttclid,
      landing_page: u.landing_page,
    },
  };
}
