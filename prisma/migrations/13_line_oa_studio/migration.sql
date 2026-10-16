-- 13_line_oa_studio — LINE OA Studio: ข้อความต้อนรับ · ตอบกลับอัตโนมัติ · ริชเมนู · ผู้ติดตาม · บันทึกข้อความ
-- สร้าง 4 ตารางใหม่เท่านั้น (ไม่แตะตารางเดิม)
-- CreateTable
CREATE TABLE "line_oa_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "welcome_enabled" BOOLEAN NOT NULL DEFAULT true,
    "welcome_messages" JSONB NOT NULL DEFAULT '[]',
    "greet_enabled" BOOLEAN NOT NULL DEFAULT false,
    "greet_messages" JSONB NOT NULL DEFAULT '[]',
    "greet_every_hours" INTEGER NOT NULL DEFAULT 24,
    "auto_reply_enabled" BOOLEAN NOT NULL DEFAULT true,
    "fallback_enabled" BOOLEAN NOT NULL DEFAULT false,
    "fallback_messages" JSONB NOT NULL DEFAULT '[]',
    "menu_keywords" TEXT[] DEFAULT ARRAY['เมนู', 'menu']::TEXT[],
    "menu_messages" JSONB NOT NULL DEFAULT '[]',
    "offline_enabled" BOOLEAN NOT NULL DEFAULT false,
    "offline_start" TEXT NOT NULL DEFAULT '18:00',
    "offline_end" TEXT NOT NULL DEFAULT '08:30',
    "offline_messages" JSONB NOT NULL DEFAULT '[]',
    "default_rich_menu_id" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_oa_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_reply_rule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "match_type" TEXT NOT NULL DEFAULT 'CONTAINS',
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messages" JSONB NOT NULL DEFAULT '[]',
    "rich_menu_id" TEXT,
    "tag" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "line_reply_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_follower" (
    "id" UUID NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "picture_url" TEXT,
    "status_message" TEXT,
    "followed" BOOLEAN NOT NULL DEFAULT true,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "tag" TEXT,
    "note" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ,
    "followed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unfollowed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "line_follower_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_message_log" (
    "id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "line_user_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "match_kind" TEXT,
    "rule_id" TEXT,
    "rule_name" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_message_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "line_reply_rule_enabled_priority_idx" ON "line_reply_rule"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "line_follower_line_user_id_key" ON "line_follower"("line_user_id");

-- CreateIndex
CREATE INDEX "line_follower_followed_idx" ON "line_follower"("followed");

-- CreateIndex
CREATE INDEX "line_message_log_created_at_idx" ON "line_message_log"("created_at");

-- CreateIndex
CREATE INDEX "line_message_log_line_user_id_created_at_idx" ON "line_message_log"("line_user_id", "created_at");

