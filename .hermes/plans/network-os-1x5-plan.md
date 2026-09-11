# แผนดำเนินงาน AI INSURANCE NETWORK OS — ระบบบริหารเครือข่าย 1 แตก 5

> จากไฟล์ `Downloads/network-management-prompt-th.md` (14 หมวด) เทียบกับโค้ดปัจจุบัน `ai-insurance-network-tree` (Next.js 16 + Prisma 6 + Postgres + Firebase Admin + Resend)

## 1. สรุปผลตรวจโครงการเดิม

| หมวดสเปค | มีแล้ว | ขาด/ไม่ตรง | ความเสี่ยง |
|---|---|---|---|
| **1. เป้าหมาย/ชื่อระบบ แยกแบรนด์** | ชื่อ AI Insurance Network Tree, หน้าแรกมี disclaimer พันธมิตร | ชื่อยัง hardcode, ไม่มีตาราง `system_config` ให้เจ้าของตั้งชื่อเอง; ต้องลบข้อความอ้างอิงบริษัทขายตรงตัวอย่างให้หมด | ต่ำ |
| **2. ตำแหน่ง 5 ขั้น + แยก Rank/Status/Permission** | `Role/Permission/UserRole` + `Position` 6 ขั้น (เกินสเปค) | สเปคกำหนด 0=ผู้สนใจทั่วไป ... 4=ผู้จัดการภาค (5 ขั้นเท่านั้น) — ปัจจุบันมี 6 ขั้น ต้องยุบ/แม็ปใหม่; ยังรวม rank กับ RBAC ปนกัน; ไม่มี middleware ตรวจ API ทุก route, ซ่อนเมนูอย่างเดียว | สูง |
| **3. สมัคร/ล็อกอิน Google + Email** | `/api/auth/login|register|verify-otp` + Firebase Admin | ยังไม่ครบ: Google Login จริง, ยืนยันอีเมล, ลืมรหัส, รีเซ็ตรหัส, ป้องกันบัญชีซ้ำ/Google-link ผิดคน, hash รหัสผ่าน | สูง |
| **4. รหัสอัตโนมัติ/ผู้แนะนำ** | `memberId(P-xxx)/memberId(M-xxx)`, `sponsorId` | ไม่มี `referral_code` unique auto, ไม่มี `sponsor_id` vs `placement_parent_id` vs `manager_id` แยก 3 คอลัมน์, ไม่มี QR/ลิงก์ `/register?ref=`, ไม่มีคิวรอมอบหมาย, แก้ sponsor ไม่ได้ + audit | สูง |
| **5. ผัง 1 แตก 5 + ปุ่มรัน** | `TreeNode/TreePlacement` + `POST /api/tree/place-member` (mock), `lib/tree.ts` มี BFS skeleton | เป็น mock — ไม่มี transaction/for update, ไม่มี queue, ไม่มี 6 ปุ่ม (ดูผัง/จำลอง/ตรวจสอบก่อนรัน/รัน/พัก/ประวัติ), ไม่มี job_id/idempotency พังพร้อมกันเกิน 5 ช่องได้ | สูง |
| **6. กฎขึ้นตำแหน่ง** | `Position` + `compensationRules.ts` | ไม่มี `rank_plans/rank_rules/rank_history` แยกเวอร์ชัน Draft/Active/Archived, ไม่มีแยก เบี้ย/ค่าบำเหน็จ/FYC/COM/COM PLUS, ไม่มีประเมิน auto + อนุมัติ | สูง |
| **7. สแกนใบเสร็จ OCR** | `/documents` + `/api/documents` + `tesseract.js`, `ocr/health` | ไม่มี `receipt_files/receipt_extractions/receipt_verifications`, ไม่มี hash/duplicate, ไม่มี confidence รายช่อง, ไม่มีเทียบกับธุรกรรมจริง, นับยอดทันที (ต้องรอ Verified) | สูง |
| **8. ตัดยอดเดือน/ปี Asia/Bangkok** | `IncomeTransaction.period` แบบ string | ไม่มี `calendar_periods/monthly_snapshots/period_adjustments`, ไม่มี cutoff_at, ไม่มี snapshot ปิดเดือน, ไม่รองรับ ก.พ. 29 วัน/cutoff 23:45 แยกเดือน | สูง |
| **9. แผนรักษายอด/คัดออก** | ไม่มี | ไม่มี `maintenance_plans/maintenance_results/membership_status_history/review_requests` — ต้องมี 2 แผนแยก (ไตรมาส vs เดือน), ไม่หาร 3, ไม่เดาตัวเลข, auto Warning→Suspended→Removed | สูง |
| **10. แจ้งเตือน/อีเมล** | `Notification/EmailMessage` แต่ยังไม่ผูก event จริง | ไม่มีกระดิ่ง + จำนวนไม่อ่าน + ลิงก์ตามสิทธิ, ไม่มีแม่แบบภาษาไทย, ไม่มี queue Pending/Sent/Failed + retry + idempotency (event_id+recipient+channel) | กลาง |
| **11. หน้าจอ 14 หน้า** | มี ~8 หน้า (home/login/dashboard/tree/members/prospects/documents/income/admin) | ขาด: รายชื่อสถานะสมัคร, รหัสแนะนำ+QR, เส้นทางตำแหน่ง, คิวตรวจ, ผลงานรายเดือน/ไตรมาส/ปี, แผนรักษายอด, ศูนย์แจ้งเตือน, ตั้งค่าระบบ — และทุกหน้าขาด loading/empty/error | กลาง |
| **12. DB/Background/Audit** | Prisma มี ~25 models | ขาดตารางตามสเปค ~15 ตาราง (placement_queue/runs, receipt_*, calendar_*, maintenance_*, event_outbox), ไม่มี outbox/worker, ไม่มี signed URL ไฟล์, audit ยังไม่ append-only ทุกธุรกรรม | สูง |
| **13. เกณฑ์รับมอบ 15 ข้อ** | ยังไม่ทำ | ต้องทำเป็นสคริปต์ทดสอบจริง | — |

