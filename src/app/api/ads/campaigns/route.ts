import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Any = Record<string, any>;

/**
 * /api/ads/campaigns — ชั้นเชื่อมต่อ TikTok Marketing API (Business API v1.3) ของจริง
 *
 * กติกาเหล็กของไฟล์นี้ (ตามสเปกที่เจ้าของวางไว้):
 *  1) ไม่มี credentials ฝั่งเซิร์ฟเวอร์ = "ไม่ยิงแอดจริง" และห้ามรายงานว่าสำเร็จ — ตอบ 400 พร้อมบอกว่าขาด env ตัวไหน
 *  2) ไม่บันทึกตัวเลขขึ้นมาเอง — ทุกคำตอบที่เกี่ยวกับผลลัพธ์ส่งกลับ message/code ของ TikTok ตรง ๆ
 *  3) Access Token อยู่ใน env ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ออกไปเบราว์เซอร์และไม่ถูก log
 *  4) แคมเปญที่สร้างใหม่ถูกตั้งเป็น DISABLE (หยุดไว้) เสมอ — การเปิดให้ใช้จ่ายจริงเป็นคำสั่งแยกที่ต้องยืนยันชัดเจน
 *  5) ใช้บัญชีโฆษณาที่ env ระบุ (บัญชีที่เจ้าของมีสิทธิ์) — ห้ามสุ่ม/เดารหัสพื้นที่หรือกลุ่มเป้าหมายเอง
 *
 * GET  ?action=accounts|videos|regions|list|report[&from=&to=&keyword=]   (ต้องล็อกอิน — อ่านเท่านั้น)
 * POST { action:'dryRun'|'create'|'status', ... }                        (create/status = ผู้ดูแลระบบเท่านั้น)
 */

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';

const ENV_TOKEN = 'TIKTOK_ADS_ACCESS_TOKEN';
const ENV_ADVERTISER = 'TIKTOK_ADS_ADVERTISER_ID';
const ENV_LOCATION = 'TIKTOK_ADS_LOCATION_IDS';

function creds() {
  const token = String(process.env[ENV_TOKEN] || '').trim();
  const advertiserId = String(process.env[ENV_ADVERTISER] || '').trim();
  const missing: string[] = [];
  if (!token) missing.push(ENV_TOKEN);
  if (!advertiserId) missing.push(ENV_ADVERTISER);
  return { token, advertiserId, missing, ok: missing.length === 0 };
}

type TtResult = { httpStatus: number; json: any };

async function tt(path: string, opts: { token: string; method?: 'GET' | 'POST'; query?: Record<string, any>; body?: any; form?: FormData; timeoutMs?: number }): Promise<TtResult> {
  const url = new URL(BASE + path);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const headers: Record<string, string> = { 'Access-Token': opts.token };
  let body: any;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
  try {
    const res = await fetch(url.toString(), { method: opts.method || (body ? 'POST' : 'GET'), headers, body, cache: 'no-store', signal: ctrl.signal });
    const json = await res.json().catch(() => null);
    return { httpStatus: res.status, json };
  } catch (e: unknown) {
    return { httpStatus: 0, json: { code: -1, message: e instanceof Error ? `เชื่อมต่อ TikTok ไม่สำเร็จ: ${e.message}` : 'เชื่อมต่อ TikTok ไม่สำเร็จ' } };
  } finally { clearTimeout(timer); }
}

/** ผลลัพธ์ที่ผ่าน (code === 0) เท่านั้นจึงถือว่าสำเร็จ — TikTok ตอบ code 0 = ok */
function ttOk(r: TtResult) { return r.httpStatus === 200 && r.json && Number(r.json.code) === 0; }
function ttError(r: TtResult, fallback: string) {
  const msg = r.json?.message || r.json?.data?.message || fallback;
  return { tiktokCode: r.json?.code ?? null, tiktokRequestId: r.json?.request_id ?? null, error: String(msg), raw: r.json };
}

const AGE_MAP: Record<string, string[]> = {
  '18-24': ['AGE_18_24'],
  '25-34': ['AGE_25_34'],
  '25-44': ['AGE_25_34', 'AGE_35_44'],
  '35-54': ['AGE_35_44', 'AGE_45_54'],
  '45-64': ['AGE_45_54', 'AGE_55_100'],
};

