-- CreateTable
CREATE TABLE "sms_template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "providerTemplateId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "delayValue" INTEGER NOT NULL,
    "delayUnit" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT,
    "payload" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_send_log" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "templateId" TEXT,
    "templateName" TEXT,
    "templateCode" TEXT NOT NULL,
    "templateParam" JSONB,
    "ruleId" TEXT,
    "ruleName" TEXT,
    "eventId" TEXT,
    "eventType" TEXT,
    "status" TEXT NOT NULL,
    "receiptStatus" TEXT,
    "code" TEXT,
    "message" TEXT,
    "bizId" TEXT,
    "requestId" TEXT,
    "shortCode" TEXT,
    "shortUrl" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastClickedAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_send_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_short_link" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "shortUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "userId" TEXT,
    "phoneMasked" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_short_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_click_log" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_click_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_receipt" (
    "id" TEXT NOT NULL,
    "logId" TEXT,
    "bizId" TEXT,
    "requestId" TEXT,
    "receiptStatus" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_rule_code_key" ON "sms_rule"("code");

-- CreateIndex
CREATE INDEX "sms_rule_eventType_status_idx" ON "sms_rule"("eventType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sms_event_eventId_key" ON "sms_event"("eventId");

-- CreateIndex
CREATE INDEX "sms_event_eventType_idx" ON "sms_event"("eventType");

-- CreateIndex
CREATE INDEX "sms_send_log_status_idx" ON "sms_send_log"("status");

-- CreateIndex
CREATE INDEX "sms_send_log_provider_idx" ON "sms_send_log"("provider");

-- CreateIndex
CREATE INDEX "sms_send_log_triggerType_idx" ON "sms_send_log"("triggerType");

-- CreateIndex
CREATE INDEX "sms_send_log_bizId_idx" ON "sms_send_log"("bizId");

-- CreateIndex
CREATE UNIQUE INDEX "sms_short_link_shortCode_key" ON "sms_short_link"("shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "sms_short_link_logId_key" ON "sms_short_link"("logId");

-- CreateIndex
CREATE INDEX "sms_click_log_shortCode_idx" ON "sms_click_log"("shortCode");

-- CreateIndex
CREATE INDEX "sms_receipt_requestId_idx" ON "sms_receipt"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "sms_receipt_bizId_receiptStatus_key" ON "sms_receipt"("bizId", "receiptStatus");

-- AddForeignKey
ALTER TABLE "sms_rule" ADD CONSTRAINT "sms_rule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "sms_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_send_log" ADD CONSTRAINT "sms_send_log_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "sms_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_send_log" ADD CONSTRAINT "sms_send_log_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "sms_rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_send_log" ADD CONSTRAINT "sms_send_log_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "sms_event"("eventId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_short_link" ADD CONSTRAINT "sms_short_link_logId_fkey" FOREIGN KEY ("logId") REFERENCES "sms_send_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_click_log" ADD CONSTRAINT "sms_click_log_logId_fkey" FOREIGN KEY ("logId") REFERENCES "sms_send_log"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_receipt" ADD CONSTRAINT "sms_receipt_logId_fkey" FOREIGN KEY ("logId") REFERENCES "sms_send_log"("id") ON DELETE SET NULL ON UPDATE CASCADE;
