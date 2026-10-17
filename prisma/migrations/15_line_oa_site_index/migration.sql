-- 15_line_oa_site_index — เก็บ "ดัชนีเนื้อหาทุกหน้า" ให้ AI ของ LINE OA / เว็บ ตอบเจาะเนื้อหาแต่ละหน้า
-- เพิ่มคอลัมน์เท่านั้น (ไม่แตะข้อมูลเดิม)
ALTER TABLE "line_oa_config"
  ADD COLUMN IF NOT EXISTS "ai_site_index" TEXT,
  ADD COLUMN IF NOT EXISTS "ai_site_index_at" TIMESTAMPTZ;
