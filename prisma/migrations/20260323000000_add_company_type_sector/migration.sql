-- Migration: add_company_type_sector
-- Adds company_types and business_sectors tables (missing from prior migrations)

-- 1. Create company_types table
CREATE TABLE "company_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "company_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_types_code_key" ON "company_types"("code");
CREATE UNIQUE INDEX "company_types_name_key" ON "company_types"("name");
CREATE INDEX "company_types_level_idx" ON "company_types"("level");
CREATE INDEX "company_types_isActive_idx" ON "company_types"("isActive");

-- 2. Create business_sectors table
CREATE TABLE "business_sectors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "business_sectors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_sectors_code_key" ON "business_sectors"("code");
CREATE UNIQUE INDEX "business_sectors_name_key" ON "business_sectors"("name");
CREATE INDEX "business_sectors_isActive_idx" ON "business_sectors"("isActive");

-- 3. Create join table for Company <-> BusinessSector (many-to-many)
CREATE TABLE "_BusinessSectorToCompany" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_BusinessSectorToCompany_AB_unique" ON "_BusinessSectorToCompany"("A", "B");
CREATE INDEX "_BusinessSectorToCompany_B_index" ON "_BusinessSectorToCompany"("B");

ALTER TABLE "_BusinessSectorToCompany"
    ADD CONSTRAINT "_BusinessSectorToCompany_A_fkey"
    FOREIGN KEY ("A") REFERENCES "business_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_BusinessSectorToCompany"
    ADD CONSTRAINT "_BusinessSectorToCompany_B_fkey"
    FOREIGN KEY ("B") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Insert default company_type for existing companies (typeId will be set below)
INSERT INTO "company_types" ("id", "code", "name", "level", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'HOLDING', 'Tập đoàn', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- 5. Add typeId column to companies (nullable first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'typeId'
    ) THEN
        ALTER TABLE "companies" ADD COLUMN "typeId" TEXT;
    END IF;
END $$;

-- 6. Populate typeId for all existing companies with the default HOLDING type
UPDATE "companies"
SET "typeId" = (SELECT "id" FROM "company_types" WHERE "code" = 'HOLDING')
WHERE "typeId" IS NULL;

-- 7. Make typeId NOT NULL
ALTER TABLE "companies" ALTER COLUMN "typeId" SET NOT NULL;

-- 8. Add FK and index for companies.typeId
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'companies_typeId_fkey' AND table_name = 'companies'
    ) THEN
        ALTER TABLE "companies"
            ADD CONSTRAINT "companies_typeId_fkey"
            FOREIGN KEY ("typeId") REFERENCES "company_types"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "companies_typeId_idx" ON "companies"("typeId");

-- 9. Add parentCompanyId column to companies if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'companies' AND column_name = 'parentCompanyId'
    ) THEN
        ALTER TABLE "companies" ADD COLUMN "parentCompanyId" TEXT;
        ALTER TABLE "companies"
            ADD CONSTRAINT "companies_parentCompanyId_fkey"
            FOREIGN KEY ("parentCompanyId") REFERENCES "companies"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        CREATE INDEX "companies_parentCompanyId_idx" ON "companies"("parentCompanyId");
    END IF;
END $$;
