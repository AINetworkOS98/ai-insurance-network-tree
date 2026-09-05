# AI Insurance Network Tree — ระบบบริหารเครือข่ายตัวแทนประกัน

**ต้นไม้ฐานกว้าง 5 คน • Prospect CRM • Income Engine แบบมี Version • Email แบบ Idempotent • RBAC แบบ Dynamic**

## Quick Start
```bash
npm install
cp .env.example .env   # ใส่ DATABASE_URL
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed   # ข้อมูลทดลอง — ติดป้ายชัดเจน
npm run dev          # http://localhost:3000
```

## Tech
Next.js 15 App Router + TypeScript + Tailwind + Prisma + PostgreSQL (Supabase) + Supabase Auth + Resend/SES + React Flow + Recharts

## หลักการสำคัญ
- ห้ามสร้างสมาชิก/รายได้ปลอม • ตำแหน่งว่างแสดง “ว่าง” ไม่นับผลงาน/รายได้
- Prospect ไม่กิน Slot ในต้นไม้จนกว่าอนุมัติ • รายได้ทุกบาทอ้างอิงผลงาน + Rule Version
- อัตราค่าตอบแทนแก้ได้จาก Admin ไม่ hard-code • ทุกการแก้ไขมี Audit Log (append-only)
- Deny by Default • ตรวจสิทธิ์ 3 ชั้น: UI → API → RLS • เงิน Decimal • เวลา UTC แสดง Asia/Bangkok

## Placement Algorithm (ฐาน 5)
`src/lib/tree.ts` — BFS Level-Order: ตรวจ parent ที่ขอก่อน → ถ้าเต็มค้นหาชั้นถัดไปซ้าย→ขวา → UNIQUE(parent,slot) + Row Lock + Idempotency Key

## Income Engine
`src/lib/income.ts` — `income_rule_versions.rules` (JSONB) คำนวณ → Estimated → Approved → Paid + PDF/QR → Reversal ไม่ลบเดิม

## Email
`src/lib/email.ts` — Event ID + Idempotency Key + Template Version + Queue + Retry/Backoff + DLQ + Suppression List

## API
`POST /api/auth/register` `POST /api/auth/verify-otp` `POST /api/members/approve` `POST /api/tree/place-member` `GET /api/tree/available-slots` `GET /api/income/summary` `GET /api/admin/audit-logs`
