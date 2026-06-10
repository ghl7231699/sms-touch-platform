import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { config } from '../../config/env.js';
import { createId } from '../../utils/ids.js';
import { maskPhone } from '../../utils/mask-phone.js';
import { mutateStore, readStore } from '../sms/sms.repository.js';

const prisma = new PrismaClient();
const PHONE_PATTERN = /^1\d{10}$/;
const SESSION_TTL_DAYS = 7;
const now = () => new Date().toISOString();

export const ROLE_DEFINITIONS = [
  {
    code: 'admin',
    name: '系统管理员',
    description: '拥有平台全部配置、账号、审计和触达操作权限。',
    permissions: ['*']
  },
  {
    code: 'operator',
    name: '运营人员',
    description: '负责模板、规则、事件、任务和发送操作，可查看治理结果。',
    permissions: [
      'dashboard.read',
      'template.manage',
      'rule.manage',
      'manual_send.manage',
      'event.manage',
      'task.manage',
      'send_log.read',
      'whitelist.read',
      'blacklist.read',
      'unsubscribe.read',
      'setting.read',
      'event_source.read',
      'operation_log.read'
    ]
  },
  {
    code: 'readonly',
    name: '只读观察员',
    description: '只能查看平台运行数据和审计记录，不允许执行写操作。',
    permissions: [
      'dashboard.read',
      'template.read',
      'rule.read',
      'event.read',
      'task.read',
      'send_log.read',
      'whitelist.read',
      'blacklist.read',
      'unsubscribe.read',
      'setting.read',
      'event_source.read',
      'operation_log.read'
    ]
  }
];

const SYSTEM_SETTING_DEFAULTS = {
  'sms.provider': { provider: config.smsProvider },
  'sms.worker': {
    enabled: config.taskWorker.enabled,
    intervalMs: config.taskWorker.intervalMs,
    batchSize: config.taskWorker.batchSize,
    allowRealSend: config.taskWorker.allowRealSend
  },
  'sms.short_link': { enabled: true, baseUrl: config.shortLinkBaseUrl, targetUrl: config.shortLinkDefaultTarget },
  'sms.safety': { requireWhitelistForMock: false, requireWhitelistForRealProvider: true },
  'sms.verification_code': { validMinutes: 5, resendIntervalSeconds: 60, dailyLimit: 10 },
  'sms.receipt': { enabled: true, allowMockDelivered: true },
  'sms.aliyun': {
    credentialMode: 'env',
    endpoint: config.aliyun.endpoint,
    region: config.aliyun.region,
    signName: config.aliyun.signName,
    templateCode: config.aliyun.templateCode
  }
};

function ok(body, statusCode = 200) {
  return { statusCode, body };
}

function fail(code, message, statusCode = 400, extra = {}) {
  return { statusCode, body: { success: false, code, message, ...extra } };
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), actual);
}

function createSecret(prefix = 'sms') {
  return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
}

function normalizePhone(phone) {
  return String(phone || '').trim();
}

function actorPermissions(user) {
  const permissions = new Set();
  for (const item of user.roles || []) {
    for (const permission of item.role.permissions || []) permissions.add(permission);
  }
  return [...permissions];
}

function safeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles: (user.roles || []).map((item) => ({
      id: item.role.id,
      code: item.role.code,
      name: item.role.name,
      permissions: item.role.permissions || []
    })),
    permissions: actorPermissions(user)
  };
}

function hasPermission(actor, permission) {
  if (!permission) return true;
  return actor.permissions.includes('*') || actor.permissions.includes(permission);
}

function requestMeta(req) {
  return {
    ip: req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] || ''
  };
}

async function getActor(req) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) return null;
  const session = await prisma.authSession.findFirst({
    where: {
      tokenHash: hashValue(token),
      revokedAt: null,
      expiresAt: { gt: new Date() }
    },
    include: {
      user: {
        include: {
          roles: { include: { role: true } }
        }
      }
    }
  });
  if (!session || session.user.status !== 'active') return null;
  await prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return { ...safeUser(session.user), sessionId: session.id, permissions: actorPermissions(session.user) };
}

async function requireActor(req, permission) {
  const actor = await getActor(req);
  if (!actor) return { error: fail('UNAUTHORIZED', '请先登录。', 401) };
  if (!hasPermission(actor, permission)) return { error: fail('FORBIDDEN', '当前账号没有执行该操作的权限。', 403) };
  return { actor };
}

async function writeOperationLog({ req, actor, action, resource, resourceId, requestBody, result = 'success', statusCode = 200, errorMessage }) {
  const meta = requestMeta(req);
  await prisma.adminOperationLog.create({
    data: {
      id: createId(),
      userId: actor?.id || null,
      userName: actor?.name || null,
      action,
      resource,
      resourceId: resourceId || null,
      method: req.method,
      path: req.url,
      ip: meta.ip,
      userAgent: meta.userAgent,
      requestBody: requestBody || {},
      result,
      statusCode,
      errorMessage: errorMessage || null
    }
  });
}

function toRole(role) {
  return {
    id: role.id,
    code: role.code,
    name: role.name,
    description: role.description,
    permissions: role.permissions || [],
    status: role.status
  };
}

async function ensureRole(code) {
  const definition = ROLE_DEFINITIONS.find((item) => item.code === code) || ROLE_DEFINITIONS[1];
  return prisma.adminRole.upsert({
    where: { code: definition.code },
    create: { id: createId(), ...definition },
    update: {
      name: definition.name,
      description: definition.description,
      permissions: definition.permissions,
      status: 'active'
    }
  });
}

async function resolveRoleIds(input = {}) {
  if (Array.isArray(input.roleIds) && input.roleIds.length) {
    const roles = await prisma.adminRole.findMany({ where: { id: { in: input.roleIds }, status: 'active' } });
    return roles.map((role) => role.id);
  }
  const codes = Array.isArray(input.roleCodes) ? input.roleCodes : input.roleCode ? [input.roleCode] : [];
  if (codes.length) {
    const roles = await prisma.adminRole.findMany({ where: { code: { in: codes }, status: 'active' } });
    if (roles.length) return roles.map((role) => role.id);
  }
  return null;
}

function parsePage(filters = {}) {
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function contains(value) {
  return value ? { contains: String(value), mode: 'insensitive' } : undefined;
}

function dateRange(filters = {}, field = 'createdAt') {
  const from = filters.dateFrom || filters.startDate || filters.createdFrom;
  const to = filters.dateTo || filters.endDate || filters.createdTo;
  const range = {};
  if (from) {
    const value = new Date(from);
    if (!Number.isNaN(value.getTime())) range.gte = value;
  }
  if (to) {
    const value = new Date(to);
    if (!Number.isNaN(value.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(to))) value.setHours(23, 59, 59, 999);
      range.lte = value;
    }
  }
  return Object.keys(range).length ? { [field]: range } : {};
}

async function listWithCount(model, args, mapItem = (item) => item) {
  const { page, pageSize, skip } = parsePage(args.filters);
  const [items, total] = await Promise.all([
    model.findMany({ ...(args.query || {}), skip, take: pageSize }),
    model.count({ where: args.query?.where || {} })
  ]);
  return { items: items.map(mapItem), total, page, pageSize };
}

