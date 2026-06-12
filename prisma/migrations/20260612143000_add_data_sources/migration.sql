CREATE TABLE "data_source" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "systemName" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'GET',
  "authType" TEXT NOT NULL DEFAULT 'none',
  "authConfig" JSONB,
  "requestConfig" JSONB,
  "pagination" JSONB,
  "responsePath" TEXT NOT NULL DEFAULT 'data.items',
  "fieldMapping" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL DEFAULT 'phone',
  "defaultRuleId" TEXT,
  "defaultTemplateId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "remark" TEXT,
  "lastRunAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_source_run" (
  "id" TEXT NOT NULL,
  "dataSourceId" TEXT NOT NULL,
  "runType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'success',
  "params" JSONB,
  "summary" JSONB,
  "errorMessage" TEXT,
  "batchJobId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_source_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_source_run_item" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "rowIndex" INTEGER NOT NULL,
  "phoneMasked" TEXT,
  "bizId" TEXT,
  "userId" TEXT,
  "scene" TEXT,
  "ruleId" TEXT,
  "templateId" TEXT,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "raw" JSONB,
  "mapped" JSONB,
  "taskId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_source_run_item_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_source_status_idx" ON "data_source"("status");
CREATE INDEX "data_source_systemName_idx" ON "data_source"("systemName");
CREATE INDEX "data_source_run_dataSourceId_createdAt_idx" ON "data_source_run"("dataSourceId", "createdAt");
CREATE INDEX "data_source_run_runType_status_idx" ON "data_source_run"("runType", "status");
CREATE INDEX "data_source_run_item_runId_status_idx" ON "data_source_run_item"("runId", "status");

ALTER TABLE "data_source_run" ADD CONSTRAINT "data_source_run_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "data_source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "data_source_run_item" ADD CONSTRAINT "data_source_run_item_runId_fkey" FOREIGN KEY ("runId") REFERENCES "data_source_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
