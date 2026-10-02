-- 9_registration_consent — ระบบสมัครสมาชิก: username/nickname/occupation + Consent Log ตรวจสอบย้อนหลังได้
-- เขียนแบบ idempotent (IF NOT EXISTS / duplicate guard) ให้ปลอดภัยกรณี deploy ซ้ำ
-- Postgres dialect เท่านั้น (-- คอมเมนต์)

-- ── User: เพิ่มฟิลด์ชื่อผู้ใช้/ชื่อเล่น/อาชีพ ──
ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "nickname" TEXT,
  ADD COLUMN IF NOT EXISTS "occupation" TEXT;

-- username ต้องไม่ซ้ำ (Postgres: NULL หลายค่าได้ ไม่ชนกับสมาชิกเดิม)
DO $$ BEGIN
  ALTER TABLE "public"."User" ADD CONSTRAINT "User_username_key" UNIQUE ("username");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

-- ── ConsentRecord: บันทึก granted/source/createdAt เพื่อตรวจสอบย้อนหลัง ──
ALTER TABLE "public"."ConsentRecord"
  ADD COLUMN IF NOT EXISTS "granted" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS "ConsentRecord_userId_type_idx"
  ON "public"."ConsentRecord" ("userId", "type");
