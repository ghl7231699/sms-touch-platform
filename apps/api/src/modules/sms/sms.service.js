import { config } from '../../config/env.js';
import { createId } from '../../utils/ids.js';
import { maskPhone } from '../../utils/mask-phone.js';
import { evaluateTaskCondition } from './sms.condition-evaluator.js';
import { createSmsProvider } from './providers/index.js';
import { mutateStore, readStore } from './sms.repository.js';
import { SMS_STATUS, TASK_STATUS } from './sms.types.js';
import { checkSendSafety, getActiveSmsProviderConfig, getShortLinkSettings } from '../governance/governance.service.js';

const PHONE_PATTERN = /^1\d{10}$/;
const EVENT_TYPES = ['user_register', 'membership_expired', 'campaign_start', 'order_completed'];

const now = () => new Date().toISOString();
const normalizePhone = (phone) => String(phone || '').trim();
const createShortCode = () => Math.random().toString(36).slice(2, 8);

function ok(body, statusCode = 200) {
  return { statusCode, body };
}

function fail(code, message, statusCode = 400, extra = {}) {
  return { statusCode, body: { success: false, code, message, ...extra } };
}

function safeLog(log) {
  const { phone, templateParam, ...safe } = log;
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

function detailResult(item, code, message, mapper = (value) => value) {
  if (!item) return fail(code, message, 404);
  return ok({ success: true, item: mapper(item) });
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

function sanitizeJson(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'function' ? undefined : item)));
  } catch {
    return { serializationError: 'RAW_RESPONSE_NOT_SERIALIZABLE' };
  }
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
    conditionResult: 'not_checked',
    scheduledAt: triggerType === 'auto' ? resolveScheduledAt(rule, event?.occurredAt) : now(),
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: now(),
    updatedAt: now()
  };
}

