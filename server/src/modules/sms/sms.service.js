import { config } from '../../config/env.js';
import { createId } from '../../utils/ids.js';
import { maskPhone } from '../../utils/mask-phone.js';
import { createSmsProvider } from './providers/index.js';
import { mutateStore, readStore } from './sms.repository.js';
import { SMS_STATUS, TASK_STATUS } from './sms.types.js';

const PHONE_PATTERN = /^1\d{10}$/;
const EVENT_TYPES = ['user_register', 'membership_expired', 'campaign_start', 'order_completed'];

const now = () => new Date().toISOString();
const normalizePhone = (phone) => String(phone || '').trim();
const isWhitelisted = (phone) => config.whitelist.includes(phone);
const createShortCode = () => Math.random().toString(36).slice(2, 8);

function ok(body, statusCode = 200) {
  return { statusCode, body };
}

function fail(code, message, statusCode = 400, extra = {}) {
  return { statusCode, body: { success: false, code, message, ...extra } };
}

function safeLog(log) {
  const { phone, templateParam, rawResponse, ...safe } = log;
  return safe;
}

function safeReceipt(receipt) {
  return receipt;
}

function safeTask(task) {
  const { phone, templateParam, ...safe } = task;
  return safe;
}

function publicResult(log, success) {
  return {
    success,
    status: log.status,
    provider: log.provider,
    logId: log.id,
    phoneMasked: log.phoneMasked,
    templateId: log.templateId,
    ruleId: log.ruleId,
    eventId: log.eventId,
    code: log.code,
    message: log.message,
    bizId: log.bizId,
    requestId: log.requestId,
    shortUrl: log.shortUrl,
    receiptStatus: log.receiptStatus
  };
}

function buildTemplateParam(input = {}) {
  const merged = {
    ...config.aliyun.templateParam,
    ...input
  };
  if (!merged.code) merged.code = '##code##';
  if (!merged.min) merged.min = '5';
  return merged;
}

function validatePhone(phone) {
  if (!phone) return fail('PHONE_REQUIRED', 'Phone is required.');
  if (!PHONE_PATTERN.test(phone)) return fail('PHONE_INVALID', 'Phone format is invalid.');
  return null;
}

function resolveScheduledAt(rule, occurredAt) {
  const base = new Date(occurredAt || now());
  const value = Number(rule?.delayValue || 0);
  const unit = rule?.delayUnit || 'hour';
  const multipliers = {
    minute: 60 * 1000,
    minutes: 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  };
  return new Date(base.getTime() + value * (multipliers[unit] || multipliers.hour)).toISOString();
}

function createTaskPayload({ phone, template, rule, event, triggerType, taskType, templateParam }) {
  return {
    id: createId(),
    taskType: taskType || triggerType || 'auto',
    status: TASK_STATUS.PENDING,
    triggerType,
    scene: template?.scene || rule?.scene || 'manual',
    phone,
    phoneMasked: maskPhone(phone),
    templateId: template.id,
    templateName: template.name,
    templateCode: template.providerTemplateId || config.aliyun.templateCode,
    templateParam: { ...templateParam, code: templateParam?.code === '##code##' ? '##code##' : '***' },
    ruleId: rule?.id,
    ruleName: rule?.name,
    eventId: event?.eventId,
    eventType: event?.eventType,
    scheduledAt: triggerType === 'auto' ? resolveScheduledAt(rule, event?.occurredAt) : now(),
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: now(),
    updatedAt: now()
  };
}

async function persistSendLog({ phone, template, rule, event, triggerType, scene, status, result, templateParam, message }) {
  const shortCode = status === SMS_STATUS.SUCCESS ? createShortCode() : undefined;
  const shortUrl = shortCode ? `${config.shortLinkBaseUrl}/s/${shortCode}` : undefined;
  const log = {
    id: createId(),
    provider: result?.provider || config.smsProvider,
    triggerType,
    scene: scene || template?.scene || rule?.scene || 'manual',
    phone,
    phoneMasked: maskPhone(phone),
    templateId: template?.id,
    templateName: template?.name,
    templateCode: template?.providerTemplateId || config.aliyun.templateCode,
    templateParam: { ...templateParam, code: templateParam?.code === '##code##' ? '##code##' : '***' },
    ruleId: rule?.id,
    ruleName: rule?.name,
    eventId: event?.eventId,
    eventType: event?.eventType,
    status,
    receiptStatus: status === SMS_STATUS.SUCCESS ? 'submitted' : status,
    code: result?.code,
    message: result?.message || message,
    bizId: result?.bizId,
    requestId: result?.requestId,
    shortCode,
    shortUrl,
    rawResponse: result?.raw,
    createdAt: now()
  };

  await mutateStore((store) => {
    if (shortCode) {
      store.shortLinks.unshift({
        id: createId(),
        shortCode,
        shortUrl,
        targetUrl: config.shortLinkDefaultTarget,
        logId: log.id,
        userId: event?.userId || '',
        phoneMasked: log.phoneMasked,
        clickCount: 0,
        createdAt: log.createdAt
      });
    }
    store.logs.unshift(log);
  });

  return log;
}