async function getSettingsObject() {
  const rows = await prisma.systemSetting.findMany();
  const settings = { ...SYSTEM_SETTING_DEFAULTS };
  for (const row of rows) settings[row.key] = row.value;
  const policies = await prisma.smsFrequencyPolicy.findMany({ orderBy: { scene: 'asc' } });
  settings['sms.frequency'] = {
    policies: policies.map((policy) => ({
      scene: policy.scene,
      dailyLimit: policy.dailyLimit,
      weeklyLimit: policy.weeklyLimit,
      cooldownMinutes: policy.cooldownMinutes,
      quietStart: policy.quietStart,
      quietEnd: policy.quietEnd,
      status: policy.status
    }))
  };
  return settings;
}

export async function getSmsProviderName() {
  const settings = await getSettingsObject();
  return settings['sms.provider']?.provider || config.smsProvider;
}

export async function getShortLinkSettings() {
  const settings = await getSettingsObject();
  return settings['sms.short_link'] || SYSTEM_SETTING_DEFAULTS['sms.short_link'];
}

async function getVerificationCodeSettings() {
  const settings = await getSettingsObject();
  return settings['sms.verification_code'] || SYSTEM_SETTING_DEFAULTS['sms.verification_code'];
}

function settingRowsFromObject(input = {}) {
  return Object.entries(input)
    .filter(([key]) => Object.prototype.hasOwnProperty.call(SYSTEM_SETTING_DEFAULTS, key))
    .map(([key, value]) => ({ key, value }));
}

function approvalSummary(payload = {}) {
  const impact = payload.impact || {};
  return {
    scenario: payload.scenario || payload.execute?.type || 'manual',
    reason: payload.reason || '',
    riskLevel: payload.riskLevel || 'medium',
    impact
  };
}

async function createApproval({ req, actor, title, resource, resourceId, action, payload, comment }) {
  const item = await prisma.approvalOrder.create({
    data: {
      id: createId(),
      title,
      resource,
      resourceId: resourceId || null,
      action,
      payload: {
        ...payload,
        summary: approvalSummary(payload)
      },
      createdById: actor.id,
      records: { create: { id: createId(), action: 'create', operatorId: actor.id, comment: comment || null } }
    },
    include: { records: true }
  });
  await writeOperationLog({ req, actor, action: 'create', resource: 'approval_order', resourceId: item.id, requestBody: { title, resource, resourceId, action, payload } });
  return item;
}

async function applySystemSettings(settings = {}) {
  const rows = settingRowsFromObject(settings);
  for (const row of rows) {
    await prisma.systemSetting.upsert({
      where: { key: row.key },
      create: { id: createId(), key: row.key, value: row.value },
      update: { value: row.value }
    });
  }
  const frequencyPolicies = Array.isArray(settings['sms.frequency']?.policies) ? settings['sms.frequency'].policies : [];
  for (const policy of frequencyPolicies) {
    const scene = String(policy.scene || '').trim();
    if (!scene) continue;
    await prisma.smsFrequencyPolicy.upsert({
      where: { scene },
      create: {
        id: createId(),
        scene,
        dailyLimit: Math.max(Number(policy.dailyLimit) || 1, 1),
        weeklyLimit: Math.max(Number(policy.weeklyLimit) || 1, 1),
        cooldownMinutes: Math.max(Number(policy.cooldownMinutes) || 0, 0),
        quietStart: policy.quietStart || '21:00',
        quietEnd: policy.quietEnd || '09:00',
        status: policy.status === 'disabled' ? 'disabled' : 'enabled'
      },
      update: {
        dailyLimit: Math.max(Number(policy.dailyLimit) || 1, 1),
        weeklyLimit: Math.max(Number(policy.weeklyLimit) || 1, 1),
        cooldownMinutes: Math.max(Number(policy.cooldownMinutes) || 0, 0),
        quietStart: policy.quietStart || '21:00',
        quietEnd: policy.quietEnd || '09:00',
        status: policy.status === 'disabled' ? 'disabled' : 'enabled'
      }
    });
  }
  return {
    appliedKeys: [
      ...rows.map((row) => row.key),
      ...(frequencyPolicies.length ? ['sms.frequency'] : [])
    ]
  };
}

async function applyRuleStatus(ruleId, status) {
  let updated = null;
  await mutateStore((store) => {
    const item = store.rules.find((rule) => rule.id === ruleId);
    if (!item) return;
    item.status = status === 'disabled' ? 'disabled' : 'enabled';
    item.updatedAt = now();
    updated = item;
  });
  if (!updated) throw new Error('规则不存在，审批动作无法执行。');
  return { ruleId, status: updated.status };
}

async function executeApproval(item) {
  const execute = item.payload?.execute;
  if (!execute?.type) return { executed: false, message: '审批单未绑定待执行动作。' };
  if (execute.type === 'update_system_settings') {
    const result = await applySystemSettings(execute.settings || {});
    return { executed: true, type: execute.type, result };
  }
  if (execute.type === 'update_rule_status') {
    const result = await applyRuleStatus(execute.ruleId, execute.status);
    return { executed: true, type: execute.type, result };
  }
  if (execute.type === 'create_export_task') {
    const task = await prisma.exportTask.create({
      data: {
        id: createId(),
        name: execute.name || `${execute.resource || 'data'} 导出`,
        resource: execute.resource || 'operation_log',
        status: 'completed',
        fileName: `${execute.resource || 'data'}_${Date.now()}.json`,
        criteria: execute.criteria || {},
        createdById: item.createdById,
        completedAt: new Date()
      }
    });
    return { executed: true, type: execute.type, result: { exportTaskId: task.id } };
  }
  throw new Error(`不支持的审批执行类型：${execute.type}`);
}

function isHighRiskSettingsChange(current, next) {
  const currentProvider = current['sms.provider']?.provider || 'mock';
  const nextProvider = next['sms.provider']?.provider || currentProvider;
  const currentSafety = current['sms.safety'] || {};
  const nextSafety = next['sms.safety'] || currentSafety;
  const currentWorker = current['sms.worker'] || {};
  const nextWorker = next['sms.worker'] || currentWorker;
  const nextRealProvider = nextProvider !== 'mock';
  return (
    currentProvider !== nextProvider ||
    currentSafety.requireWhitelistForRealProvider !== false && nextSafety.requireWhitelistForRealProvider === false ||
    nextRealProvider && !currentWorker.enabled && nextWorker.enabled ||
    nextRealProvider && !currentWorker.allowRealSend && nextWorker.allowRealSend
  );
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || '00:00').split(':').map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function inQuietHours(nowDate, start, end) {
  const current = nowDate.getHours() * 60 + nowDate.getMinutes();
  const startValue = timeToMinutes(start);
  const endValue = timeToMinutes(end);
  if (startValue === endValue) return false;
  if (startValue < endValue) return current >= startValue && current < endValue;
  return current >= startValue || current < endValue;
}

