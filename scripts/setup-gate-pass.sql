-- Gate Pass Management System Database Setup
-- Run this script to add Gate Pass functionality to existing database

-- CreateEnum for Gate Pass Reason
DO $$ BEGIN
    CREATE TYPE "GatePassReason" AS ENUM ('BUSINESS', 'DISCIPLINE', 'SICK', 'PERSONAL', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum for Gate Pass Status  
DO $$ BEGIN
    CREATE TYPE "GatePassStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'USED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateEnum for Gate Pass Approval Status
DO $$ BEGIN
    CREATE TYPE "GatePassApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable for Gate Passes
CREATE TABLE IF NOT EXISTS "gate_passes" (
    "id" TEXT NOT NULL,
    "passNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reasonType" "GatePassReason" NOT NULL,
    "reasonDetail" TEXT,
    "location" TEXT NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "status" "GatePassStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Gate Pass Approvals
CREATE TABLE IF NOT EXISTS "gate_pass_approvals" (
    "id" TEXT NOT NULL,
    "gatePassId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "approvalLevel" INTEGER NOT NULL,
    "status" "GatePassApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_pass_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes (only if they don't exist)
DO $$ BEGIN
    CREATE UNIQUE INDEX "gate_passes_passNumber_key" ON "gate_passes"("passNumber");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "gate_passes_userId_idx" ON "gate_passes"("userId");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "gate_passes_status_idx" ON "gate_passes"("status");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "gate_passes_startDateTime_idx" ON "gate_passes"("startDateTime");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
    CREATE UNIQUE INDEX "gate_pass_approvals_gatePassId_approvalLevel_key" ON "gate_pass_approvals"("gatePassId", "approvalLevel");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "gate_pass_approvals_gatePassId_idx" ON "gate_pass_approvals"("gatePassId");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "gate_pass_approvals_approverId_idx" ON "gate_pass_approvals"("approverId");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;

-- AddForeignKeys (with error handling)
DO $$ BEGIN
    ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "gate_pass_approvals" ADD CONSTRAINT "gate_pass_approvals_gatePassId_fkey" 
    FOREIGN KEY ("gatePassId") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "gate_pass_approvals" ADD CONSTRAINT "gate_pass_approvals_approverId_fkey" 
    FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Verification queries
SELECT 'Gate Pass tables created successfully' as status;
SELECT COUNT(*) as gate_passes_count FROM "gate_passes";
SELECT COUNT(*) as gate_pass_approvals_count FROM "gate_pass_approvals";

-- Show enum values
SELECT enumlabel as gate_pass_reasons FROM pg_enum WHERE enumtypid = 'GatePassReason'::regtype;
SELECT enumlabel as gate_pass_statuses FROM pg_enum WHERE enumtypid = 'GatePassStatus'::regtype;
SELECT enumlabel as approval_statuses FROM pg_enum WHERE enumtypid = 'GatePassApprovalStatus'::regtype;