async function sendWithProvider({ phone, template, rule, event, triggerType, templateParam }) {
  const invalid = validatePhone(phone);
  if (invalid) return invalid;

  if (!isWhitelisted(phone)) {
    const log = await persistSendLog({
      phone,
      template,
      rule,
      event,
      triggerType,
      templateParam,
      status: SMS_STATUS.BLOCKED,
      result: {
        provider: config.smsProvider,
        code: 'PHONE_NOT_IN_WHITELIST',
        message: 'Phone number is not allowed in test mode.'
      }
    });
    return ok(publicResult(log, false), 403);
  }

  try {
    const provider = createSmsProvider();
    const result = await provider.sendVerifyCode({
      phone,
      templateCode: template?.providerTemplateId || config.aliyun.templateCode,
      templateParam
    });
    const log = await persistSendLog({
      phone,
      template,
      rule,
      event,
      triggerType,
      templateParam,
      status: result.success ? SMS_STATUS.SUCCESS : SMS_STATUS.FAILED,
      result
    });
    return ok(publicResult(log, result.success), result.success ? 200 : 502);
  } catch (error) {
    const log = await persistSendLog({
      phone,
      template,
      rule,
      event,
      triggerType,
      templateParam,
      status: SMS_STATUS.FAILED,
      result: {
        provider: config.smsProvider,
        code: error.code || 'SMS_SEND_FAILED',
        message: error.message || 'SMS provider failed.'
      }
    });
    return ok(publicResult(log, false), 502);
  }
}

export async function getDashboard() {
  const store = await readStore();
  const stats = await getStats();
  return {
    stats,
    recentLogs: store.logs.slice(0, 8).map(safeLog),
    activeRules: store.rules.filter((rule) => rule.status === 'enabled').slice(0, 6),
    templates: store.templates
  };
}

export async function listTemplates() {
  const store = await readStore();
  return { items: store.templates };
}

export async function createTemplate(input) {
  if (!input.name) return fail('TEMPLATE_NAME_REQUIRED', 'Template name is required.');
  if (!input.scene) return fail('TEMPLATE_SCENE_REQUIRED', 'Template scene is required.');
  const createdAt = now();
  const template = {
    id: createId(),
    name: input.name,
    scene: input.scene,
    providerTemplateId: input.providerTemplateId || config.aliyun.templateCode,
    content: input.content || '您的测试验证码为${code}，${min}分钟内有效。',
    variables: Array.isArray(input.variables) ? input.variables : ['code', 'min'],
    status: input.status || 'enabled',
    createdAt,
    updatedAt: createdAt
  };
  await mutateStore((store) => store.templates.unshift(template));
  return ok({ success: true, item: template }, 201);
}

export async function updateTemplateStatus(id, status) {
  return mutateStore((store) => {
    const item = store.templates.find((template) => template.id === id);
    if (!item) return fail('TEMPLATE_NOT_FOUND', 'Template not found.', 404);
    item.status = status === 'disabled' ? 'disabled' : 'enabled';
    item.updatedAt = now();
    return ok({ success: true, item });
  });
}

export async function listRules() {
  const store = await readStore();
  return { items: store.rules };
}

export async function createRule(input) {
  if (!input.name) return fail('RULE_NAME_REQUIRED', 'Rule name is required.');
  if (!EVENT_TYPES.includes(input.eventType)) return fail('EVENT_TYPE_INVALID', 'Event type is invalid.');
  const store = await readStore();
  const template = store.templates.find((item) => item.id === input.templateId);
  if (!template) return fail('TEMPLATE_NOT_FOUND', 'Template not found.', 404);
  const createdAt = now();
  const rule = {
    id: createId(),
    name: input.name,
    code: input.code || `rule_${Date.now()}`,
    scene: input.scene || template.scene,
    eventType: input.eventType,
    delayValue: Number(input.delayValue) || 0,
    delayUnit: input.delayUnit || 'hour',
    conditionType: input.conditionType || 'none',
    templateId: input.templateId,
    status: input.status || 'enabled',
    createdAt,
    updatedAt: createdAt
  };
  await mutateStore((current) => current.rules.unshift(rule));
  return ok({ success: true, item: rule }, 201);
}