async function checkFrequency({ phone, scene }) {
  const policy = await prisma.smsFrequencyPolicy.findUnique({ where: { scene } });
  const activePolicy = policy && policy.status === 'enabled'
    ? policy
    : {
        dailyLimit: 1,
        weeklyLimit: 3,
        cooldownMinutes: 1440,
        quietStart: '21:00',
        quietEnd: '09:00'
      };
  const nowDate = new Date();
  if (inQuietHours(nowDate, activePolicy.quietStart, activePolicy.quietEnd)) {
    return {
      passed: false,
      code: 'QUIET_HOURS',
      message: `当前处于安静时段 ${activePolicy.quietStart}-${activePolicy.quietEnd}。`,
      nextPlanTime: null
    };
  }

  const dayStart = new Date(nowDate);
  dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const cooldownStart = new Date(nowDate.getTime() - Number(activePolicy.cooldownMinutes) * 60 * 1000);

  const [dailyCount, weeklyCount, cooldownCount] = await Promise.all([
    prisma.smsSendLog.count({ where: { phone, scene, status: 'success', createdAt: { gte: dayStart } } }),
    prisma.smsSendLog.count({ where: { phone, scene, status: 'success', createdAt: { gte: weekStart } } }),
    prisma.smsSendLog.count({ where: { phone, scene, status: 'success', createdAt: { gte: cooldownStart } } })
  ]);

  if (dailyCount >= Number(activePolicy.dailyLimit)) {
    return { passed: false, code: 'DAILY_LIMIT_REACHED', message: '该号码已达到场景日频控上限。' };
  }
  if (weeklyCount >= Number(activePolicy.weeklyLimit)) {
    return { passed: false, code: 'WEEKLY_LIMIT_REACHED', message: '该号码已达到场景周频控上限。' };
  }
  if (cooldownCount > 0) {
    return { passed: false, code: 'COOLDOWN_ACTIVE', message: '该号码仍在场景冷却期内。' };
  }
  return { passed: true, code: 'PASSED', message: '频控通过。' };
}

export async function checkSendSafety({ phone, scene = 'manual', provider = config.smsProvider, triggerType = 'manual' }) {
  const normalizedPhone = normalizePhone(phone);
  const settings = await getSettingsObject();
  const requireWhitelist = provider === 'mock'
    ? Boolean(settings['sms.safety']?.requireWhitelistForMock)
    : settings['sms.safety']?.requireWhitelistForRealProvider !== false;

  const workerSettings = settings['sms.worker'] || {};
  const checks = {
    provider: { status: provider === 'mock' || config.aliyun.accessKeyId ? 'passed' : 'blocked' },
    worker: { status: triggerType === 'auto' && !workerSettings.enabled ? 'warning' : 'passed' },
    whitelist: { status: 'skipped' },
    blacklist: { status: 'passed' },
    unsubscribe: { status: 'passed' },
    frequency: { status: 'passed' },
    quietHours: { status: 'passed' }
  };

  if (!PHONE_PATTERN.test(normalizedPhone)) {
    return {
      passed: false,
      finalAction: 'block',
      checks,
      blockedReason: { code: 'PHONE_INVALID', message: '手机号格式不正确。' },
      nextPlanTime: null
    };
  }

  if (checks.provider.status === 'blocked') {
    return {
      passed: false,
      finalAction: 'block',
      checks,
      blockedReason: { code: 'PROVIDER_NOT_CONFIGURED', message: '真实短信服务商未完成密钥配置。' },
      nextPlanTime: null
    };
  }

  if (requireWhitelist) {
    const inDbWhitelist = await prisma.smsWhitelist.findFirst({
      where: {
        phone: normalizedPhone,
        status: 'enabled',
        OR: [{ scene: null }, { scene }, { scene: '' }]
      }
    });
    const inEnvWhitelist = config.whitelist.includes(normalizedPhone);
    checks.whitelist.status = inDbWhitelist || inEnvWhitelist ? 'passed' : 'blocked';
    if (checks.whitelist.status === 'blocked') {
      return {
        passed: false,
        finalAction: 'block',
        checks,
        blockedReason: { code: 'PHONE_NOT_IN_WHITELIST', message: '手机号不在允许发送白名单内。' },
        nextPlanTime: null
      };
    }
  }

  const blacklist = await prisma.smsBlacklist.findFirst({
    where: {
      phone: normalizedPhone,
      status: 'active',
      OR: [{ scene: null }, { scene }, { scene: '' }]
    }
  });
  if (blacklist) {
    checks.blacklist.status = 'blocked';
    return {
      passed: false,
      finalAction: 'block',
      checks,
      blockedReason: { code: 'PHONE_IN_BLACKLIST', message: blacklist.reason || '手机号命中黑名单。' },
      nextPlanTime: null
    };
  }

  const unsubscribe = await prisma.smsUnsubscribe.findFirst({
    where: {
      phone: normalizedPhone,
      status: 'active',
      OR: [{ scene: '' }, { scene }]
    }
  });
  if (unsubscribe) {
    checks.unsubscribe.status = 'blocked';
    return {
      passed: false,
      finalAction: 'block',
      checks,
      blockedReason: { code: 'PHONE_UNSUBSCRIBED', message: '手机号已退订该场景触达。' },
      nextPlanTime: null
    };
  }

  const frequency = await checkFrequency({ phone: normalizedPhone, scene });
  if (!frequency.passed) {
    if (frequency.code === 'QUIET_HOURS') checks.quietHours.status = 'blocked';
    else checks.frequency.status = 'blocked';
    return {
      passed: false,
      finalAction: 'block',
      checks,
      blockedReason: { code: frequency.code, message: frequency.message },
      nextPlanTime: frequency.nextPlanTime || null
    };
  }

  return {
    passed: true,
    finalAction: 'send',
    checks,
    blockedReason: null,
    nextPlanTime: null
  };
}

export async function recordEventSourceLog({ source, input, req, status, code, message }) {
  const meta = requestMeta(req);
  return prisma.eventSourceLog.create({
    data: {
      id: createId(),
      sourceId: source?.id || null,
      appId: input.appId || source?.appId || null,
      eventType: input.eventType || null,
      eventId: input.eventId || null,
      status,
      code,
      message,
      ip: meta.ip,
      userAgent: meta.userAgent,
      payload: input || {}
    }
  });
}

export async function verifyEventSourceRequest(req, input = {}) {
  const appId = input.appId || req.headers['x-event-app-id'];
  const secret = input.secret || req.headers['x-event-secret'];
  if (!appId) return { passed: true, source: null };
  const source = await prisma.eventSource.findUnique({ where: { appId: String(appId) } });
  if (!source || source.status !== 'enabled') {
    await recordEventSourceLog({
      source,
      input: { ...input, appId },
      req,
      status: 'failed',
      code: 'EVENT_SOURCE_DISABLED',
      message: '事件来源不存在或已停用。'
    });
    return { passed: false, error: fail('EVENT_SOURCE_DISABLED', '事件来源不存在或已停用。', 403) };
  }
  if (!secret || hashValue(secret) !== source.secretHash) {
    await recordEventSourceLog({
      source,
      input: { ...input, appId },
      req,
      status: 'failed',
      code: 'EVENT_SOURCE_SECRET_INVALID',
      message: '事件来源密钥不正确。'
    });
    return { passed: false, error: fail('EVENT_SOURCE_SECRET_INVALID', '事件来源密钥不正确。', 401) };
  }
  return { passed: true, source };
}

