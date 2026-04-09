-- AlterTable: add requesterJobNames to leave_approval_flows
ALTER TABLE "leave_approval_flows" ADD COLUMN IF NOT EXISTS "requesterJobNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE IF NOT EXISTS "leave_flow_requester_filters" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "leave_flow_requester_filters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leave_flow_requester_filters_flowId_idx" ON "leave_flow_requester_filters"("flowId");
CREATE INDEX IF NOT EXISTS "leave_flow_requester_filters_userId_idx" ON "leave_flow_requester_filters"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "leave_flow_requester_filters_flowId_userId_key" ON "leave_flow_requester_filters"("flowId", "userId");

-- AddForeignKey
ALTER TABLE "leave_flow_requester_filters" ADD CONSTRAINT "leave_flow_requester_filters_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "leave_approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_flow_requester_filters" ADD CONSTRAINT "leave_flow_requester_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