async function persistSendLog({ phone, template, rule, event, triggerType, scene, status, result, templateParam, message }) {
  const shortLinkSettings = await getShortLinkSettings();
  const shortCode = status === SMS_STATUS.SUCCESS ? createShortCode() : undefined;
  const shortUrl = shortCode ? `${shortLinkSettings.baseUrl || config.shortLinkBaseUrl}/s/${shortCode}` : undefined;
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
    rawResponse: sanitizeJson(result?.raw),
    createdAt: now()
  };

  await mutateStore((store) => {
    if (shortCode) {
      store.shortLinks.unshift({
        id: createId(),
        shortCode,
        shortUrl,
        targetUrl: shortLinkSettings.targetUrl || config.shortLinkDefaultTarget,
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

  const providerConfig = await getActiveSmsProviderConfig();
  const providerName = providerConfig.provider;
  const safety = await checkSendSafety({
    phone,
    scene: template?.scene || rule?.scene || 'manual',
    provider: providerName,
    triggerType
  });

  if (!safety.passed) {
    const blockedReason = safety.blockedReason || {
      code: 'SEND_SAFETY_BLOCKED',
      message: 'Send safety check blocked this request.'
    };
    const log = await persistSendLog({
      phone,
      template,
      rule,
      event,
      triggerType,
      templateParam,
      status: SMS_STATUS.BLOCKED,
      result: {
        provider: providerName,
        code: blockedReason.code,
        message: blockedReason.message,
        raw: safety
      }
    });
    return ok(publicResult(log, false), 403);
  }

  try {
    const provider = createSmsProvider(providerName, providerConfig);
    const result = await provider.sendVerifyCode({
      phone,
      templateCode: template?.providerTemplateId || providerConfig.templateCode || config.aliyun.templateCode,
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
        provider: providerName,
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

export async function getTemplate(id) {
  const store = await readStore();
  return detailResult(
    store.templates.find((template) => template.id === id || template.providerTemplateId === id),
    'TEMPLATE_NOT_FOUND',
    'Template not found.'
  );
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

export async function updateTemplate(id, input) {
  if (!input.name) return fail('TEMPLATE_NAME_REQUIRED', 'Template name is required.');
  if (!input.scene) return fail('TEMPLATE_SCENE_REQUIRED', 'Template scene is required.');
  return mutateStore((store) => {
    const item = store.templates.find((template) => template.id === id);
    if (!item) return fail('TEMPLATE_NOT_FOUND', 'Template not found.', 404);
    item.name = input.name;
    item.scene = input.scene;
    item.providerTemplateId = input.providerTemplateId || config.aliyun.templateCode;
    item.content = input.content || item.content;
    item.variables = Array.isArray(input.variables) ? input.variables : item.variables;
    item.updatedAt = now();
    return ok({ success: true, item });
  });
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

export async function getRule(id) {
  const store = await readStore();
  return detailResult(
    store.rules.find((rule) => rule.id === id || rule.code === id),
    'RULE_NOT_FOUND',
    'Rule not found.'
  );
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
    conditionConfig: input.conditionConfig || { type: input.conditionType || 'none' },
    templateId: input.templateId,
    status: input.status || 'enabled',
    createdAt,
    updatedAt: createdAt
  };
  await mutateStore((current) => current.rules.unshift(rule));
  return ok({ success: true, item: rule }, 201);
}

export async function updateRule(id, input) {
  if (!input.name) return fail('RULE_NAME_REQUIRED', 'Rule name is required.');
  if (!EVENT_TYPES.includes(input.eventType)) return fail('EVENT_TYPE_INVALID', 'Event type is invalid.');
  const store = await readStore();
  const template = store.templates.find((item) => item.id === input.templateId);
  if (!template) return fail('TEMPLATE_NOT_FOUND', 'Template not found.', 404);
  return mutateStore((current) => {
    const item = current.rules.find((rule) => rule.id === id);
    if (!item) return fail('RULE_NOT_FOUND', 'Rule not found.', 404);
    item.name = input.name;
    item.code = input.code || item.code;
    item.scene = input.scene || template.scene;
    item.eventType = input.eventType;
    item.delayValue = Number(input.delayValue) || 0;
    item.delayUnit = input.delayUnit || 'hour';
    item.conditionType = input.conditionType || 'none';
    item.conditionConfig = input.conditionConfig || { type: input.conditionType || 'none' };
    item.templateId = input.templateId;
    item.updatedAt = now();
    return ok({ success: true, item });
  });
}

export async function copyRule(id) {
  const store = await readStore();
  const source = store.rules.find((rule) => rule.id === id);
  if (!source) return fail('RULE_NOT_FOUND', 'Rule not found.', 404);
  const createdAt = now();
  const rule = {
    ...source,
    id: createId(),
    name: `${source.name} 副本`,
    code: `${source.code}_copy_${Date.now()}`,
    status: 'disabled',
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

export async function testRule(id, input = {}) {
  const store = await readStore();
  const rule = store.rules.find((item) => item.id === id);
  if (!rule) return fail('RULE_NOT_FOUND', 'Rule not found.', 404);
  const template = store.templates.find((item) => item.id === rule.templateId);
  const eventType = input.eventType || rule.eventType;
  const matched = rule.status === 'enabled' && rule.eventType === eventType;
  const payload = input.payload || {};
  const event = {
    eventId: input.eventId || `test_${Date.now()}`,
    eventType,
    userId: input.userId || payload.userId || 'test-user',
    phone: input.phone || payload.phone || '',
    payload,
    occurredAt: input.occurredAt || now()
  };
  const scheduledAt = resolveScheduledAt(rule, event.occurredAt);
  const estimatedTask = matched && template ? {
    ruleId: rule.id,
    ruleName: rule.name,
    templateId: template.id,
    templateName: template.name,
    eventId: event.eventId,
    eventType,
    scheduledAt,
    conditionType: rule.conditionType,
    conditionConfig: rule.conditionConfig
  } : null;
  return ok({
    success: true,
    matched,
    event,
    matchedRuleCount: matched ? 1 : 0,
    queuedTaskCount: estimatedTask ? 1 : 0,
    estimatedTask,
    reason: matched ? '规则可匹配该测试事件。' : '规则未启用或事件类型不匹配。'
  });
}

export async function estimateRuleImpact(id) {
  const store = await readStore();
  const rule = store.rules.find((item) => item.id === id);
  if (!rule) return fail('RULE_NOT_FOUND', 'Rule not found.', 404);
  const matchedEvents = store.events.filter((event) => event.eventType === rule.eventType);
  const tasks = store.tasks.filter((task) => task.ruleId === rule.id);
  const logs = store.logs.filter((log) => log.ruleId === rule.id || log.ruleName === rule.name);
  return ok({
    success: true,
    ruleId: rule.id,
    matchedEventCount: matchedEvents.length,
    generatedTaskCount: tasks.length,
    sendLogCount: logs.length,
    successCount: logs.filter((log) => log.status === SMS_STATUS.SUCCESS).length,
    blockedCount: logs.filter((log) => log.status === SMS_STATUS.BLOCKED).length,
    clickCount: logs.reduce((sum, log) => sum + Number(log.clickCount || 0), 0)
  });
}

export async function listTasks(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let tasks = store.tasks;
  if (filters.status) tasks = tasks.filter((task) => task.status === filters.status);
  if (filters.dueOnly === '1' || filters.dueOnly === 'true') {
    tasks = tasks.filter((task) => task.status === TASK_STATUS.PENDING && new Date(task.scheduledAt).getTime() <= Date.now());
  }
  if (filters.scene) tasks = tasks.filter((task) => task.scene === filters.scene);
  if (filters.triggerType) tasks = tasks.filter((task) => task.triggerType === filters.triggerType);
  if (filters.eventType) tasks = tasks.filter((task) => task.eventType === filters.eventType);
  if (filters.keyword) {
    const keyword = String(filters.keyword).trim().toLowerCase();
    tasks = tasks.filter((task) => [
      task.id,
      task.ruleId,
      task.ruleName,
      task.eventId,
      task.templateName,
      task.templateCode,
      task.phone,
      task.phoneMasked
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
  }
  tasks = [...tasks].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const total = tasks.length;
  return { items: tasks.slice((page - 1) * pageSize, page * pageSize).map(safeTask), total, page, pageSize };
}

export async function getTask(id) {
  const store = await readStore();
  return detailResult(
    store.tasks.find((task) => task.id === id || task.logId === id),
    'TASK_NOT_FOUND',
    'Task not found.',
    safeTask
  );
}

export async function cancelTask(id) {
  return mutateStore((store) => {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) return fail('TASK_NOT_FOUND', 'Task not found.', 404);
    if (task.status !== TASK_STATUS.PENDING) return fail('TASK_NOT_CANCELABLE', 'Only pending task can be cancelled.', 409);
    task.status = TASK_STATUS.CANCELLED;
    task.updatedAt = now();
    return ok({ success: true, item: safeTask(task) });
  });
}

export async function retryTask(id) {
  const reset = await mutateStore((store) => {
    const task = store.tasks.find((item) => item.id === id);
    if (!task) return fail('TASK_NOT_FOUND', 'Task not found.', 404);
    if (task.status !== TASK_STATUS.FAILED) return fail('TASK_NOT_RETRYABLE', 'Only failed task can be retried.', 409);
    task.status = TASK_STATUS.PENDING;
    task.scheduledAt = now();
    task.lastErrorCode = undefined;
    task.lastErrorMessage = undefined;
    task.updatedAt = now();
    return ok({ success: true, item: safeTask(task) });
  });
  if (reset.statusCode >= 400) return reset;
  return executeTask(id);
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

  const condition = await evaluateTaskCondition({ task: claimedTask || task, rule, event });
  await mutateStore((current) => {
    const currentTask = current.tasks.find((item) => item.id === task.id);
    if (currentTask) {
      currentTask.conditionCheckedAt = now();
      currentTask.conditionResult = condition.result;
      currentTask.conditionReason = condition.reason;
      currentTask.updatedAt = now();
    }
  });

  if (!condition.shouldSend) {
    const finalStatus = condition.retryable ? TASK_STATUS.FAILED : TASK_STATUS.SKIPPED;
    await mutateStore((current) => {
      const currentTask = current.tasks.find((item) => item.id === task.id);
      if (currentTask) {
        currentTask.status = finalStatus;
        currentTask.lastErrorCode = condition.retryable ? condition.code : undefined;
        currentTask.lastErrorMessage = condition.retryable ? condition.reason : undefined;
        currentTask.updatedAt = now();
      }
    });
    const latestAfterCondition = await readStore();
    const updatedTask = latestAfterCondition.tasks.find((item) => item.id === task.id);
    return ok({
      success: !condition.retryable,
      skipped: !condition.retryable,
      condition,
      task: safeTask(updatedTask)
    }, condition.retryable ? 503 : 200);
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
      task.status === TASK_STATUS.PENDING &&
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

  return ok({
    success: true,
    event,
    matchedRuleCount: matchedRules.length,
    queuedTaskCount: queuedTasks.length,
    queuedTasks,
    processedTasks: {
      success: true,
      processed: 0,
      results: [],
      reason: 'Event accepted and tasks queued. Due tasks are executed by worker or manual run-due action.'
    }
  }, 201);
}

export async function listEvents(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let events = store.events;
  if (filters.eventType) events = events.filter((event) => event.eventType === filters.eventType);
  if (filters.phoneSuffix) {
    const suffix = String(filters.phoneSuffix).trim();
    events = events.filter((event) => String(event.phone || '').endsWith(suffix));
  }
  if (filters.keyword) {
    const keyword = String(filters.keyword).trim().toLowerCase();
    events = events.filter((event) => [
      event.id,
      event.eventId,
      event.eventType,
      event.userId,
      event.phone
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
  }
  const total = events.length;
  return { items: events.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize };
}

export async function getEvent(id) {
  const store = await readStore();
  return detailResult(
    store.events.find((event) => event.id === id || event.eventId === id),
    'EVENT_NOT_FOUND',
    'Event not found.'
  );
}

export async function listLogs(filters = {}) {
  const store = await readStore();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  let logs = store.logs;
  if (filters.logId) logs = logs.filter((log) => log.id === filters.logId || log.requestId === filters.logId);
  if (filters.ruleId) logs = logs.filter((log) => log.ruleId === filters.ruleId);
  if (filters.eventId) logs = logs.filter((log) => log.eventId === filters.eventId);
  if (filters.templateId) logs = logs.filter((log) => log.templateId === filters.templateId);
  if (filters.phone) logs = logs.filter((log) => log.phone === filters.phone);
  if (filters.status) logs = logs.filter((log) => log.status === filters.status);
  if (filters.scene) logs = logs.filter((log) => log.scene === filters.scene);
  if (filters.provider) logs = logs.filter((log) => log.provider === filters.provider);
  if (filters.triggerType) logs = logs.filter((log) => log.triggerType === filters.triggerType);
  if (filters.timeRange) {
    const days = Number(filters.timeRange);
    if (Number.isFinite(days) && days > 0) {
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      logs = logs.filter((log) => new Date(log.createdAt).getTime() >= since);
    }
  }
  if (filters.startDate) {
    const start = new Date(`${filters.startDate}T00:00:00`).getTime();
    if (Number.isFinite(start)) logs = logs.filter((log) => new Date(log.createdAt).getTime() >= start);
  }
  if (filters.endDate) {
    const end = new Date(`${filters.endDate}T23:59:59`).getTime();
    if (Number.isFinite(end)) logs = logs.filter((log) => new Date(log.createdAt).getTime() <= end);
  }
  if (filters.keyword) {
    const keyword = String(filters.keyword).trim().toLowerCase();
    logs = logs.filter((log) => [
      log.id,
      log.requestId,
      log.bizId,
      log.ruleName,
      log.eventId,
      log.eventType,
      log.templateName,
      log.templateCode,
      log.phoneMasked,
      log.code,
      log.message
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)));
  }
  const total = logs.length;
  return { items: logs.slice((page - 1) * pageSize, page * pageSize).map(safeLog), total, page, pageSize };
}

export async function getLog(id) {
  const store = await readStore();
  return detailResult(
    store.logs.find((log) => log.id === id || log.requestId === id || log.bizId === id),
    'SEND_LOG_NOT_FOUND',
    'Send log not found.',
    safeLog
  );
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

export async function getReceipt(id) {
  const store = await readStore();
  return detailResult(
    store.receipts.find((receipt) => receipt.id === id || receipt.requestId === id || receipt.bizId === id),
    'RECEIPT_NOT_FOUND',
    'Receipt not found.',
    safeReceipt
  );
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

export async function getClickLog(id) {
  const store = await readStore();
  return detailResult(
    store.clickLogs.find((click) => click.id === id || click.shortCode === id || click.logId === id),
    'CLICK_LOG_NOT_FOUND',
    'Click log not found.'
  );
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
