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

### ผู้ส่งอีเมล 2 ทาง — เลือกอัตโนมัติ (`src/lib/mailer.ts`)
1. **SMTP** (ถ้าตั้ง `SMTP_HOST`+`SMTP_USER`+`SMTP_PASS`) — ส่งถึงผู้รับใดก็ได้ **ไม่ต้องมีโดเมนของตัวเอง** (Gmail ใช้ App Password)
2. **Resend** (`EMAIL_API_KEY`+`EMAIL_FROM_ADDRESS`) — ต้อง verify โดเมนก่อนจึงส่งถึงคนอื่นได้

`src/app/api/cron/email-sync/route.ts` เป็น worker ส่งอีเมลจากคิว `EmailMessage` (status=QUEUED, retry ไม่เกิน 3 ครั้ง)
- ถ้าใช้ Resend และ `EMAIL_FROM_ADDRESS` ยังเป็นผู้ส่งทดสอบ (`onboarding@resend.dev`) จะส่งได้ **เฉพาะอีเมลเจ้าของบัญชี Resend** เท่านั้น
- อีเมลถึงสมาชิกคนอื่นจะถูกปฏิเสธ และบันทึกเหตุผลไว้ที่ `EmailFailure` / `EmailDeliveryLog` (ดูได้จาก `lastError` และ `provider.hint` ในผลลัพธ์ของ worker)
- วิธีแก้: ตั้ง SMTP (เร็วสุด) หรือ verify โดเมนที่ https://resend.com/domains แล้วตั้ง `EMAIL_FROM_ADDRESS` เป็นอีเมลบนโดเมนนั้น
- อีเมลการตลาดจะถูกระงับอัตโนมัติถ้าสมาชิกยังไม่ให้ความยินยอม MARKETING หรืออยู่ใน suppression list

## Automation (n8n)
`Registration Sync` → `Email Sync` ถูกเรียกทุก 1 นาทีด้วย `Authorization: Bearer $CRON_SECRET` (outbound เท่านั้น ไม่ต้องเปิด public tunnel)
- `POST /api/cron/registration-sync` — ประมวลผลคิว `EventOutbox` (channel=registration) แบบ idempotent
- `POST /api/cron/email-sync` — ส่งอีเมลที่ค้างในคิว
- ต้องเปิดเครื่องและให้ n8n รันอยู่ (ไม่ใช่บริการ 24/7)

## API
`POST /api/auth/register` `POST /api/consent` `POST /api/auth/verify-otp` `POST /api/members/approve` `POST /api/tree/place-member` `GET /api/tree/available-slots` `GET /api/income/summary` `GET /api/admin/audit-logs` `GET /api/admin/consent`