async function routePublicAuth(req, url, readJson) {
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req);
    const user = await prisma.adminUser.findUnique({
      where: { email: String(body.email || '').trim().toLowerCase() },
      include: { roles: { include: { role: true } } }
    });
    if (!user || !verifyPassword(body.password, user.passwordHash)) return fail('LOGIN_FAILED', '账号或密码不正确。', 401);
    if (user.status !== 'active') return fail('USER_DISABLED', '账号不可用，请联系管理员。', 403);
    const token = createSecret('session');
    const meta = requestMeta(req);
    await prisma.authSession.create({
      data: {
        id: createId(),
        userId: user.id,
        tokenHash: hashValue(token),
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
      }
    });
    await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeOperationLog({ req, actor: safeUser(user), action: 'login', resource: 'auth', resourceId: user.id, statusCode: 200 });
    return ok({ success: true, token, user: safeUser(user) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register-request') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.name) return fail('REGISTER_INFO_REQUIRED', '姓名和邮箱必填。');
    const exists = await prisma.adminUser.findUnique({ where: { email } });
    if (exists) return fail('USER_ALREADY_EXISTS', '该邮箱已存在账号。', 409);
    const item = await prisma.authRegisterRequest.create({
      data: {
        id: createId(),
        email,
        name: String(body.name).trim(),
        phone: body.phone ? normalizePhone(body.phone) : null,
        reason: body.reason || null,
        requestedRole: body.requestedRole || 'operator'
      }
    });
    return ok({ success: true, item }, 201);
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password/send-code') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) return fail('USER_NOT_FOUND', '账号不存在。', 404);
    const codeSettings = await getVerificationCodeSettings();
    const resendAfter = new Date(Date.now() - Number(codeSettings.resendIntervalSeconds || 60) * 1000);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [recentCode, dailyCount] = await Promise.all([
      prisma.authVerificationCode.findFirst({
        where: { email, purpose: 'reset_password', createdAt: { gte: resendAfter } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.authVerificationCode.count({
        where: { email, purpose: 'reset_password', createdAt: { gte: dayStart } }
      })
    ]);
    if (recentCode) return fail('VERIFICATION_CODE_TOO_FREQUENT', '验证码发送过于频繁，请稍后再试。', 429);
    if (dailyCount >= Number(codeSettings.dailyLimit || 10)) return fail('VERIFICATION_CODE_DAILY_LIMIT', '今日验证码发送次数已达上限。', 429);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await prisma.authVerificationCode.create({
      data: {
        id: createId(),
        email,
        codeHash: hashValue(code),
        purpose: 'reset_password',
        expiresAt: new Date(Date.now() + Number(codeSettings.validMinutes || 5) * 60 * 1000)
      }
    });
    return ok({ success: true, message: '验证码已生成。', devCode: await getSmsProviderName() === 'mock' ? code : undefined });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/forgot-password/verify-code') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const codeHash = hashValue(body.code || '');
    const item = await prisma.authVerificationCode.findFirst({
      where: { email, codeHash, purpose: 'reset_password', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    if (!item) return fail('CODE_INVALID', '验证码无效或已过期。', 400);
    await prisma.authVerificationCode.update({ where: { id: item.id }, data: { consumedAt: new Date() } });
    const user = await prisma.adminUser.findUnique({ where: { email } });
    const token = createSecret('reset');
    await prisma.authPasswordSetupToken.create({
      data: {
        id: createId(),
        userId: user.id,
        tokenHash: hashValue(token),
        purpose: 'reset_password',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });
    return ok({ success: true, resetToken: token });
  }

  if (req.method === 'POST' && (url.pathname === '/api/auth/reset-password' || url.pathname === '/api/auth/set-password')) {
    const body = await readJson(req);
    if (!body.token || !body.password) return fail('TOKEN_PASSWORD_REQUIRED', 'token 和新密码必填。');
    const tokenRow = await prisma.authPasswordSetupToken.findFirst({
      where: {
        tokenHash: hashValue(body.token),
        usedAt: null,
        expiresAt: { gt: new Date() }
      }
    });
    if (!tokenRow) return fail('TOKEN_INVALID', '设置密码链接无效或已过期。', 400);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: tokenRow.userId }, data: { passwordHash: hashPassword(body.password), status: 'active' } }),
      prisma.authPasswordSetupToken.update({ where: { id: tokenRow.id }, data: { usedAt: new Date() } })
    ]);
    return ok({ success: true });
  }

  return null;
}

async function routeAuth(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/auth/me') return ok({ user: actor });
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    await prisma.authSession.update({ where: { id: actor.sessionId }, data: { revokedAt: new Date() } });
    await writeOperationLog({ req, actor, action: 'logout', resource: 'auth', resourceId: actor.id });
    return ok({ success: true });
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/change-password') {
    const body = await readJson(req);
    const user = await prisma.adminUser.findUnique({ where: { id: actor.id } });
    if (!verifyPassword(body.oldPassword, user.passwordHash)) return fail('OLD_PASSWORD_INVALID', '原密码不正确。', 400);
    await prisma.adminUser.update({ where: { id: actor.id }, data: { passwordHash: hashPassword(body.newPassword) } });
    await writeOperationLog({ req, actor, action: 'change_password', resource: 'auth', resourceId: actor.id });
    return ok({ success: true });
  }
  return null;
}

async function routeUsers(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/users') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.adminUser, {
      filters,
      query: {
        where: {
          ...(filters.keyword ? { OR: [{ email: contains(filters.keyword) }, { name: contains(filters.keyword) }, { phone: contains(filters.keyword) }] } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' },
        include: { roles: { include: { role: true } } }
      }
    }, safeUser));
  }

  if (req.method === 'POST' && url.pathname === '/api/users') {
    const body = await readJson(req);
    if (!body.email || !body.name) return fail('USER_INFO_REQUIRED', '邮箱和姓名必填。');
    const role = await ensureRole(body.roleCode || 'operator');
    const tempPassword = body.password || `Sms${Math.random().toString(36).slice(2, 8)}!`;
    const user = await prisma.adminUser.create({
      data: {
        id: createId(),
        email: String(body.email).trim().toLowerCase(),
        name: String(body.name).trim(),
        phone: body.phone ? normalizePhone(body.phone) : null,
        passwordHash: hashPassword(tempPassword),
        roles: { create: { id: createId(), roleId: role.id } }
      },
      include: { roles: { include: { role: true } } }
    });
    await writeOperationLog({ req, actor, action: 'create', resource: 'admin_user', resourceId: user.id, requestBody: { email: user.email, roleCode: role.code } });
    return ok({ success: true, item: safeUser(user), initialPassword: body.password ? undefined : tempPassword }, 201);
  }

  const statusMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/status$/);
  if (req.method === 'POST' && statusMatch) {
    const body = await readJson(req);
    const user = await prisma.adminUser.update({
      where: { id: statusMatch[1] },
      data: { status: body.status || 'active' },
      include: { roles: { include: { role: true } } }
    });
    await writeOperationLog({ req, actor, action: 'change_status', resource: 'admin_user', resourceId: user.id, requestBody: body });
    return ok({ success: true, item: safeUser(user) });
  }

  const resetMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
  if (req.method === 'POST' && resetMatch) {
    const token = createSecret('setup');
    await prisma.authPasswordSetupToken.create({
      data: {
        id: createId(),
        userId: resetMatch[1],
        tokenHash: hashValue(token),
        purpose: 'admin_reset_password',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    await writeOperationLog({ req, actor, action: 'reset_password', resource: 'admin_user', resourceId: resetMatch[1] });
    return ok({ success: true, setupToken: token });
  }

  const updateMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/update$/);
  if (req.method === 'POST' && updateMatch) {
    const body = await readJson(req);
    const roleIds = await resolveRoleIds(body);
    if ((body.roleIds || body.roleCodes || body.roleCode) && (!roleIds || !roleIds.length)) {
      return fail('ROLE_REQUIRED', '至少需要分配一个有效角色。');
    }
    await prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { id: updateMatch[1] },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone ? normalizePhone(body.phone) : null } : {})
        }
      });
      if (roleIds) {
        await tx.adminUserRole.deleteMany({ where: { userId: updateMatch[1] } });
        for (const roleId of roleIds) {
          await tx.adminUserRole.create({ data: { id: createId(), userId: updateMatch[1], roleId } });
        }
      }
    });
    const user = await prisma.adminUser.findUnique({ where: { id: updateMatch[1] }, include: { roles: { include: { role: true } } } });
    if (!user) return fail('USER_NOT_FOUND', '用户不存在。', 404);
    await writeOperationLog({ req, actor, action: 'update', resource: 'admin_user', resourceId: user.id, requestBody: body });
    return ok({ success: true, item: safeUser(user) });
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === 'GET' && userMatch) {
    const user = await prisma.adminUser.findUnique({ where: { id: userMatch[1] }, include: { roles: { include: { role: true } } } });
    if (!user) return fail('USER_NOT_FOUND', '用户不存在。', 404);
    return ok({ item: safeUser(user) });
  }

  return null;
}

