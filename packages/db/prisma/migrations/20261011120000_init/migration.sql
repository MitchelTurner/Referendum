-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('MEETINGS', 'ASK', 'NOTIFY', 'PARTICIPATION', 'LIVE', 'MINUTES_AI', 'BOARDS', 'RECORDS', 'SERVICES', 'EMBEDS');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'CLERK', 'DEPUTY_CLERK', 'STAFF', 'REVIEWER', 'MEMBER', 'CHAIR', 'VIEWER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'NOTICED', 'PACKET_PUBLISHED', 'IN_PROGRESS', 'RECESSED', 'ADJOURNED', 'MINUTES_DRAFT', 'MINUTES_ADOPTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('CONSENT', 'PUBLIC_HEARING', 'NEW_BUSINESS', 'UNFINISHED_BUSINESS', 'REPORT', 'PRESENTATION', 'CORRESPONDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'READY', 'PUBLISHED', 'HEARD', 'CONTINUED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'APPROVED', 'RETURNED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('SUPPORT', 'OPPOSE', 'NEUTRAL');

-- CreateEnum
CREATE TYPE "TestimonyMode" AS ENUM ('IN_PERSON', 'PHONE');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('YES', 'NO', 'ABSTAIN', 'ABSENT', 'RECUSED');

-- CreateEnum
CREATE TYPE "SubscriptionKind" AS ENUM ('MATTER', 'BODY', 'ADDRESS', 'DIGEST', 'TOPIC');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('EN', 'TL', 'ES');

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Government" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Anchorage',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Government_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernmentModule" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "module" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernmentModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Body" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "defaultLocation" TEXT,
    "speakerSeconds" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Body_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seat" (
    "id" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "appointingGovernmentId" TEXT,
    "appointmentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "isChair" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "bodyId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "noticePostedAt" TIMESTAMP(3),
    "packetPublishedAt" TIMESTAMP(3),
    "videoProvider" TEXT,
    "videoRef" TEXT,
    "recordingStartedAt" TIMESTAMP(3),
    "currentItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caseNumber" TEXT,
    "kind" TEXT NOT NULL,
    "summaryEn" TEXT,
    "summaryApprovedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterEvent" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "bodyId" TEXT,
    "meetingId" TEXT,
    "occurredAt" TIMESTAMP(3),
    "projectedFor" TIMESTAMP(3),
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "matterId" TEXT,
    "position" TEXT NOT NULL,
    "sortKey" INTEGER NOT NULL,
    "type" "ItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'DRAFT',
    "commentsCloseAt" TIMESTAMP(3),
    "testimonyOpen" BOOLEAN NOT NULL DEFAULT false,
    "videoOffsetSec" INTEGER,
    "authorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewStep" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "assigneeUserId" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT,
    "matterId" TEXT,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1024),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redline" (
    "id" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "fromDocumentId" TEXT NOT NULL,
    "toDocumentId" TEXT NOT NULL,
    "diffJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicComment" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "residentId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "position" "Position" NOT NULL DEFAULT 'NEUTRAL',
    "body" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onTime" BOOLEAN NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hiddenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeakerSignup" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "residentId" TEXT,
    "displayName" TEXT NOT NULL,
    "mode" "TestimonyMode" NOT NULL,
    "phone" TEXT,
    "queuePosition" INTEGER NOT NULL,
    "calledAt" TIMESTAMP(3),
    "spokeSeconds" INTEGER,
    "notifiedTwoAway" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeakerSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motion" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "moverPersonId" TEXT,
    "seconderPersonId" TEXT,
    "result" TEXT,
    "source" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "transcriptStartSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "motionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "value" "VoteValue" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictDeclaration" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "chairRuling" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConflictDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "lang" "Lang" NOT NULL DEFAULT 'EN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "kind" "SubscriptionKind" NOT NULL,
    "matterId" TEXT,
    "bodyId" TEXT,
    "address" TEXT,
    "point" geography(Point,4326),
    "radiusFt" INTEGER,
    "channels" "Channel"[],
    "confirmedAt" TIMESTAMP(3),
    "topic" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "parcelNumber" TEXT NOT NULL,
    "situsAddress" TEXT,
    "geom" geography(MultiPolygon,4326),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterParcel" (
    "matterId" TEXT NOT NULL,
    "parcelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatterParcel_pkey" PRIMARY KEY ("matterId","parcelId")
);

