-- Phase 2 public records requests.

CREATE TYPE "RecordsStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'NEED_INFO', 'FULFILLED', 'DENIED', 'WITHDRAWN');

CREATE TABLE "RecordsRule" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "daysToRespond" INTEGER,
    "citation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordsRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordsRequest" (
    "id" TEXT NOT NULL,
    "governmentId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RecordsStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "residentId" TEXT,
    "assigneeUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "denialReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordsRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordsRelease" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authoredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordsRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordsRule_governmentId_key" ON "RecordsRule"("governmentId");
CREATE UNIQUE INDEX "RecordsRequest_governmentId_trackingNumber_key" ON "RecordsRequest"("governmentId", "trackingNumber");
CREATE INDEX "RecordsRequest_governmentId_status_idx" ON "RecordsRequest"("governmentId", "status");
CREATE INDEX "RecordsRelease_requestId_idx" ON "RecordsRelease"("requestId");

ALTER TABLE "RecordsRule" ADD CONSTRAINT "RecordsRule_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordsRequest" ADD CONSTRAINT "RecordsRequest_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordsRequest" ADD CONSTRAINT "RecordsRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecordsRequest" ADD CONSTRAINT "RecordsRequest_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecordsRelease" ADD CONSTRAINT "RecordsRelease_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RecordsRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecordsRelease" ADD CONSTRAINT "RecordsRelease_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecordsRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordsRule" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RecordsRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordsRequest" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RecordsRelease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordsRelease" FORCE ROW LEVEL SECURITY;

CREATE POLICY records_rule_all ON "RecordsRule" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY records_request_all ON "RecordsRequest" FOR ALL USING (app_visible("governmentId")) WITH CHECK (app_visible("governmentId"));
CREATE POLICY records_release_all ON "RecordsRelease" FOR ALL USING (
  EXISTS (
    SELECT 1 FROM "RecordsRequest" request
    WHERE request.id = "RecordsRelease"."requestId" AND app_visible(request."governmentId")
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM "RecordsRequest" request
    WHERE request.id = "RecordsRelease"."requestId" AND app_visible(request."governmentId")
  )
);
