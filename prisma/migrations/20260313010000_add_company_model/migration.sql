-- Migration: add_company_model
-- Adds Company as root tenant model for multi-company (holding group) support

-- 1. Create companies table
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- 2. Unique constraints on companies
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");
CREATE UNIQUE INDEX "companies_taxCode_key" ON "companies"("taxCode");
CREATE INDEX "companies_isActive_idx" ON "companies"("isActive");

-- 3. Add companyId to offices (nullable first, then populate, then make required)
ALTER TABLE "offices" ADD COLUMN "companyId" TEXT;

-- 4. Insert default company for existing data
INSERT INTO "companies" ("id", "code", "name", "isActive", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'TBS', 'TBS Group', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 5. Assign all existing offices to default company
UPDATE "offices" SET "companyId" = (SELECT "id" FROM "companies" WHERE "code" = 'TBS');

-- 6. Make companyId NOT NULL on offices
ALTER TABLE "offices" ALTER COLUMN "companyId" SET NOT NULL;

-- 7. Drop old unique constraint on offices.name (was globally unique, now per company)
DROP INDEX IF EXISTS "offices_name_key";

-- 8. Add new unique constraint: name per company
CREATE UNIQUE INDEX "offices_name_companyId_key" ON "offices"("name", "companyId");

-- 9. Add FK: offices.companyId -> companies.id
ALTER TABLE "offices" ADD CONSTRAINT "offices_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 10. Add index for offices.companyId
CREATE INDEX "offices_companyId_idx" ON "offices"("companyId");

-- 11. Add companyId to users (nullable first)
ALTER TABLE "users" ADD COLUMN "companyId" TEXT;

-- 12. Populate users.companyId from their office's companyId
UPDATE "users" u SET "companyId" = o."companyId"
FROM "offices" o WHERE u."officeId" = o."id";

-- 13. Fallback: assign remaining users (those without office match) to default company
UPDATE "users" SET "companyId" = (SELECT "id" FROM "companies" WHERE "code" = 'TBS')
WHERE "companyId" IS NULL;

-- 14. Make companyId NOT NULL on users
ALTER TABLE "users" ALTER COLUMN "companyId" SET NOT NULL;

-- 15. Drop old unique constraint on users.employeeCode (was globally unique)
DROP INDEX IF EXISTS "users_employeeCode_key";

-- 16. Add new unique constraint: employeeCode per company
CREATE UNIQUE INDEX "users_employeeCode_companyId_key" ON "users"("employeeCode", "companyId");

-- 17. Add FK: users.companyId -> companies.id
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 18. Add index for users.companyId
CREATE INDEX "users_companyId_idx" ON "users"("companyId");

-- 19. Add companyId to products (nullable — null = shared/global)
ALTER TABLE "products" ADD COLUMN "companyId" TEXT;

-- 20. Drop old unique constraint on products.code
DROP INDEX IF EXISTS "products_code_key";

-- 21. Add new unique constraint: code per company (null treated as separate)
CREATE UNIQUE INDEX "products_code_companyId_key" ON "products"("code", "companyId");

-- 22. Add FK: products.companyId -> companies.id (nullable)
ALTER TABLE "products" ADD CONSTRAINT "products_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 23. Add index for products.companyId
CREATE INDEX "products_companyId_idx" ON "products"("companyId");

-- 24. Add companyId to processes (nullable — null = shared/global)
ALTER TABLE "processes" ADD COLUMN "companyId" TEXT;

-- 25. Drop old unique constraint on processes.code
DROP INDEX IF EXISTS "processes_code_key";

-- 26. Add new unique constraint: code per company
CREATE UNIQUE INDEX "processes_code_companyId_key" ON "processes"("code", "companyId");

-- 27. Add FK: processes.companyId -> companies.id (nullable)
ALTER TABLE "processes" ADD CONSTRAINT "processes_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 28. Add index for processes.companyId
CREATE INDEX "processes_companyId_idx" ON "processes"("companyId");