## 2. ข้อขัดกันที่ต้องตัดสินใจ (ห้ามเดา)

1. **ตำแหน่ง 6 ขั้น → 5 ขั้น**: สเปคหมวด 2 บังคับ 0-4 เท่านั้น (ผู้สนใจทั่วไป/ตัวแทน/ผู้จัดการหน่วย/ศูนย์/ภาค) — โค้ดปัจจุบันมี ผู้จัดการฝ่าย+ผู้อำนวยการ เกิน ต้องยุบเป็น Draft หรือซ่อน
2. **Firebase vs Postgres**: สเปคหมวด 12 บอกให้ใช้เทคโนโลยีเดิมถ้ารองรับ — ปัจจุบันใช้ Postgres (Prisma) + Firebase Admin แบบผสม ต้องเลือก Postgres เป็นหลัก + Firebase เฉพาะ Auth (ตาม `getDb()` ที่เรียก Firestore อยู่) — ต้องรวมให้ชัด
3. **ฐานข้อมูลเดิม**: สเปคบอกให้รักษารหัสสมาชิก + ประวัติธุรกรรม — จะทำ migration script แยก ไม่ drop
4. **เกณฑ์ตัวเลข**: ห้ามนำตัวเลขในภาพ (20k/75k/1.2M, กันยา 3/23:45, ไตรมาส 3k/7.5k/30k) ไปใช้จริง — ใส่เป็น Draft อ้างอิงเท่านั้น
5. **ค่าบำเหน็จ vs เบี้ย**: ห้ามคัดยอดเบี้ยไปเป็น COM โดยตรง — ต้องมี commission_records แยก

## 3. แผนทำเป็น 7 เฟส (เรียงลำดับพึ่งพา)

