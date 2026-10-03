-- 11_video_intelligence — ระบบ AI Video Intelligence & Lead Monitoring
-- เพิ่ม: ตาราง video_ai_analysis (ผลวิเคราะห์ของ AI), คอลัมน์สรุปพฤติกรรมใน visitors,
--       และคอลัมน์ processed_at ใน visitor_events (ให้ n8n มาร์กว่าประมวลผลแล้ว กันซ้ำ)
--
-- เขียนแบบ idempotent (IF NOT EXISTS / DO $$ guard) ให้ปลอดภัยเมื่อ deploy ซ้ำ
-- Postgres dialect (Supabase) — ห้ามใช้ syntax ของ SQLite

-- ── 1) visitors: สรุประดับความสนใจเชิงพฤติกรรม (Behavioral Interest Level) ─────
--     เก็บเป็นค่าสรุปเพื่อทำ dashboard/รายงาน โดยยังนับจาก event จริงเท่านั้น
ALTER TABLE "public"."visitors"
  ADD COLUMN IF NOT EXISTS "engagement_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "interest_level" TEXT NOT NULL DEFAULT 'COLD',
  ADD COLUMN IF NOT EXISTS "total_watch_seconds" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "average_watch_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "total_video_views" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_analyzed_at" TIMESTAMPTZ;

-- ── 2) visitor_events: มาร์กจุดที่ n8n ประมวลผลแล้ว ──────────────────────────
ALTER TABLE "public"."visitor_events"
  ADD COLUMN IF NOT EXISTS "processed_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "visitor_events_processed_at_idx"
  ON "public"."visitor_events" ("processed_at");

-- ── 3) video_ai_analysis: ผลวิเคราะห์ของ AI (structured output) ─────────────
CREATE TABLE IF NOT EXISTS "public"."video_ai_analysis" (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "analysis_id"        TEXT NOT NULL,
  "visitor_id"         TEXT,
  "session_id"         TEXT,
  "page"               TEXT,
  "video_id"           TEXT,
  "engagement_score"   INTEGER NOT NULL DEFAULT 0,
  "interest_level"     TEXT NOT NULL DEFAULT 'COLD',
  "watch_probability"  TEXT,
  "returning_visitor"  BOOLEAN NOT NULL DEFAULT false,
  "video_completion"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ai_summary"         TEXT,
  "recommended_action" TEXT,
  "reason"             JSONB,
  "raw"                JSONB,
  "model"              TEXT,
  "send_alert"         BOOLEAN NOT NULL DEFAULT false,
  "alert_sent"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- analysis_id ต้องไม่ซ้ำ (idempotency: n8n ยิงซ้ำต้องไม่เกิดแถวใหม่)
DO $$ BEGIN
  ALTER TABLE "public"."video_ai_analysis" ADD CONSTRAINT "video_ai_analysis_analysis_id_key" UNIQUE ("analysis_id");
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "video_ai_analysis_visitor_id_created_at_idx"
  ON "public"."video_ai_analysis" ("visitor_id", "created_at");
CREATE INDEX IF NOT EXISTS "video_ai_analysis_interest_level_created_at_idx"
  ON "public"."video_ai_analysis" ("interest_level", "created_at");
CREATE INDEX IF NOT EXISTS "video_ai_analysis_engagement_score_idx"
  ON "public"."video_ai_analysis" ("engagement_score");
CREATE INDEX IF NOT EXISTS "video_ai_analysis_created_at_idx"
  ON "public"."video_ai_analysis" ("created_at");
