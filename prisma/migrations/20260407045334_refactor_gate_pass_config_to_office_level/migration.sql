-- CreateEnum
CREATE TYPE "GatePassApproverType" AS ENUM ('DEPARTMENT_HEAD', 'SPECIFIC_USER');

-- DropForeignKey
ALTER TABLE "gate_pass_approval_configs" DROP CONSTRAINT "gate_pass_approval_configs_approverUserId_fkey";

-- DropForeignKey
ALTER TABLE "gate_pass_approval_configs" DROP CONSTRAINT "gate_pass_approval_configs_departmentId_fkey";

-- DropIndex
DROP INDEX "gate_pass_approval_configs_departmentId_level_key";

-- AlterTable
ALTER TABLE "gate_pass_approval_configs" ADD COLUMN     "approverType" "GatePassApproverType" NOT NULL DEFAULT 'SPECIFIC_USER',
ADD COLUMN     "officeId" TEXT,
ALTER COLUMN "departmentId" DROP NOT NULL,
ALTER COLUMN "approverUserId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "gate_pass_approval_configs_officeId_idx" ON "gate_pass_approval_configs"("officeId");

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "offices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_approval_configs" ADD CONSTRAINT "gate_pass_approval_configs_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
