-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('NORMAL_8H', 'EXTENDED_9_5H', 'OVERTIME_11H');

-- CreateEnum
CREATE TYPE "WorkSheetStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkRecordStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "OfficeType" AS ENUM ('HEAD_OFFICE', 'FACTORY_OFFICE');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('REVIEW', 'APPROVAL', 'REJECTION');

-- CreateEnum
CREATE TYPE "CauseType" AS ENUM ('MATERIALS', 'TECHNOLOGY', 'QUALITY', 'MACHINERY', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('LATE', 'EARLY_LEAVE', 'ABSENT', 'REASSIGNMENT', 'BREAK', 'OTHER');

-- CreateEnum
CREATE TYPE "GatePassReason" AS ENUM ('BUSINESS', 'DISCIPLINE', 'SICK', 'PERSONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "GatePassStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'USED', 'CANCELLATION_REQUESTED');

-- CreateEnum
CREATE TYPE "GatePassApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "job_positions" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "positionId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OfficeType" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "officeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isManagement" BOOLEAN NOT NULL DEFAULT false,
    "isReportable" BOOLEAN NOT NULL DEFAULT true,
    "canViewHierarchy" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "dateOfBirth" DATE,
    "address" TEXT,
    "sex" "Sex",
    "jobPositionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "officeId" TEXT NOT NULL,
    "groupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_tasks" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "taskName" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL DEFAULT false,
    "tuesday" BOOLEAN NOT NULL DEFAULT false,
    "wednesday" BOOLEAN NOT NULL DEFAULT false,
    "thursday" BOOLEAN NOT NULL DEFAULT false,
    "friday" BOOLEAN NOT NULL DEFAULT false,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "reasonNotDone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_evaluations" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "originalIsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "evaluatedIsCompleted" BOOLEAN NOT NULL DEFAULT false,
    "originalReasonNotDone" TEXT,
    "evaluatedReasonNotDone" TEXT,
    "evaluatorComment" TEXT,
    "evaluationType" "EvaluationType" NOT NULL DEFAULT 'REVIEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_department_management" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_department_management_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "leaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_processes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_processes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheets" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "workerId" TEXT NOT NULL,
    "groupId" TEXT,
    "officeId" TEXT NOT NULL,
    "status" "WorkSheetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worksheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_records" (
    "id" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "entryIndex" INTEGER NOT NULL,
    "status" "WorkRecordStatus" NOT NULL DEFAULT 'PENDING',
    "totalPlanned" INTEGER,
    "totalActual" INTEGER NOT NULL DEFAULT 0,
    "avgEfficiency" DOUBLE PRECISION,
    "note" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worksheet_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_record_items" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "entryIndex" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "plannedOutput" INTEGER,
    "actualOutput" INTEGER NOT NULL DEFAULT 0,
    "efficiencyRate" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worksheet_record_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_record_causes" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "cause" "CauseType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worksheet_record_causes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worksheet_monthly_backups" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "officeId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "totalWorksheets" INTEGER NOT NULL,
    "totalOutput" INTEGER NOT NULL,
    "avgEfficiency" DOUBLE PRECISION NOT NULL,
    "backupData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worksheet_monthly_backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "AttendanceEventType" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "hourStart" INTEGER,
    "hourEnd" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_passes" (
    "id" TEXT NOT NULL,
    "passNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reasonType" "GatePassReason" NOT NULL,
    "reasonDetail" TEXT,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "status" "GatePassStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_pass_approvals" (
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

-- CreateTable
CREATE TABLE "medicines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strength" TEXT,
    "dosage" TEXT,
    "frequency" TEXT,
    "instructions" TEXT,
    "units" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "symptoms" TEXT,
    "diagnosis" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_prescriptions" (
    "id" TEXT NOT NULL,
    "medicalRecordId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "strength" TEXT,
    "duration" TEXT,
    "instructions" TEXT,
    "notes" TEXT,
    "isDispensed" BOOLEAN NOT NULL DEFAULT false,
    "dispensedAt" TIMESTAMP(3),
    "dispensedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medical_prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dhKey" TEXT NOT NULL,
    "authKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_definition_permissions" (
    "id" TEXT NOT NULL,
    "roleDefinitionId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isGranted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_definition_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleDefinitionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_positions_departmentId_idx" ON "job_positions"("departmentId");

-- CreateIndex
CREATE INDEX "job_positions_positionId_idx" ON "job_positions"("positionId");

-- CreateIndex
CREATE INDEX "job_positions_isActive_idx" ON "job_positions"("isActive");

-- CreateIndex
CREATE INDEX "job_positions_officeId_idx" ON "job_positions"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "job_positions_positionId_jobName_departmentId_key" ON "job_positions"("positionId", "jobName", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "offices_name_key" ON "offices"("name");

-- CreateIndex
CREATE INDEX "offices_type_idx" ON "offices"("type");

-- CreateIndex
CREATE INDEX "departments_officeId_idx" ON "departments"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_officeId_key" ON "departments"("name", "officeId");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeCode_key" ON "users"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_jobPositionId_idx" ON "users"("jobPositionId");

-- CreateIndex
CREATE INDEX "users_officeId_idx" ON "users"("officeId");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "users_firstName_lastName_idx" ON "users"("firstName", "lastName");

-- CreateIndex
CREATE INDEX "users_groupId_idx" ON "users"("groupId");

-- CreateIndex
CREATE INDEX "reports_userId_idx" ON "reports"("userId");

-- CreateIndex
CREATE INDEX "reports_year_weekNumber_idx" ON "reports"("year", "weekNumber");

-- CreateIndex
CREATE INDEX "reports_isCompleted_idx" ON "reports"("isCompleted");

-- CreateIndex
CREATE INDEX "reports_isLocked_idx" ON "reports"("isLocked");

-- CreateIndex
CREATE INDEX "reports_createdAt_idx" ON "reports"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reports_weekNumber_year_userId_key" ON "reports"("weekNumber", "year", "userId");

-- CreateIndex
CREATE INDEX "report_tasks_reportId_idx" ON "report_tasks"("reportId");

-- CreateIndex
CREATE INDEX "report_tasks_isCompleted_idx" ON "report_tasks"("isCompleted");

-- CreateIndex
CREATE INDEX "task_evaluations_taskId_idx" ON "task_evaluations"("taskId");

-- CreateIndex
CREATE INDEX "task_evaluations_evaluatorId_idx" ON "task_evaluations"("evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "task_evaluations_taskId_evaluatorId_key" ON "task_evaluations"("taskId", "evaluatorId");

-- CreateIndex
CREATE INDEX "user_department_management_userId_idx" ON "user_department_management"("userId");

-- CreateIndex
CREATE INDEX "user_department_management_departmentId_idx" ON "user_department_management"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_department_management_userId_departmentId_key" ON "user_department_management"("userId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE INDEX "teams_departmentId_idx" ON "teams"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_departmentId_key" ON "teams"("name", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "groups_code_key" ON "groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "processes_code_key" ON "processes"("code");

-- CreateIndex
CREATE INDEX "product_processes_productId_idx" ON "product_processes"("productId");

-- CreateIndex
CREATE INDEX "product_processes_processId_idx" ON "product_processes"("processId");

-- CreateIndex
CREATE UNIQUE INDEX "product_processes_productId_processId_key" ON "product_processes"("productId", "processId");

-- CreateIndex
CREATE INDEX "worksheets_workerId_idx" ON "worksheets"("workerId");

-- CreateIndex
CREATE INDEX "worksheets_groupId_idx" ON "worksheets"("groupId");

-- CreateIndex
CREATE INDEX "worksheets_officeId_idx" ON "worksheets"("officeId");

-- CreateIndex
CREATE INDEX "worksheets_date_idx" ON "worksheets"("date");

-- CreateIndex
CREATE INDEX "worksheets_shiftType_idx" ON "worksheets"("shiftType");

-- CreateIndex
CREATE INDEX "worksheets_status_idx" ON "worksheets"("status");

-- CreateIndex
CREATE INDEX "worksheets_createdBy_idx" ON "worksheets"("createdBy");

-- CreateIndex
CREATE INDEX "worksheet_records_worksheetId_idx" ON "worksheet_records"("worksheetId");

-- CreateIndex
CREATE INDEX "worksheet_records_productId_idx" ON "worksheet_records"("productId");

-- CreateIndex
CREATE INDEX "worksheet_records_status_idx" ON "worksheet_records"("status");

-- CreateIndex
CREATE UNIQUE INDEX "worksheet_records_worksheetId_entryIndex_key" ON "worksheet_records"("worksheetId", "entryIndex");

-- CreateIndex
CREATE INDEX "worksheet_record_items_recordId_idx" ON "worksheet_record_items"("recordId");

-- CreateIndex
CREATE INDEX "worksheet_record_items_productId_processId_idx" ON "worksheet_record_items"("productId", "processId");

-- CreateIndex
CREATE UNIQUE INDEX "worksheet_record_items_recordId_entryIndex_key" ON "worksheet_record_items"("recordId", "entryIndex");

-- CreateIndex
CREATE INDEX "worksheet_record_causes_recordId_idx" ON "worksheet_record_causes"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "worksheet_record_causes_recordId_cause_key" ON "worksheet_record_causes"("recordId", "cause");

-- CreateIndex
CREATE INDEX "worksheet_monthly_backups_year_month_idx" ON "worksheet_monthly_backups"("year", "month");

-- CreateIndex
CREATE INDEX "worksheet_monthly_backups_officeId_idx" ON "worksheet_monthly_backups"("officeId");

-- CreateIndex
CREATE UNIQUE INDEX "worksheet_monthly_backups_month_year_officeId_groupId_key" ON "worksheet_monthly_backups"("month", "year", "officeId", "groupId");

-- CreateIndex
CREATE INDEX "attendance_events_worksheetId_idx" ON "attendance_events"("worksheetId");

-- CreateIndex
CREATE INDEX "attendance_events_userId_idx" ON "attendance_events"("userId");

-- CreateIndex
CREATE INDEX "attendance_events_eventType_idx" ON "attendance_events"("eventType");

-- CreateIndex
CREATE UNIQUE INDEX "gate_passes_passNumber_key" ON "gate_passes"("passNumber");

-- CreateIndex
CREATE INDEX "gate_passes_userId_idx" ON "gate_passes"("userId");

-- CreateIndex
CREATE INDEX "gate_passes_status_idx" ON "gate_passes"("status");

-- CreateIndex
CREATE INDEX "gate_passes_startDateTime_idx" ON "gate_passes"("startDateTime");

-- CreateIndex
CREATE INDEX "gate_pass_approvals_gatePassId_idx" ON "gate_pass_approvals"("gatePassId");

-- CreateIndex
CREATE INDEX "gate_pass_approvals_approverId_idx" ON "gate_pass_approvals"("approverId");

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_approvals_gatePassId_approvalLevel_key" ON "gate_pass_approvals"("gatePassId", "approvalLevel");

-- CreateIndex
CREATE UNIQUE INDEX "medicines_name_key" ON "medicines"("name");

-- CreateIndex
CREATE INDEX "medicines_isActive_idx" ON "medicines"("isActive");

-- CreateIndex
CREATE INDEX "medicines_name_idx" ON "medicines"("name");

-- CreateIndex
CREATE INDEX "medical_records_patientId_idx" ON "medical_records"("patientId");

-- CreateIndex
CREATE INDEX "medical_records_doctorId_idx" ON "medical_records"("doctorId");

-- CreateIndex
CREATE INDEX "medical_records_visitDate_idx" ON "medical_records"("visitDate");

-- CreateIndex
CREATE INDEX "medical_prescriptions_medicalRecordId_idx" ON "medical_prescriptions"("medicalRecordId");

-- CreateIndex
CREATE INDEX "medical_prescriptions_medicineId_idx" ON "medical_prescriptions"("medicineId");

-- CreateIndex
CREATE INDEX "medical_prescriptions_isDispensed_idx" ON "medical_prescriptions"("isDispensed");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_userId_endpoint_key" ON "push_subscriptions"("userId", "endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "role_definitions_name_key" ON "role_definitions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_definitions_code_key" ON "role_definitions"("code");

-- CreateIndex
CREATE INDEX "role_definitions_isActive_idx" ON "role_definitions"("isActive");

-- CreateIndex
CREATE INDEX "role_definitions_isSystem_idx" ON "role_definitions"("isSystem");

-- CreateIndex
CREATE INDEX "role_definition_permissions_roleDefinitionId_idx" ON "role_definition_permissions"("roleDefinitionId");

-- CreateIndex
CREATE INDEX "role_definition_permissions_permissionId_idx" ON "role_definition_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "role_definition_permissions_roleDefinitionId_permissionId_key" ON "role_definition_permissions"("roleDefinitionId", "permissionId");

-- CreateIndex
CREATE INDEX "user_roles_userId_idx" ON "user_roles"("userId");

-- CreateIndex
CREATE INDEX "user_roles_roleDefinitionId_idx" ON "user_roles"("roleDefinitionId");

-- CreateIndex
CREATE INDEX "user_roles_isActive_idx" ON "user_roles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleDefinitionId_key" ON "user_roles"("userId", "roleDefinitionId");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "permissions_action_idx" ON "permissions"("action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE INDEX "feedbacks_createdAt_idx" ON "feedbacks"("createdAt");

-- AddForeignKey
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_jobPositionId_fkey" FOREIGN KEY ("jobPositionId") REFERENCES "job_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_tasks" ADD CONSTRAINT "report_tasks_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evaluations" ADD CONSTRAINT "task_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evaluations" ADD CONSTRAINT "task_evaluations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "report_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_management" ADD CONSTRAINT "user_department_management_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_management" ADD CONSTRAINT "user_department_management_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_processes" ADD CONSTRAINT "product_processes_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_processes" ADD CONSTRAINT "product_processes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_records" ADD CONSTRAINT "worksheet_records_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_records" ADD CONSTRAINT "worksheet_records_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_records" ADD CONSTRAINT "worksheet_records_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "worksheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_record_items" ADD CONSTRAINT "worksheet_record_items_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_record_items" ADD CONSTRAINT "worksheet_record_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_record_items" ADD CONSTRAINT "worksheet_record_items_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "worksheet_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_record_causes" ADD CONSTRAINT "worksheet_record_causes_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "worksheet_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_worksheetId_fkey" FOREIGN KEY ("worksheetId") REFERENCES "worksheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approvals" ADD CONSTRAINT "gate_pass_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approvals" ADD CONSTRAINT "gate_pass_approvals_gatePassId_fkey" FOREIGN KEY ("gatePassId") REFERENCES "gate_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_prescriptions" ADD CONSTRAINT "medical_prescriptions_dispensedBy_fkey" FOREIGN KEY ("dispensedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_prescriptions" ADD CONSTRAINT "medical_prescriptions_medicalRecordId_fkey" FOREIGN KEY ("medicalRecordId") REFERENCES "medical_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_prescriptions" ADD CONSTRAINT "medical_prescriptions_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_definition_permissions" ADD CONSTRAINT "role_definition_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_definition_permissions" ADD CONSTRAINT "role_definition_permissions_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "role_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleDefinitionId_fkey" FOREIGN KEY ("roleDefinitionId") REFERENCES "role_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
