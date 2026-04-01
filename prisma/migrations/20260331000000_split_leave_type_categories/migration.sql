-- ============================================================
-- Migration: Split LeaveType into LeaveTypeCategory + LeaveType
-- Tách bảng leave_types thành 2 bảng riêng biệt:
--   leave_type_categories  (danh mục cha: TS, PB, KT, ...)
--   leave_types            (mã phép con: C3, B1, PN, ...)
-- ============================================================

-- Step 1: Create leave_type_categories table
CREATE TABLE "leave_type_categories" (
  "id"            TEXT NOT NULL,
  "companyId"     TEXT,
  "code"          TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "nameVi"        TEXT,
  "leaveCategory" "LeaveCategory" NOT NULL,
  "description"   TEXT,
  "colorCode"     TEXT,
  "sortOrder"     INTEGER NOT NULL DEFAULT 0,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_type_categories_pkey" PRIMARY KEY ("id")
);

-- Step 2: Migrate category rows (isCategory = true) from leave_types → leave_type_categories
INSERT INTO "leave_type_categories"
  ("id", "companyId", "code", "name", "leaveCategory", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT
  "id", "companyId", "categoryCode", "name", "leaveCategory", "sortOrder", "isActive", "createdAt", "updatedAt"
FROM "leave_types"
WHERE "isCategory" = true;

-- Step 3: Add nullable categoryId to leave_types (will populate before making NOT NULL)
ALTER TABLE "leave_types" ADD COLUMN "categoryId" TEXT;

-- Step 4: Populate categoryId from parentId (parentId points to the category row)
UPDATE "leave_types"
SET "categoryId" = "parentId"
WHERE "isCategory" = false AND "parentId" IS NOT NULL;

-- Step 5: For any orphaned leaf types without parentId, set categoryId to first available category
--         (safety fallback — should not occur in normal seeded data)
UPDATE "leave_types" t
SET "categoryId" = (
  SELECT "id" FROM "leave_type_categories"
  WHERE "leaveCategory" = t."leaveCategory"
  ORDER BY "sortOrder"
  LIMIT 1
)
WHERE "isCategory" = false AND "categoryId" IS NULL;

-- Step 6: Remove category rows from leave_types (they're now in leave_type_categories)
--         First nullify references from leave_approval_flows (SET NULL on delete already, but be explicit)
UPDATE "leave_approval_flows" SET "leaveTypeId" = NULL
WHERE "leaveTypeId" IN (SELECT "id" FROM "leave_types" WHERE "isCategory" = true);

DELETE FROM "leave_types" WHERE "isCategory" = true;

-- Step 7: Make categoryId NOT NULL
ALTER TABLE "leave_types" ALTER COLUMN "categoryId" SET NOT NULL;

-- Step 8: Add nameVi column (nullable)
ALTER TABLE "leave_types" ADD COLUMN "nameVi" TEXT;

-- Step 9: Drop old columns (isCategory, parentId, categoryCode, leaveCategory)
ALTER TABLE "leave_types" DROP CONSTRAINT IF EXISTS "leave_types_parentId_fkey";
DROP INDEX IF EXISTS "leave_types_categoryCode_idx";
DROP INDEX IF EXISTS "leave_types_leaveCategory_idx";

ALTER TABLE "leave_types"
  DROP COLUMN "isCategory",
  DROP COLUMN "parentId",
  DROP COLUMN "categoryCode",
  DROP COLUMN "leaveCategory";

-- Step 10: Add FK and indexes
ALTER TABLE "leave_type_categories"
  ADD CONSTRAINT "leave_type_categories_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leave_types"
  ADD CONSTRAINT "leave_types_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "leave_type_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "leave_type_categories_companyId_code_idx" ON "leave_type_categories"("companyId", "code");
CREATE INDEX "leave_type_categories_leaveCategory_idx" ON "leave_type_categories"("leaveCategory");
CREATE INDEX "leave_types_categoryId_idx" ON "leave_types"("categoryId");
