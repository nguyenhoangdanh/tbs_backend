/*
  Warnings:

  - You are about to drop the column `sequenceOrder` on the `product_processes` table. All the data in the column will be lost.
  - You are about to drop the column `avgEfficiency` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `entryIndex` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `productId` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `totalActual` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `totalPlanned` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `worksheet_records` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `worksheets` table. All the data in the column will be lost.
  - You are about to drop the `user_department_management` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[code,teamId]` on the table `groups` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,departmentId]` on the table `teams` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[worksheetId,workHour]` on the table `worksheet_records` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[date,workerId]` on the table `worksheets` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `teamId` to the `groups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `standardOutputPerHour` to the `product_processes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `endTime` to the `worksheet_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startTime` to the `worksheet_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workHour` to the `worksheet_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdById` to the `worksheets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plannedOutput` to the `worksheets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `processId` to the `worksheets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productId` to the `worksheets` table without a default value. This is not possible if the table is not empty.
  - Made the column `groupId` on table `worksheets` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('IMPORT', 'EXPORT', 'ADJUSTMENT');

-- DropForeignKey
ALTER TABLE "user_department_management" DROP CONSTRAINT "user_department_management_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "user_department_management" DROP CONSTRAINT "user_department_management_userId_fkey";

-- DropForeignKey
ALTER TABLE "worksheet_records" DROP CONSTRAINT "worksheet_records_productId_fkey";

-- DropForeignKey
ALTER TABLE "worksheet_records" DROP CONSTRAINT "worksheet_records_updatedBy_fkey";

-- DropForeignKey
ALTER TABLE "worksheets" DROP CONSTRAINT "worksheets_createdBy_fkey";

-- DropForeignKey
ALTER TABLE "worksheets" DROP CONSTRAINT "worksheets_groupId_fkey";

-- DropIndex
DROP INDEX "groups_code_key";

-- DropIndex
DROP INDEX "medicines_name_key";

-- DropIndex
DROP INDEX "teams_code_key";

-- DropIndex
DROP INDEX "teams_name_departmentId_key";

-- DropIndex
DROP INDEX "worksheet_records_productId_idx";

-- DropIndex
DROP INDEX "worksheet_records_worksheetId_entryIndex_key";

-- DropIndex
DROP INDEX "worksheets_createdBy_idx";

-- DropIndex
DROP INDEX "worksheets_shiftType_idx";

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "teamId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "medicines" ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "route" TEXT;

-- AlterTable
ALTER TABLE "processes" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "product_processes" DROP COLUMN "sequenceOrder",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "standardOutputPerHour" INTEGER NOT NULL,
ADD COLUMN     "standardWorkers" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "worksheet_record_items" ALTER COLUMN "entryIndex" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "worksheet_records" DROP COLUMN "avgEfficiency",
DROP COLUMN "entryIndex",
DROP COLUMN "note",
DROP COLUMN "productId",
DROP COLUMN "totalActual",
DROP COLUMN "totalPlanned",
DROP COLUMN "updatedBy",
ADD COLUMN     "actualOutput" INTEGER,
ADD COLUMN     "endTime" TIME(6) NOT NULL,
ADD COLUMN     "plannedOutput" INTEGER,
ADD COLUMN     "startTime" TIME(6) NOT NULL,
ADD COLUMN     "updatedById" TEXT,
ADD COLUMN     "workHour" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "worksheets" DROP COLUMN "createdBy",
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "plannedOutput" INTEGER NOT NULL,
ADD COLUMN     "processId" TEXT NOT NULL,
ADD COLUMN     "productId" TEXT NOT NULL,
ALTER COLUMN "groupId" SET NOT NULL;

-- DropTable
DROP TABLE "user_department_management";

-- CreateTable
CREATE TABLE "user_department_managements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_department_managements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_inventories" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "expiryDate" DATE,
    "openingQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingTotalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyImportQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyImportUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyImportAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyExportQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyExportUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "monthlyExportAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closingQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closingUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "closingTotalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "yearlyImportQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "yearlyImportUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "yearlyImportAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "yearlyExportQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "yearlyExportUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "yearlyExportAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "suggestedPurchaseQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "suggestedPurchaseUnitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "suggestedPurchaseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medicine_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "expiryDate" DATE,
    "batchNumber" TEXT,
    "supplier" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_department_managements_userId_idx" ON "user_department_managements"("userId");

-- CreateIndex
CREATE INDEX "user_department_managements_departmentId_idx" ON "user_department_managements"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "user_department_managements_userId_departmentId_key" ON "user_department_managements"("userId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_categories_code_key" ON "medicine_categories"("code");

-- CreateIndex
CREATE INDEX "medicine_categories_isActive_idx" ON "medicine_categories"("isActive");

-- CreateIndex
CREATE INDEX "medicine_categories_sortOrder_idx" ON "medicine_categories"("sortOrder");

-- CreateIndex
CREATE INDEX "medicine_inventories_medicineId_idx" ON "medicine_inventories"("medicineId");

-- CreateIndex
CREATE INDEX "medicine_inventories_month_year_idx" ON "medicine_inventories"("month", "year");

-- CreateIndex
CREATE INDEX "medicine_inventories_year_idx" ON "medicine_inventories"("year");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_inventories_medicineId_month_year_key" ON "medicine_inventories"("medicineId", "month", "year");

-- CreateIndex
CREATE INDEX "inventory_transactions_medicineId_idx" ON "inventory_transactions"("medicineId");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_idx" ON "inventory_transactions"("type");

-- CreateIndex
CREATE INDEX "inventory_transactions_transactionDate_idx" ON "inventory_transactions"("transactionDate");

-- CreateIndex
CREATE INDEX "inventory_transactions_referenceType_referenceId_idx" ON "inventory_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "groups_teamId_idx" ON "groups"("teamId");

-- CreateIndex
CREATE INDEX "groups_leaderId_idx" ON "groups"("leaderId");

-- CreateIndex
CREATE INDEX "groups_isActive_idx" ON "groups"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "groups_code_teamId_key" ON "groups"("code", "teamId");

-- CreateIndex
CREATE INDEX "medicines_categoryId_idx" ON "medicines"("categoryId");

-- CreateIndex
CREATE INDEX "processes_isActive_idx" ON "processes"("isActive");

-- CreateIndex
CREATE INDEX "processes_code_idx" ON "processes"("code");

-- CreateIndex
CREATE INDEX "product_processes_isActive_idx" ON "product_processes"("isActive");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE INDEX "products_code_idx" ON "products"("code");

-- CreateIndex
CREATE INDEX "task_evaluations_evaluationType_idx" ON "task_evaluations"("evaluationType");

-- CreateIndex
CREATE INDEX "task_evaluations_createdAt_idx" ON "task_evaluations"("createdAt");

-- CreateIndex
CREATE INDEX "teams_isActive_idx" ON "teams"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_departmentId_key" ON "teams"("code", "departmentId");

-- CreateIndex
CREATE INDEX "worksheet_records_workHour_idx" ON "worksheet_records"("workHour");

-- CreateIndex
CREATE UNIQUE INDEX "worksheet_records_worksheetId_workHour_key" ON "worksheet_records"("worksheetId", "workHour");

-- CreateIndex
CREATE INDEX "worksheets_createdById_idx" ON "worksheets"("createdById");

-- CreateIndex
CREATE INDEX "worksheets_productId_processId_idx" ON "worksheets"("productId", "processId");

-- CreateIndex
CREATE UNIQUE INDEX "worksheets_date_workerId_key" ON "worksheets"("date", "workerId");

-- AddForeignKey
ALTER TABLE "user_department_managements" ADD CONSTRAINT "user_department_managements_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_department_managements" ADD CONSTRAINT "user_department_managements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_processId_fkey" FOREIGN KEY ("processId") REFERENCES "processes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worksheet_records" ADD CONSTRAINT "worksheet_records_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "medicine_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_inventories" ADD CONSTRAINT "medicine_inventories_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
