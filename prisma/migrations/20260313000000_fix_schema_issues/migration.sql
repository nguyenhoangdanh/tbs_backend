-- Migration: fix_schema_issues
-- 1. Fix MedicalRecord.updatedAt: remove static default so Prisma @updatedAt can manage updates
ALTER TABLE "medical_records" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- 2. Add updatedAt to attendance_events
ALTER TABLE "attendance_events" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Add updatedAt to worksheet_record_causes
ALTER TABLE "worksheet_record_causes" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Rename InventoryTransaction.createdBy -> createdById
ALTER TABLE "inventory_transactions" RENAME COLUMN "createdBy" TO "createdById";

-- 5. Add FK constraint for inventory_transactions.createdById -> users.id
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Add index for inventory_transactions.createdById
CREATE INDEX "inventory_transactions_createdById_idx" ON "inventory_transactions"("createdById");

-- 7. Add FK constraints for worksheet_monthly_backups
ALTER TABLE "worksheet_monthly_backups" ADD CONSTRAINT "worksheet_monthly_backups_officeId_fkey"
  FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "worksheet_monthly_backups" ADD CONSTRAINT "worksheet_monthly_backups_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 8. Add missing index for worksheet_monthly_backups.groupId
CREATE INDEX "worksheet_monthly_backups_groupId_idx" ON "worksheet_monthly_backups"("groupId");
