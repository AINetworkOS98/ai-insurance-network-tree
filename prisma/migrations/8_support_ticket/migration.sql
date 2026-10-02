-- Support Center (Phase 1) — Ticket system
-- เขียนแบบ idempotent (IF NOT EXISTS / duplicate_object guard)
-- เพื่อให้ปลอดภัยกรณีตารางถูกสร้างไปแล้วด้วย prisma db push

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "public"."SupportStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."SupportTicket" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "lineId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "public"."SupportStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "closedAt" TIMESTAMPTZ,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "public"."SupportMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON "public"."SupportTicket"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx" ON "public"."SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_idx" ON "public"."SupportMessage"("ticketId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "public"."SupportTicket"
    ADD CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "public"."SupportMessage"
    ADD CONSTRAINT "SupportMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
