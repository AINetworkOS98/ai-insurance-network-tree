-- AlterTable: เก็บที่อยู่สมาชิกตอนสมัคร (จังหวัด/อำเภอ/ตำบล)
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "district" TEXT,
ADD COLUMN IF NOT EXISTS "subdistrict" TEXT;
