-- AlterTable
ALTER TABLE "gate_pass_approval_configs" ADD COLUMN IF NOT EXISTS "requesterJobNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
