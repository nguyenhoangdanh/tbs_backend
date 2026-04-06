/*
  Warnings:

  - You are about to drop the column `isReportable` on the `positions` table. All the data in the column will be lost.
  - You are about to drop the `report_tasks` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `reports` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `task_evaluations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "report_tasks" DROP CONSTRAINT "report_tasks_reportId_fkey";

-- DropForeignKey
ALTER TABLE "reports" DROP CONSTRAINT "reports_userId_fkey";

-- DropForeignKey
ALTER TABLE "task_evaluations" DROP CONSTRAINT "task_evaluations_evaluatorId_fkey";

-- DropForeignKey
ALTER TABLE "task_evaluations" DROP CONSTRAINT "task_evaluations_taskId_fkey";

-- AlterTable
ALTER TABLE "leave_type_categories" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "positions" DROP COLUMN "isReportable";

-- DropTable
DROP TABLE "report_tasks";

-- DropTable
DROP TABLE "reports";

-- DropTable
DROP TABLE "task_evaluations";

-- DropEnum
DROP TYPE "EvaluationType";
