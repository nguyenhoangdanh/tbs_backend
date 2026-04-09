-- CreateTable
CREATE TABLE "gate_pass_config_approver_overrides" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "gate_pass_config_approver_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gate_pass_config_approver_overrides_configId_idx" ON "gate_pass_config_approver_overrides"("configId");

-- CreateIndex
CREATE INDEX "gate_pass_config_approver_overrides_userId_idx" ON "gate_pass_config_approver_overrides"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_config_approver_overrides_configId_userId_key" ON "gate_pass_config_approver_overrides"("configId", "userId");

-- AddForeignKey
ALTER TABLE "gate_pass_config_approver_overrides" ADD CONSTRAINT "gate_pass_config_approver_overrides_configId_fkey" FOREIGN KEY ("configId") REFERENCES "gate_pass_approval_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_config_approver_overrides" ADD CONSTRAINT "gate_pass_config_approver_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
