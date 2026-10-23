#!/usr/bin/env node
// gen_steps_image.mjs — สร้างภาพ "3 ขั้นตอน" (ไทย/อังกฤษ) 1600×1093 แล้วเรนเดอร์ด้วย headless Chrome
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const OUT = resolve(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const DATA = {
  th: {
    kicker: 'เริ่มต้นเส้นทางสู่อิสรภาพทางการเงิน',
    title: 'เพียง 3 ขั้นตอน',
    sub: 'สมัคร → สมัครตัวแทน → อัปโหลดใบเสร็จ  ทำได้จากมือถือ ไม่ต้องเดินทาง',
    steps: [
      { n: '1', icon: '📝', title: 'ลงทะเบียนสมัครสมาชิก', desc: 'สมัครบัญชีด้วยอีเมลและรหัสผ่าน แล้วยืนยันอีเมล', url: '/register', cta: 'สมัครสมาชิก' },
      { n: '2', icon: '🧑‍💼', title: 'สมัครเป็นตัวแทน (ผู้มุ่งหวัง)', desc: 'กรอกใบสมัคร/แสดงความสนใจ เข้าสู่การคัดเลือก', url: '/recruit', cta: 'สมัครเป็นตัวแทน' },
      { n: '3', icon: '🧾', title: 'อัปโหลดสลิป / ใบเสร็จ', desc: 'ระบบอ่านยอดเงินจริง และตรวจคุณสมบัติอัตโนมัติ', url: '/documents', cta: 'อัปโหลดใบเสร็จ' },
    ],
    foot: 'ai-insurance-network-tree.vercel.app',
    note: 'ลำดับขั้นตอนตามระบบจริง · ไม่มีการเรียกเก็บค่าธรรมเนียมในขั้นตอนสมัคร',
  },
  en: {
    kicker: 'Your journey to financial freedom',
    title: 'in 3 simple steps',
    sub: 'Register → Apply as an agent → Upload your receipt. All from your phone.',
    steps: [
      { n: '1', icon: '📝', title: 'Create your account', desc: 'Register with email and password, then verify your email.', url: '/register', cta: 'Register' },
      { n: '2', icon: '🧑‍💼', title: 'Apply as a prospective agent', desc: 'Submit the agent application to enter selection.', url: '/recruit', cta: 'Apply now' },
      { n: '3', icon: '🧾', title: 'Upload receipt', desc: 'The system reads the real amount and checks eligibility.', url: '/documents', cta: 'Upload receipt' },
    ],
    foot: 'ai-insurance-network-tree.vercel.app',
    note: 'Steps follow the live system · No fee is charged during registration.',
  },
};

const html = (d) => `<!doctype html><html lang="th"><head><meta charset="utf-8">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:1600px;height:1093px}
  body{font-family:'Noto Sans Thai','Leelawadee UI',sans-serif;background:#08131f;color:#eaf4ff;overflow:hidden}
  .wrap{position:relative;width:1600px;height:1093px;padding:64px 72px 0;
    background:
      radial-gradient(900px 520px at 82% 8%, rgba(34,211,238,.20), transparent 60%),
      radial-gradient(700px 460px at 12% 88%, rgba(200,168,78,.16), transparent 62%),
      linear-gradient(150deg,#08131f 0%,#0b2036 55%,#071427 100%)}
  .grid{position:absolute;inset:0;opacity:.10;
    background-image:linear-gradient(rgba(125,211,252,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(125,211,252,.22) 1px,transparent 1px);
    background-size:80px 80px;mask-image:radial-gradient(70% 60% at 50% 40%,#000 40%,transparent 100%)}
  .head{position:relative;text-align:center}
  .kicker{display:inline-block;font-size:22px;letter-spacing:.14em;color:#7dd3fc;border:1px solid rgba(125,211,252,.35);
    background:rgba(125,211,252,.08);padding:8px 20px;border-radius:999px;font-weight:600}
  h1{font-size:74px;line-height:1.12;font-weight:800;margin-top:22px}
  h1 span{color:#22d3ee}
  .sub{margin-top:16px;font-size:25px;color:rgba(234,244,255,.72);font-weight:400}
  .row{position:relative;display:flex;align-items:stretch;justify-content:center;gap:0;margin-top:52px}
  .card{position:relative;width:432px;min-height:404px;border-radius:26px;padding:28px 28px 104px;
    background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.03));
    border:1px solid rgba(125,211,252,.22);box-shadow:0 26px 60px -30px rgba(0,0,0,.85)}
  .card:after{content:'';position:absolute;inset:0;border-radius:26px;pointer-events:none;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.10)}
  .num{width:64px;height:64px;border-radius:20px;display:flex;align-items:center;justify-content:center;
    font-size:32px;font-weight:800;color:#08131f;background:linear-gradient(160deg,#22d3ee,#7dd3fc);
    box-shadow:0 12px 30px -10px rgba(34,211,238,.75)}
  .num.gold{background:linear-gradient(160deg,#f5c451,#e0a92e);box-shadow:0 12px 30px -10px rgba(245,196,81,.7)}
  .ic{font-size:34px;margin-top:22px}
  .t{font-size:30px;font-weight:800;line-height:1.3;margin-top:12px;min-height:78px}
  .d{font-size:19.5px;line-height:1.5;color:rgba(234,244,255,.72);margin-top:10px}
  .chip{position:absolute;left:28px;right:28px;bottom:24px;display:flex;align-items:center;justify-content:space-between;
    font-size:19px;font-weight:700;color:#08131f;background:#eaf4ff;border-radius:14px;padding:12px 18px}
  .chip .u{font-family:ui-monospace,Consolas,monospace;font-size:17px;font-weight:600;color:#123a6b;opacity:.85}
  .arrow{align-self:center;width:64px;text-align:center;font-size:38px;color:rgba(125,211,252,.75)}
  .foot{position:absolute;left:0;right:0;bottom:44px;text-align:center}
  .foot .f{font-size:20px;font-weight:700;color:rgba(234,244,255,.85);letter-spacing:.02em}
  .foot .n{font-size:16px;color:rgba(234,244,255,.45);margin-top:6px}
</style></head><body><div class="wrap"><div class="grid"></div>
  <div class="head">
    <div class="kicker">${d.kicker}</div>
    <h1>${d.title}</h1>
    <div class="sub">${d.sub}</div>
  </div>
  <div class="row">
    ${d.steps.map((s, i) => `
      <div class="card">
        <div class="num${i === 1 ? ' gold' : ''}">${s.n}</div>
        <div class="ic">${s.icon}</div>
        <div class="t">${s.title}</div>
        <div class="d">${s.desc}</div>
        <div class="chip"><span>${s.cta} →</span><span class="u">${s.url}</span></div>
      </div>
      ${i < 2 ? '<div class="arrow">→</div>' : ''}
    `).join('')}
  </div>
  <div class="foot"><div class="f">${d.foot}</div><div class="n">${d.note}</div></div>
</div></body></html>`;

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
for (const [lang, d] of Object.entries(DATA)) {
  const file = resolve(OUT, `3-steps-${lang}.html`);
  writeFileSync(file, html(d), 'utf8');
  const png = resolve(OUT, `3-steps-${lang}.png`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1600,1093', `--screenshot=${png}`,
    '--user-data-dir=' + resolve(OUT, `chrome-${lang}`),
    'file:///' + file.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  console.log('rendered', png);
}
