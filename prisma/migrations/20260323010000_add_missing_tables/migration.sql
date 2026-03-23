-- Migration: add_missing_tables
-- Adds user_permissions, feedback_views tables
-- Fixes user_department_managements table name (was user_department_management)

-- 1. Create user_permissions table
CREATE TABLE IF NOT EXISTS "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isGranted" BOOLEAN NOT NULL DEFAULT true,
    "grantedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_permissions_userId_permissionId_key"
    ON "user_permissions"("userId", "permissionId");
CREATE INDEX IF NOT EXISTS "user_permissions_userId_idx" ON "user_permissions"("userId");
CREATE INDEX IF NOT EXISTS "user_permissions_permissionId_idx" ON "user_permissions"("permissionId");

ALTER TABLE "user_permissions"
    ADD CONSTRAINT "user_permissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permissions"
    ADD CONSTRAINT "user_permissions_permissionId_fkey"
    FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_permissions"
    ADD CONSTRAINT "user_permissions_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Create feedback_views table
CREATE TABLE IF NOT EXISTS "feedback_views" (
    "id" TEXT NOT NULL,
    "feedbackId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "feedback_views_feedbackId_viewerId_key"
    ON "feedback_views"("feedbackId", "viewerId");
CREATE INDEX IF NOT EXISTS "feedback_views_feedbackId_idx" ON "feedback_views"("feedbackId");
CREATE INDEX IF NOT EXISTS "feedback_views_viewerId_idx" ON "feedback_views"("viewerId");

ALTER TABLE "feedback_views"
    ADD CONSTRAINT "feedback_views_feedbackId_fkey"
    FOREIGN KEY ("feedbackId") REFERENCES "feedbacks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feedback_views"
    ADD CONSTRAINT "feedback_views_viewerId_fkey"
    FOREIGN KEY ("viewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Fix user_department_managements table name
-- (old migration created 'user_department_management' without trailing 's')
DO $$
BEGIN
    -- Rename old table if it exists with wrong name and new one doesn't exist yet
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_department_management' AND table_schema = 'public'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'user_department_managements' AND table_schema = 'public'
    ) THEN
        ALTER TABLE "user_department_management" RENAME TO "user_department_managements";
    END IF;
END $$;

-- Create if neither exists
CREATE TABLE IF NOT EXISTS "user_department_managements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_department_managements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_department_managements_userId_departmentId_key"
    ON "user_department_managements"("userId", "departmentId");
CREATE INDEX IF NOT EXISTS "user_department_managements_userId_idx"
    ON "user_department_managements"("userId");
CREATE INDEX IF NOT EXISTS "user_department_managements_departmentId_idx"
    ON "user_department_managements"("departmentId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_department_managements_userId_fkey'
    ) THEN
        ALTER TABLE "user_department_managements"
            ADD CONSTRAINT "user_department_managements_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_department_managements_departmentId_fkey'
    ) THEN
        ALTER TABLE "user_department_managements"
            ADD CONSTRAINT "user_department_managements_departmentId_fkey"
            FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
