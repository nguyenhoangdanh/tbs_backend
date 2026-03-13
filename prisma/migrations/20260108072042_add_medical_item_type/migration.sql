-- CreateEnum
CREATE TYPE "MedicalItemType" AS ENUM ('MEDICINE', 'EMERGENCY_SUPPLY', 'MEDICAL_EQUIPMENT');

-- AlterTable
ALTER TABLE "medicine_categories" ADD COLUMN     "type" "MedicalItemType" NOT NULL DEFAULT 'MEDICINE';

-- AlterTable
ALTER TABLE "medicines" ADD COLUMN     "type" "MedicalItemType" NOT NULL DEFAULT 'MEDICINE';

-- CreateIndex
CREATE INDEX "medicines_type_idx" ON "medicines"("type");

-- CreateIndex
CREATE INDEX "medicines_type_categoryId_idx" ON "medicines"("type", "categoryId");
