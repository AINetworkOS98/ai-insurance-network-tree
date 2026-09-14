-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'RESIGNED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."MemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'RESIGNED');

-- CreateEnum
CREATE TYPE "public"."ProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'INTERESTED', 'APPOINTMENT', 'FOLLOW_UP', 'PREPARING_DOCUMENTS', 'APPLIED', 'CONVERTED', 'NOT_INTERESTED', 'UNREACHABLE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."IncomeStatus" AS ENUM ('ESTIMATED', 'PENDING', 'APPROVED', 'PAID', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "public"."PlacementPolicy" AS ENUM ('STRICT_HISTORY', 'VACANCY_REFILL');

-- CreateEnum
CREATE TYPE "public"."PayoutStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'PAID', 'REVERSED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "prefix" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "dob" DATE,
    "province" TEXT,
    "branch" TEXT,
    "avatarUrl" TEXT,
    "sponsorId" UUID,
    "placementParentId" UUID,
    "managerId" UUID,
    "memberCode" TEXT,
    "referralCode" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'PENDING',
    "rankLevel" INTEGER NOT NULL DEFAULT 0,
    "rankUpdatedAt" TIMESTAMPTZ,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "pdpaConsentVersion" TEXT,
    "pdpaConsentedAt" TIMESTAMP(3),
    "tosVersion" TEXT,
    "tosConsentedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "lastActiveAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConsentRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "consentedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemberProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "memberId" TEXT NOT NULL,
    "prospectId" UUID,
    "status" "public"."MemberStatus" NOT NULL DEFAULT 'PENDING',
    "branchName" TEXT,
    "regionName" TEXT,
    "licenseStatus" TEXT,
    "trainingStatus" TEXT,
    "idCardHash" TEXT,
    "idCardLast4" TEXT,
    "directSponsorId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMPTZ,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemberStatusHistory" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ,
    "approvedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TreeNode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "directCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TreePlacement" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "policy" "public"."PlacementPolicy" NOT NULL DEFAULT 'STRICT_HISTORY',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TreePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlacementRun" (
    "id" UUID NOT NULL,
    "jobId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedBy" UUID,
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ,
    "totalQueued" INTEGER NOT NULL DEFAULT 0,
    "totalSuccess" INTEGER NOT NULL DEFAULT 0,
    "totalSkipped" INTEGER NOT NULL DEFAULT 0,
    "totalFailed" INTEGER NOT NULL DEFAULT 0,
    "scopeTeamId" UUID,

    CONSTRAINT "PlacementRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlacementRunEntry" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "slot" INTEGER,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementRunEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlacementHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "parentId" UUID,
    "slot" INTEGER,
    "level" INTEGER,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "changedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Position" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "icon" TEXT,
    "color" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PositionRule" (
    "id" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "description" TEXT,

    CONSTRAINT "PositionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MemberQualification" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "progress" JSONB,
    "isQualified" BOOLEAN NOT NULL DEFAULT false,
    "evaluatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PerformanceRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "policyRef" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "period" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IncomeRuleVersion" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMPTZ NOT NULL,
    "effectiveTo" TIMESTAMPTZ,
    "rules" JSONB NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IncomeTransaction" (
    "id" UUID NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "ruleVersionId" UUID,
    "policyRef" TEXT,
    "type" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "status" "public"."IncomeStatus" NOT NULL DEFAULT 'ESTIMATED',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMPTZ,
    "reversalOfId" UUID,
    "payoutBatchId" UUID,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayoutBatch" (
    "id" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdBy" UUID,
    "approvedBy" UUID,
    "paidAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payout" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinancialDocument" (
    "id" UUID NOT NULL,
    "docNo" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "period" TEXT,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "netAmount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL,
    "qrHash" TEXT,
    "issuedBy" UUID,
    "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ,
    "pdfUrl" TEXT,

    CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentVerification" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "memberId" UUID,
    "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Partner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "brandGuideline" TEXT,
    "approvedBy" UUID,
    "startAt" TIMESTAMPTZ,
    "endAt" TIMESTAMPTZ,
    "disclaimer" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMPTZ,
    "validTo" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RolePermission" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PermissionScope" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "depth" INTEGER,

    CONSTRAINT "PermissionScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuVisibility" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "menuKey" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FieldVisibility" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FieldVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Prospect" (
    "id" UUID NOT NULL,
    "prospectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickname" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "province" TEXT,
    "occupation" TEXT,
    "ageRange" TEXT,
    "leadSourceId" UUID,
    "referralCode" TEXT,
    "sponsorId" UUID,
    "interest" TEXT,
    "assignedTo" UUID,
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."ProspectStatus" NOT NULL DEFAULT 'NEW',
    "consentStatus" TEXT,
    "lastContactAt" TIMESTAMPTZ,
    "nextFollowUpAt" TIMESTAMPTZ,
    "ownerId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeadSource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectAssignment" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "assigneeId" UUID NOT NULL,
    "assignedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectActivity" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "userId" UUID,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectStatusHistory" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectDocument" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectConsent" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProspectConversion" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "userId" UUID,
    "memberId" UUID,
    "convertedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedBy" UUID,

    CONSTRAINT "ProspectConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Appointment" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "channel" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "referenceId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailTemplate" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailTemplateVersion" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailMessage" (
    "id" UUID NOT NULL,
    "eventId" UUID,
    "idempotencyKey" TEXT,
    "templateId" UUID,
    "templateVersion" INTEGER,
    "toEmail" TEXT NOT NULL,
    "toUserId" UUID,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "status" "public"."EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "queuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailRecipient" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "EmailRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailDeliveryLog" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "status" "public"."EmailStatus" NOT NULL,
    "providerResponse" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailFailure" (
    "id" UUID NOT NULL,
    "messageId" UUID,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailSuppression" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduledReport" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "frequency" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'th',
    "sendAt" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReportDeliveryLog" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,

    CONSTRAINT "ReportDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventOutbox" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recipientId" UUID,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "appName" TEXT NOT NULL DEFAULT 'AI INSURANCE NETWORK OS',
    "appNameEn" TEXT DEFAULT 'AI INSURANCE NETWORK OS',
    "logoUrl" TEXT,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT,
    "email" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailVerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReferralCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sponsorship" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "sponsorId" UUID NOT NULL,
    "referralCode" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SponsorshipHistory" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "oldSponsorId" UUID,
    "newSponsorId" UUID,
    "reason" TEXT NOT NULL,
    "changedBy" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorshipHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlacementQueue" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sponsorId" UUID,
    "queueNo" SERIAL NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptFile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT,
    "storageUrl" TEXT,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Uploaded',
    "submissionAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentAt" TIMESTAMPTZ,
    "policyApprovedAt" TIMESTAMPTZ,
    "verifiedAt" TIMESTAMPTZ,
    "creditedPeriod" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ReceiptFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptExtraction" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "issuerName" TEXT,
    "receiptNo" TEXT,
    "transactionRef" TEXT,
    "policyNo" TEXT,
    "payerName" TEXT,
    "paidAt" TIMESTAMPTZ,
    "amount" DECIMAL(18,2),
    "type" TEXT,
    "periodLabel" TEXT,
    "agentCode" TEXT,
    "qrBarcode" TEXT,
    "confidence" JSONB,
    "rawOcr" JSONB,
    "correctedBy" UUID,
    "originalValues" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptVerification" (
    "id" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "verifiedBy" UUID,
    "verifiedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PerformanceLedger" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "receiptId" UUID,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reversalOfId" UUID,
    "periodSnapshotId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RankPlan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "validFrom" TIMESTAMPTZ,
    "validTo" TIMESTAMPTZ,
    "sourceRef" TEXT,
    "createdBy" UUID,
    "isLegacyRef" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RankPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RankRule" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "targetRank" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "personalMin" DECIMAL(18,2),
    "teamMin" DECIMAL(18,2),
    "qualifiedUnits" INTEGER,
    "qualifiedCenters" INTEGER,
    "durationMinMonths" INTEGER,
    "durationMaxMonths" INTEGER,
    "licenseRequired" BOOLEAN NOT NULL DEFAULT false,
    "evalType" TEXT NOT NULL DEFAULT 'auto',
    "description" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RankHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromRank" INTEGER NOT NULL,
    "toRank" INTEGER NOT NULL,
    "planId" UUID,
    "result" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CalendarPeriod" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "cutoffAt" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PeriodRule" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT,
    "cutoffAt" TIMESTAMPTZ NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MonthlySnapshot" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "rankLevel" INTEGER NOT NULL,
    "planVersion" TEXT,
    "verifiedAmount" DECIMAL(18,2) NOT NULL,
    "pendingAmount" DECIMAL(18,2) NOT NULL,
    "rejectedAmount" DECIMAL(18,2) NOT NULL,
    "remainingToTarget" DECIMAL(18,2),
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PeriodAdjustment" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" UUID,
    "isReversal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenancePlan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "cycle" TEXT NOT NULL,
    "graceMonths" INTEGER NOT NULL DEFAULT 0,
    "allowedFailCycles" INTEGER NOT NULL DEFAULT 1,
    "warnDaysBefore" INTEGER[] DEFAULT ARRAY[7, 3, 1]::INTEGER[],
    "effectDate" TIMESTAMPTZ,
    "createdBy" UUID,
    "isLegacyRef" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceRule" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "targetRank" INTEGER NOT NULL,
    "minAmount" DECIMAL(18,2) NOT NULL,
    "resultType" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MaintenanceResult" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "targetRank" INTEGER NOT NULL,
    "required" DECIMAL(18,2) NOT NULL,
    "verified" DECIMAL(18,2) NOT NULL,
    "remaining" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "decidedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MembershipStatusHistory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "changedBy" UUID,
    "period" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Member" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "memberCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "rankLevel" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."MemberStatus" NOT NULL DEFAULT 'PENDING',
    "sponsorId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Placement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "parentId" UUID,
    "slot" INTEGER,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlacementRequest" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "sponsorId" UUID,
    "idempotencyKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlacementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rank_rules" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "targetRank" INTEGER NOT NULL,
    "metric" TEXT NOT NULL,
    "personalMin" DECIMAL(18,2),
    "teamMin" DECIMAL(18,2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."receipts" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Uploaded',
    "amount" DECIMAL(18,2),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."performance_ledger" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."monthly_closures" (
    "id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "snapshots" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_outbox" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIMemory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AIMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_memberCode_key" ON "public"."User"("memberCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "public"."User"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "public"."UserSession"("tokenHash");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "public"."UserSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_userId_key" ON "public"."MemberProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_memberId_key" ON "public"."MemberProfile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_prospectId_key" ON "public"."MemberProfile"("prospectId");

-- CreateIndex
CREATE INDEX "Membership_memberId_idx" ON "public"."Membership"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "TreeNode_userId_key" ON "public"."TreeNode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TreePlacement_childId_key" ON "public"."TreePlacement"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "TreePlacement_idempotencyKey_key" ON "public"."TreePlacement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TreePlacement_parentId_idx" ON "public"."TreePlacement"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "TreePlacement_parentId_slot_key" ON "public"."TreePlacement"("parentId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementRun_jobId_key" ON "public"."PlacementRun"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementRun_idempotencyKey_key" ON "public"."PlacementRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PlacementRunEntry_runId_idx" ON "public"."PlacementRunEntry"("runId");

-- CreateIndex
CREATE INDEX "PlacementHistory_userId_idx" ON "public"."PlacementHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_code_key" ON "public"."Position"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MemberQualification_memberId_positionId_key" ON "public"."MemberQualification"("memberId", "positionId");

-- CreateIndex
CREATE INDEX "PerformanceRecord_userId_period_idx" ON "public"."PerformanceRecord"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeRuleVersion_version_key" ON "public"."IncomeRuleVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeTransaction_transactionId_key" ON "public"."IncomeTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeTransaction_reversalOfId_key" ON "public"."IncomeTransaction"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeTransaction_idempotencyKey_key" ON "public"."IncomeTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IncomeTransaction_userId_period_status_idx" ON "public"."IncomeTransaction"("userId", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutBatch_batchNo_key" ON "public"."PayoutBatch"("batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialDocument_docNo_key" ON "public"."FinancialDocument"("docNo");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "public"."Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "public"."Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "public"."RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "public"."UserRole"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionScope_roleId_scope_key" ON "public"."PermissionScope"("roleId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "MenuVisibility_roleId_menuKey_key" ON "public"."MenuVisibility"("roleId", "menuKey");

-- CreateIndex
CREATE UNIQUE INDEX "FieldVisibility_roleId_field_key" ON "public"."FieldVisibility"("roleId", "field");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_prospectId_key" ON "public"."Prospect"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_name_key" ON "public"."LeadSource"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectConversion_prospectId_key" ON "public"."ProspectConversion"("prospectId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_eventKey_channel_key" ON "public"."NotificationPreference"("userId", "eventKey", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "public"."EmailTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplateVersion_templateId_version_key" ON "public"."EmailTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_idempotencyKey_key" ON "public"."EmailMessage"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "public"."EmailSuppression"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EventOutbox_eventId_key" ON "public"."EventOutbox"("eventId");

-- CreateIndex
CREATE INDEX "EventOutbox_status_createdAt_idx" ON "public"."EventOutbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuthIdentity_userId_idx" ON "public"."AuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_providerUserId_key" ON "public"."AuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_email_key" ON "public"."AuthIdentity"("provider", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "public"."EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_idx" ON "public"."EmailVerificationToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "public"."PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "public"."PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "public"."ReferralCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "public"."ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_code_idx" ON "public"."ReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsorship_childId_key" ON "public"."Sponsorship"("childId");

-- CreateIndex
CREATE INDEX "Sponsorship_sponsorId_idx" ON "public"."Sponsorship"("sponsorId");

-- CreateIndex
CREATE INDEX "SponsorshipHistory_childId_idx" ON "public"."SponsorshipHistory"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementQueue_userId_key" ON "public"."PlacementQueue"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementQueue_queueNo_key" ON "public"."PlacementQueue"("queueNo");

-- CreateIndex
CREATE INDEX "PlacementQueue_queueNo_idx" ON "public"."PlacementQueue"("queueNo");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptFile_fileHash_key" ON "public"."ReceiptFile"("fileHash");

-- CreateIndex
CREATE INDEX "ReceiptFile_userId_status_idx" ON "public"."ReceiptFile"("userId", "status");

-- CreateIndex
CREATE INDEX "ReceiptFile_fileHash_idx" ON "public"."ReceiptFile"("fileHash");

-- CreateIndex
CREATE INDEX "ReceiptExtraction_receiptId_idx" ON "public"."ReceiptExtraction"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptVerification_receiptId_idx" ON "public"."ReceiptVerification"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceLedger_receiptId_key" ON "public"."PerformanceLedger"("receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceLedger_reversalOfId_key" ON "public"."PerformanceLedger"("reversalOfId");

-- CreateIndex
CREATE INDEX "PerformanceLedger_userId_period_idx" ON "public"."PerformanceLedger"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "RankPlan_version_key" ON "public"."RankPlan"("version");

-- CreateIndex
CREATE INDEX "RankRule_planId_idx" ON "public"."RankRule"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "RankRule_planId_targetRank_metric_key" ON "public"."RankRule"("planId", "targetRank", "metric");

-- CreateIndex
CREATE INDEX "RankHistory_userId_idx" ON "public"."RankHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarPeriod_period_key" ON "public"."CalendarPeriod"("period");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodRule_kind_period_key" ON "public"."PeriodRule"("kind", "period");

-- CreateIndex
CREATE INDEX "MonthlySnapshot_period_idx" ON "public"."MonthlySnapshot"("period");

-- CreateIndex
CREATE INDEX "MonthlySnapshot_userId_idx" ON "public"."MonthlySnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_period_userId_key" ON "public"."MonthlySnapshot"("period", "userId");

-- CreateIndex
CREATE INDEX "PeriodAdjustment_period_userId_idx" ON "public"."PeriodAdjustment"("period", "userId");

-- CreateIndex
CREATE INDEX "MaintenanceRule_planId_idx" ON "public"."MaintenanceRule"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceRule_planId_targetRank_key" ON "public"."MaintenanceRule"("planId", "targetRank");

-- CreateIndex
CREATE INDEX "MaintenanceResult_period_status_idx" ON "public"."MaintenanceResult"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceResult_planId_period_userId_key" ON "public"."MaintenanceResult"("planId", "period", "userId");

-- CreateIndex
CREATE INDEX "MembershipStatusHistory_userId_idx" ON "public"."MembershipStatusHistory"("userId");

-- CreateIndex
CREATE INDEX "ReviewRequest_userId_status_idx" ON "public"."ReviewRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "public"."Organization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Member_userId_key" ON "public"."Member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_memberCode_key" ON "public"."Member"("memberCode");

-- CreateIndex
CREATE INDEX "Member_organizationId_idx" ON "public"."Member"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_memberId_key" ON "public"."Placement"("memberId");

-- CreateIndex
CREATE INDEX "Placement_organizationId_idx" ON "public"."Placement"("organizationId");

-- CreateIndex
CREATE INDEX "Placement_parentId_idx" ON "public"."Placement"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_parentId_slot_key" ON "public"."Placement"("parentId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "PlacementRequest_idempotencyKey_key" ON "public"."PlacementRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PlacementRequest_status_idx" ON "public"."PlacementRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_fileHash_key" ON "public"."receipts"("fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_closures_period_key" ON "public"."monthly_closures"("period");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_eventId_key" ON "public"."notification_outbox"("eventId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "public"."AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AIMemory_userId_idx" ON "public"."AIMemory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AIMemory_userId_key_key" ON "public"."AIMemory"("userId", "key");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_placementParentId_fkey" FOREIGN KEY ("placementParentId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemberProfile" ADD CONSTRAINT "MemberProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemberProfile" ADD CONSTRAINT "MemberProfile_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemberStatusHistory" ADD CONSTRAINT "MemberStatusHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TreeNode" ADD CONSTRAINT "TreeNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TreePlacement" ADD CONSTRAINT "TreePlacement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."TreeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TreePlacement" ADD CONSTRAINT "TreePlacement_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlacementRunEntry" ADD CONSTRAINT "PlacementRunEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "public"."PlacementRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PositionRule" ADD CONSTRAINT "PositionRule_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "public"."Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MemberQualification" ADD CONSTRAINT "MemberQualification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceRecord" ADD CONSTRAINT "PerformanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "public"."IncomeRuleVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "public"."IncomeTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IncomeTransaction" ADD CONSTRAINT "IncomeTransaction_payoutBatchId_fkey" FOREIGN KEY ("payoutBatchId") REFERENCES "public"."PayoutBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."PayoutBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVerification" ADD CONSTRAINT "DocumentVerification_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."FinancialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVerification" ADD CONSTRAINT "DocumentVerification_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."MemberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PermissionScope" ADD CONSTRAINT "PermissionScope_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Prospect" ADD CONSTRAINT "Prospect_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "public"."LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Prospect" ADD CONSTRAINT "Prospect_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectAssignment" ADD CONSTRAINT "ProspectAssignment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectActivity" ADD CONSTRAINT "ProspectActivity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectActivity" ADD CONSTRAINT "ProspectActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectStatusHistory" ADD CONSTRAINT "ProspectStatusHistory_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectDocument" ADD CONSTRAINT "ProspectDocument_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectConsent" ADD CONSTRAINT "ProspectConsent_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProspectConversion" ADD CONSTRAINT "ProspectConversion_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Appointment" ADD CONSTRAINT "Appointment_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "public"."Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailMessage" ADD CONSTRAINT "EmailMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."EmailTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailRecipient" ADD CONSTRAINT "EmailRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailDeliveryLog" ADD CONSTRAINT "EmailDeliveryLog_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReportDeliveryLog" ADD CONSTRAINT "ReportDeliveryLog_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."ScheduledReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReferralCode" ADD CONSTRAINT "ReferralCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sponsorship" ADD CONSTRAINT "Sponsorship_childId_fkey" FOREIGN KEY ("childId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sponsorship" ADD CONSTRAINT "Sponsorship_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlacementQueue" ADD CONSTRAINT "PlacementQueue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptFile" ADD CONSTRAINT "ReceiptFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptExtraction" ADD CONSTRAINT "ReceiptExtraction_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "public"."ReceiptFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptVerification" ADD CONSTRAINT "ReceiptVerification_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "public"."ReceiptFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PerformanceLedger" ADD CONSTRAINT "PerformanceLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RankRule" ADD CONSTRAINT "RankRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."RankPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RankHistory" ADD CONSTRAINT "RankHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RankHistory" ADD CONSTRAINT "RankHistory_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."RankPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MonthlySnapshot" ADD CONSTRAINT "MonthlySnapshot_period_fkey" FOREIGN KEY ("period") REFERENCES "public"."CalendarPeriod"("period") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PeriodAdjustment" ADD CONSTRAINT "PeriodAdjustment_period_fkey" FOREIGN KEY ("period") REFERENCES "public"."CalendarPeriod"("period") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceRule" ADD CONSTRAINT "MaintenanceRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MaintenanceResult" ADD CONSTRAINT "MaintenanceResult_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Placement" ADD CONSTRAINT "Placement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Placement" ADD CONSTRAINT "Placement_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlacementRequest" ADD CONSTRAINT "PlacementRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIMemory" ADD CONSTRAINT "AIMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

