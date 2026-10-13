#!/usr/bin/env node
/**
 * ads-launch.mjs — ยิงแคมเปญโฆษณา TikTok "จริง" จากบรรทัดคำสั่ง (ไม่ผ่านเบราว์เซอร์)
 *
 *   node scripts/ads-launch.mjs                 # ตรวจความพร้อม + dry run (ไม่ยิงจริง)
 *   node scripts/ads-launch.mjs --confirm       # สร้างจริง (campaign → adgroup → ad) แบบ "หยุดไว้" เสมอ
 *   node scripts/ads-launch.mjs --enable <id> --confirm   # เปิดแคมเปญให้เริ่มใช้จ่ายจริง
 *   node scripts/ads-launch.mjs --disable <id> --confirm  # หยุดแคมเปญ
 *
 * อ่านค่า secret จาก .env.local เท่านั้น (ไม่พิมพ์ค่า secret ลงจอ)
 *   TIKTOK_ADS_ACCESS_TOKEN, TIKTOK_ADS_ADVERTISER_ID, TIKTOK_ADS_LOCATION_IDS
 *   ตัวเลือก: ADS_OBJECTIVE (ค่าเริ่มต้น TRAFFIC), ADS_DAILY_BUDGET, ADS_TOTAL_BUDGET,
 *            ADS_START_DATE, ADS_END_DATE, ADS_LANDING_PAGE, ADS_POST_ID, ADS_IDENTITY_ID,
 *            ADS_VIDEO_ID, ADS_CAMPAIGN_NAME, ADS_AGE_RANGE, ADS_CTA, ADS_AD_TEXT, ADS_HEADLINE
 *
 * หลักการ: ถ้าไม่มี credentials = หยุดทันทีและบอกว่าขาดอะไร (ห้ามจำลองว่ายิงสำเร็จ)
 *          แคมเปญใหม่ถูกสร้างเป็น DISABLE เสมอ — การเปิดใช้จ่ายเป็นคำสั่งแยกที่ต้องมี --confirm
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : ''; };
const CONFIRM = has('--confirm');
const AGE_GROUPS = {
  '18-24': ['AGE_18_24'], '25-34': ['AGE_25_34'], '25-44': ['AGE_25_34', 'AGE_35_44'],
  '35-54': ['AGE_35_44', 'AGE_45_54'], '45-64': ['AGE_45_54', 'AGE_55_100'],
};

function loadEnv() {
  const env = {};
  const file = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  }
  return { ...env, ...process.env };
}
const env = loadEnv();
const TOKEN = String(env.TIKTOK_ADS_ACCESS_TOKEN || '').trim();
const ADVERTISER = String(env.TIKTOK_ADS_ADVERTISER_ID || '').trim();
const LOCATIONS = String(env.TIKTOK_ADS_LOCATION_IDS || '').split(/[,\s]+/).map((s) => Number(s.trim())).filter(Boolean);
const LANDING = env.ADS_LANDING_PAGE || 'https://ai-insurance-network-tree.vercel.app/';
const OBJECTIVE = env.ADS_OBJECTIVE || 'TRAFFIC';

async function tt(p, opts = {}) {
  const url = new URL(BASE + p);
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await fetch(url, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Access-Token': TOKEN, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { http: res.status, json };
}
function stop(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

(async () => {
  const missing = [];
  if (!TOKEN) missing.push('TIKTOK_ADS_ACCESS_TOKEN');
  if (!ADVERTISER) missing.push('TIKTOK_ADS_ADVERTISER_ID');
  if (!LOCATIONS.length) missing.push('TIKTOK_ADS_LOCATION_IDS');

  console.log('── ตรวจความพร้อม ─────────────────────────────────────────');
  console.log(`  access token : ${TOKEN ? 'มีค่า (ไม่แสดง)' : 'ไม่มี'}`);
  console.log(`  advertiser id: ${ADVERTISER || 'ไม่มี'}`);
  console.log(`  location_ids : ${LOCATIONS.length ? LOCATIONS.join(',') : 'ไม่มี'}`);
  if (missing.length) {
    stop(`ยังยิงไม่ได้ — ขาดค่าใน .env.local: ${missing.join(', ')}
   วิธีได้มา: TikTok Ads Manager → เครื่องมือ → Marketing API (หรือ developers.tiktok.com/apps)
   แล้วตั้งค่าในไฟล์ .env.local (ห้ามวางโทเคนในโค้ดหน้าเว็บ/แชท) · ฝั่ง production ตั้งที่ Vercel → Settings → Environment Variables`);
  }

  // 0) ยืนยันบัญชี + โทเคนใช้งานได้จริง
  const info = await tt('/advertiser/info/', { query: { advertiser_ids: [ADVERTISER] } });
  if (info.json?.code !== 0) stop(`TikTok ปฏิเสธโทเคน/บัญชี: ${info.json?.message || JSON.stringify(info.json)}`);
  const acc = (info.json?.data?.list || [])[0] || {};
  console.log(`\n✓ บัญชีโฆษณา: ${acc.name || '(ไม่ระบุชื่อ)'} · สถานะ ${acc.status || '-'} · สกุลเงิน ${acc.currency || '-'}`);

  // 1) เปิด/หยุดแคมเปญ
  const enableId = argOf('--enable') , disableId = argOf('--disable');
  if (enableId || disableId) {
    const id = String(enableId || disableId);
    const status = enableId ? 'ENABLE' : 'DISABLE';
    if (!CONFIRM) stop(`ต้องยืนยันด้วย --confirm (คำสั่งนี้จะ${enableId ? 'เริ่มใช้จ่ายจริง' : 'หยุด'}แคมเปญ ${id})`);
    const r = await tt('/campaign/status/update/', { body: { advertiser_id: ADVERTISER, campaign_ids: [id], operation_status: status } });
    if (r.json?.code !== 0) stop(`เปลี่ยนสถานะไม่สำเร็จ: ${r.json?.message || JSON.stringify(r.json)}`);
    console.log(`\n✓ ${enableId ? 'เปิด' : 'หยุด'}แคมเปญ ${id} แล้ว${enableId ? ' — TikTok จะเริ่มใช้จ่ายตามงบที่ตั้งไว้' : ''}`);
    return;
  }

  // 2) สร้างแคมเปญใหม่
  const today = new Date();
  const d = (offset) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const start = env.ADS_START_DATE || d(0);
  const end = env.ADS_END_DATE || d(7);
  const daily = Number(env.ADS_DAILY_BUDGET || 200);
  const postId = String(env.ADS_POST_ID || '').trim();
  const identityId = String(env.ADS_IDENTITY_ID || '').trim();
  const videoId = String(env.ADS_VIDEO_ID || '').trim();
  const campaign = {
    advertiser_id: ADVERTISER,
    campaign_name: env.ADS_CAMPAIGN_NAME || `หาตัวแทนจากคลิป TikTok ${start} → เว็บไซต์`,
    objective_type: OBJECTIVE,
    budget_mode: 'BUDGET_MODE_DAY',
    budget: daily,
    operation_status: 'DISABLE',
  };
  const adgroup = {
    advertiser_id: ADVERTISER,
    adgroup_name: `${campaign.campaign_name} · AG`,
    placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
    location_ids: LOCATIONS,
    age_groups: AGE_GROUPS[env.ADS_AGE_RANGE || '25-44'],
    gender: 'GENDER_UNLIMITED',
    languages: ['th'],
    budget_mode: 'BUDGET_MODE_DAY',
    budget: daily,
    schedule_type: 'SCHEDULE_START_END',
    schedule_start_time: `${start} 00:00:00`,
    schedule_end_time: `${end} 23:59:59`,
    optimization_goal: OBJECTIVE === 'TRAFFIC' ? 'CLICK' : OBJECTIVE === 'WEB_CONVERSIONS' ? 'CONVERSION' : 'LEAD_GENERATION',
    billing_event: 'CPC',
    bid_type: 'BID_TYPE_NO_BID',
    pacing: 'PACING_MODE_SMOOTH',
    operation_status: 'DISABLE',
  };
  const adBase = {
    advertiser_id: ADVERTISER,
    creatives: [{
      ad_format: 'SINGLE_VIDEO',
      ad_text: env.ADS_AD_TEXT || 'อยากมีรายได้เสริมหรือเปลี่ยนสายงานมาลองงานที่ปรึกษาการเงิน? ดูรายละเอียดเส้นทางอาชีพตัวแทนประกันชีวิตได้ที่เว็บไซต์',
      call_to_action: env.ADS_CTA || 'LEARN_MORE',
      landing_page_url: LANDING,
      display_name: env.ADS_HEADLINE || 'เริ่มจาก 0 ก็มีพี่เลี้ยงดูแล',
    }],
  };
  if (postId && identityId) Object.assign(adBase.creatives[0], { ad_name: `${campaign.campaign_name} · Spark`, tiktok_item_id: postId, identity_id: identityId, identity_type: 'AUTH_CODE', creative_authorized: true });
  else if (videoId) Object.assign(adBase.creatives[0], { ad_name: `${campaign.campaign_name} · Ad`, video_id: videoId });
  else stop('ต้องระบุคลิป: ADS_POST_ID + ADS_IDENTITY_ID (ยิงจากโพสต์ TikTok ของตัวเอง) หรือ ADS_VIDEO_ID (คลิปในบัญชีโฆษณา)');

  console.log('\n── สิ่งที่จะส่งไป TikTok ──────────────────────────────────');
  console.log(`  วัตถุประสงค์ : ${OBJECTIVE} · งบ/วัน ${daily} THB · ${start} → ${end}`);
  console.log(`  ปลายทาง     : ${LANDING}`);
  console.log(`  คลิป        : ${postId && identityId ? `โพสต์ TikTok ${postId} (identity ${identityId})` : `video_id ${videoId}`}`);
  if (!CONFIRM) {
    console.log('\n(dry run) ยังไม่ยิงจริง — เติม --confirm เพื่อสร้างแคมเปญจริง\n');
    console.log(JSON.stringify({ campaign, adgroup, ad: adBase }, null, 2));
    return;
  }

  console.log('\n→ กำลังสร้างจริง…');
  const cr = await tt('/campaign/create/', { body: campaign });
  if (cr.json?.code !== 0) stop(`สร้างแคมเปญไม่สำเร็จ: ${cr.json?.message || JSON.stringify(cr.json)}`);
  const campaignId = cr.json?.data?.campaign_id;
  console.log(`  ✓ campaign ${campaignId}`);

  const ag = await tt('/adgroup/create/', { body: { ...adgroup, campaign_id: campaignId } });
  if (ag.json?.code !== 0) stop(`สร้าง Ad Group ไม่สำเร็จ: ${ag.json?.message || JSON.stringify(ag.json)} (แคมเปญ ${campaignId} ถูกสร้างแบบหยุดไว้)`);
  const adgroupId = ag.json?.data?.adgroup_id;
  console.log(`  ✓ adgroup ${adgroupId}`);

  const ad = await tt('/ad/create/', { body: { ...adBase, adgroup_id: adgroupId } });
  if (ad.json?.code !== 0) stop(`สร้าง Ad ไม่สำเร็จ: ${ad.json?.message || JSON.stringify(ad.json)} (campaign ${campaignId} · adgroup ${adgroupId} หยุดไว้)`);
  console.log(`  ✓ ad ${ad.json?.data?.ad_ids?.[0] || ad.json?.data?.ad_id || ''}`);

  console.log(`\n✓ สร้างบน TikTok จริงแล้ว — สถานะ "หยุดไว้" ยังไม่มีการใช้จ่าย`);
  console.log(`  เปิดให้เริ่มใช้จ่าย: node scripts/ads-launch.mjs --enable ${campaignId} --confirm`);
  console.log(`  ดูใน Ads Manager : https://ads.tiktok.com/iib/dashboard/campaign?aadvid=${ADVERTISER}\n`);
})().catch((e) => stop(e?.message || String(e)));
