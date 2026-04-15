-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('REVIEW', 'APPROVAL', 'REJECTION');

-- AlterTable
ALTER TABLE "gate_passes" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "currentLevel" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "isReportable" BOOLEAN NOT NULL DEFAULT true;

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
CREATE TABLE "gate_pass_approval_configs" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "companyId" TEXT,
    "level" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "substituteUserId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_pass_approval_configs_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "task_evaluations_evaluationType_idx" ON "task_evaluations"("evaluationType");

-- CreateIndex
CREATE INDEX "task_evaluations_createdAt_idx" ON "task_evaluations"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_evaluations_taskId_evaluatorId_key" ON "task_evaluations"("taskId", "evaluatorId");

-- CreateIndex
CREATE INDEX "gate_pass_approval_configs_departmentId_idx" ON "gate_pass_approval_configs"("departmentId");

-- CreateIndex
CREATE INDEX "gate_pass_approval_configs_approverUserId_idx" ON "gate_pass_approval_configs"("approverUserId");

-- CreateIndex
CREATE INDEX "gate_pass_approval_configs_companyId_idx" ON "gate_pass_approval_configs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_approval_configs_departmentId_level_key" ON "gate_pass_approval_configs"("departmentId", "level");

-- CreateIndex
CREATE INDEX "gate_passes_departmentId_idx" ON "gate_passes"("departmentId");

-- CreateIndex
CREATE INDEX "gate_passes_companyId_idx" ON "gate_passes"("companyId");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_tasks" ADD CONSTRAINT "report_tasks_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evaluations" ADD CONSTRAINT "task_evaluations_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evaluations" ADD CONSTRAINT "task_evaluations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "report_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_passes" ADD CONSTRAINT "gate_passes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_substituteUserId_fkey" FOREIGN KEY ("substituteUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
