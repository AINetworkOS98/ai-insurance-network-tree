-- 10_network_simulator — ระบบจำลองเครือข่าย "1 แตก 5" (Network Simulator)
-- ตารางชุดนี้เป็นข้อมูลจำลองทั้งหมด (simulation = true) ห้ามนำไปรวมกับข้อมูลธุรกรรมจริง
-- เขียนแบบ additive ล้วน: สร้างตารางใหม่ 5 ตาราง ไม่แตะตารางเดิม

-- CreateTable
CREATE TABLE "network_sims" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '1 แตก 5 – Future Network Simulator',
    "init_members" INTEGER NOT NULL DEFAULT 1,
    "branch_factor" INTEGER NOT NULL DEFAULT 5,
    "layers" INTEGER NOT NULL DEFAULT 5,
    "growth_rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "months" INTEGER NOT NULL DEFAULT 12,
    "income_plan" TEXT,
    "commission" DECIMAL(12,2) NOT NULL DEFAULT 20000,
    "status" TEXT NOT NULL DEFAULT 'running',
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "network_sims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_members" (
    "id" UUID NOT NULL,
    "sim_id" UUID NOT NULL,
    "member_code" TEXT NOT NULL,
    "parent_code" TEXT,
    "sponsor_code" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "children_count" INTEGER NOT NULL DEFAULT 0,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "promotion_status" TEXT NOT NULL DEFAULT 'none',
    "payment_verified" BOOLEAN NOT NULL DEFAULT false,
    "receipt_id" TEXT,
    "join_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pos_x" DOUBLE PRECISION,
    "pos_y" DOUBLE PRECISION,
    "pos_z" DOUBLE PRECISION,
    "simulation" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sim_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "sim_id" UUID,
    "event_type" TEXT NOT NULL,
    "member_code" TEXT,
    "source" TEXT NOT NULL DEFAULT 'dashboard',
    "simulation" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_rules" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_members" INTEGER NOT NULL DEFAULT 5,
    "min_levels" INTEGER NOT NULL DEFAULT 1,
    "required_payment" TEXT NOT NULL DEFAULT 'verified',
    "required_receipt" BOOLEAN NOT NULL DEFAULT true,
    "commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 20000,
    "conditions" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_payments" (
    "id" UUID NOT NULL,
    "sim_id" UUID,
    "payment_ref" TEXT NOT NULL,
    "member_code" TEXT,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL DEFAULT 'demo',
    "provider" TEXT,
    "receipt_id" TEXT,
    "watermark" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_sims_status_idx" ON "network_sims"("status");
CREATE INDEX "network_sims_created_at_idx" ON "network_sims"("created_at");
CREATE UNIQUE INDEX "sim_members_sim_id_member_code_key" ON "sim_members"("sim_id", "member_code");
CREATE INDEX "sim_members_sim_id_level_idx" ON "sim_members"("sim_id", "level");
CREATE INDEX "sim_members_sim_id_parent_code_idx" ON "sim_members"("sim_id", "parent_code");
CREATE UNIQUE INDEX "sim_events_event_id_key" ON "sim_events"("event_id");
CREATE INDEX "sim_events_sim_id_created_at_idx" ON "sim_events"("sim_id", "created_at");
CREATE INDEX "sim_events_event_type_idx" ON "sim_events"("event_type");
CREATE UNIQUE INDEX "promotion_rules_name_key" ON "promotion_rules"("name");
CREATE INDEX "sim_payments_status_idx" ON "sim_payments"("status");

-- AddForeignKey
ALTER TABLE "sim_members" ADD CONSTRAINT "sim_members_sim_id_fkey" FOREIGN KEY ("sim_id") REFERENCES "network_sims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: กฎการเลื่อนตำแหน่งตั้งต้น (แก้ไขได้ผ่าน API/หลังบ้าน ไม่ฝังในโค้ด)
INSERT INTO "promotion_rules" ("id", "name", "min_members", "min_levels", "required_payment", "required_receipt", "commission_amount", "conditions", "active", "created_at", "updated_at")
VALUES (
  gen_random_uuid(),
  '1-แตก-5 · ตั้งต้น',
  5,
  1,
  'verified',
  true,
  20000,
  '{"note":"ค่าตามกติกาที่ตั้งไว้ในระบบ ไม่ใช่การรับประกันรายได้","requireAllChildrenVerified":true}'::jsonb,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;
