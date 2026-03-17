/*
  Warnings:

  - You are about to alter the column `quantity` on the `inventory_transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `unitPrice` on the `inventory_transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `totalAmount` on the `inventory_transactions` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `openingQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `openingUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `openingTotalAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `monthlyImportQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `monthlyImportUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `monthlyImportAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `monthlyExportQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `monthlyExportUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `monthlyExportAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `closingQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `closingUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `closingTotalAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `yearlyImportQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `yearlyImportUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `yearlyImportAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `yearlyExportQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `yearlyExportUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `yearlyExportAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `suggestedPurchaseQuantity` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `suggestedPurchaseUnitPrice` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.
  - You are about to alter the column `suggestedPurchaseAmount` on the `medicine_inventories` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(30,20)`.

*/
-- AlterTable
ALTER TABLE "inventory_transactions" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(30,20);

-- AlterTable
ALTER TABLE "medicine_inventories" ALTER COLUMN "openingQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "openingUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "openingTotalAmount" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "monthlyImportQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "monthlyImportUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "monthlyImportAmount" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "monthlyExportQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "monthlyExportUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "monthlyExportAmount" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "closingQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "closingUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "closingTotalAmount" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "yearlyImportQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "yearlyImportUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "yearlyImportAmount" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "yearlyExportQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "yearlyExportUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "yearlyExportAmount" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "suggestedPurchaseQuantity" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "suggestedPurchaseUnitPrice" SET DATA TYPE DECIMAL(30,20),
ALTER COLUMN "suggestedPurchaseAmount" SET DATA TYPE DECIMAL(30,20);
