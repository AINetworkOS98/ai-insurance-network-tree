-- 14_line_oa_ai — เพิ่มคอลัมน์ "AI ตอบกลับอัตโนมัติ" (Hermes + DeepSeek) ในตาราง line_oa_config
-- เพิ่มคอลัมน์เท่านั้น (ไม่แตะข้อมูล/ตารางเดิม) — ค่าเริ่มต้น = ปิด AI ไว้ก่อน ต้องเปิดจากหน้า /admin/line-oa
ALTER TABLE "line_oa_config"
  ADD COLUMN IF NOT EXISTS "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_mode" TEXT NOT NULL DEFAULT 'fallback',
  ADD COLUMN IF NOT EXISTS "ai_system_prompt" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_knowledge" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_provider" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_model" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_max_chars" INTEGER NOT NULL DEFAULT 900,
  ADD COLUMN IF NOT EXISTS "ai_temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  ADD COLUMN IF NOT EXISTS "ai_per_hour" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS "ai_handoff_keywords" TEXT[] DEFAULT ARRAY['คุยกับเจ้าหน้าที่', 'เจ้าหน้าที่', 'คนจริง', 'ขอคุยกับคน']::TEXT[],
  ADD COLUMN IF NOT EXISTS "ai_handoff_message" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "ai_fail_message" JSONB NOT NULL DEFAULT '[]';
