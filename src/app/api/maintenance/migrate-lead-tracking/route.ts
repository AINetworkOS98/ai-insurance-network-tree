import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/maintenance/migrate-lead-tracking
 * สร้าง "ตารางใหม่" ของระบบ Lead Nurturing (11 ตาราง) — ADDITIVE ONLY
 * ไม่มี DROP · ไม่แตะ/ไม่ลบข้อมูลเดิม · รันซ้ำได้ (idempotent)
 * ต้องมี header: Authorization: Bearer $CRON_SECRET
 * GET = ตรวจว่าตารางครบหรือยัง (อ่านอย่างเดียว)
 */
const NEW_TABLES = ["visitors","visitor_events","videos","video_views","recommendations","follow_ups","engagement_scores","lead_interests","channel_preferences","unsubscribes","agent_tasks"];

const DELTA_SQL = `-- delta.sql — เพิ่มตารางใหม่สำหรับระบบ Lead Nurturing (ADDITIVE ONLY)
-- สร้างจาก prisma schema (103 โมเดล) · ไม่มี DROP · ไม่แตะตารางเดิม · รันซ้ำได้ (idempotent)
-- ตารางใหม่: visitors, visitor_events, videos, video_views, recommendations, follow_ups, engagement_scores, lead_interests, channel_preferences, unsubscribes, agent_tasks

DO $$ BEGIN
  CREATE TYPE "EngagementLevel" AS ENUM ('LOW', 'WARM', 'INTERESTED', 'HIGH_INTENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "visitors" (
    "id" UUID NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "first_visit" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_visit" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_visits" INTEGER NOT NULL DEFAULT 0,
    "total_events" INTEGER NOT NULL DEFAULT 0,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "consent_status" TEXT NOT NULL DEFAULT 'unknown',
    "consent_version" TEXT,
    "consent_at" TIMESTAMPTZ,
    "prospect_id" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "visitor_events" (
    "id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "visitor_id" UUID NOT NULL,
    "session_id" TEXT,
    "prospect_id" UUID,
    "type" TEXT NOT NULL,
    "page_url" TEXT,
    "page_path" TEXT,
    "page_title" TEXT,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_term" TEXT,
    "utm_content" TEXT,
    "video_code" TEXT,
    "video_id" UUID,
    "watch_pct" DOUBLE PRECISION,
    "watch_seconds" INTEGER,
    "score_delta" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "videos" (
    "id" UUID NOT NULL,
    "video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tiktok_id" TEXT,
    "thumbnail_url" TEXT,
    "topic" TEXT,
    "sub_topic" TEXT,
    "target_interest" TEXT,
    "duration_sec" INTEGER,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "transcript" TEXT,
    "cta" TEXT,
    "cta_url" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "video_views" (
    "id" UUID NOT NULL,
    "visitor_id" UUID,
    "prospect_id" UUID,
    "video_id" UUID NOT NULL,
    "session_id" TEXT,
    "source" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "seconds_watched" INTEGER NOT NULL DEFAULT 0,
    "completion_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "is_repeat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "video_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recommendations" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "topic" TEXT,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "match_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channel" TEXT NOT NULL DEFAULT 'email',
    "dedupe_key" TEXT,
    "created_by" TEXT,
    "sent_at" TIMESTAMPTZ,
    "viewed_at" TIMESTAMPTZ,
    "dismissed_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "follow_ups" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "day_offset" INTEGER NOT NULL DEFAULT 0,
    "step_key" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "topic" TEXT,
    "video_id" UUID,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "skip_reason" TEXT,
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "engagement_scores" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "level" "EngagementLevel" NOT NULL DEFAULT 'LOW',
    "breakdown" JSONB,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "last_event_at" TIMESTAMPTZ,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "engagement_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "lead_interests" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'initial',
    "evidence" JSONB,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lead_interests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "channel_preferences" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "email_address" TEXT,
    "line" BOOLEAN NOT NULL DEFAULT false,
    "line_user_id" TEXT,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "web_push" BOOLEAN NOT NULL DEFAULT false,
    "preferred" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "quiet_hours" TEXT,
    "chosen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "channel_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "unsubscribes" (
    "id" UUID NOT NULL,
    "prospect_id" UUID,
    "visitor_id" TEXT,
    "contact" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'all',
    "scope" TEXT NOT NULL DEFAULT 'all',
    "reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'link',
    "token" TEXT,
    "ip_hash" TEXT,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsubscribes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_tasks" (
    "id" UUID NOT NULL,
    "prospect_id" UUID,
    "assignee_id" UUID,
    "created_by_id" UUID,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'open',
    "channel" TEXT,
    "trigger_score" INTEGER,
    "source_event_id" TEXT,
    "payload" JSONB,
    "due_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "visitors_visitor_id_key" ON "visitors"("visitor_id");

CREATE INDEX IF NOT EXISTS "visitors_last_visit_idx" ON "visitors"("last_visit");

CREATE INDEX IF NOT EXISTS "visitors_prospect_id_idx" ON "visitors"("prospect_id");

CREATE INDEX IF NOT EXISTS "visitors_consent_status_idx" ON "visitors"("consent_status");

CREATE UNIQUE INDEX IF NOT EXISTS "visitor_events_event_id_key" ON "visitor_events"("event_id");

CREATE INDEX IF NOT EXISTS "visitor_events_visitor_id_at_idx" ON "visitor_events"("visitor_id", "at");

CREATE INDEX IF NOT EXISTS "visitor_events_prospect_id_at_idx" ON "visitor_events"("prospect_id", "at");

CREATE INDEX IF NOT EXISTS "visitor_events_type_at_idx" ON "visitor_events"("type", "at");

CREATE INDEX IF NOT EXISTS "visitor_events_video_id_idx" ON "visitor_events"("video_id");

CREATE UNIQUE INDEX IF NOT EXISTS "videos_video_id_key" ON "videos"("video_id");

CREATE INDEX IF NOT EXISTS "videos_status_priority_idx" ON "videos"("status", "priority");

CREATE INDEX IF NOT EXISTS "videos_topic_idx" ON "videos"("topic");

CREATE INDEX IF NOT EXISTS "videos_target_interest_idx" ON "videos"("target_interest");

CREATE INDEX IF NOT EXISTS "video_views_prospect_id_video_id_idx" ON "video_views"("prospect_id", "video_id");

CREATE INDEX IF NOT EXISTS "video_views_visitor_id_video_id_idx" ON "video_views"("visitor_id", "video_id");

CREATE INDEX IF NOT EXISTS "video_views_video_id_idx" ON "video_views"("video_id");

CREATE INDEX IF NOT EXISTS "video_views_started_at_idx" ON "video_views"("started_at");

CREATE UNIQUE INDEX IF NOT EXISTS "recommendations_dedupe_key_key" ON "recommendations"("dedupe_key");

CREATE INDEX IF NOT EXISTS "recommendations_prospect_id_status_idx" ON "recommendations"("prospect_id", "status");

CREATE INDEX IF NOT EXISTS "recommendations_video_id_idx" ON "recommendations"("video_id");

CREATE INDEX IF NOT EXISTS "recommendations_status_createdAt_idx" ON "recommendations"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "follow_ups_status_scheduled_at_idx" ON "follow_ups"("status", "scheduled_at");

CREATE INDEX IF NOT EXISTS "follow_ups_prospect_id_day_offset_idx" ON "follow_ups"("prospect_id", "day_offset");

CREATE UNIQUE INDEX IF NOT EXISTS "follow_ups_prospect_id_day_offset_channel_key" ON "follow_ups"("prospect_id", "day_offset", "channel");

CREATE UNIQUE INDEX IF NOT EXISTS "engagement_scores_prospect_id_key" ON "engagement_scores"("prospect_id");

CREATE INDEX IF NOT EXISTS "engagement_scores_level_score_idx" ON "engagement_scores"("level", "score");

CREATE INDEX IF NOT EXISTS "lead_interests_topic_weight_idx" ON "lead_interests"("topic", "weight");

CREATE UNIQUE INDEX IF NOT EXISTS "lead_interests_prospect_id_topic_key" ON "lead_interests"("prospect_id", "topic");

CREATE UNIQUE INDEX IF NOT EXISTS "channel_preferences_prospect_id_key" ON "channel_preferences"("prospect_id");

CREATE UNIQUE INDEX IF NOT EXISTS "unsubscribes_token_key" ON "unsubscribes"("token");

CREATE INDEX IF NOT EXISTS "unsubscribes_prospect_id_idx" ON "unsubscribes"("prospect_id");

CREATE INDEX IF NOT EXISTS "unsubscribes_contact_idx" ON "unsubscribes"("contact");

CREATE INDEX IF NOT EXISTS "unsubscribes_scope_channel_idx" ON "unsubscribes"("scope", "channel");

CREATE INDEX IF NOT EXISTS "unsubscribes_at_idx" ON "unsubscribes"("at");

CREATE INDEX IF NOT EXISTS "agent_tasks_assignee_id_status_idx" ON "agent_tasks"("assignee_id", "status");

CREATE INDEX IF NOT EXISTS "agent_tasks_status_due_at_idx" ON "agent_tasks"("status", "due_at");

CREATE INDEX IF NOT EXISTS "agent_tasks_priority_status_idx" ON "agent_tasks"("priority", "status");

CREATE INDEX IF NOT EXISTS "agent_tasks_prospect_id_idx" ON "agent_tasks"("prospect_id");

ALTER TABLE "visitor_events" ADD CONSTRAINT "visitor_events_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visitor_events" ADD CONSTRAINT "visitor_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "video_views" ADD CONSTRAINT "video_views_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "video_views" ADD CONSTRAINT "video_views_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

function allowed(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return secret.length > 0 && got === secret;
}

async function tableStatus() {
  const rows: Array<{ table_name: string }> = await (prisma as any).$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    NEW_TABLES,
  );
  const have = rows.map((r) => r.table_name);
  return { have, missing: NEW_TABLES.filter((t) => !have.includes(t)), complete: have.length === NEW_TABLES.length };
}

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: 'ต้องมีสิทธิ์ (Bearer CRON_SECRET)' }, { status: 401 });
  const st = await tableStatus();
  const counts: Record<string, number> = {};
  for (const t of NEW_TABLES) {
    try {
      const r: any[] = await (prisma as any).$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
      counts[t] = r?.[0]?.n ?? 0;
    } catch {
      counts[t] = -1;
    }
  }
  return NextResponse.json({ ok: true, ...st, total: NEW_TABLES.length, counts });
}

export async function POST(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: 'ต้องมีสิทธิ์ (Bearer CRON_SECRET)' }, { status: 401 });
  if (process.env.ALLOW_DB_MIGRATION !== '1') {
    return NextResponse.json({ ok: false, error: 'ยังไม่เปิดใช้งาน — ตั้ง env ALLOW_DB_MIGRATION=1 ก่อน' }, { status: 403 });
  }
  const stmts = DELTA_SQL.split(';\n\n').map((s) => {
    const t = s.trim();
    const m = t.match(/^DO \$\$ BEGIN\s*([\s\S]*?);\s*EXCEPTION WHEN duplicate_object THEN NULL; END \$\$$/);
    return m ? m[1].trim() : t;
  }).filter((s) => s && !/^--/.test(s.split('\n')[0].trim()));
  // กันพลาด: สร้าง enum type ให้แน่ใจก่อน (Postgres ไม่มี CREATE TYPE IF NOT EXISTS)
  try {
    await (prisma as any).$executeRawUnsafe(`CREATE TYPE "EngagementLevel" AS ENUM ('LOW','WARM','INTERESTED','HIGH_INTENT')`);
  } catch { /* มีอยู่แล้ว = ปกติ */ }
  const done: string[] = [];
  const failed: Array<{ sql: string; error: string }> = [];
  const benign = /42710|duplicate_object|already exists/i;
  for (const s of stmts) {
    try {
      await (prisma as any).$executeRawUnsafe(s);
      done.push(s.slice(0, 60).replace(/\s+/g, ' '));
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (benign.test(msg)) { done.push('(มีอยู่แล้ว) ' + s.slice(0, 45).replace(/\s+/g, ' ')); continue; }
      failed.push({ sql: s.slice(0, 60).replace(/\s+/g, ' '), error: msg.slice(0, 200) });
    }
  }
  const st = await tableStatus();
  return NextResponse.json({ ok: st.complete && failed.length === 0, executed: done.length, failed, ...st }, { status: st.complete ? 200 : 500 });
}
