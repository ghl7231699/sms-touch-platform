export type Status = 'enabled' | 'disabled' | 'pending' | 'sending' | 'success' | 'failed' | 'blocked' | 'skipped' | 'cancelled' | 'partial_failed';

export interface Template {
  id: string;
  name: string;
  scene: string;
  providerTemplateId: string;
  content: string;
  variables: string[];
  status: Status;
}

export interface Rule {
  id: string;
  name: string;
  code: string;
  scene: string;
  eventType: string;
  delayValue: number;
  delayUnit: string;
  conditionType: string;
  conditionConfig?: {
    type?: string;
    window?: { value: number; unit: string };
    membershipProductIds?: string[];
  };
  templateId: string;
  status: Status;
}

export interface SendLog {
  id: string;
  provider: string;
  triggerType: string;
  scene: string;
  phoneMasked: string;
  templateName?: string;
  templateCode: string;
  ruleId?: string;
  ruleName?: string;
  eventType?: string;
  status: Status;
  code: string;
  message: string;
  receiptStatus?: string;
  shortUrl?: string;
  clickCount?: number;
  bizId?: string;
  requestId?: string;
  createdAt: string;
}

export interface EventItem {
  id: string;
  eventId: string;
  eventType: string;
  userId: string;
  phone: string;
  createdAt: string;
}

export interface SmsTask {
  id: string;
  taskType: string;
  status: Status;
  triggerType: string;
  scene: string;
  phoneMasked: string;
  templateName?: string;
  templateCode: string;
  ruleName?: string;
  eventType?: string;
  scheduledAt: string;
  sentAt?: string;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  conditionCheckedAt?: string;
  conditionResult?: string;
  conditionReason?: string;
  logId?: string;
  createdAt: string;
}

export interface Stats {
  sendCount: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  templateCount: number;
  enabledTemplateCount: number;
  ruleCount: number;
  enabledRuleCount: number;
  eventCount: number;
  clickCount: number;
  clickUserCount: number;
  receiptCount: number;
  taskCount: number;
  pendingTaskCount: number;
  dueTaskCount: number;
  ctr: string;
  providers: Record<string, number>;
  scenes: Record<string, number>;
}

export interface Health {
  provider: string;
  whitelistCount: number;
  taskWorker?: {
    enabled: boolean;
    running: boolean;
    intervalMs: number;
    batchSize: number;
    lastRunAt: string | null;
    lastProcessed: number;
    lastError: string | null;
    disabledReason: string | null;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: { code: string; name: string; permissions: string[] }[];
  permissions: string[];
}

export interface AdminUser extends AuthUser {
  phone?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface RegisterRequestItem {
  id: string;
  email: string;
  name: string;
  phone?: string;
  reason?: string;
  requestedRole: string;
  status: string;
  reviewedById?: string;
  reviewedAt?: string;
  rejectReason?: string;
  createdUserId?: string;
  createdAt: string;
}

export interface RoleItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  permissions: string[];
  status: string;
}

export interface PhoneGovernanceItem {
  id: string;
  phoneMasked: string;
  scene?: string;
  remark?: string;
  reason?: string;
  source?: string;
  status: string;
  createdAt: string;
}

export interface EventSourceItem {
  id: string;
  appId: string;
  name: string;
  secretPreview: string;
  status: string;
  remark?: string;
  createdAt: string;
}

export interface AuditItem {
  id: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  userId?: string;
  userName?: string;
  appId?: string;
  eventType?: string;
  eventId?: string;
  status?: string;
  code?: string;
  message?: string;
  result?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  requestBody?: unknown;
  payload?: unknown;
  errorMessage?: string;
  createdAt: string;
}

export interface ExportTaskItem {
  id: string;
  name: string;
  resource: string;
  status: string;
  fileName?: string;
  criteria?: Record<string, unknown>;
  createdAt: string;
}

export interface BatchJobItem {
  id: string;
  name: string;
  jobType: string;
  status: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
  items?: { id: string; target: string; status: string; message?: string }[];
  createdAt: string;
}

export interface ApprovalItem {
  id: string;
  title: string;
  resource: string;
  resourceId?: string;
  action: string;
  status: string;
  payload?: {
    scenario?: string;
    reason?: string;
    riskLevel?: string;
    before?: unknown;
    after?: unknown;
    impact?: { title?: string; description?: string; count?: number };
    summary?: {
      scenario?: string;
      reason?: string;
      riskLevel?: string;
      impact?: { title?: string; description?: string; count?: number };
    };
    execute?: { type?: string; [key: string]: unknown };
    executeResult?: unknown;
  };
  records?: { id: string; action: string; comment?: string; operatorId?: string; createdAt: string }[];
  createdAt: string;
}

export type View =
  | 'dashboard'
  | 'templates'
  | 'rules'
  | 'manual'
  | 'events'
  | 'tasks'
  | 'logs'
  | 'users'
  | 'whitelist'
  | 'blacklist'
  | 'unsubscribes'
  | 'settings'
  | 'eventSources'
  | 'eventSourceLogs'
  | 'operationLogs'
  | 'exportTasks'
  | 'batchJobs'
  | 'approvals';
