// ─────────────────────────────────────────────────────────────────────────────
// สร้าง "ริชเมนู" ของ LINE OA (ภาพ + โครงสร้าง) พร้อมอัปโหลด
//
//   node scripts/make-line-oa-richmenu.mjs
//
// ได้:
//   ~/OneDrive/Desktop/QR-AITREE/LINE-OA/line-oa-richmenu-2500x1686.png  (สเปก LINE: 2500×1686, PNG < 1 MB)
//   ~/OneDrive/Desktop/QR-AITREE/LINE-OA/line-oa-richmenu.json           (โซน 3 ปุ่ม + action สำหรับอัปโหลดผ่าน API)
//   ~/OneDrive/Desktop/QR-AITREE/LINE-OA/line-oa-text-pack.md            (ข้อความตั้งต้นสำหรับกรอกใน manager.line.biz)
//
// กติกา: ปุ่มเป็น action ชนิด "message" (ส่งข้อความเข้าแชท) ไม่ใช่ URI
//        → ข้อความที่สมาชิกกดจะเข้ากระบวนการตอบกลับอัตโนมัติ/บอตได้ทันทีและนับผลได้
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const OA_ID = process.env.LINE_OA_ID || '@923jrlgz';
const DESKTOP = execFileSync('powershell', ['-NoProfile', '-Command',
  "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
const OUT = path.join(DESKTOP, 'QR-AITREE', 'LINE-OA');
mkdirSync(OUT, { recursive: true });

const W = 2500, H = 1686;              // สเปก LINE rich menu ขนาดใหญ่
const NAVY = '#0b2b5b', GREEN = '#06C755';

const cells = [
  { icon: '💰', title: 'สอบถามรายได้', sub: 'ค่าคอม · รายได้ · แผนตำแหน่ง', msg: 'สอบถามรายได้และค่าคอมมิชชั่น' },
  { icon: '🤝', title: 'สมัครเป็นตัวแทน', sub: 'ขั้นตอน · เอกสาร · สอบใบอนุญาต', msg: 'ต้องการสมัครเป็นตัวแทนประกัน' },
  { icon: '🛠', title: 'แจ้งปัญหาการใช้ระบบ', sub: 'เข้าใช้ไม่ได้ · ข้อมูลไม่ตรง · ใบเสร็จ', msg: 'แจ้งปัญหาการใช้งานระบบ' },
];

const FONT = `'Leelawadee UI','Sarabun','Tahoma',sans-serif`;
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:2500px;height:1686px;font-family:${FONT};background:${NAVY};color:#fff;
       display:flex;flex-direction:column;padding:70px 70px 60px}
  .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:56px}
  .brand{font-size:64px;font-weight:700;letter-spacing:.02em}
  .brand small{display:block;font-size:34px;font-weight:400;opacity:.8;margin-top:10px;letter-spacing:.06em}
  .oa{font-size:40px;background:${GREEN};color:#fff;padding:16px 34px;border-radius:999px;font-weight:700}
  .grid{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:44px}
  .cell{background:#ffffff;color:#0b1f12;border-radius:44px;padding:56px 46px;display:flex;flex-direction:column;justify-content:center;text-align:center}
  .icon{font-size:150px;line-height:1}
  .t{font-size:80px;font-weight:700;margin-top:30px;line-height:1.15}
  .s{font-size:40px;color:#41506b;margin-top:22px;line-height:1.45}
  .go{margin-top:34px;font-size:42px;font-weight:700;color:${GREEN}}
  .foot{margin-top:44px;font-size:36px;opacity:.85;text-align:center;line-height:1.5}
  .foot b{color:${GREEN}}
</style></head><body>
  <div class="head">
    <div class="brand">AI INSURANCE NETWORK TREE<small>ทีมงานตอบกลับพร้อม AI ผู้ช่วยอัตโนมัติ</small></div>
    <div class="oa">LINE ${OA_ID}</div>
  </div>
  <div class="grid">
    ${cells.map(c => `<div class="cell"><div class="icon">${c.icon}</div><div class="t">${c.title}</div><div class="s">${c.sub}</div><div class="go">แตะเพื่อคุย ›</div></div>`).join('')}
  </div>
  <div class="foot">แตะหัวข้อที่ต้องการ แล้วทีมงานจะเห็นข้อความของคุณทันที — หรือ<b>พิมพ์คำถามเองได้เลยในช่องแชท</b></div>
</body></html>`;

const htmlPath = path.join(OUT, 'line-oa-richmenu.html');
writeFileSync(htmlPath, html, 'utf8');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const png = path.join(OUT, 'line-oa-richmenu-2500x1686.png');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=' + path.join(OUT, '.chrome-shot').replace(/\\/g, '/'),
  '--force-device-scale-factor=1', `--window-size=${W},${H}`,
  `--screenshot=${png.replace(/\\/g, '/')}`, 'file:///' + htmlPath.replace(/\\/g, '/')],
  { stdio: 'ignore', timeout: 120000 });

// โครงสร้างริชเมนู (โซน 3 คอลัมน์เท่ากัน) — พร้อมอัปโหลดผ่าน Messaging API หรือใช้เป็นคู่มือกรอกในหน้าเว็บ
const richmenu = {
  size: { width: W, height: H },
  selected: true,
  name: 'เมนูหลัก — ทีมงาน/AI',
  chatBarText: 'เมนูคุยกับทีมงาน',
  areas: cells.map((c, i) => ({
    bounds: { x: Math.round((W / 3) * i), y: 0, width: Math.round(W / 3), height: H },
    action: { type: 'message', text: c.msg },
    label_th: c.title,
  })),
};
const jsonPath = path.join(OUT, 'line-oa-richmenu.json');
writeFileSync(jsonPath, JSON.stringify(richmenu, null, 2));

const textPack = `# ข้อความสำหรับ OA ${OA_ID} — คัดลอกวางใน manager.line.biz

## 1) ข้อความต้อนรับ (Greeting message) — เปิดใน LINE OA Manager → ข้อความต้อนรับ
สวัสดีครับ 🙏 ยินดีต้อนรับสู่ AI Insurance Network Tree
ทีมงานตอบกลับพร้อม AI ผู้ช่วยอัตโนมัติ — เลือกหัวข้อด้านล่างหรือพิมพ์คำถามได้เลยครับ

## 2) ตอบกลับอัตโนมัติตามคำสำคัญ (Auto-reply / Keyword)
| คำสำคัญที่จับ | ข้อความตอบกลับ |
|---|---|
| รายได้, ค่าคอม, คอมมิชชั่น | เรื่องรายได้/ค่าคอม: แจ้งรหัสตัวแทน + เดือนที่ต้องการตรวจสอบ ทีมงานจะส่งสรุปให้ครับ (ตรวจยอดเองได้ที่หน้า "ค่าคอมมิชชั่น" ในระบบ) |
| สมัคร, ตัวแทน, สนใจ | ยินดีครับ! ขั้นตอน: กรอกใบสมัครที่ ${'https://ai-insurance-network-tree.vercel.app/recruit'} → ทีมงานตรวจ → นัดสอบ → แต่งตั้ง ใช้เวลา 3-7 วันครับ |
| ปัญหา, ใช้ไม่ได้, ล็อกอินไม่ได้ | ขอบคุณที่แจ้งครับ 🙏 ส่งภาพหน้าจอ + อีเมลที่ใช้เข้าใช้มาในแชทนี้ ทีมงานตรวจให้ภายใน 1 วันทำการ |
| ใบเสร็จ, สลิป, หลักฐาน | แนบสลิปในแชทได้เลยครับ ระบบจะตรวจรูปแบบใบเสร็จ (เลขใบเสร็จ/เลขอ้างอิง/ยอด/วันที่/รหัสตัวแทน) แล้วแจ้งผลกลับ |

## 3) ข้อความเมื่อไม่มีทีมงาน (Away message) — เปิดช่วง 20:00-08:00
ขณะนี้เลยเวลาทำการครับ 🌙 ฝากข้อความไว้ได้เลย ทีมงานจะตอบกลับในเช้าวันถัดไป
(ระบบ AI จะตอบคำถามเบื้องต้นให้ทันที)

## 4) ริชเมนู — ปุ่ม 3 ปุ่ม (ใช้ภาพ line-oa-richmenu-2500x1686.png)
| ปุ่ม | ชนิด | ค่าที่ตั้ง |
|---|---|---|
| 💰 สอบถามรายได้ | ส่งข้อความ | สอบถามรายได้และค่าคอมมิชชั่น |
| 🤝 สมัครเป็นตัวแทน | ส่งข้อความ | ต้องการสมัครเป็นตัวแทนประกัน |
| 🛠 แจ้งปัญหาการใช้ระบบ | ส่งข้อความ | แจ้งปัญหาการใช้งานระบบ |
(แถบเมนู: "เมนูคุยกับทีมงาน")

## วิธีอัปโหลดริชเมนู
1. manager.line.biz → เลือก OA → Rich menus → Create rich menu → อัปโหลดภาพ line-oa-richmenu-2500x1686.png
2. เลือกพื้นที่ 3 ช่องเท่ากัน แล้วตั้ง action ตามตารางข้างบน (ชนิด "ส่งข้อความ")
3. กด Set as default → ให้สมาชิกทุกคนเห็นเมนูนี้
`;
const packPath = path.join(OUT, 'line-oa-text-pack.md');
writeFileSync(packPath, textPack, 'utf8');

const st = statSync(png);
console.log(JSON.stringify({
  png, bytes: st.size, under_1MB: st.size < 1024 * 1024, size_px: `${W}x${H}`,
  json: jsonPath, text_pack: packPath,
  areas: richmenu.areas.map(a => ({ x: a.bounds.x, w: a.bounds.width, action: a.action.text })),
}, null, 2));
