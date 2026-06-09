CREATE TABLE "admin_user" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "passwordHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_role" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_user_role" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_user_role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_verification_code" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_verification_code_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_register_request" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "reason" TEXT,
  "requestedRole" TEXT NOT NULL DEFAULT 'operator',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "createdUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_register_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_password_setup_token" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_password_setup_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_operation_log" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "userName" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "method" TEXT,
  "path" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "requestBody" JSONB,
  "result" TEXT NOT NULL DEFAULT 'success',
  "statusCode" INTEGER,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_operation_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_whitelist" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneMasked" TEXT NOT NULL,
  "scene" TEXT,
  "remark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_whitelist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_blacklist" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneMasked" TEXT NOT NULL,
  "scene" TEXT,
  "reason" TEXT,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdById" TEXT,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_blacklist_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_unsubscribe" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "phoneMasked" TEXT NOT NULL,
  "scene" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "remark" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_unsubscribe_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sms_frequency_policy" (
  "id" TEXT NOT NULL,
  "scene" TEXT NOT NULL,
  "dailyLimit" INTEGER NOT NULL DEFAULT 1,
  "weeklyLimit" INTEGER NOT NULL DEFAULT 3,
  "cooldownMinutes" INTEGER NOT NULL DEFAULT 1440,
  "quietStart" TEXT NOT NULL DEFAULT '21:00',
  "quietEnd" TEXT NOT NULL DEFAULT '09:00',
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_frequency_policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "system_setting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "remark" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "system_setting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_source" (
  "id" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "secretPreview" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'enabled',
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_source_log" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT,
  "appId" TEXT,
  "eventType" TEXT,
  "eventId" TEXT,
  "status" TEXT NOT NULL,
  "code" TEXT,
  "message" TEXT,
  "ip" TEXT,
  "userAgent" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_source_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "export_task" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "fileName" TEXT,
  "criteria" JSONB,
  "createdById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "export_task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "batch_job" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "batch_job_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "batch_job_item" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "batch_job_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_order" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "action" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approval_order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "approval_record" (
  "id" TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "comment" TEXT,
  "operatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_record_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");
CREATE UNIQUE INDEX "admin_user_phone_key" ON "admin_user"("phone");
CREATE INDEX "admin_user_status_idx" ON "admin_user"("status");
CREATE UNIQUE INDEX "admin_role_code_key" ON "admin_role"("code");
CREATE UNIQUE INDEX "admin_user_role_userId_roleId_key" ON "admin_user_role"("userId", "roleId");
CREATE UNIQUE INDEX "auth_session_tokenHash_key" ON "auth_session"("tokenHash");
CREATE INDEX "auth_session_userId_expiresAt_idx" ON "auth_session"("userId", "expiresAt");
CREATE INDEX "auth_verification_code_email_purpose_idx" ON "auth_verification_code"("email", "purpose");
CREATE INDEX "auth_register_request_status_idx" ON "auth_register_request"("status");
CREATE UNIQUE INDEX "auth_password_setup_token_tokenHash_key" ON "auth_password_setup_token"("tokenHash");
CREATE INDEX "auth_password_setup_token_userId_purpose_idx" ON "auth_password_setup_token"("userId", "purpose");
CREATE INDEX "admin_operation_log_resource_action_idx" ON "admin_operation_log"("resource", "action");
CREATE INDEX "admin_operation_log_userId_idx" ON "admin_operation_log"("userId");
CREATE UNIQUE INDEX "sms_whitelist_phone_key" ON "sms_whitelist"("phone");
CREATE INDEX "sms_whitelist_status_idx" ON "sms_whitelist"("status");
CREATE UNIQUE INDEX "sms_blacklist_phone_key" ON "sms_blacklist"("phone");
CREATE INDEX "sms_blacklist_status_idx" ON "sms_blacklist"("status");
CREATE UNIQUE INDEX "sms_unsubscribe_phone_scene_key" ON "sms_unsubscribe"("phone", "scene");
CREATE INDEX "sms_unsubscribe_status_idx" ON "sms_unsubscribe"("status");
CREATE UNIQUE INDEX "sms_frequency_policy_scene_key" ON "sms_frequency_policy"("scene");
CREATE UNIQUE INDEX "system_setting_key_key" ON "system_setting"("key");
CREATE UNIQUE INDEX "event_source_appId_key" ON "event_source"("appId");
CREATE INDEX "event_source_status_idx" ON "event_source"("status");
CREATE INDEX "event_source_log_appId_status_idx" ON "event_source_log"("appId", "status");
CREATE INDEX "export_task_resource_status_idx" ON "export_task"("resource", "status");
CREATE INDEX "batch_job_jobType_status_idx" ON "batch_job"("jobType", "status");
CREATE INDEX "batch_job_item_jobId_idx" ON "batch_job_item"("jobId");
CREATE INDEX "approval_order_resource_status_idx" ON "approval_order"("resource", "status");
CREATE INDEX "approval_record_approvalId_idx" ON "approval_record"("approvalId");

ALTER TABLE "admin_user_role" ADD CONSTRAINT "admin_user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_user_role" ADD CONSTRAINT "admin_user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "admin_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_operation_log" ADD CONSTRAINT "admin_operation_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_source_log" ADD CONSTRAINT "event_source_log_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "event_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "batch_job_item" ADD CONSTRAINT "batch_job_item_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "batch_job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_record" ADD CONSTRAINT "approval_record_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approval_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
