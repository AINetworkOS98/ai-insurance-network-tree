-- n8n Workflow Watch — ตารางเก็บ "workflow ที่ระบบตรวจจับได้" จาก n8n
-- เขียนแบบ idempotent (IF NOT EXISTS) ให้ปลอดภัยกรณีตารางถูกสร้างไปแล้ว
-- ผู้เรียกใช้: scripts/n8n-workflow-watch.mjs → POST /api/n8n/watch → ตารางนี้ → หน้า /n8n/workflow-3d

CREATE TABLE IF NOT EXISTS "public"."n8n_workflow_watch" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "active"         BOOLEAN NOT NULL DEFAULT false,
    "node_count"     INTEGER NOT NULL DEFAULT 0,
    "n8n_created_at" TIMESTAMPTZ,
    "n8n_updated_at" TIMESTAMPTZ,
    "first_seen_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source"         TEXT NOT NULL DEFAULT 'n8n-local',

    CONSTRAINT "n8n_workflow_watch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "n8n_workflow_watch_first_seen_at_idx" ON "public"."n8n_workflow_watch"("first_seen_at");
CREATE INDEX IF NOT EXISTS "n8n_workflow_watch_last_seen_at_idx"  ON "public"."n8n_workflow_watch"("last_seen_at");