-- CreateTable
CREATE TABLE "NoticeRule" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "bodyId" TEXT,
    "itemType" "ItemType",
    "daysBefore" INTEGER,
    "codeCitation" TEXT,
    "mailedRadiusFt" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoticeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "lang" "Lang" NOT NULL,
    "text" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskQuery" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "matterId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "citedPageIds" TEXT[],
    "answered" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffQuestion" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "askedByPersonId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "answeredByUserId" TEXT,
    "distributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "totpSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT,
    "actorUserId" TEXT,
    "actorResidentId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stats" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRule" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL,
    "retainYears" INTEGER,
    "citation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "residentId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OneTimeCode" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "userId" TEXT,
    "residentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneTimeCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "destination" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobFailure" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "governmentId" TEXT,
    "meetingId" TEXT,
    "payload" JSONB,
    "error" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAudit" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "governmentId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "outputText" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveTimer" (
    "meetingId" TEXT NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "durationSec" INTEGER NOT NULL DEFAULT 180,
    "remainingMs" INTEGER NOT NULL DEFAULT 180000,
    "runningSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveTimer_pkey" PRIMARY KEY ("meetingId")
);

-- CreateTable
CREATE TABLE "BoardApplication" (
    "id" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "residentId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "matterId" TEXT,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_slug_key" ON "Region"("slug");

-- CreateIndex
CREATE INDEX "Government_regionId_idx" ON "Government"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "GovernmentModule_governmentId_module_key" ON "GovernmentModule"("governmentId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "Body_governmentId_code_key" ON "Body"("governmentId", "code");

-- CreateIndex
CREATE INDEX "Seat_bodyId_idx" ON "Seat"("bodyId");

-- CreateIndex
CREATE INDEX "Term_seatId_endsOn_idx" ON "Term"("seatId", "endsOn");

-- CreateIndex
CREATE INDEX "Meeting_startsAt_idx" ON "Meeting"("startsAt");

-- CreateIndex
CREATE INDEX "Meeting_bodyId_idx" ON "Meeting"("bodyId");

-- CreateIndex
CREATE INDEX "Matter_governmentId_caseNumber_idx" ON "Matter"("governmentId", "caseNumber");

-- CreateIndex
CREATE INDEX "MatterEvent_matterId_order_idx" ON "MatterEvent"("matterId", "order");

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_sortKey_idx" ON "AgendaItem"("meetingId", "sortKey");

-- CreateIndex
CREATE INDEX "AgendaItem_matterId_idx" ON "AgendaItem"("matterId");

-- CreateIndex
CREATE INDEX "ReviewStep_agendaItemId_order_idx" ON "ReviewStep"("agendaItemId", "order");

-- CreateIndex
CREATE INDEX "ReviewStep_assigneeUserId_idx" ON "ReviewStep"("assigneeUserId");

-- CreateIndex
CREATE INDEX "Document_agendaItemId_idx" ON "Document"("agendaItemId");

-- CreateIndex
CREATE INDEX "Document_matterId_idx" ON "Document"("matterId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "DocumentChunk_pageId_idx" ON "DocumentChunk"("pageId");

-- CreateIndex
CREATE INDEX "Redline_matterId_idx" ON "Redline"("matterId");

-- CreateIndex
CREATE INDEX "PublicComment_agendaItemId_idx" ON "PublicComment"("agendaItemId");

-- CreateIndex
CREATE INDEX "SpeakerSignup_agendaItemId_queuePosition_idx" ON "SpeakerSignup"("agendaItemId", "queuePosition");

-- CreateIndex
CREATE INDEX "Motion_agendaItemId_idx" ON "Motion"("agendaItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_motionId_personId_key" ON "Vote"("motionId", "personId");

-- CreateIndex
CREATE INDEX "ConflictDeclaration_agendaItemId_idx" ON "ConflictDeclaration"("agendaItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_email_key" ON "Resident"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_phone_key" ON "Resident"("phone");

-- CreateIndex
CREATE INDEX "Subscription_residentId_idx" ON "Subscription"("residentId");

-- CreateIndex
CREATE INDEX "Subscription_matterId_idx" ON "Subscription"("matterId");

-- CreateIndex
CREATE INDEX "Subscription_kind_idx" ON "Subscription"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "Parcel_governmentId_parcelNumber_key" ON "Parcel"("governmentId", "parcelNumber");

-- CreateIndex
CREATE INDEX "NoticeRule_governmentId_idx" ON "NoticeRule"("governmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entityType_entityId_field_lang_key" ON "Translation"("entityType", "entityId", "field", "lang");

-- CreateIndex
CREATE INDEX "AskQuery_regionId_createdAt_idx" ON "AskQuery"("regionId", "createdAt");

-- CreateIndex
CREATE INDEX "AskQuery_matterId_idx" ON "AskQuery"("matterId");

-- CreateIndex
CREATE INDEX "StaffQuestion_agendaItemId_idx" ON "StaffQuestion"("agendaItemId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_governmentId_key" ON "Membership"("userId", "governmentId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_governmentId_at_idx" ON "AuditLog"("governmentId", "at");

-- CreateIndex
CREATE INDEX "ImportJob_governmentId_idx" ON "ImportJob"("governmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionRule_governmentId_documentKind_key" ON "RetentionRule"("governmentId", "documentKind");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_residentId_idx" ON "Session"("residentId");

-- CreateIndex
CREATE INDEX "OneTimeCode_destination_purpose_idx" ON "OneTimeCode"("destination", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_idempotencyKey_key" ON "OutboundMessage"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobFailure_queue_createdAt_idx" ON "JobFailure"("queue", "createdAt");

-- CreateIndex
CREATE INDEX "AiAudit_requestId_idx" ON "AiAudit"("requestId");

-- CreateIndex
CREATE INDEX "AiAudit_feature_createdAt_idx" ON "AiAudit"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "BoardApplication_seatId_idx" ON "BoardApplication"("seatId");

-- CreateIndex
CREATE UNIQUE INDEX "AskCache_cacheKey_key" ON "AskCache"("cacheKey");

-- AddForeignKey
ALTER TABLE "Government" ADD CONSTRAINT "Government_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GovernmentModule" ADD CONSTRAINT "GovernmentModule_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Body" ADD CONSTRAINT "Body_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "Body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seat" ADD CONSTRAINT "Seat_appointingGovernmentId_fkey" FOREIGN KEY ("appointingGovernmentId") REFERENCES "Government"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Term" ADD CONSTRAINT "Term_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "Body"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_summaryApprovedByUserId_fkey" FOREIGN KEY ("summaryApprovedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterEvent" ADD CONSTRAINT "MatterEvent_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterEvent" ADD CONSTRAINT "MatterEvent_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "Body"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterEvent" ADD CONSTRAINT "MatterEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStep" ADD CONSTRAINT "ReviewStep_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewStep" ADD CONSTRAINT "ReviewStep_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redline" ADD CONSTRAINT "Redline_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicComment" ADD CONSTRAINT "PublicComment_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerSignup" ADD CONSTRAINT "SpeakerSignup_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeakerSignup" ADD CONSTRAINT "SpeakerSignup_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_moverPersonId_fkey" FOREIGN KEY ("moverPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_seconderPersonId_fkey" FOREIGN KEY ("seconderPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Motion" ADD CONSTRAINT "Motion_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_motionId_fkey" FOREIGN KEY ("motionId") REFERENCES "Motion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictDeclaration" ADD CONSTRAINT "ConflictDeclaration_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictDeclaration" ADD CONSTRAINT "ConflictDeclaration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_bodyId_fkey" FOREIGN KEY ("bodyId") REFERENCES "Body"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterParcel" ADD CONSTRAINT "MatterParcel_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterParcel" ADD CONSTRAINT "MatterParcel_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoticeRule" ADD CONSTRAINT "NoticeRule_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Translation" ADD CONSTRAINT "Translation_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskQuery" ADD CONSTRAINT "AskQuery_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffQuestion" ADD CONSTRAINT "StaffQuestion_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffQuestion" ADD CONSTRAINT "StaffQuestion_askedByPersonId_fkey" FOREIGN KEY ("askedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffQuestion" ADD CONSTRAINT "StaffQuestion_answeredByUserId_fkey" FOREIGN KEY ("answeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRule" ADD CONSTRAINT "RetentionRule_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFailure" ADD CONSTRAINT "JobFailure_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveTimer" ADD CONSTRAINT "LiveTimer_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardApplication" ADD CONSTRAINT "BoardApplication_seatId_fkey" FOREIGN KEY ("seatId") REFERENCES "Seat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardApplication" ADD CONSTRAINT "BoardApplication_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Tenant row-level security and an append-only audit log.

CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), '') = 'on';
$$;

CREATE OR REPLACE FUNCTION app_visible(gov text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_bypass()
    OR (
      gov IS NOT NULL
      AND gov = ANY (string_to_array(coalesce(current_setting('app.government_ids', true), ''), ','))
    );
$$;

CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;

CREATE TRIGGER audit_log_no_mutation
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE INDEX "DocumentChunk_embedding_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "Parcel_geom_idx" ON "Parcel" USING GIST ("geom");
CREATE INDEX "Subscription_point_idx" ON "Subscription" USING GIST ("point");

DO $$ DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'Government','GovernmentModule','Body','Seat','Term','Meeting','Matter','MatterEvent','AgendaItem',
    'ReviewStep','Document','DocumentPage','DocumentChunk','Redline','PublicComment','SpeakerSignup',
    'Motion','Vote','ConflictDeclaration','Parcel','MatterParcel','NoticeRule','Membership','AuditLog',
    'ImportJob','RetentionRule','StaffQuestion','BoardApplication','LiveTimer','OutboundMessage','JobFailure'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;

CREATE POLICY government_all ON "Government" FOR ALL USING (app_visible(id)) WITH CHECK (app_visible(id));
CREATE POLICY government_module_all ON "GovernmentModule" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY body_all ON "Body" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY seat_all ON "Seat" FOR ALL USING (
  app_bypass() OR EXISTS (SELECT 1 FROM "Body" b WHERE b.id = "Seat"."bodyId" AND app_visible(b."governmentId"))
) WITH CHECK (
  app_bypass() OR EXISTS (SELECT 1 FROM "Body" b WHERE b.id = "Seat"."bodyId" AND app_visible(b."governmentId"))
);
CREATE POLICY term_all ON "Term" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Seat" s JOIN "Body" b ON b.id = s."bodyId"
    WHERE s.id = "Term"."seatId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Seat" s JOIN "Body" b ON b.id = s."bodyId"
    WHERE s.id = "Term"."seatId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY meeting_all ON "Meeting" FOR ALL USING (
  app_bypass() OR EXISTS (SELECT 1 FROM "Body" b WHERE b.id = "Meeting"."bodyId" AND app_visible(b."governmentId"))
) WITH CHECK (
  app_bypass() OR EXISTS (SELECT 1 FROM "Body" b WHERE b.id = "Meeting"."bodyId" AND app_visible(b."governmentId"))
);
CREATE POLICY matter_all ON "Matter" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY matter_event_all ON "MatterEvent" FOR ALL USING (
  app_bypass() OR EXISTS (SELECT 1 FROM "Matter" m WHERE m.id = "MatterEvent"."matterId" AND app_visible(m."governmentId"))
) WITH CHECK (
  app_bypass() OR EXISTS (SELECT 1 FROM "Matter" m WHERE m.id = "MatterEvent"."matterId" AND app_visible(m."governmentId"))
);
CREATE POLICY agenda_item_all ON "AgendaItem" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Meeting" m JOIN "Body" b ON b.id = m."bodyId"
    WHERE m.id = "AgendaItem"."meetingId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Meeting" m JOIN "Body" b ON b.id = m."bodyId"
    WHERE m.id = "AgendaItem"."meetingId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY review_step_all ON "ReviewStep" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "ReviewStep"."agendaItemId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "ReviewStep"."agendaItemId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY document_all ON "Document" FOR ALL USING (
  app_bypass() OR (
    "agendaItemId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
      WHERE i.id = "Document"."agendaItemId" AND app_visible(b."governmentId")
    )
  ) OR (
    "matterId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Matter" mat WHERE mat.id = "Document"."matterId" AND app_visible(mat."governmentId")
    )
  )
) WITH CHECK (
  app_bypass() OR (
    "agendaItemId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
      WHERE i.id = "Document"."agendaItemId" AND app_visible(b."governmentId")
    )
  ) OR (
    "matterId" IS NOT NULL AND EXISTS (
      SELECT 1 FROM "Matter" mat WHERE mat.id = "Document"."matterId" AND app_visible(mat."governmentId")
    )
  )
);
CREATE POLICY document_page_all ON "DocumentPage" FOR ALL USING (
  EXISTS (SELECT 1 FROM "Document" d WHERE d.id = "DocumentPage"."documentId")
) WITH CHECK (
  EXISTS (SELECT 1 FROM "Document" d WHERE d.id = "DocumentPage"."documentId")
);
CREATE POLICY document_chunk_all ON "DocumentChunk" FOR ALL USING (
  EXISTS (SELECT 1 FROM "DocumentPage" p WHERE p.id = "DocumentChunk"."pageId")
) WITH CHECK (
  EXISTS (SELECT 1 FROM "DocumentPage" p WHERE p.id = "DocumentChunk"."pageId")
);
CREATE POLICY redline_all ON "Redline" FOR ALL USING (
  app_bypass() OR EXISTS (SELECT 1 FROM "Matter" m WHERE m.id = "Redline"."matterId" AND app_visible(m."governmentId"))
) WITH CHECK (
  app_bypass() OR EXISTS (SELECT 1 FROM "Matter" m WHERE m.id = "Redline"."matterId" AND app_visible(m."governmentId"))
);
CREATE POLICY comment_all ON "PublicComment" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "PublicComment"."agendaItemId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "PublicComment"."agendaItemId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY speaker_all ON "SpeakerSignup" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "SpeakerSignup"."agendaItemId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "SpeakerSignup"."agendaItemId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY motion_all ON "Motion" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "Motion"."agendaItemId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "Motion"."agendaItemId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY vote_all ON "Vote" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Motion" mo JOIN "AgendaItem" i ON i.id = mo."agendaItemId"
    JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE mo.id = "Vote"."motionId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Motion" mo JOIN "AgendaItem" i ON i.id = mo."agendaItemId"
    JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE mo.id = "Vote"."motionId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY conflict_all ON "ConflictDeclaration" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "ConflictDeclaration"."agendaItemId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "ConflictDeclaration"."agendaItemId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY staff_question_all ON "StaffQuestion" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "StaffQuestion"."agendaItemId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "AgendaItem" i JOIN "Meeting" m ON m.id = i."meetingId" JOIN "Body" b ON b.id = m."bodyId"
    WHERE i.id = "StaffQuestion"."agendaItemId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY parcel_all ON "Parcel" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY matter_parcel_all ON "MatterParcel" FOR ALL USING (
  app_bypass() OR EXISTS (SELECT 1 FROM "Matter" m WHERE m.id = "MatterParcel"."matterId" AND app_visible(m."governmentId"))
) WITH CHECK (
  app_bypass() OR EXISTS (SELECT 1 FROM "Matter" m WHERE m.id = "MatterParcel"."matterId" AND app_visible(m."governmentId"))
);
CREATE POLICY notice_rule_all ON "NoticeRule" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY membership_all ON "Membership" FOR ALL USING (
  app_bypass() OR app_visible("governmentId") OR "userId" = coalesce(current_setting('app.user_id', true), '')
) WITH CHECK (
  app_bypass() OR app_visible("governmentId") OR "userId" = coalesce(current_setting('app.user_id', true), '')
);
CREATE POLICY audit_select ON "AuditLog" FOR SELECT USING (
  app_bypass()
  OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
  OR ("governmentId" IS NULL AND "actorUserId" IS NOT NULL AND "actorUserId" = coalesce(current_setting('app.user_id', true), ''))
);
CREATE POLICY audit_insert ON "AuditLog" FOR INSERT WITH CHECK (
  app_bypass()
  OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
  OR ("governmentId" IS NULL AND "actorUserId" IS NOT NULL AND "actorUserId" = coalesce(current_setting('app.user_id', true), ''))
);
CREATE POLICY import_job_all ON "ImportJob" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY retention_all ON "RetentionRule" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY application_all ON "BoardApplication" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Seat" s JOIN "Body" b ON b.id = s."bodyId"
    WHERE s.id = "BoardApplication"."seatId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Seat" s JOIN "Body" b ON b.id = s."bodyId"
    WHERE s.id = "BoardApplication"."seatId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY live_timer_all ON "LiveTimer" FOR ALL USING (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Meeting" m JOIN "Body" b ON b.id = m."bodyId"
    WHERE m.id = "LiveTimer"."meetingId" AND app_visible(b."governmentId")
  )
) WITH CHECK (
  app_bypass() OR EXISTS (
    SELECT 1 FROM "Meeting" m JOIN "Body" b ON b.id = m."bodyId"
    WHERE m.id = "LiveTimer"."meetingId" AND app_visible(b."governmentId")
  )
);
CREATE POLICY outbound_all ON "OutboundMessage" FOR ALL USING (
  app_bypass() OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
) WITH CHECK (
  app_bypass() OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
);
CREATE POLICY job_failure_all ON "JobFailure" FOR ALL USING (
  app_bypass() OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
) WITH CHECK (
  app_bypass() OR ("governmentId" IS NOT NULL AND app_visible("governmentId"))
);
