-- AlterTable: Add cancel support fields to inventory_transactions
ALTER TABLE "inventory_transactions"
  ADD COLUMN IF NOT EXISTS "isCancelled"   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "cancelledAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelReason"  TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inventory_transactions_isCancelled_idx" ON "inventory_transactions"("isCancelled");

-- AddForeignKey (cancelledByUser)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_transactions_cancelledById_fkey'
  ) THEN
    ALTER TABLE "inventory_transactions"
      ADD CONSTRAINT "inventory_transactions_cancelledById_fkey"
      FOREIGN KEY ("cancelledById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
