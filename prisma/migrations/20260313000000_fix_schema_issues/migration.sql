-- Migration: fix_schema_issues
-- 1. Fix MedicalRecord.updatedAt: remove static default, Prisma @updatedAt handles updates
ALTER TABLE "medical_records" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "medical_records" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- 2. Add updatedAt to attendance_events
ALTER TABLE "attendance_events" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 3. Add updatedAt to worksheet_record_causes
ALTER TABLE "worksheet_record_causes" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 4. Rename InventoryTransaction.createdBy -> createdById
ALTER TABLE "inventory_transactions" RENAME COLUMN "created_by" TO "created_by_id";

-- 5. Add FK constraint for inventory_transactions.created_by_id -> users.id
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Add index for inventory_transactions.created_by_id
CREATE INDEX "inventory_transactions_created_by_id_idx" ON "inventory_transactions"("created_by_id");

-- 7. Add FK constraints for worksheet_monthly_backups
ALTER TABLE "worksheet_monthly_backups" ADD CONSTRAINT "worksheet_monthly_backups_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "worksheet_monthly_backups" ADD CONSTRAINT "worksheet_monthly_backups_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- 8. Add missing index for worksheet_monthly_backups.group_id
CREATE INDEX "worksheet_monthly_backups_group_id_idx" ON "worksheet_monthly_backups"("group_id");
