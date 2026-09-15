-- AlterTable: เพิ่มฟิลด์มาตรฐานตั้งค่า/สมัคร — ที่อยู่ละเอียด + โซเชียล
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "addressLine" TEXT,
ADD COLUMN IF NOT EXISTS "zipCode" TEXT,
ADD COLUMN IF NOT EXISTS "lineId" TEXT,
ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT,
ADD COLUMN IF NOT EXISTS "tiktokUrl" TEXT;
