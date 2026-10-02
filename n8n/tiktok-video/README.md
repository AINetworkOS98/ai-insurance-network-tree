# ช่องดูวีดีโอ TikTok @aka989._ (สุ่มต่อเนื่อง)

## ภาพรวม
หน้าเว็บ https://ai-insurance-network-tree.vercel.app/financial-freedom (ส่วนท้ายสุด "ช่องดูวีดีโอ · สุ่มต่อเนื่อง")
ดึงคลิปจากบัญชี **@aka989._** แล้ว **สุ่ม → เล่น → จบ → สุ่มใหม่** วนไปเรื่อย ๆ โดยไม่เล่นคลิปซ้ำติดกัน (จำประวัติ 10 คลิปล่าสุด)

## n8n (local, port 5679)
| workflow | webhook | หน้าที่ |
|---|---|---|
| TikTok Video 01 · Video Sync | `POST /webhook/add-video` | เพิ่มคลิปเข้าคลัง (รับ `{"url": "<tiktok video url>"}`) |
| TikTok Video 02 · Random Video API | `GET /webhook/random-video?sid=<id>` | สุ่มคลิป (คิว + กันซ้ำ) |
| TikTok Video 03 · Next Video API | `GET /webhook/next-video?sid=<id>` | คลิปถัดไปในคิว |
| TikTok Video 04 · Video Analytics | `POST /webhook/video-played` | บันทึกยอดดู/ดูจบ (ลงตาราง `video_views`) |

## API ฝั่งแอป (Vercel)
- `GET /api/videos/next`, `POST /api/videos/played` — เปิดให้ทุกคน (ผู้ชมทั่วไป)
- `POST /api/videos/add`, `GET /api/videos/list` — ต้องมี `Authorization: Bearer $CRON_SECRET`
- `POST /api/videos/add` รองรับ action ดูแลคลัง: `{"action":"pause"|"activate"|"delete","videoId":"V-000001"}`

## ดึงรายการคลิปจากโปรไฟล์ TikTok (ทำไมต้องใช้เบราว์เซอร์)
TikTok ไม่ให้รายการคลิปผ่าน HTTP ตรง ๆ แบบไม่ล็อกอิน (ทดสอบแล้ว: `/api/post/item_list` ได้ 0 ไบต์, `/node/share/user/` ได้ 403, หน้า HTML/embed ไม่มี `itemList`)
วิธีที่ใช้ได้จริง = เปิดโปรไฟล์ด้วย Chrome ที่มี debug port แล้วอ่าน DOM:

```bash
# 1) เปิด Chrome (แยกโปรไฟล์ ไม่กระทบ Chrome ที่ใช้อยู่)
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --user-data-dir=C:/Users/User/cdp-tiktok --profile-directory=Default \
  --remote-debugging-port=9222 --remote-allow-origins=* --no-first-run \
  "https://www.tiktok.com/@aka989._"
# 2) รอ port 9222 แล้วดึงลิงก์ (เลื่อนหน้าจออัตโนมัติจนครบ)
node scripts/sync-profile-videos.js > data/videos.txt
# 3) ยิงเข้าคลังผ่าน n8n
while read -r u; do curl -s -o /dev/null -X POST -H "Content-Type: application/json" \
  -d "{\"url\":\"$u\"}" http://localhost:5679/webhook/add-video; sleep 2; done < data/videos.txt
```

## สถานะล่าสุด
- คลังมี **53 คลิป** จากบัญชี (รายการใน `data/videos.txt`)
- **กรองเฉพาะคลิปเครือข่าย**: ตั้ง `topic='เครือข่าย'` ให้ 13 คลิป (ตัวแทน/ที่ปรึกษา/อิสรภาพทางการเงิน/influencer-creator) และ `paused` อีก 40 คลิป (คลิปรายละเอียดแบบประกัน)
  - `/api/videos/list?status=active` → 13 · `/api/videos/list?status=paused` → 40
  - n8n WF02/WF03 และหน้าเว็บใช้ `status=active` + `topic=เครือข่าย` → สุ่มเฉพาะคลิปเครือข่ายเท่านั้น
- **เล่นจนจบแล้วต่อทันที (ยืนยันจากฐานข้อมูลจริง)**: 33/44 รอบดูในชั่วโมงเดียวกันเป็น `completed=true` `completionPct=100` และ `secondsWatched ≈ durationSec`
  เฉลี่ยเวลาจาก "คลิปจบ" ถึง "คลิปใหม่เริ่ม" = **-0.00 วินาที** (37 คู่) → ต่อเนื่องทันทีตามที่ต้องการ
- ระบบเรียน "ความยาวจริง" ของแต่ละคลิปจากเครื่องเล่นอัตโนมัติ (`onCurrentTime.duration`) แล้วบันทึกลง `durationSec`
- ผู้เล่นจริงบนหน้าเว็บหมุนคลิปเองอัตโนมัติ

### กลไก "จบแล้วต่อทันที" ในโค้ด (`src/components/TikTokChannel.tsx`)
1. ฟัง `message` จากตัวเล่น TikTok (`x-tiktok-player: true`)
   - `onStateChange` value **0** = เล่นจบ → เรียก `advance('ended')` → บันทึกผลดู + `/api/videos/next` ทันที
   - `onCurrentTime` = เก็บความยาวจริง และถ้า `currentTime >= duration - 0.35` ถือว่าจบ (กันเหตุการณ์ไม่มา)
2. มีเวลาสำรอง = ความยาวจริง + 5 วิ (สูงสุด 15 นาที) → ถ้าไม่ได้เหตุการณ์เลยก็ยังวนต่อแน่นอน
3. กันเรียกซ้ำด้วย flag 900 ms (เหตุการณ์ ended มักมาหลายรอบ)

## หมายเหตุ
- การซิงก์อัตโนมัติทุกชั่วโมงต้องมี **TikTok access token (scope `video.list`)** หรือรันสคริปต์เบราว์เซอร์นี้ตามรอบ (Chrome ต้องเปิด port 9222 ไว้)
- เพิ่มคลิปใหม่ทีหลัง: ยิง `POST /webhook/add-video` พร้อม `{"url": "...", "topic": "เครือข่าย"}` เพื่อให้เข้าช่องทันที
- จะพัก/เปิดคลิป: `POST /api/videos/add` (Bearer) `{"action":"pause"|"activate","tiktokId":"..."}`

