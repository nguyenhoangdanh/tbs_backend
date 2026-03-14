-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('HOLDING', 'SUBSIDIARY', 'FACTORY_COMPLEX', 'BRANCH');

-- CreateEnum
CREATE TYPE "BusinessSector" AS ENUM ('BAGS', 'FOOTWEAR', 'REAL_ESTATE', 'APARTMENT', 'LOGISTICS', 'EDUCATION', 'OTHER');

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "regions_name_key" ON "regions"("name");

-- CreateIndex
CREATE INDEX "regions_isActive_idx" ON "regions"("isActive");

-- AlterTable: add new columns to companies
ALTER TABLE "companies"
    ADD COLUMN "type" "CompanyType" NOT NULL DEFAULT 'SUBSIDIARY',
    ADD COLUMN "parentCompanyId" TEXT,
    ADD COLUMN "regionId" TEXT,
    ADD COLUMN "sector" "BusinessSector";

-- Update TBS Group (root holding) type to HOLDING
UPDATE "companies" SET "type" = 'HOLDING' WHERE "code" = 'TBS';

-- AddForeignKey: companies.parentCompanyId -> companies.id
ALTER TABLE "companies" ADD CONSTRAINT "companies_parentCompanyId_fkey"
    FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: companies.regionId -> regions.id
ALTER TABLE "companies" ADD CONSTRAINT "companies_regionId_fkey"
    FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex on companies
CREATE INDEX "companies_type_idx" ON "companies"("type");
CREATE INDEX "companies_parentCompanyId_idx" ON "companies"("parentCompanyId");
CREATE INDEX "companies_regionId_idx" ON "companies"("regionId");
CREATE INDEX "companies_sector_idx" ON "companies"("sector");
