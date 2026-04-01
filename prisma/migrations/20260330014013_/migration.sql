/*
  Warnings:

  - You are about to drop the column `sector` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `companies` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `feedbacks` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ApproverMode" AS ENUM ('SPECIFIC_USER', 'ROLE_IN_COMPANY', 'ROLE_IN_OFFICE', 'ROLE_IN_DEPARTMENT', 'DEPARTMENT_MANAGERS');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "LeaveApprovalAction" AS ENUM ('APPROVED', 'REJECTED', 'TIMEOUT_ESCALATED', 'TIMEOUT_AUTO_APPROVED', 'TIMEOUT_AUTO_REJECTED', 'FORWARDED');

-- CreateEnum
CREATE TYPE "LeaveTimeoutAction" AS ENUM ('ESCALATE', 'AUTO_APPROVE', 'AUTO_REJECT', 'NOTIFY_ONLY');

-- CreateEnum
CREATE TYPE "LeaveVisibilityScope" AS ENUM ('OWN', 'TEAM', 'DEPARTMENT', 'OFFICE', 'COMPANY');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('MEDICAL', 'SPECIAL', 'PERSONAL', 'OTHER');

-- DropIndex
DROP INDEX "companies_sector_idx";

-- DropIndex
DROP INDEX "companies_type_idx";

-- DropIndex
DROP INDEX "processes_code_idx";

-- DropIndex
DROP INDEX "products_code_idx";

-- AlterTable
ALTER TABLE "_BusinessSectorToCompany" ADD CONSTRAINT "_BusinessSectorToCompany_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_BusinessSectorToCompany_AB_unique";

-- AlterTable
ALTER TABLE "attendance_events" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "sector",
DROP COLUMN "type";

-- AlterTable
ALTER TABLE "feedbacks" ADD COLUMN     "processorAt" TIMESTAMP(3),
ADD COLUMN     "processorId" TEXT,
ADD COLUMN     "rating" INTEGER,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "medical_records" ADD COLUMN     "isWorkAccident" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_permissions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "joinDate" DATE;

-- AlterTable
ALTER TABLE "worksheet_record_causes" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropEnum
DROP TYPE "BusinessSector";

-- DropEnum
DROP TYPE "CompanyType";

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isLunar" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isCategory" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "leaveCategory" "LeaveCategory" NOT NULL,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "isAccruable" BOOLEAN NOT NULL DEFAULT false,
    "accrualPerMonth" DECIMAL(5,2),
    "maxDaysPerYear" DECIMAL(7,1),
    "maxCarryOver" DECIMAL(7,1),
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "countWorkingDaysOnly" BOOLEAN NOT NULL DEFAULT true,
    "isAutoApproved" BOOLEAN NOT NULL DEFAULT false,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "colorCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approval_flows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaveTypeId" TEXT,
    "officeId" TEXT,
    "departmentId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_approval_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approval_flow_levels" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverMode" "ApproverMode" NOT NULL,
    "specificUserId" TEXT,
    "roleDefinitionId" TEXT,
    "targetDepartmentId" TEXT,
    "substitute1Id" TEXT,
    "substitute2Id" TEXT,
    "timeoutHours" INTEGER,
    "timeoutAction" "LeaveTimeoutAction" NOT NULL DEFAULT 'NOTIFY_ONLY',
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT false,
    "canViewAllRequests" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_approval_flow_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "flowId" TEXT,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "startHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "endHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "totalDays" DECIMAL(7,1) NOT NULL,
    "reason" TEXT,
    "attachmentUrl" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notifyByEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "isSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "action" "LeaveApprovalAction" NOT NULL,
    "comment" TEXT,
    "actionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "accrued" DECIMAL(7,1) NOT NULL DEFAULT 0,
    "carriedOver" DECIMAL(7,1) NOT NULL DEFAULT 0,
    "adjusted" DECIMAL(7,1) NOT NULL DEFAULT 0,
    "used" DECIMAL(7,1) NOT NULL DEFAULT 0,
    "pending" DECIMAL(7,1) NOT NULL DEFAULT 0,
    "expired" DECIMAL(7,1) NOT NULL DEFAULT 0,
    "lastAccrualMonth" INTEGER,
    "lastAccrualYear" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_visibility_rules" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "LeaveVisibilityScope" NOT NULL,
    "viewerRoleId" TEXT,
    "viewerUserId" TEXT,
    "leaveTypeId" TEXT,
    "officeId" TEXT,
    "canViewDetails" BOOLEAN NOT NULL DEFAULT true,
    "canViewDocuments" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_visibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request_comments" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_request_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "public_holidays_date_idx" ON "public_holidays"("date");

-- CreateIndex
CREATE INDEX "public_holidays_companyId_isActive_idx" ON "public_holidays"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "leave_types_companyId_isActive_idx" ON "leave_types"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "leave_types_categoryCode_idx" ON "leave_types"("categoryCode");

-- CreateIndex
CREATE INDEX "leave_types_isAccruable_idx" ON "leave_types"("isAccruable");

-- CreateIndex
CREATE INDEX "leave_types_leaveCategory_idx" ON "leave_types"("leaveCategory");

-- CreateIndex
CREATE INDEX "leave_approval_flows_companyId_isActive_idx" ON "leave_approval_flows"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "leave_approval_flows_leaveTypeId_idx" ON "leave_approval_flows"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_approval_flows_officeId_idx" ON "leave_approval_flows"("officeId");

-- CreateIndex
CREATE INDEX "leave_approval_flows_departmentId_idx" ON "leave_approval_flows"("departmentId");

-- CreateIndex
CREATE INDEX "leave_approval_flows_priority_idx" ON "leave_approval_flows"("priority");

-- CreateIndex
CREATE INDEX "leave_approval_flow_levels_flowId_idx" ON "leave_approval_flow_levels"("flowId");

-- CreateIndex
CREATE INDEX "leave_approval_flow_levels_specificUserId_idx" ON "leave_approval_flow_levels"("specificUserId");

-- CreateIndex
CREATE INDEX "leave_approval_flow_levels_substitute1Id_idx" ON "leave_approval_flow_levels"("substitute1Id");

-- CreateIndex
CREATE INDEX "leave_approval_flow_levels_substitute2Id_idx" ON "leave_approval_flow_levels"("substitute2Id");

-- CreateIndex
CREATE INDEX "leave_approval_flow_levels_approverMode_idx" ON "leave_approval_flow_levels"("approverMode");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approval_flow_levels_flowId_level_key" ON "leave_approval_flow_levels"("flowId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_requestNumber_key" ON "leave_requests"("requestNumber");

-- CreateIndex
CREATE INDEX "leave_requests_userId_status_idx" ON "leave_requests"("userId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_companyId_status_idx" ON "leave_requests"("companyId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_leaveTypeId_idx" ON "leave_requests"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_endDate_idx" ON "leave_requests"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "leave_requests_status_currentLevel_companyId_idx" ON "leave_requests"("status", "currentLevel", "companyId");

-- CreateIndex
CREATE INDEX "leave_requests_submittedAt_idx" ON "leave_requests"("submittedAt");

-- CreateIndex
CREATE INDEX "leave_approvals_requestId_idx" ON "leave_approvals"("requestId");

-- CreateIndex
CREATE INDEX "leave_approvals_approverId_idx" ON "leave_approvals"("approverId");

-- CreateIndex
CREATE INDEX "leave_approvals_action_idx" ON "leave_approvals"("action");

-- CreateIndex
CREATE INDEX "leave_approvals_level_idx" ON "leave_approvals"("level");

-- CreateIndex
CREATE INDEX "leave_balances_userId_year_idx" ON "leave_balances"("userId", "year");

-- CreateIndex
CREATE INDEX "leave_balances_companyId_year_idx" ON "leave_balances"("companyId", "year");

-- CreateIndex
CREATE INDEX "leave_balances_leaveTypeId_idx" ON "leave_balances"("leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_userId_leaveTypeId_year_key" ON "leave_balances"("userId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_visibility_rules_companyId_isActive_idx" ON "leave_visibility_rules"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "leave_visibility_rules_viewerRoleId_idx" ON "leave_visibility_rules"("viewerRoleId");

-- CreateIndex
CREATE INDEX "leave_visibility_rules_viewerUserId_idx" ON "leave_visibility_rules"("viewerUserId");

-- CreateIndex
CREATE INDEX "leave_visibility_rules_leaveTypeId_idx" ON "leave_visibility_rules"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_visibility_rules_scope_idx" ON "leave_visibility_rules"("scope");

-- CreateIndex
CREATE INDEX "leave_request_comments_requestId_idx" ON "leave_request_comments"("requestId");

-- CreateIndex
CREATE INDEX "leave_request_comments_userId_idx" ON "leave_request_comments"("userId");

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

-- CreateIndex
CREATE INDEX "feedbacks_rating_idx" ON "feedbacks"("rating");

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_processorId_fkey" FOREIGN KEY ("processorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flows" ADD CONSTRAINT "leave_approval_flows_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flows" ADD CONSTRAINT "leave_approval_flows_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flows" ADD CONSTRAINT "leave_approval_flows_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flows" ADD CONSTRAINT "leave_approval_flows_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flow_levels" ADD CONSTRAINT "leave_approval_flow_levels_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "leave_approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flow_levels" ADD CONSTRAINT "leave_approval_flow_levels_specificUserId_fkey" FOREIGN KEY ("specificUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flow_levels" ADD CONSTRAINT "leave_approval_flow_levels_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "role_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flow_levels" ADD CONSTRAINT "leave_approval_flow_levels_targetDepartmentId_fkey" FOREIGN KEY ("targetDepartmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flow_levels" ADD CONSTRAINT "leave_approval_flow_levels_substitute1Id_fkey" FOREIGN KEY ("substitute1Id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approval_flow_levels" ADD CONSTRAINT "leave_approval_flow_levels_substitute2Id_fkey" FOREIGN KEY ("substitute2Id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "leave_approval_flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_visibility_rules" ADD CONSTRAINT "leave_visibility_rules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_visibility_rules" ADD CONSTRAINT "leave_visibility_rules_viewerRoleId_fkey" FOREIGN KEY ("viewerRoleId") REFERENCES "role_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_visibility_rules" ADD CONSTRAINT "leave_visibility_rules_viewerUserId_fkey" FOREIGN KEY ("viewerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_visibility_rules" ADD CONSTRAINT "leave_visibility_rules_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_visibility_rules" ADD CONSTRAINT "leave_visibility_rules_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_comments" ADD CONSTRAINT "leave_request_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_comments" ADD CONSTRAINT "leave_request_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
