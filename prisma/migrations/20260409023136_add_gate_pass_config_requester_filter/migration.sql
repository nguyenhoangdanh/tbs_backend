-- CreateTable
CREATE TABLE "gate_pass_config_requester_filters" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "gate_pass_config_requester_filters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gate_pass_config_requester_filters_configId_idx" ON "gate_pass_config_requester_filters"("configId");

-- CreateIndex
CREATE INDEX "gate_pass_config_requester_filters_userId_idx" ON "gate_pass_config_requester_filters"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "gate_pass_config_requester_filters_configId_userId_key" ON "gate_pass_config_requester_filters"("configId", "userId");

-- AddForeignKey
ALTER TABLE "gate_pass_config_requester_filters" ADD CONSTRAINT "gate_pass_config_requester_filters_configId_fkey" FOREIGN KEY ("configId") REFERENCES "gate_pass_approval_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_pass_config_requester_filters" ADD CONSTRAINT "gate_pass_config_requester_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