const OBJECTIVE_MAP: Record<string, string> = {
  TRAFFIC: 'TRAFFIC',
  LEAD_GENERATION: 'LEAD_GENERATION',
  WEBSITE_CONVERSIONS: 'WEB_CONVERSIONS',
};

/** optimization_goal ของ Ad Group ตามวัตถุประสงค์ — ไม่มี pixel ก็ยังยิงได้ด้วย TRAFFIC (CLICK) */
function goalFor(objective: string) {
  if (objective === 'TRAFFIC') return { optimization_goal: 'CLICK', billing_event: 'CPC' };
  if (objective === 'WEB_CONVERSIONS') return { optimization_goal: 'CONVERSION', billing_event: 'CPC' };
  return { optimization_goal: 'LEAD_GENERATION', billing_event: 'CPC' };
}

function locationIdsFromEnv() {
  return String(process.env[ENV_LOCATION] || '')
    .split(/[,\s]+/).map((s) => s.trim()).filter(Boolean).map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

/** สร้าง payload ทั้งชุดจากข้อมูลในฟอร์ม — ใช้ทั้ง dryRun และ create (ที่เดียว ไม่มีสองมาตรฐาน) */
function buildPayloads(body: any, advertiserId: string, locationIds: number[]) {
  const p = body?.payload || body || {};
  const errors: string[] = [];
  const campaignName = String(p.campaignName || '').trim();
  const dailyBudget = Number(p.dailyBudget || 0);
  const startDate = String(p.startDate || '').trim();
  const endDate = String(p.endDate || '').trim();
  const adText = String(p.adText || '').trim();
  const headline = String(p.headline || '').trim();
  const cta = String(p.cta || 'LEARN_MORE').trim();
  const landingPage = String(p.landingPage || p.destinationUrl || '').trim();
  const objective = OBJECTIVE_MAP[String(p.objective || 'LEAD_GENERATION')] || null;
  const ageGroups = AGE_MAP[String(p.ageRange || '25-44')] || null;
  const videoId = String(p.videoId || '').trim();
  const sparkItemId = String(p.tiktokItemId || p.sparkItemId || '').trim(); // TikTok post id (Spark Ads) — คลิปของเจ้าของเอง
  const identityId = String(p.identityId || '').trim();                      // identity ที่ผูกกับบัญชี TikTok เจ้าของ

  if (!campaignName) errors.push('ยังไม่ได้ใส่ชื่อแคมเปญ');
  if (!(dailyBudget > 0)) errors.push('งบประมาณต่อวันต้องมากกว่า 0');
  if (!objective) errors.push(`วัตถุประสงค์ "${p.objective}" ยังไม่รองรับในเส้นทางนี้ (รองรับ TRAFFIC / LEAD_GENERATION / WEBSITE_CONVERSIONS)`);
  if (!ageGroups) errors.push(`ช่วงอายุ "${p.ageRange}" ยังไม่รองรับ`);
  if (!startDate || !endDate) errors.push('ต้องระบุวันที่เริ่มและสิ้นสุด');
  if (!locationIds.length) errors.push(`ยังไม่มีรหัสพื้นที่โฆษณา (location_ids) — ตั้ง env ${ENV_LOCATION} หรือเลือกจากปุ่ม "ค้นหารหัสพื้นที่" (ห้ามเดาเอง)`);
  if (!videoId && !(sparkItemId && identityId)) errors.push('ต้องมีคลิปที่จะยิง: อัปโหลดไฟล์ / ระบุ video_id ในบัญชีโฆษณา / หรือยิงจากโพสต์ TikTok ของตัวเอง (ต้องมี tiktok post id + identity_id)');
  if (sparkItemId && !identityId) errors.push('ยิงจากโพสต์ TikTok ต้องระบุ identity_id ของบัญชี TikTok ที่อนุญาต (ดึงจากปุ่ม "ดึง identity ของบัญชี")');
  if (!adText) errors.push('ยังไม่ได้ใส่ข้อความโฆษณา');
  if (!headline) errors.push('ยังไม่ได้ใส่ข้อความพาดหัว');
  if (!/^https:\/\//i.test(landingPage)) errors.push('หน้า Landing Page ต้องเป็น https://');

  const scheduleStart = startDate ? `${startDate} 00:00:00` : '';
  const scheduleEnd = endDate ? `${endDate} 23:59:59` : '';
  const goal = goalFor(String(p.objective || 'TRAFFIC'));

  const campaign = {
    advertiser_id: advertiserId,
    campaign_name: campaignName,
    objective_type: objective,
    budget_mode: 'BUDGET_MODE_DAY',
    budget: dailyBudget,
    operation_status: 'DISABLE', // สร้างแบบหยุดไว้เสมอ — เปิดใช้จ่ายเป็นคำสั่งแยก
  };
  const adgroup = {
    advertiser_id: advertiserId,
    campaign_id: '<campaign_id จากขั้นที่ 1>',
    adgroup_name: `${campaignName} · AG`,
    placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
    location_ids: locationIds,
    age_groups: ageGroups,
    gender: 'GENDER_UNLIMITED',
    languages: String(p.language || 'th').split(',').map((s: string) => s.trim()).filter(Boolean),
    budget_mode: 'BUDGET_MODE_DAY',
    budget: dailyBudget,
    schedule_type: 'SCHEDULE_START_END',
    schedule_start_time: scheduleStart,
    schedule_end_time: scheduleEnd,
    optimization_goal: goal.optimization_goal,
    billing_event: goal.billing_event,
    bid_type: 'BID_TYPE_NO_BID',
    pacing: 'PACING_MODE_SMOOTH',
    operation_status: 'DISABLE',
  };
  // creative: ใช้โพสต์ TikTok ของเจ้าของเอง (Spark Ads) ถ้ามี tiktok_item_id + identity_id ไม่งั้นใช้ video_id ที่อัปโหลด
  const creative: Any = sparkItemId && identityId
    ? {
        ad_name: `${campaignName} · Spark Ad`,
        ad_format: 'SINGLE_VIDEO',
        tiktok_item_id: sparkItemId,
        identity_id: identityId,
        identity_type: 'AUTH_CODE',
        creative_authorized: true,
        ad_text: adText,
        call_to_action: cta,
        landing_page_url: landingPage,
        display_name: headline,
      }
    : {
        ad_name: `${campaignName} · Ad`,
        ad_format: 'SINGLE_VIDEO',
        video_id: videoId || '<video_id>',
        ad_text: adText,
        call_to_action: cta,
        landing_page_url: landingPage,
        display_name: headline,
      };
  const ad = {
    advertiser_id: advertiserId,
    adgroup_id: '<adgroup_id จากขั้นที่ 2>',
    creatives: [creative],
  };
  return { errors, campaign, adgroup, ad };
}

async function sessionPayload(req: NextRequest) {
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace('Bearer ', '') || '';
  if (!token) return { error: NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  const decoded: any = verifyToken(token);
  if (!decoded) return { error: NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ' }, { status: 401 }) };
  return { decoded };
}

function notConfigured(missing: string[]) {
  return NextResponse.json({
    ok: false,
    configured: false,
    missing,
    error: `ยังไม่ได้เชื่อมต่อ TikTok Ads — ขาดค่าฝั่งเซิร์ฟเวอร์: ${missing.join(', ')} · ระบบจะไม่สร้างแคมเปญและไม่ใช้จ่ายจริงจนกว่าจะตั้งค่าและ TikTok ยืนยันสำเร็จ (ห้ามจำลองผลสำเร็จ)`,
  }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
}

// ── GET: อ่านข้อมูลจริงจากบัญชีโฆษณา (accounts / videos / regions / list / report) ──
export async function GET(req: NextRequest) {
  const s = await sessionPayload(req);
  if (s.error) return s.error;
  const c = creds();
  if (!c.ok) return notConfigured(c.missing);

  const url = new URL(req.url);
  const action = String(url.searchParams.get('action') || 'accounts');
  try {
    if (action === 'accounts') {
      const r = await tt('/advertiser/info/', { token: c.token, query: { advertiser_ids: [c.advertiserId] } });
      if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'อ่านข้อมูลบัญชีโฆษณาไม่สำเร็จ') }, { status: 200 });
      return NextResponse.json({ ok: true, advertiserId: c.advertiserId, accounts: r.json?.data?.list || r.json?.data || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'videos') {
      const r = await tt('/file/video/ad/search/', { token: c.token, query: { advertiser_id: c.advertiserId, page_size: 20, filtering: { video_ids: [] } } });
      if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'อ่านคลังวิดีโอของบัญชีโฆษณาไม่สำเร็จ') }, { status: 200 });
      return NextResponse.json({ ok: true, videos: r.json?.data?.list || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'identities') {
      const r = await tt('/identity/get/', { token: c.token, query: { advertiser_id: c.advertiserId, page_size: 50 } });
      if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'ดึงรายการ identity ของบัญชีไม่สำเร็จ') }, { status: 200 });
      return NextResponse.json({ ok: true, identities: r.json?.data?.list || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'regions') {
      const keyword = String(url.searchParams.get('keyword') || '').trim();
      const r = await tt('/tool/region/', { token: c.token, query: { advertiser_id: c.advertiserId } });
      if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'อ่านรายการพื้นที่โฆษณาไม่สำเร็จ') }, { status: 200 });
      const list: any[] = r.json?.data?.region_list || r.json?.data?.list || [];
      const regions = keyword ? list.filter((x) => JSON.stringify(x).includes(keyword)) : list;
      return NextResponse.json({ ok: true, count: regions.length, regions: regions.slice(0, 60) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'list') {
      const r = await tt('/campaign/get/', { token: c.token, query: { advertiser_id: c.advertiserId, page_size: 50, fields: ['campaign_id', 'campaign_name', 'operation_status', 'budget', 'budget_mode', 'objective_type', 'create_time'] } });
      if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'อ่านรายการแคมเปญไม่สำเร็จ') }, { status: 200 });
      return NextResponse.json({ ok: true, campaigns: r.json?.data?.list || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action === 'report') {
      const from = String(url.searchParams.get('from') || '').trim();
      const to = String(url.searchParams.get('to') || '').trim();
      if (!from || !to) return NextResponse.json({ ok: false, error: 'ต้องระบุช่วงวันที่ (from, to) รูปแบบ YYYY-MM-DD' }, { status: 400 });
      const r = await tt('/report/integrated/get/', {
        token: c.token,
        query: {
          advertiser_id: c.advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: ['campaign_id', 'stat_time_day'],
          metrics: ['spend', 'impressions', 'clicks', 'ctr', 'conversion', 'cost_per_conversion'],
          start_date: from,
          end_date: to,
          page_size: 100,
        },
      });
      if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'ดึงรายงานผลโฆษณาไม่สำเร็จ (บัญชีอาจยังไม่ให้สิทธิ์อ่านรายงาน)') }, { status: 200 });
      return NextResponse.json({ ok: true, from, to, rows: r.json?.data?.list || [], at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ok: false, error: `ไม่รู้จัก action "${action}"` }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

// ── POST: สร้าง/เปลี่ยนสถานะแคมเปญจริง (ผู้ดูแลระบบเท่านั้น) ──
export async function POST(req: NextRequest) {
  const s = await sessionPayload(req);
  if (s.error) return s.error;
  let body: any = {};
  let file: File | null = null;
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      const fd = await req.formData();
      file = (fd.get('video') as File) || null;
      body = JSON.parse(String(fd.get('payload') || '{}'));
    } else {
      body = await req.json();
    }
  } catch { body = {}; }

  const action = String(body.action || '').trim();

  // dryRun: แสดง payload ที่จะส่งจริง — ไม่เรียกเครือข่าย ไม่ใช้สิทธิ์พิเศษ (ยังตรวจ env ให้เห็นว่าเชื่อมต่อหรือยัง)
  if (action === 'dryRun') {
    const c = creds();
    const locationIds = Array.isArray(body.locationIds) && body.locationIds.length ? body.locationIds.map((n: any) => Number(n)) : locationIdsFromEnv();
    const built = buildPayloads(body, c.advertiserId || '<TIKTOK_ADS_ADVERTISER_ID>', locationIds);
    return NextResponse.json({
      ok: built.errors.length === 0,
      configured: c.ok,
      missing: c.missing,
      notes: [
        'นี่คือ payload ที่ระบบจะส่งไป TikTok จริงตามลำดับ: campaign → adgroup → ad',
        'แคมเปญจะถูกสร้างเป็น DISABLE (หยุดไว้) เสมอ — ต้องกด "เปิดแคมเปญจริง" แยกอีกครั้งจึงจะเริ่มใช้จ่าย',
        c.ok ? 'มี credentials ครบ — พร้อมยิงจริงเมื่อกดยืนยัน' : `ยังขาด ${c.missing.join(', ')} — กดยืนยันตอนนี้จะไม่มีการสร้างอะไรบน TikTok`,
      ],
      errors: built.errors,
      locationIds,
      payloads: { campaign: built.campaign, adgroup: built.adgroup, ad: built.ad },
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // ทุก action ที่แตะบัญชีโฆษณาจริง = ผู้ดูแลระบบเท่านั้น
  const isAdmin = await isAdminFromPayload(s.decoded);
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์ยิงแคมเปญจริง — เฉพาะผู้ดูแลระบบ' }, { status: 403 });

  const c = creds();
  if (!c.ok) return notConfigured(c.missing);

  if (action === 'upload') {
    if (!file) return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์วิดีโอในคำขอ (ต้องเป็น multipart/form-data ช่องชื่อ video)' }, { status: 400 });
    const fd = new FormData();
    fd.set('advertiser_id', c.advertiserId);
    fd.set('upload_type', 'UPLOAD_BY_FILE');
    fd.set('file_name', file.name || 'creative.mp4');
    fd.set('video_file', file, file.name || 'creative.mp4');
    const r = await tt('/file/video/ad/upload/', { token: c.token, form: fd, timeoutMs: 55000 });
    if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'อัปโหลดวิดีโอไม่สำเร็จ') }, { status: 200 });
    return NextResponse.json({ ok: true, videoId: r.json?.data?.video_id || null, raw: r.json?.data || null }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (action === 'create') {
    if (body.confirm !== true) return NextResponse.json({ ok: false, error: 'ต้องยืนยันก่อนยิงจริง (confirm: true) — ระบบไม่สร้างแคมเปญโดยไม่มีการยืนยัน' }, { status: 400 });
    const locationIds = Array.isArray(body.locationIds) && body.locationIds.length ? body.locationIds.map((n: any) => Number(n)) : locationIdsFromEnv();
    const built = buildPayloads(body, c.advertiserId, locationIds);
    if (built.errors.length) return NextResponse.json({ ok: false, needsFix: built.errors, error: 'ข้อมูลยังไม่ครบ — ไม่ได้ส่งอะไรไป TikTok' }, { status: 400 });

    // 0) อัปโหลดไฟล์ถ้าส่งมาเป็นไฟล์ (ไฟล์อยู่ในเครื่องผู้ใช้ ส่งตรงขึ้น TikTok ไม่เก็บที่เซิร์ฟเวอร์เรา)
    let videoId = String((body.payload || body).videoId || '').trim();
    const steps: any[] = [];
    if (!videoId && file) {
      const fd = new FormData();
      fd.set('advertiser_id', c.advertiserId);
      fd.set('upload_type', 'UPLOAD_BY_FILE');
      fd.set('file_name', file.name || 'creative.mp4');
      fd.set('video_file', file, file.name || 'creative.mp4');
      const up = await tt('/file/video/ad/upload/', { token: c.token, form: fd, timeoutMs: 55000 });
      steps.push({ step: 'upload_video', httpStatus: up.httpStatus, code: up.json?.code ?? null, message: up.json?.message ?? null });
      if (!ttOk(up)) return NextResponse.json({ ok: false, steps, ...ttError(up, 'อัปโหลดวิดีโอไม่สำเร็จ') }, { status: 200 });
      videoId = String(up.json?.data?.video_id || '');
      if (!videoId) return NextResponse.json({ ok: false, steps, error: 'TikTok ตอบสำเร็จแตไม่คืน video_id — หยุดไว้เพื่อไม่ให้สร้างโฆษณาที่ไม่มีวิดีโอ' }, { status: 200 });
      built.ad.creatives[0].video_id = videoId;
    }

    // 1) campaign
    const cr = await tt('/campaign/create/', { token: c.token, body: built.campaign });
    steps.push({ step: 'campaign/create', httpStatus: cr.httpStatus, code: cr.json?.code ?? null, message: cr.json?.message ?? null });
    if (!ttOk(cr)) return NextResponse.json({ ok: false, steps, ...ttError(cr, 'สร้างแคมเปญไม่สำเร็จ') }, { status: 200 });
    const campaignId = String(cr.json?.data?.campaign_id || '');
    if (!campaignId) return NextResponse.json({ ok: false, steps, error: 'TikTok ตอบสำเร็จแต่ไม่คืน campaign_id — หยุดไว้ ไม่สร้างขั้นถัดไป' }, { status: 200 });

    // 2) adgroup
    built.adgroup.campaign_id = campaignId;
    const ag = await tt('/adgroup/create/', { token: c.token, body: built.adgroup });
    steps.push({ step: 'adgroup/create', httpStatus: ag.httpStatus, code: ag.json?.code ?? null, message: ag.json?.message ?? null });
    if (!ttOk(ag)) return NextResponse.json({ ok: false, campaignId, steps, ...ttError(ag, 'สร้าง Ad Group ไม่สำเร็จ (แคมเปญถูกสร้างแบบหยุดไว้)') }, { status: 200 });
    const adgroupId = String(ag.json?.data?.adgroup_id || '');
    if (!adgroupId) return NextResponse.json({ ok: false, campaignId, steps, error: 'TikTok ตอบสำเร็จแต่ไม่คืน adgroup_id — หยุดไว้ ไม่สร้างขั้นถัดไป' }, { status: 200 });

    // 3) ad
    built.ad.adgroup_id = adgroupId;
    const ad = await tt('/ad/create/', { token: c.token, body: built.ad });
    steps.push({ step: 'ad/create', httpStatus: ad.httpStatus, code: ad.json?.code ?? null, message: ad.json?.message ?? null });
    if (!ttOk(ad)) return NextResponse.json({ ok: false, campaignId, adgroupId, steps, ...ttError(ad, 'สร้าง Video Ad ไม่สำเร็จ (แคมเปญ/Ad Group ถูกสร้างแบบหยุดไว้)') }, { status: 200 });
    const adId = String(ad.json?.data?.ad_ids?.[0] || ad.json?.data?.ad_id || '');

    return NextResponse.json({
      ok: true,
      created: true,
      advertiserId: c.advertiserId,
      campaignId, adgroupId, adId, videoId,
      operationStatus: 'DISABLE',
      steps,
      note: 'สร้างบน TikTok จริงแล้ว แต่ยังเป็นสถานะ "หยุดไว้" — ยังไม่มีการใช้จ่ายจนกว่าจะกดเปิดแคมเปญจริง',
      managerUrl: `https://ads.tiktok.com/iib/dashboard/campaign?aadvid=${c.advertiserId}`,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (action === 'status') {
    if (body.confirm !== true) return NextResponse.json({ ok: false, error: 'ต้องยืนยันก่อนเปลี่ยนสถานะแคมเปญจริง (confirm: true)' }, { status: 400 });
    const campaignId = String(body.campaignId || '').trim();
    const status = String(body.status || '').toUpperCase();
    if (!campaignId) return NextResponse.json({ ok: false, error: 'ต้องระบุ campaignId' }, { status: 400 });
    if (!['ENABLE', 'DISABLE'].includes(status)) return NextResponse.json({ ok: false, error: 'status ต้องเป็น ENABLE หรือ DISABLE' }, { status: 400 });
    const r = await tt('/campaign/status/update/', { token: c.token, body: { advertiser_id: c.advertiserId, campaign_ids: [campaignId], operation_status: status } });
    if (!ttOk(r)) return NextResponse.json({ ok: false, ...ttError(r, 'เปลี่ยนสถานะแคมเปญไม่สำเร็จ') }, { status: 200 });
    return NextResponse.json({
      ok: true, campaignId, operationStatus: status,
      note: status === 'ENABLE' ? 'เปิดแคมเปญแล้ว — TikTok จะเริ่มใช้จ่ายตามงบที่ตั้งไว้' : 'หยุดแคมเปญแล้ว — ไม่มีการใช้จ่ายเพิ่ม',
      raw: r.json?.data || null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ ok: false, error: `ไม่รู้จัก action "${action}"` }, { status: 400 });
}