### เฟส 1 — บัญชีและสิทธิ (หมวด 2+3) — เริ่มก่อน
- แยก `rank` vs `member_status` vs `rbac` ชัดเจน; สร้าง `system_config` ให้แก้ชื่อระบบได้
- ทำ Google OAuth + Email/Password + verify/forgot/reset + ป้องกันบัญชีซ้ำ
- Middleware ตรวจสิทธิ์ทุก `/api/*` (ไม่ใช่แค่ซ่อนเมนู) + ยกเลิก session เมื่อถูกพัก/คัดออก
- หน้าแรกสำหรับผู้สนใจทั่วไป — ไม่โหลดข้อมูลหลังบ้าน

### เฟส 2 — สมาชิกและผู้แนะนำ (หมวด 4)
- เพิ่ม `referral_codes/sponsorships/management_assignments` + unique constraint
- ปุ่มคัดลอก/ลิงก์/QR, เติม `?ref=` ข้าม Google Login, ตรวจวงวน/แนะนำตนเอง, คิวรอมอบหมาย
- แยก 3 คอลัมน์ `sponsor_id / placement_parent_id / manager_id`

### เฟส 3 — ผัง 1 แตก 5 (หมวด 5)
- สร้าง `placement_queue/placement_nodes/placement_runs/placement_history`
- BFS จริง + transaction + `SELECT FOR UPDATE` + unique(parent,slot), idempotencyKey, job_id background
- 6 ปุ่มครบ + จำลอง 781 ตำแหน่ง (แยกข้อมูลจริง) + ประวัติรัน

### เฟส 4 — หลักฐานและยอด (หมวด 7)
- `receipt_files/receipt_extractions/receipt_verifications/payment_transactions/commission_records/performance_ledger`
- Hash/duplicate, confidence รายช่อง, outbox, แยกเบี้ย vs ค่าบำเหน็จ

### เฟส 5 — แผนตำแหน่ง (หมวด 6)
- `ranks/rank_plans/rank_rules/rank_history` พร้อม Draft/Active/Archived + แยก 5 ฐานวัด

### เฟส 6 — ปิดยอดและคัดออก (หมวด 8+9)
- `calendar_periods/period_rules/monthly_snapshots/period_adjustments` + Asia/Bangkok, cutoff, snapshot
- `maintenance_plans/maintenance_rules/maintenance_results/membership_status_history/review_requests` — 2 แผนแยก (ไตรมาส/เดือน), auto ประเมินรายเดือน

### เฟส 7 — แจ้งเตือน/รายงาน/ทดสอบรับมอบ (หมวด 10+11+13)
- ศูนย์แจ้งเตือน + email queue + แม่แบบไทย + ส่งจริง Resend + retry
- เติมหน้าจอให้ครบ 14 + ทดสอบ 15 ข้อพร้อมสคริปต์ `tests/acceptance/*`

## 4. สิ่งที่จะส่งมอบ (หมวด 14)
โค้ดจริง + migrations + `.env.example` ไม่มี secret + seed แยก production + คู่มือผู้ใช้/ผู้ดูแล + วิธีเชื่อม Google/OCR/อีเมล + ผลทดสอบ 15 ข้อ

## 5. ลำดับถัดไป (ต้องยืนยันก่อนเริ่มโค้ด)
1. ยุบตำแหน่งจาก 6 → 5 ขั้นตามสเปคหรือไม่? (แนะนำ: ยุบ)
2. ใช้ Postgres เป็น DB หลัก + Firebase Auth เท่านั้น — ยืนยัน?
3. เริ่มเฟส 1 ทันทีได้เลยหรือรอเจ้าของเติมเกณฑ์ธุรกิจเพิ่มเติม?

> หมายเหตุ: งานรันผัง/ปิดยอด/คัดออก ทุกงานต้องเป็น background job มี idempotency — กดซ้ำไม่ซ้ำข้อมูล (หมวด 5,8,9)