export async function updateRuleStatus(id, status) {
  return mutateStore((store) => {
    const item = store.rules.find((rule) => rule.id === id);
    if (!item) return fail('RULE_NOT_FOUND', 'Rule not found.', 404);
    item.status = status === 'disabled' ? 'disabled' : 'enabled';
    item.updatedAt = now();
    return ok({ success: true, item });
  });
}

export async function listTasks(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let tasks = store.tasks;
  if (filters.status) tasks = tasks.filter((task) => task.status === filters.status);
  if (filters.triggerType) tasks = tasks.filter((task) => task.triggerType === filters.triggerType);
  if (filters.eventType) tasks = tasks.filter((task) => task.eventType === filters.eventType);
  const total = tasks.length;
  return { items: tasks.slice((page - 1) * pageSize, page * pageSize).map(safeTask), total, page, pageSize };
}

async function enqueueTask(input) {
  const task = createTaskPayload(input);
  await mutateStore((store) => {
    store.tasks.unshift(task);
  });
  return task;
}

async function executeTask(taskId) {
  const store = await readStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) return fail('TASK_NOT_FOUND', 'Task not found.', 404);
  if (![TASK_STATUS.PENDING, TASK_STATUS.FAILED].includes(task.status)) {
    return ok({ success: true, skipped: true, reason: `Task status is ${task.status}.`, task: safeTask(task) });
  }
  if (task.status === TASK_STATUS.FAILED && Number(task.attemptCount || 0) >= Number(task.maxAttempts || 3)) {
    return ok({ success: true, skipped: true, reason: 'Task has reached max attempts.', task: safeTask(task) });
  }
  if (new Date(task.scheduledAt).getTime() > Date.now()) {
    return ok({ success: true, skipped: true, reason: 'Task is not due yet.', task: safeTask(task) });
  }

  await mutateStore((current) => {
    const currentTask = current.tasks.find((item) => item.id === task.id);
    if (currentTask) {
      currentTask.status = TASK_STATUS.SENDING;
      currentTask.attemptCount = Number(currentTask.attemptCount || 0) + 1;
      currentTask.updatedAt = now();
    }
  });

  const latest = await readStore();
  const claimedTask = latest.tasks.find((item) => item.id === task.id);
  const template = latest.templates.find((item) => item.id === task.templateId);
  const rule = task.ruleId ? latest.rules.find((item) => item.id === task.ruleId) : undefined;
  const event = task.eventId ? latest.events.find((item) => item.eventId === task.eventId) : undefined;

  if (!template || template.status !== 'enabled') {
    await mutateStore((current) => {
      const currentTask = current.tasks.find((item) => item.id === task.id);
      if (currentTask) {
        currentTask.status = TASK_STATUS.FAILED;
        currentTask.lastErrorCode = 'TEMPLATE_UNAVAILABLE';
        currentTask.lastErrorMessage = 'Template is missing or disabled.';
        currentTask.updatedAt = now();
      }
    });
    return fail('TEMPLATE_UNAVAILABLE', 'Template is missing or disabled.', 409);
  }

  const result = await sendWithProvider({
    phone: task.phone,
    template,
    rule,
    event,
    triggerType: task.triggerType,
    templateParam: claimedTask?.templateParam || buildTemplateParam()
  });
  const body = result.body;
  const finalStatus = body.status === SMS_STATUS.BLOCKED
    ? TASK_STATUS.BLOCKED
    : body.status === SMS_STATUS.SUCCESS
      ? TASK_STATUS.SUCCESS
      : TASK_STATUS.FAILED;

  await mutateStore((current) => {
    const currentTask = current.tasks.find((item) => item.id === task.id);
    if (currentTask) {
      currentTask.status = finalStatus;
      currentTask.sentAt = body.status === SMS_STATUS.BLOCKED ? undefined : now();
      currentTask.logId = body.logId;
      currentTask.lastErrorCode = body.status === SMS_STATUS.SUCCESS ? undefined : body.code;
      currentTask.lastErrorMessage = body.status === SMS_STATUS.SUCCESS ? undefined : body.message;
      currentTask.updatedAt = now();
    }
  });

  const updated = await readStore();
  const updatedTask = updated.tasks.find((item) => item.id === task.id);
  return ok({ success: body.success, task: safeTask(updatedTask), result: body }, result.statusCode || 200);
}