async function routeRegisterRequests(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/auth/register-requests') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.authRegisterRequest, {
      filters,
      query: {
        where: filters.status ? { status: filters.status } : {},
        orderBy: { createdAt: 'desc' }
      }
    }));
  }
  const match = url.pathname.match(/^\/api\/auth\/register-requests\/([^/]+)(?:\/(approve|reject))?$/);
  if (!match) return null;
  const id = match[1];
  const action = match[2];
  if (req.method === 'GET' && !action) {
    const item = await prisma.authRegisterRequest.findUnique({ where: { id } });
    if (!item) return fail('REGISTER_REQUEST_NOT_FOUND', '注册申请不存在。', 404);
    return ok({ item });
  }
  if (req.method === 'POST' && action === 'approve') {
    const body = await readJson(req);
    const request = await prisma.authRegisterRequest.findUnique({ where: { id } });
    if (!request || request.status !== 'pending') return fail('REGISTER_REQUEST_INVALID', '注册申请不可审核。', 409);
    const role = await ensureRole(body.roleCode || request.requestedRole || 'operator');
    const initialPassword = body.password || `Sms${Math.random().toString(36).slice(2, 8)}!`;
    const user = await prisma.adminUser.create({
      data: {
        id: createId(),
        email: request.email,
        name: request.name,
        phone: request.phone,
        passwordHash: hashPassword(initialPassword),
        roles: { create: { id: createId(), roleId: role.id } }
      }
    });
    await prisma.authRegisterRequest.update({
      where: { id },
      data: { status: 'approved', reviewedById: actor.id, reviewedAt: new Date(), createdUserId: user.id }
    });
    await writeOperationLog({ req, actor, action: 'approve', resource: 'auth_register_request', resourceId: id, requestBody: { roleCode: role.code } });
    return ok({ success: true, userId: user.id, initialPassword: body.password ? undefined : initialPassword });
  }
  if (req.method === 'POST' && action === 'reject') {
    const body = await readJson(req);
    await prisma.authRegisterRequest.update({
      where: { id },
      data: { status: 'rejected', reviewedById: actor.id, reviewedAt: new Date(), rejectReason: body.reason || null }
    });
    await writeOperationLog({ req, actor, action: 'reject', resource: 'auth_register_request', resourceId: id, requestBody: body });
    return ok({ success: true });
  }
  return null;
}

async function routeRoles(req, url) {
  if (req.method === 'GET' && url.pathname === '/api/roles') {
    const roles = await prisma.adminRole.findMany({ orderBy: { code: 'asc' } });
    return ok({ items: roles.map(toRole), total: roles.length });
  }
  const match = url.pathname.match(/^\/api\/roles\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const role = await prisma.adminRole.findFirst({ where: { OR: [{ id: match[1] }, { code: match[1] }] } });
    if (!role) return fail('ROLE_NOT_FOUND', '角色不存在。', 404);
    return ok({ item: toRole(role) });
  }
  return null;
}

async function routePhoneList(req, url, readJson, actor) {
  const resources = [
    { path: 'whitelist', model: prisma.smsWhitelist, resource: 'sms_whitelist', activeStatus: 'enabled' },
    { path: 'blacklist', model: prisma.smsBlacklist, resource: 'sms_blacklist', activeStatus: 'active' },
    { path: 'unsubscribes', model: prisma.smsUnsubscribe, resource: 'sms_unsubscribe', activeStatus: 'active' }
  ];
  for (const item of resources) {
    if (req.method === 'GET' && url.pathname === `/api/${item.path}`) {
      const filters = Object.fromEntries(url.searchParams.entries());
      return ok(await listWithCount(item.model, {
        filters,
        query: {
          where: {
            ...(filters.phone ? { phone: contains(filters.phone) } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.scene ? { scene: filters.scene } : {}),
            ...(filters.source && item.path !== 'whitelist' ? { source: filters.source } : {}),
            ...dateRange(filters)
          },
          orderBy: { createdAt: 'desc' }
        }
      }));
    }
    if (req.method === 'POST' && url.pathname === `/api/${item.path}`) {
      const body = await readJson(req);
      const phone = normalizePhone(body.phone);
      if (!PHONE_PATTERN.test(phone)) return fail('PHONE_INVALID', '手机号格式不正确。');
      const data = {
        id: createId(),
        phone,
        phoneMasked: maskPhone(phone),
        scene: body.scene || null,
        status: item.activeStatus
      };
      if (item.path === 'whitelist') Object.assign(data, { remark: body.remark || null, createdById: actor.id });
      if (item.path === 'blacklist') Object.assign(data, { reason: body.reason || null, source: body.source || 'manual', createdById: actor.id });
      if (item.path === 'unsubscribes') Object.assign(data, { scene: body.scene || '', source: body.source || 'manual', remark: body.remark || null });
      const created = await item.model.upsert({
        where: item.path === 'unsubscribes' ? { phone_scene: { phone, scene: body.scene || '' } } : { phone },
        create: data,
        update: { ...data, id: undefined, phone: undefined, phoneMasked: undefined, createdById: actor.id }
      });
      await writeOperationLog({ req, actor, action: 'create', resource: item.resource, resourceId: created.id, requestBody: { phone: maskPhone(phone), scene: body.scene } });
      return ok({ success: true, item: created }, 201);
    }
  }

  const whitelistStatusMatch = url.pathname.match(/^\/api\/whitelist\/([^/]+)\/status$/);
  if (req.method === 'POST' && whitelistStatusMatch) {
    const body = await readJson(req);
    const updated = await prisma.smsWhitelist.update({ where: { id: whitelistStatusMatch[1] }, data: { status: body.status === 'disabled' ? 'disabled' : 'enabled' } });
    await writeOperationLog({ req, actor, action: 'change_status', resource: 'sms_whitelist', resourceId: updated.id, requestBody: body });
    return ok({ success: true, item: updated });
  }

  const whitelistUpdateMatch = url.pathname.match(/^\/api\/whitelist\/([^/]+)\/update$/);
  if (req.method === 'POST' && whitelistUpdateMatch) {
    const body = await readJson(req);
    const updated = await prisma.smsWhitelist.update({ where: { id: whitelistUpdateMatch[1] }, data: { remark: body.remark || null, scene: body.scene || null } });
    await writeOperationLog({ req, actor, action: 'update', resource: 'sms_whitelist', resourceId: updated.id, requestBody: body });
    return ok({ success: true, item: updated });
  }

  const detailMatch = url.pathname.match(/^\/api\/(whitelist|blacklist|unsubscribes)\/([^/]+)$/);
  if (req.method === 'GET' && detailMatch) {
    const resource = resources.find((entry) => entry.path === detailMatch[1]);
    const detail = await resource.model.findUnique({ where: { id: detailMatch[2] } });
    if (!detail) return fail('PHONE_LIST_ITEM_NOT_FOUND', '号码记录不存在。', 404);
    return ok({ item: detail });
  }

  const removeBlacklistMatch = url.pathname.match(/^\/api\/blacklist\/([^/]+)\/remove$/);
  if (req.method === 'POST' && removeBlacklistMatch) {
    const updated = await prisma.smsBlacklist.update({ where: { id: removeBlacklistMatch[1] }, data: { status: 'removed', removedAt: new Date() } });
    await writeOperationLog({ req, actor, action: 'remove', resource: 'sms_blacklist', resourceId: updated.id });
    return ok({ success: true, item: updated });
  }

  if (req.method === 'POST' && (url.pathname === '/api/blacklist/import' || url.pathname === '/api/unsubscribes/import')) {
    const body = await readJson(req);
    const phones = Array.isArray(body.phones) ? body.phones.map(normalizePhone).filter((phone) => PHONE_PATTERN.test(phone)) : [];
    const job = await prisma.batchJob.create({
      data: {
        id: createId(),
        name: url.pathname.includes('blacklist') ? '批量导入黑名单' : '批量导入退订',
        jobType: url.pathname.includes('blacklist') ? 'blacklist_import' : 'unsubscribe_import',
        status: 'completed',
        totalCount: phones.length,
        successCount: phones.length,
        createdById: actor.id,
        items: {
          create: phones.map((phone) => ({ id: createId(), target: maskPhone(phone), status: 'success' }))
        }
      }
    });
    for (const phone of phones) {
      if (url.pathname.includes('blacklist')) {
        await prisma.smsBlacklist.upsert({
          where: { phone },
          create: { id: createId(), phone, phoneMasked: maskPhone(phone), reason: body.reason || '批量导入', source: 'import', createdById: actor.id },
          update: { status: 'active', reason: body.reason || '批量导入', source: 'import' }
        });
      } else {
        await prisma.smsUnsubscribe.upsert({
          where: { phone_scene: { phone, scene: body.scene || '' } },
          create: { id: createId(), phone, phoneMasked: maskPhone(phone), scene: body.scene || '', source: 'import', remark: body.remark || null },
          update: { status: 'active', remark: body.remark || null }
        });
      }
    }
    await writeOperationLog({ req, actor, action: 'import', resource: job.jobType, resourceId: job.id, requestBody: { count: phones.length } });
    return ok({ success: true, jobId: job.id, imported: phones.length });
  }

  if (req.method === 'POST' && url.pathname === '/api/whitelist/export') {
    const task = await prisma.exportTask.create({
      data: {
        id: createId(),
        name: '白名单导出',
        resource: 'sms_whitelist',
        status: 'completed',
        fileName: `sms_whitelist_${Date.now()}.json`,
        criteria: Object.fromEntries(url.searchParams.entries()),
        createdById: actor.id,
        completedAt: new Date()
      }
    });
    await writeOperationLog({ req, actor, action: 'export', resource: 'sms_whitelist', resourceId: task.id });
    return ok({ success: true, item: task }, 201);
  }
  return null;
}

