-- เพิ่มระบบข้อความสมาชิก (ตอบสมาชิก) + log การแจ้งเตือน email/LINE

-- CreateEnum
CREATE TYPE "public"."MessageStatus" AS ENUM ('PENDING', 'REPLIED');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable MemberMessage
CREATE TABLE "public"."MemberMessage" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "status" "public"."MessageStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "MemberMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable MessageReply
CREATE TABLE "public"."MessageReply" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "repliedBy" UUID NOT NULL,
    "replyMessage" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "MessageReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable NotificationLog
CREATE TABLE "public"."NotificationLog" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "messageId" UUID,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "sentAt" TIMESTAMPTZ,
    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberMessage_memberId_idx" ON "public"."MemberMessage"("memberId");
CREATE INDEX "MemberMessage_status_createdAt_idx" ON "public"."MemberMessage"("status", "createdAt");
CREATE INDEX "MessageReply_messageId_idx" ON "public"."MessageReply"("messageId");
CREATE INDEX "NotificationLog_type_status_idx" ON "public"."NotificationLog"("type", "status");
CREATE INDEX "NotificationLog_createdAt_idx" ON "public"."NotificationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."MemberMessage" ADD CONSTRAINT "MemberMessage_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."MessageReply" ADD CONSTRAINT "MessageReply_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "public"."MemberMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."MessageReply" ADD CONSTRAINT "MessageReply_repliedBy_fkey"
  FOREIGN KEY ("repliedBy") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."NotificationLog" ADD CONSTRAINT "NotificationLog_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "public"."MemberMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
