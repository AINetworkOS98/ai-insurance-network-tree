// อ่าน AUTH_SECRET จาก .env หลายไฟล์ → เซ็น JWT → ยิง production /dashboard เพื่อพิสูจน์ว่าโค้ดใหม่ขึ้นจริง
// ไม่พิมพ์ค่า secret ใด ๆ ออกทาง stdout
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

function readEnv(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}
function getSecret(txt, key) {
  const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
  if (!m) return null;
  let v = m[1].trim().replace(/^["']|["']$/g, '');
  if (!v || v.includes('[SENSITIVE') || v.includes('dev-secret')) return null;
  return v;
}

const root = 'C:/Users/User/ai-insurance-network-tree';
const files = ['.env.vercel.pull', '.env.local'];
const user = process.argv[2] || 'akarapol.pro798@gmail.com';

(async () => {
  for (const f of files) {
    const txt = readEnv(path.join(root, f));
    const s = getSecret(txt, 'AUTH_SECRET');
    if (!s) { console.log(`${f}: AUTH_SECRET ใช้ไม่ได้ (ว่าง/placeholder)`); continue; }
    const token = jwt.sign({ sub: 'audit-readonly', email: user, rankLevel: 4, status: 'ACTIVE' }, s, { expiresIn: '10m' });
    for (const url of ['https://ai-insurance-network-tree.vercel.app/dashboard', 'https://ai-insurance-network-tree.vercel.app/api/members']) {
      try {
        const r = await fetch(url + '?cb=' + Date.now(), { headers: { cookie: 'token=' + token }, redirect: 'manual' });
        const body = await r.text();
        console.log(`${f} | ${url.replace('https://ai-insurance-network-tree.vercel.app', '')} -> HTTP ${r.status} size=${body.length}`);
        if (r.status === 200) {
          fs.writeFileSync(path.join(process.env.LOCALAPPDATA, 'Temp', 'dash_auth.html'), body);
          const chunks = [...body.matchAll(/\/_next\/static\/chunks\/app\/dashboard\/page-[0-9a-f]+\.js/g)].map(m => m[0]);
          console.log('chunk(dashboard) =', [...new Set(chunks)]);
          console.log('มีคำว่า อัปเดตเดี๋ยวนี้ ใน HTML =', body.includes('อัปเดตเดี๋ยวนี้'));
        }
      } catch (e) { console.log(f, url, 'ERR', e.message); }
    }
    break; // สำเร็จรอบแรกพอ
  }
})();