async function routeSettings(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/settings') return ok({ settings: await getSettingsObject() });
  if (req.method === 'POST' && url.pathname === '/api/settings/update') {
    const body = await readJson(req);
    const nextSettings = body.settings || body;
    const currentSettings = await getSettingsObject();
    if (!body.approvalId && isHighRiskSettingsChange(currentSettings, nextSettings)) {
      const approval = await createApproval({
        req,
        actor,
        title: '高风险发送控制变更',
        resource: 'system_setting',
        action: 'update',
        payload: {
          scenario: '配置变更',
          reason: body.reason || 'Provider、worker 或白名单保护策略变更',
          riskLevel: 'high',
          before: {
            provider: currentSettings['sms.provider'],
            safety: currentSettings['sms.safety'],
            worker: currentSettings['sms.worker']
          },
          after: {
            provider: nextSettings['sms.provider'],
            safety: nextSettings['sms.safety'],
            worker: nextSettings['sms.worker']
          },
          impact: {
            title: '真实发送安全策略',
            description: '审批通过后才会写入发送控制。'
          },
          execute: { type: 'update_system_settings', settings: nextSettings }
        },
        comment: body.reason || null
      });
      return ok({ success: true, approvalRequired: true, approval }, 202);
    }
    await applySystemSettings(nextSettings);
    await writeOperationLog({ req, actor, action: 'update', resource: 'system_setting', requestBody: body });
    return ok({ success: true, settings: await getSettingsObject() });
  }
  return null;
}

async function routeEventSources(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/event-sources') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.eventSource, {
      filters,
      query: {
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.appId ? { appId: contains(filters.appId) } : {}),
          ...(filters.keyword ? { OR: [{ name: contains(filters.keyword) }, { appId: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' }
      }
    }, (item) => ({ ...item, secretHash: undefined })));
  }
  if (req.method === 'POST' && url.pathname === '/api/event-sources') {
    const body = await readJson(req);
    if (!body.name) return fail('EVENT_SOURCE_NAME_REQUIRED', '事件来源名称必填。');
    const appId = body.appId || `app_${crypto.randomBytes(6).toString('hex')}`;
    const secret = createSecret('evt');
    const item = await prisma.eventSource.create({
      data: {
        id: createId(),
        appId,
        name: body.name,
        secretHash: hashValue(secret),
        secretPreview: `${secret.slice(0, 8)}...${secret.slice(-4)}`,
        remark: body.remark || null
      }
    });
    await writeOperationLog({ req, actor, action: 'create', resource: 'event_source', resourceId: item.id, requestBody: { appId, name: body.name } });
    return ok({ success: true, item: { ...item, secretHash: undefined }, secret }, 201);
  }
  const statusMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)\/status$/);
  if (req.method === 'POST' && statusMatch) {
    const body = await readJson(req);
    const item = await prisma.eventSource.update({ where: { id: statusMatch[1] }, data: { status: body.status === 'disabled' ? 'disabled' : 'enabled' } });
    await writeOperationLog({ req, actor, action: 'change_status', resource: 'event_source', resourceId: item.id, requestBody: body });
    return ok({ success: true, item: { ...item, secretHash: undefined } });
  }
  const resetMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)\/reset-secret$/);
  if (req.method === 'POST' && resetMatch) {
    const secret = createSecret('evt');
    const item = await prisma.eventSource.update({
      where: { id: resetMatch[1] },
      data: { secretHash: hashValue(secret), secretPreview: `${secret.slice(0, 8)}...${secret.slice(-4)}` }
    });
    await writeOperationLog({ req, actor, action: 'reset_secret', resource: 'event_source', resourceId: item.id });
    return ok({ success: true, item: { ...item, secretHash: undefined }, secret });
  }
  const sourceUpdateMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)\/update$/);
  if (req.method === 'POST' && sourceUpdateMatch) {
    const body = await readJson(req);
    const item = await prisma.eventSource.update({ where: { id: sourceUpdateMatch[1] }, data: { name: body.name, remark: body.remark || null } });
    await writeOperationLog({ req, actor, action: 'update', resource: 'event_source', resourceId: item.id, requestBody: body });
    return ok({ success: true, item: { ...item, secretHash: undefined } });
  }
  const sourceMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)$/);
  if (req.method === 'GET' && sourceMatch) {
    const item = await prisma.eventSource.findUnique({ where: { id: sourceMatch[1] } });
    if (!item) return fail('EVENT_SOURCE_NOT_FOUND', '事件来源不存在。', 404);
    return ok({ item: { ...item, secretHash: undefined } });
  }
  return null;
}

