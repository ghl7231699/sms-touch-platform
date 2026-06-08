-- CreateTable
CREATE TABLE "sms_task" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggerType" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateName" TEXT,
    "templateCode" TEXT NOT NULL,
    "templateParam" JSONB,
    "ruleId" TEXT,
    "ruleName" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "logId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_task_logId_key" ON "sms_task"("logId");

-- CreateIndex
CREATE INDEX "sms_task_status_scheduledAt_idx" ON "sms_task"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "sms_task_eventId_idx" ON "sms_task"("eventId");

-- CreateIndex
CREATE INDEX "sms_task_ruleId_idx" ON "sms_task"("ruleId");

-- AddForeignKey
ALTER TABLE "sms_task" ADD CONSTRAINT "sms_task_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "sms_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_task" ADD CONSTRAINT "sms_task_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "sms_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_task" ADD CONSTRAINT "sms_task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "sms_event"("eventId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_task" ADD CONSTRAINT "sms_task_logId_fkey" FOREIGN KEY ("logId") REFERENCES "sms_send_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;