export async function runDueTasks(input = {}) {
  const store = await readStore();
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
  const dueTasks = store.tasks
    .filter((task) => (
      [TASK_STATUS.PENDING, TASK_STATUS.FAILED].includes(task.status) &&
      new Date(task.scheduledAt).getTime() <= Date.now() &&
      Number(task.attemptCount || 0) < Number(task.maxAttempts || 3)
    ))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, limit);

  const results = [];
  for (const task of dueTasks) {
    const result = await executeTask(task.id);
    results.push(result.body);
  }

  return ok({ success: true, processed: results.length, results });
}

export async function manualSend(input) {
  const store = await readStore();
  const template = store.templates.find((item) => item.id === input.templateId);
  if (!template) return fail('TEMPLATE_NOT_FOUND', 'Template not found.', 404);
  if (template.status !== 'enabled') return fail('TEMPLATE_DISABLED', 'Template is disabled.', 409);
  return sendWithProvider({
    phone: normalizePhone(input.phone),
    template,
    triggerType: 'manual',
    templateParam: buildTemplateParam(input.templateParam || input.variables)
  });
}

export async function receiveEvent(input) {
  if (!input.eventType || !EVENT_TYPES.includes(input.eventType)) {
    return fail('EVENT_TYPE_INVALID', 'Event type is invalid.');
  }
  const phone = normalizePhone(input.phone || input.payload?.phone);
  const event = {
    id: createId(),
    eventId: input.eventId || `evt_${Date.now()}`,
    eventType: input.eventType,
    userId: input.userId || input.payload?.userId || '',
    phone,
    payload: input.payload || {},
    occurredAt: input.occurredAt || now(),
    createdAt: now()
  };

  const store = await readStore();
  if (store.events.some((item) => item.eventId === event.eventId)) {
    return fail('EVENT_DUPLICATED', 'Event already exists.', 409);
  }

  const matchedRules = store.rules.filter((rule) => rule.status === 'enabled' && rule.eventType === event.eventType);
  const queuedTasks = [];
  await mutateStore((current) => {
    current.events.unshift(event);
  });

  for (const rule of matchedRules) {
    const template = store.templates.find((item) => item.id === rule.templateId);
    if (!template || template.status !== 'enabled') continue;
    const task = await enqueueTask({
      phone,
      template,
      rule,
      event,
      triggerType: 'auto',
      taskType: 'auto',
      templateParam: buildTemplateParam(input.templateParam || input.variables)
    });
    queuedTasks.push(safeTask(task));
  }

  const processedTasks = await runDueTasks({ limit: queuedTasks.length || 1 });
  return ok({
    success: true,
    event,
    matchedRuleCount: matchedRules.length,
    queuedTaskCount: queuedTasks.length,
    queuedTasks,
    processedTasks: processedTasks.body
  }, 201);
}

