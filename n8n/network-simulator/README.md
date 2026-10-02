# 1 แตก 5 – Future Network Simulator (ระบบจำลองเครือข่าย)

ระบบทดลองโครงสร้างเครือข่าย "1 แตก N" + จักรวาล 3D + Promotion Rule Engine + Event Timeline
ทำงานบน Next.js (แอปหลัก) + n8n (Workflow Automation) โดยเก็บข้อมูลจำลองแยกจากข้อมูลจริงทั้งหมด

## หลักการที่ยึด (สำคัญ)
- ข้อมูลจำลองอยู่ตาราง `network_sims · sim_members · sim_events · sim_payments` และมี `simulation = true` ทุกแถว — **ห้ามนำไปรวมกับตัวเลขจริง**
- สูตร/เงื่อนไขเลื่อนตำแหน่งอยู่ในตาราง `promotion_rules` เท่านั้น (แก้ได้โดยไม่ต้องแก้โค้ด/ไม่ฝังใน frontend)
- โหมด demo ออกได้แค่ **ใบเสร็จ DEMO + watermark** "SIMULATION / DEMO – ไม่ใช่หลักฐานการชำระเงินจริง" และ **ไม่ตั้ง `payment_verified = true`**
- โหมด live ต้องมี `Authorization: Bearer $CRON_SECRET` และยังไม่ตั้ง verified จนกว่าจะยืนยันกับผู้ให้บริการชำระเงินจริง
- ทุกหน้าจอมีข้อความ: "ตัวเลขทั้งหมดเป็นการจำลอง/สมมติเพื่อวางแผนเท่านั้น ไม่ใช่การรับประกันรายได้"

## โครงสร้างไฟล์
```
n8n/network-simulator/
├── workflows/sim-01..sim-06.json      # workflow n8n 6 ตัว (import แล้ว/active)
├── scripts/build_sim_workflows.py     # สร้าง workflow JSON
├── scripts/import_sim_workflows.py    # import เข้า n8n (SQLite ตรง) + export สำรองทุก workflow
└── README.md
```
ฝั่งแอป:
```
src/lib/sim.ts                                  # กติกา/ตัวช่วยกลาง (watermark, disclaimer, promotion)
src/app/api/sim/{run,state,member,check,promotion-check,payment,rules,events,stats}/route.ts
src/components/NetworkSimulator.tsx             # Control Center (ซ้าย=ปุ่มทดลอง · กลาง=จักรวาล · ขวา=Member · ล่าง=Timeline)
src/components/NetworkUniverse3D.tsx            # จักรวาล 3D (react-three-fiber)
src/components/FutureNetworkTeaser.tsx          # ส่วนย่อที่ต่อท้ายหน้า /financial-freedom
src/app/network-simulator/page.tsx              # หน้าเต็ม /network-simulator
prisma/migrations/10_network_simulator/         # ตาราง + seed กฎ 2 ข้อ
```

## n8n Workflow (webhook → แอป)
| # | Workflow | Webhook | ปลายทาง |
|---|----------|---------|---------|
| 01 | Member Created | `POST /webhook/member-created` | `/api/sim/member` |
| 02 | Check 1-to-5 Structure | `GET /webhook/check-1-to-5?code=M0001` | `/api/sim/check` |
| 03 | Promotion Rule Engine | `POST /webhook/promotion-check` | `/api/sim/promotion-check` |
| 04 | Payment Verification (DEMO) | `POST /webhook/payment-verified` | `/api/sim/payment` |
| 05 | Simulation Start/Reset | `POST /webhook/simulation-start` | `/api/sim/run` |
| 06 | Event Log & Network Update | `GET /webhook/network-update` | `/api/sim/state` |

Event types: `SIMULATION_STARTED · SIMULATION_RESET · SIMULATION_UPDATED · NETWORK_UPDATED · MEMBER_CREATED · LEVEL_COMPLETED · QUALIFICATION_COMPLETED · PROMOTION_ELIGIBLE · PROMOTION_APPROVED · PAYMENT_SUBMITTED · PAYMENT_VERIFIED · COMMISSION_CREATED`

## วิธีใช้
- หน้าเว็บ: `/network-simulator` (เต็ม) หรือส่วนย่อท้าย `/financial-freedom`
- ปุ่มสำคัญ: `▶ เริ่ม Simulation` (สร้างโครงสร้างทั้งชุด) · `⏵ เติบโตทีละคน` (สร้างสมาชิกทีละคน เห็นดาวหางวิ่ง) · `🔍 ตรวจเงื่อนไข` · `✅ อนุมัติ (จำลอง)` · `🧾 ใบเสร็จ DEMO` · `🧹 ล้าง Simulation`
- Toggle `SIMULATION | REAL DATA` แยกแหล่งข้อมูลชัดเจน (โหมด REAL ไม่วาดสมาชิกจริงบนจักรวาล เพราะ PDPA — แสดงเฉพาะจำนวน)

## import workflow เข้า n8n (บนเครื่องนี้)
```bash
python n8n/network-simulator/scripts/build_sim_workflows.py      # สร้าง JSON
python n8n/network-simulator/scripts/import_sim_workflows.py     # import + export สำรอง
# รีสตาร์ท n8n แล้วตรวจว่าลงทะเบียนจริง
python -c "import sqlite3;c=sqlite3.connect('C:/Users/User/.n8n/database.sqlite');print(c.execute('select method,webhookPath from webhook_entity').fetchall())"
```
**กับดัก n8n 2.x (สำคัญ):** การ insert แถวใน `workflow_entity` อย่างเดียว **ไม่พอ** — webhook จะไม่ลงทะเบียน ถ้า
(1) `versionId != activeVersionId` หรือไม่มีแถวใน `workflow_history` ที่ตรงกับ `activeVersionId`
(2) `settings` ไม่มี `executionOrder: "v1"`
ตัวช่วยตรวจคือตาราง `webhook_entity` (ถ้า webhook ไม่โผล่ที่นี่ = ยังไม่ active จริง)

## ผลทดสอบ (ของจริง)
- API (production): **17/17 ผ่าน** — โครงสร้าง 1→5→25→125, `simulation=true` ทุกโหนด, เพิ่มสมาชิก → `LEVEL_COMPLETED`, ใบเสร็จ DEMO + watermark, demo ไม่ตั้ง verified, live ไม่มี Bearer = 401, ประเมิน/อนุมัติจำลอง, timeline ครบ 9 event types, stats แยก REAL/SIM
- Webhook n8n → แอป production: **8/8 ผ่าน** (ทั้ง 6 webhook + event เข้า timeline จริง)
- หน้าเว็บ: DOM มี `<canvas>` (จักรวาล 3D), แผงครบทั้ง 4 ด้าน, ตัวเลข Layer, ข้อความ disclaimer

## ข้อจำกัดที่รู้อยู่
- `sim_members` ใช้โครงสร้างแบบ "กำหนดให้" (deterministic) จากการตั้งค่า — ไม่ใช่ข้อมูลสมาชิกจริง
- ยังไม่ต่อผู้ให้บริการชำระเงินจริง → โหมด live บันทึกเป็น `pending` เสมอ (โดยเจตนา)
- สรุปผลใน Code node ของ n8n บางฟิลด์ (memberCode/treeDepth) ยังเป็น null ทั้งที่การเรียกแอปสำเร็จจริง — ควรปรับ mapping ใน node สรุปผล
- โฟลเดอร์นี้เคยถูกลบ (ไม่ทราบสาเหตุ) จึงมี `n8n/_exports/` เก็บ workflow ทั้งหมดเป็นสำเนาสำรอง
