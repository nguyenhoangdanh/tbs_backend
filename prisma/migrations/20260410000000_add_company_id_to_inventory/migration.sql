-- DropIndex
DROP INDEX "medicine_inventories_medicineId_month_year_key";

-- AlterTable
ALTER TABLE "inventory_transactions" ADD COLUMN     "companyId" TEXT;

-- AlterTable
ALTER TABLE "medicine_inventories" ADD COLUMN     "companyId" TEXT;

-- CreateIndex
CREATE INDEX "inventory_transactions_companyId_idx" ON "inventory_transactions"("companyId");

-- CreateIndex
CREATE INDEX "medicine_inventories_companyId_idx" ON "medicine_inventories"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_inventories_companyId_medicineId_month_year_key" ON "medicine_inventories"("companyId", "medicineId", "month", "year");

-- AddForeignKey
ALTER TABLE "medicine_inventories" ADD CONSTRAINT "medicine_inventories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill companyId for MedicineInventory from InventoryTransaction.createdBy.companyId
UPDATE medicine_inventories mi
SET "companyId" = (
  SELECT u."companyId" FROM inventory_transactions it
  JOIN users u ON it."createdById" = u.id
  WHERE it."medicineId" = mi."medicineId"
  AND u."companyId" IS NOT NULL
  LIMIT 1
)
WHERE mi."companyId" IS NULL;

-- Backfill companyId for InventoryTransaction from createdBy user
UPDATE inventory_transactions it
SET "companyId" = (
  SELECT u."companyId" FROM users u WHERE u.id = it."createdById"
)
WHERE it."companyId" IS NULL AND it."createdById" IS NOT NULL;