export async function listEvents(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let events = store.events;
  if (filters.eventType) events = events.filter((event) => event.eventType === filters.eventType);
  const total = events.length;
  return { items: events.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export async function listLogs(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let logs = store.logs;
  if (filters.phone) logs = logs.filter((log) => log.phone === filters.phone);
  if (filters.status) logs = logs.filter((log) => log.status === filters.status);
  if (filters.provider) logs = logs.filter((log) => log.provider === filters.provider);
  if (filters.triggerType) logs = logs.filter((log) => log.triggerType === filters.triggerType);
  const total = logs.length;
  return { items: logs.slice((page - 1) * pageSize, page * pageSize).map(safeLog), total, page, pageSize };
}

export async function listReceipts(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let receipts = store.receipts;
  if (filters.receiptStatus) receipts = receipts.filter((receipt) => receipt.receiptStatus === filters.receiptStatus);
  const total = receipts.length;
  return { items: receipts.slice((page - 1) * pageSize, page * pageSize).map(safeReceipt), total, page, pageSize };
}

export async function listClickLogs(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let clicks = store.clickLogs;
  if (filters.shortCode) clicks = clicks.filter((click) => click.shortCode === filters.shortCode);
  const total = clicks.length;
  return { items: clicks.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export async function recordShortLinkClick(shortCode, request = {}) {
  const store = await readStore();
  const link = store.shortLinks.find((item) => item.shortCode === shortCode);
  if (!link) return fail('SHORT_LINK_NOT_FOUND', 'Short link not found.', 404);

  const click = {
    id: createId(),
    shortCode,
    logId: link.logId,
    userId: link.userId || '',
    ip: request.ip || '',
    userAgent: request.userAgent || '',
    clickedAt: now()
  };

  await mutateStore((current) => {
    const currentLink = current.shortLinks.find((item) => item.shortCode === shortCode);
    if (currentLink) currentLink.clickCount = Number(currentLink.clickCount || 0) + 1;
    const log = current.logs.find((item) => item.id === link.logId);
    if (log) {
      log.clickCount = Number(log.clickCount || 0) + 1;
      log.lastClickedAt = click.clickedAt;
    }
    current.clickLogs.unshift(click);
  });

  return ok({ success: true, targetUrl: link.targetUrl, click });
}

export async function receiveProviderCallback(input) {
  const bizId = input.bizId || input.BizId || input.providerMsgId || input.provider_msg_id;
  const requestId = input.requestId || input.RequestId;
  const receiptStatus = input.receiptStatus || input.status || input.receipt_status || 'delivered';
  if (!bizId && !requestId) return fail('RECEIPT_ID_REQUIRED', 'bizId or requestId is required.');

  return mutateStore((store) => {
    const exists = store.receipts.some((receipt) => (
      (bizId && receipt.bizId === bizId) &&
      receipt.receiptStatus === receiptStatus
    ));
    if (exists) return ok({ success: true, duplicated: true });

    const log = store.logs.find((item) => (bizId && item.bizId === bizId) || (requestId && item.requestId === requestId));
    const receipt = {
      id: createId(),
      logId: log?.id,
      bizId,
      requestId,
      receiptStatus,
      raw: input,
      createdAt: now()
    };
    store.receipts.unshift(receipt);

    if (log) {
      log.receiptStatus = receiptStatus;
      if (['delivered', 'success', 'DELIVERED'].includes(receiptStatus)) log.status = SMS_STATUS.SUCCESS;
      if (['failed', 'undelivered', 'FAIL', 'FAILED'].includes(receiptStatus)) log.status = SMS_STATUS.FAILED;
      log.updatedAt = receipt.createdAt;
    }

    return ok({ success: true, item: receipt, log: log ? safeLog(log) : null }, 201);
  });
}

export async function getStats() {
  const store = await readStore();
  const logs = store.logs;
  const successCount = logs.filter((log) => log.status === SMS_STATUS.SUCCESS).length;
  const failedCount = logs.filter((log) => log.status === SMS_STATUS.FAILED).length;
  const blockedCount = logs.filter((log) => log.status === SMS_STATUS.BLOCKED).length;
  const sentLogs = logs.filter((log) => log.status !== SMS_STATUS.BLOCKED);
  const tasks = store.tasks;
  const providers = {};
  const scenes = {};
  const clickCount = store.clickLogs.length;
  const clickUsers = new Set(store.clickLogs.map((click) => click.userId || click.ip || click.id));

  for (const log of logs) {
    providers[log.provider] = (providers[log.provider] || 0) + 1;
    scenes[log.scene || 'unknown'] = (scenes[log.scene || 'unknown'] || 0) + 1;
  }

  return {
    sendCount: sentLogs.length,
    successCount,
    failedCount,
    blockedCount,
    templateCount: store.templates.length,
    enabledTemplateCount: store.templates.filter((template) => template.status === 'enabled').length,
    ruleCount: store.rules.length,
    enabledRuleCount: store.rules.filter((rule) => rule.status === 'enabled').length,
    eventCount: store.events.length,
    taskCount: tasks.length,
    pendingTaskCount: tasks.filter((task) => task.status === TASK_STATUS.PENDING).length,
    dueTaskCount: tasks.filter((task) => (
      [TASK_STATUS.PENDING, TASK_STATUS.FAILED].includes(task.status) &&
      new Date(task.scheduledAt).getTime() <= Date.now()
    )).length,
    clickCount,
    clickUserCount: clickUsers.size,
    receiptCount: store.receipts.length,
    ctr: successCount > 0 ? `${((clickUsers.size / successCount) * 100).toFixed(1)}%` : '0.0%',
    providers,
    scenes
  };
}

export async function sendTestCode(input) {
  const store = await readStore();
  const template = store.templates.find((item) => item.providerTemplateId === input.templateCode) || store.templates[0];
  return sendWithProvider({
    phone: normalizePhone(input.phone),
    template,
    triggerType: 'manual',
    templateParam: buildTemplateParam(input.templateParam || input.variables)
  });
}