async function routeAudit(req, url) {
  if (req.method === 'GET' && url.pathname === '/api/event-source-logs') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.eventSourceLog, {
      filters,
      query: {
        where: {
          ...(filters.appId ? { appId: filters.appId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.eventId ? { eventId: contains(filters.eventId) } : {}),
          ...(filters.eventType ? { eventType: filters.eventType } : {}),
          ...(filters.code ? { code: filters.code } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' }
      }
    }));
  }
  const eventLogMatch = url.pathname.match(/^\/api\/event-source-logs\/([^/]+)$/);
  if (req.method === 'GET' && eventLogMatch) {
    const item = await prisma.eventSourceLog.findUnique({ where: { id: eventLogMatch[1] } });
    if (!item) return fail('EVENT_SOURCE_LOG_NOT_FOUND', '事件接入日志不存在。', 404);
    return ok({ item });
  }
  if (req.method === 'GET' && url.pathname === '/api/operation-logs') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.adminOperationLog, {
      filters,
      query: {
        where: {
          ...(filters.resource ? { resource: filters.resource } : {}),
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.userId ? { userId: filters.userId } : {}),
          ...(filters.userName ? { userName: contains(filters.userName) } : {}),
          ...(filters.result ? { result: filters.result } : {}),
          ...(filters.keyword ? { OR: [{ userName: contains(filters.keyword) }, { resource: contains(filters.keyword) }, { action: contains(filters.keyword) }, { path: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' }
      }
    }));
  }
  const operationLogMatch = url.pathname.match(/^\/api\/operation-logs\/([^/]+)$/);
  if (req.method === 'GET' && operationLogMatch) {
    const item = await prisma.adminOperationLog.findUnique({ where: { id: operationLogMatch[1] } });
    if (!item) return fail('OPERATION_LOG_NOT_FOUND', '操作日志不存在。', 404);
    return ok({ item });
  }
  return null;
}

async function routeAuxiliary(req, url, readJson, actor) {
  if (req.method === 'POST' && (url.pathname === '/api/tasks/batch-cancel' || url.pathname === '/api/tasks/batch-retry')) {
    const body = await readJson(req);
    const isCancel = url.pathname.endsWith('batch-cancel');
    const targetStatus = isCancel ? 'pending' : 'failed';
    const ids = Array.isArray(body.taskIds) ? body.taskIds : [];
    const store = await readStore();
    const candidates = store.tasks.filter((task) => (
      ids.length ? ids.includes(task.id) : task.status === targetStatus
    ));
    const limited = candidates.slice(0, Math.min(Math.max(Number(body.limit) || 50, 1), 200));
    const resultItems = [];
    await mutateStore((current) => {
      for (const task of limited) {
        const currentTask = current.tasks.find((item) => item.id === task.id);
        if (!currentTask) continue;
        if (isCancel && currentTask.status !== 'pending') {
          resultItems.push({ target: task.id, status: 'failed', message: `任务状态为 ${currentTask.status}，不可取消。` });
          continue;
        }
        if (!isCancel && currentTask.status !== 'failed') {
          resultItems.push({ target: task.id, status: 'failed', message: `任务状态为 ${currentTask.status}，不可重试。` });
          continue;
        }
        if (isCancel) {
          currentTask.status = 'cancelled';
          currentTask.lastErrorCode = undefined;
          currentTask.lastErrorMessage = undefined;
        } else {
          currentTask.status = 'pending';
          currentTask.lastErrorCode = undefined;
          currentTask.lastErrorMessage = undefined;
          currentTask.scheduledAt = now();
        }
        currentTask.updatedAt = now();
        resultItems.push({ target: task.id, status: 'success', message: isCancel ? '已取消' : '已重新进入待执行队列' });
      }
    });
    const successCount = resultItems.filter((item) => item.status === 'success').length;
    const job = await prisma.batchJob.create({
      data: {
        id: createId(),
        name: isCancel ? '批量取消待发送任务' : '批量重试失败任务',
        jobType: isCancel ? 'task_cancel' : 'task_retry',
        status: resultItems.some((item) => item.status === 'failed') ? 'partial_failed' : 'completed',
        totalCount: resultItems.length,
        successCount,
        failedCount: resultItems.length - successCount,
        createdById: actor.id,
        items: {
          create: resultItems.map((item) => ({
            id: createId(),
            target: item.target,
            status: item.status,
            message: item.message
          }))
        }
      },
      include: { items: true }
    });
    await writeOperationLog({ req, actor, action: isCancel ? 'batch_cancel' : 'batch_retry', resource: 'sms_task', resourceId: job.id, requestBody: { taskIds: ids, count: resultItems.length } });
    return ok({ success: true, job });
  }

  if (req.method === 'GET' && url.pathname === '/api/export-tasks') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.exportTask, {
      filters,
      query: {
        where: {
          ...(filters.resource ? { resource: filters.resource } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.createdById ? { createdById: filters.createdById } : {}),
          ...(filters.keyword ? { OR: [{ name: contains(filters.keyword) }, { resource: contains(filters.keyword) }, { fileName: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' }
      }
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/export-tasks') {
    const body = await readJson(req);
    if (body.sensitive === true || body.maskSensitive === false) {
      const approval = await createApproval({
        req,
        actor,
        title: `明文${body.name || body.resource || '数据'}导出审批`,
        resource: 'export_task',
        action: 'create',
        payload: {
          scenario: '明文数据导出',
          reason: body.reason || '导出包含敏感字段，需要审批后生成文件。',
          riskLevel: 'high',
          impact: {
            title: body.resource || 'data',
            description: '审批通过后创建导出任务，文件默认 7 天有效。'
          },
          execute: {
            type: 'create_export_task',
            name: body.name,
            resource: body.resource,
            criteria: { ...(body.criteria || {}), sensitive: true }
          }
        },
        comment: body.reason || null
      });
      return ok({ success: true, approvalRequired: true, approval }, 202);
    }
    const task = await prisma.exportTask.create({
      data: {
        id: createId(),
        name: body.name || `${body.resource || 'data'} 导出`,
        resource: body.resource || 'operation_log',
        status: 'completed',
        fileName: `${body.resource || 'data'}_${Date.now()}.json`,
        criteria: body.criteria || {},
        createdById: actor.id,
        completedAt: new Date()
      }
    });
    await writeOperationLog({ req, actor, action: 'create', resource: 'export_task', resourceId: task.id, requestBody: body });
    return ok({ success: true, item: task }, 201);
  }
  const downloadMatch = url.pathname.match(/^\/api\/export-tasks\/([^/]+)\/download$/);
  if (req.method === 'GET' && downloadMatch) {
    const task = await prisma.exportTask.findUnique({ where: { id: downloadMatch[1] } });
    if (!task) return fail('EXPORT_TASK_NOT_FOUND', '导出任务不存在。', 404);
    return ok({ fileName: task.fileName, resource: task.resource, criteria: task.criteria || {}, generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
  }
  const exportTaskMatch = url.pathname.match(/^\/api\/export-tasks\/([^/]+)$/);
  if (req.method === 'GET' && exportTaskMatch) {
    const item = await prisma.exportTask.findUnique({ where: { id: exportTaskMatch[1] } });
    if (!item) return fail('EXPORT_TASK_NOT_FOUND', '导出任务不存在。', 404);
    return ok({ item });
  }
  if (req.method === 'GET' && url.pathname === '/api/batch-jobs') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.batchJob, {
      filters,
      query: {
        where: {
          ...(filters.jobType ? { jobType: filters.jobType } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.createdById ? { createdById: filters.createdById } : {}),
          ...(filters.keyword ? { OR: [{ name: contains(filters.keyword) }, { jobType: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' }
      }
    }));
  }
  const batchMatch = url.pathname.match(/^\/api\/batch-jobs\/([^/]+)$/);
  if (req.method === 'GET' && batchMatch) {
    const item = await prisma.batchJob.findUnique({ where: { id: batchMatch[1] }, include: { items: true } });
    if (!item) return fail('BATCH_JOB_NOT_FOUND', '批量任务不存在。', 404);
    return ok({ item });
  }
  if (req.method === 'GET' && url.pathname === '/api/approvals') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.approvalOrder, {
      filters,
      query: {
        where: {
          ...(filters.resource ? { resource: filters.resource } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.action ? { action: filters.action } : {}),
          ...(filters.createdById ? { createdById: filters.createdById } : {}),
          ...(filters.keyword ? { OR: [{ title: contains(filters.keyword) }, { resource: contains(filters.keyword) }, { action: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' },
        include: { records: true }
      }
    }));
  }
  if (req.method === 'POST' && url.pathname === '/api/approvals') {
    const body = await readJson(req);
    const item = await createApproval({
      req,
      actor,
      title: body.title || '高风险操作审批',
      resource: body.resource || 'manual',
      resourceId: body.resourceId || null,
      action: body.action || 'approve_required',
      payload: body.payload || {},
      comment: body.comment || null
    });
    return ok({ success: true, item }, 201);
  }
  const approvalActionMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject|withdraw)$/);
  if (req.method === 'POST' && approvalActionMatch) {
    const body = await readJson(req);
    const statusMap = { approve: 'approved', reject: 'rejected', withdraw: 'withdrawn' };
    const current = await prisma.approvalOrder.findUnique({ where: { id: approvalActionMatch[1] }, include: { records: true } });
    if (!current) return fail('APPROVAL_NOT_FOUND', '审批单不存在。', 404);
    if (current.status !== 'pending') return fail('APPROVAL_STATUS_INVALID', '审批单已处理，不能重复操作。', 409);
    let executeResult = null;
    if (approvalActionMatch[2] === 'approve') {
      try {
        executeResult = await executeApproval(current);
      } catch (error) {
        await prisma.approvalOrder.update({
          where: { id: current.id },
          data: {
            records: { create: { id: createId(), action: 'execute_failed', operatorId: actor.id, comment: error.message } }
          }
        });
        return fail('APPROVAL_EXECUTE_FAILED', error.message || '审批通过后的业务动作执行失败。', 409);
      }
    }
    const item = await prisma.approvalOrder.update({
      where: { id: current.id },
      data: {
        status: statusMap[approvalActionMatch[2]],
        payload: executeResult ? { ...(current.payload || {}), executeResult } : current.payload,
        records: { create: { id: createId(), action: approvalActionMatch[2], operatorId: actor.id, comment: body.comment || null } }
      },
      include: { records: true }
    });
    await writeOperationLog({ req, actor, action: approvalActionMatch[2], resource: 'approval_order', resourceId: item.id, requestBody: body });
    return ok({ success: true, item });
  }
  const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)$/);
  if (req.method === 'GET' && approvalMatch) {
    const item = await prisma.approvalOrder.findUnique({ where: { id: approvalMatch[1] }, include: { records: true } });
    if (!item) return fail('APPROVAL_NOT_FOUND', '审批单不存在。', 404);
    return ok({ item });
  }
  return null;
}

export async function handleGovernanceApi(req, url, readJson) {
  const publicResult = await routePublicAuth(req, url, readJson);
  if (publicResult) return { handled: true, ...publicResult };

  const governancePaths = [
    '/api/auth',
    '/api/users',
    '/api/roles',
    '/api/whitelist',
    '/api/blacklist',
    '/api/unsubscribes',
    '/api/settings',
    '/api/event-sources',
    '/api/event-source-logs',
    '/api/operation-logs',
    '/api/export-tasks',
    '/api/batch-jobs',
    '/api/approvals',
    '/api/tasks/batch-',
    '/api/safety'
  ];
  if (!governancePaths.some((prefix) => url.pathname.startsWith(prefix))) return { handled: false };

  const permission = permissionFor(req, url);
  const auth = await requireActor(req, permission);
  if (auth.error) return { handled: true, ...auth.error };
  const actor = auth.actor;

  const routeResult =
    (await routeAuth(req, url, readJson, actor)) ||
    (await routeUsers(req, url, readJson, actor)) ||
    (await routeRegisterRequests(req, url, readJson, actor)) ||
    (await routeRoles(req, url, readJson, actor)) ||
    (await routePhoneList(req, url, readJson, actor)) ||
    (await routeSettings(req, url, readJson, actor)) ||
    (await routeEventSources(req, url, readJson, actor)) ||
    (await routeAudit(req, url, readJson, actor)) ||
    (await routeAuxiliary(req, url, readJson, actor));

  if (routeResult) return { handled: true, ...routeResult };

  if (req.method === 'POST' && url.pathname === '/api/safety/send-check') {
    const body = await readJson(req);
    return { handled: true, ...ok(await checkSendSafety(body)) };
  }

  return { handled: true, ...fail('API_NOT_FOUND', 'API not found.', 404) };
}

function permissionFor(req, url) {
  if (url.pathname.startsWith('/api/auth/me') || url.pathname.startsWith('/api/auth/logout') || url.pathname.startsWith('/api/auth/change-password')) return undefined;
  if (url.pathname.startsWith('/api/users') || url.pathname.startsWith('/api/auth/register-requests')) return 'user.manage';
  if (url.pathname.startsWith('/api/roles')) return req.method === 'GET' ? 'setting.read' : 'user.manage';
  if (url.pathname.startsWith('/api/whitelist')) return req.method === 'GET' ? 'whitelist.read' : 'whitelist.manage';
  if (url.pathname.startsWith('/api/blacklist')) return req.method === 'GET' ? 'blacklist.read' : 'blacklist.manage';
  if (url.pathname.startsWith('/api/unsubscribes')) return req.method === 'GET' ? 'unsubscribe.read' : 'unsubscribe.manage';
  if (url.pathname.startsWith('/api/settings')) return req.method === 'GET' ? 'setting.read' : 'setting.manage';
  if (url.pathname.startsWith('/api/event-sources')) return req.method === 'GET' ? 'event_source.read' : 'event_source.manage';
  if (url.pathname.startsWith('/api/event-source-logs')) return 'event_source.read';
  if (url.pathname.startsWith('/api/operation-logs')) return 'operation_log.read';
  if (url.pathname.startsWith('/api/export-tasks')) return req.method === 'GET' ? 'export.read' : 'export.manage';
  if (url.pathname.startsWith('/api/batch-jobs')) return 'batch.read';
  if (url.pathname.startsWith('/api/tasks/batch-')) return 'task.manage';
  if (url.pathname.startsWith('/api/approvals')) return req.method === 'GET' ? 'approval.read' : 'approval.manage';
  if (url.pathname.startsWith('/api/safety')) return 'manual_send.manage';
  return undefined;
}
