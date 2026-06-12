import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config } from '../../config/env.js';
import { createId } from '../../utils/ids.js';
import { maskPhone } from '../../utils/mask-phone.js';
import { mutateStore, readStore } from '../sms/sms.repository.js';
import { createSmsProvider } from '../sms/providers/index.js';

const prisma = new PrismaClient();
const PHONE_PATTERN = /^1\d{10}$/;
const SESSION_TTL_DAYS = 7;
const EXPORT_DIR = path.resolve(process.cwd(), 'storage', 'exports');
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
      'overview:dashboard:base',
      'touch:template:base',
      'touch:template:add',
      'touch:template:edit',
      'touch:template:test',
      'touch:template:status',
      'touch:rule:base',
      'touch:rule:add',
      'touch:rule:edit',
      'touch:rule:test',
      'touch:rule:copy',
      'touch:rule:delete',
      'touch:rule:enable',
      'touch:rule:disable',
      'touch:manual:base',
      'touch:manual:send',
      'touch:task:base',
      'touch:task:batchCancel',
      'touch:task:batchRetry',
      'touch:task:runDue',
      'touch:event:base',
      'touch:event:simulate',
      'data:sendLog:base',
      'data:sendLog:detail',
      'security:whitelist:base',
      'security:whitelist:add',
      'security:whitelist:edit',
      'security:whitelist:status',
      'security:whitelist:export',
      'security:whitelist:detail',
      'security:blacklist:base',
      'security:blacklist:add',
      'security:blacklist:edit',
      'security:blacklist:import',
      'security:blacklist:remove',
      'security:blacklist:detail',
      'security:unsubscribe:base',
      'security:unsubscribe:add',
      'security:unsubscribe:edit',
      'security:unsubscribe:import',
      'security:unsubscribe:status',
      'security:unsubscribe:detail',
      'security:setting:base',
      'security:setting:providerTest',
      'security:setting:workerRun',
      'integration:eventSource:base',
      'integration:eventSource:detail',
      'integration:dataSource:base',
      'integration:dataSource:detail',
      'integration:dataSource:test',
      'integration:dataSource:preview',
      'integration:dataSource:createTasks',
      'integration:dataSourceRun:base',
      'integration:dataSourceRun:detail',
      'integration:eventSourceLog:base',
      'integration:eventSourceLog:detail',
      'audit:operationLog:base',
      'audit:operationLog:detail',
      'audit:exportTask:base',
      'audit:exportTask:add',
      'audit:exportTask:detail',
      'audit:exportTask:download',
      'audit:batchJob:base',
      'audit:batchJob:detail',
      'audit:approval:base',
      'audit:approval:add',
      'audit:approval:detail'
    ]
  },
  {
    code: 'readonly',
    name: '只读观察员',
    description: '只能查看平台运行数据和审计记录，不允许执行写操作。',
    permissions: [
      'overview:dashboard:base',
      'touch:template:base',
      'touch:rule:base',
      'touch:manual:base',
      'touch:task:base',
      'touch:event:base',
      'data:sendLog:base',
      'data:sendLog:detail',
      'security:whitelist:base',
      'security:whitelist:detail',
      'security:blacklist:base',
      'security:blacklist:detail',
      'security:unsubscribe:base',
      'security:unsubscribe:status',
      'security:unsubscribe:detail',
      'security:setting:base',
      'integration:eventSource:base',
      'integration:eventSource:detail',
      'integration:dataSource:base',
      'integration:dataSource:detail',
      'integration:dataSourceRun:base',
      'integration:dataSourceRun:detail',
      'integration:eventSourceLog:base',
      'integration:eventSourceLog:detail',
      'audit:operationLog:base',
      'audit:operationLog:detail',
      'audit:exportTask:base',
      'audit:exportTask:detail',
      'audit:batchJob:base',
      'audit:batchJob:detail',
      'audit:approval:base',
      'audit:approval:detail'
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
  'sms.safety': { requireWhitelistForRealProvider: true },
  'sms.verification_code': { validMinutes: 5, resendIntervalSeconds: 60, dailyLimit: 10 },
  'sms.receipt': { enabled: true },
  'sms.aliyun': {
    credentialMode: 'env',
    endpoint: config.aliyun.endpoint,
    region: config.aliyun.region,
    signName: config.aliyun.signName,
    templateCode: config.aliyun.templateCode
  },
  'sms.provider_configs': {
    items: [
      {
        id: 'provider_aliyun_default',
        name: '阿里云短信通道',
        provider: 'aliyun_dypns',
        endpoint: config.aliyun.endpoint,
        region: config.aliyun.region,
        signName: config.aliyun.signName,
        templateCode: config.aliyun.templateCode,
        status: 'enabled',
        remark: '默认服务商配置，密钥从环境变量读取。',
        createdAt: null,
        updatedAt: null
      }
    ]
  }
};

function ok(body, statusCode = 200) {
  return { statusCode, body };
}

function fail(code, message, statusCode = 400, extra = {}) {
  return { statusCode, body: { success: false, code, message, ...extra } };
}

function normalizeProviderName(provider) {
  return provider === 'aliyun_dypns' ? provider : 'aliyun_dypns';
}

function providerDisplayName(provider) {
  return normalizeProviderName(provider) === 'aliyun_dypns' ? '阿里云短信通道' : '短信服务商';
}

function normalizeProviderConfigItem(input = {}, index = 0) {
  const provider = normalizeProviderName(input.provider || config.smsProvider);
  return {
    id: String(input.id || `provider_${index + 1}`),
    name: String(input.name || providerDisplayName(provider)).trim(),
    provider,
    endpoint: String(input.endpoint || config.aliyun.endpoint).trim(),
    region: String(input.region || config.aliyun.region).trim(),
    signName: String(input.signName || config.aliyun.signName).trim(),
    templateCode: String(input.templateCode || config.aliyun.templateCode).trim(),
    status: input.status === 'disabled' ? 'disabled' : 'enabled',
    remark: String(input.remark || '').trim(),
    createdAt: input.createdAt || null,
    updatedAt: input.updatedAt || null
  };
}

function normalizeProviderConfigsSetting(value = {}) {
  const items = Array.isArray(value.items) ? value.items : [];
  return {
    items: (items.length ? items : SYSTEM_SETTING_DEFAULTS['sms.provider_configs'].items)
      .map((item, index) => normalizeProviderConfigItem(item, index))
  };
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

function exportWhere(criteria = {}) {
  return {
    ...(criteria.status ? { status: criteria.status } : {}),
    ...(criteria.scene ? { scene: criteria.scene } : {}),
    ...(criteria.resource ? { resource: criteria.resource } : {}),
    ...(criteria.action ? { action: criteria.action } : {}),
    ...(criteria.userName ? { userName: contains(criteria.userName) } : {}),
    ...dateRange(criteria)
  };
}

function maskExportRow(row = {}, exposeSensitive = false) {
  if (exposeSensitive) return row;
  const result = { ...row };
  if (result.phone) result.phone = result.phoneMasked || maskPhone(result.phone);
  return result;
}

function safeExportFileName(fileName) {
  const normalized = String(fileName || `export_${Date.now()}.json`).replace(/[^a-zA-Z0-9_.-]/g, '_');
  return normalized.endsWith('.json') ? normalized : `${normalized}.json`;
}

function cleanOptionalString(value) {
  if (value === undefined) return undefined;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function exportFilePath(fileName) {
  return path.join(EXPORT_DIR, safeExportFileName(fileName));
}

async function buildExportPayload(task) {
  const criteria = task.criteria || {};
  const exposeSensitive = criteria.sensitive === true || criteria.maskSensitive === false;
  const take = Math.min(Math.max(Number(criteria.pageSize) || 500, 1), 2000);
  let items = [];

  if (task.resource === 'operation_log' || task.resource === 'operation_logs') {
    items = await prisma.adminOperationLog.findMany({
      where: exportWhere(criteria),
      orderBy: { createdAt: 'desc' },
      take
    });
  } else if (task.resource === 'send_log' || task.resource === 'sms_send_log') {
    items = await prisma.smsSendLog.findMany({
      where: {
        ...(criteria.status ? { status: criteria.status } : {}),
        ...(criteria.scene ? { scene: criteria.scene } : {}),
        ...(criteria.triggerType ? { triggerType: criteria.triggerType } : {}),
        ...dateRange(criteria)
      },
      orderBy: { createdAt: 'desc' },
      take
    });
  } else if (task.resource === 'sms_whitelist') {
    items = await prisma.smsWhitelist.findMany({
      where: {
        ...(criteria.status ? { status: criteria.status } : {}),
        ...(criteria.scene ? { scene: criteria.scene } : {}),
        ...dateRange(criteria)
      },
      orderBy: { createdAt: 'desc' },
      take
    });
  } else if (task.resource === 'sms_blacklist') {
    items = await prisma.smsBlacklist.findMany({
      where: {
        ...(criteria.status ? { status: criteria.status } : {}),
        ...(criteria.scene ? { scene: criteria.scene } : {}),
        ...(criteria.source ? { source: criteria.source } : {}),
        ...dateRange(criteria)
      },
      orderBy: { createdAt: 'desc' },
      take
    });
  } else if (task.resource === 'approval_order') {
    items = await prisma.approvalOrder.findMany({
      where: exportWhere(criteria),
      orderBy: { createdAt: 'desc' },
      take,
      include: { records: true }
    });
  } else if (task.resource === 'event_source_log') {
    items = await prisma.eventSourceLog.findMany({
      where: {
        ...(criteria.status ? { status: criteria.status } : {}),
        ...(criteria.appId ? { appId: criteria.appId } : {}),
        ...(criteria.eventType ? { eventType: criteria.eventType } : {}),
        ...dateRange(criteria)
      },
      orderBy: { createdAt: 'desc' },
      take
    });
  }

  return {
    fileName: safeExportFileName(task.fileName),
    resource: task.resource,
    criteria,
    generatedAt: new Date().toISOString(),
    count: items.length,
    items: items.map((item) => maskExportRow(item, exposeSensitive))
  };
}

async function materializeExportTask(task) {
  const payload = await buildExportPayload(task);
  const fileName = safeExportFileName(payload.fileName);
  await mkdir(EXPORT_DIR, { recursive: true });
  await writeFile(exportFilePath(fileName), JSON.stringify(payload, null, 2), 'utf8');
  return { ...payload, fileName };
}

async function readOrMaterializeExportFile(task) {
  const fileName = safeExportFileName(task.fileName);
  try {
    const buffer = await readFile(exportFilePath(fileName));
    return { fileName, buffer };
  } catch {
    const payload = await materializeExportTask({ ...task, fileName });
    const buffer = await readFile(exportFilePath(payload.fileName));
    return { fileName: payload.fileName, buffer };
  }
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
  settings['sms.provider'] = {
    ...(settings['sms.provider'] || {}),
    provider: normalizeProviderName(settings['sms.provider']?.provider || config.smsProvider)
  };
  settings['sms.safety'] = {
    requireWhitelistForRealProvider: settings['sms.safety']?.requireWhitelistForRealProvider !== false
  };
  settings['sms.receipt'] = {
    enabled: settings['sms.receipt']?.enabled !== false
  };
  settings['sms.provider_configs'] = normalizeProviderConfigsSetting(settings['sms.provider_configs']);
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
  return normalizeProviderName(settings['sms.provider']?.provider || config.smsProvider);
}

export async function getActiveSmsProviderConfig(providerName) {
  const settings = await getSettingsObject();
  const provider = normalizeProviderName(providerName || settings['sms.provider']?.provider || config.smsProvider);
  const providerConfigId = settings['sms.provider']?.providerConfigId;
  const providerConfigs = settings['sms.provider_configs']?.items || [];
  const selected =
    providerConfigs.find((item) => item.id === providerConfigId && item.provider === provider) ||
    providerConfigs.find((item) => item.provider === provider && item.status === 'enabled') ||
    providerConfigs.find((item) => item.provider === provider) ||
    normalizeProviderConfigItem({ provider }, 0);
  const aliyun = settings['sms.aliyun'] || {};
  return {
    ...config.aliyun,
    provider,
    providerConfigId: selected.id,
    name: selected.name,
    endpoint: selected.endpoint || aliyun.endpoint || config.aliyun.endpoint,
    region: selected.region || aliyun.region || config.aliyun.region,
    signName: selected.signName || aliyun.signName || config.aliyun.signName,
    templateCode: selected.templateCode || aliyun.templateCode || config.aliyun.templateCode
  };
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
  const normalized = { ...input };
  if (normalized['sms.provider']) {
    normalized['sms.provider'] = {
      ...normalized['sms.provider'],
      provider: normalizeProviderName(normalized['sms.provider'].provider || config.smsProvider)
    };
  }
  if (normalized['sms.safety']) {
    normalized['sms.safety'] = {
      requireWhitelistForRealProvider: normalized['sms.safety'].requireWhitelistForRealProvider !== false
    };
  }
  if (normalized['sms.receipt']) {
    normalized['sms.receipt'] = {
      enabled: normalized['sms.receipt'].enabled !== false
    };
  }
  if (normalized['sms.provider_configs']) {
    normalized['sms.provider_configs'] = normalizeProviderConfigsSetting(normalized['sms.provider_configs']);
  }
  return Object.entries(normalized)
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
        fileName: safeExportFileName(`${execute.resource || 'data'}_${Date.now()}.json`),
        criteria: execute.criteria || {},
        createdById: item.createdById,
        completedAt: new Date()
      }
    });
    const file = await materializeExportTask(task);
    return { executed: true, type: execute.type, result: { exportTaskId: task.id, fileName: file.fileName, count: file.count } };
  }
  throw new Error(`不支持的审批执行类型：${execute.type}`);
}

function isHighRiskSettingsChange(current, next) {
  const currentProvider = normalizeProviderName(current['sms.provider']?.provider || config.smsProvider);
  const nextProvider = normalizeProviderName(next['sms.provider']?.provider || currentProvider);
  const currentSafety = current['sms.safety'] || {};
  const nextSafety = next['sms.safety'] || currentSafety;
  const currentWorker = current['sms.worker'] || {};
  const nextWorker = next['sms.worker'] || currentWorker;
  return (
    currentProvider !== nextProvider ||
    currentSafety.requireWhitelistForRealProvider !== false && nextSafety.requireWhitelistForRealProvider === false ||
    !currentWorker.enabled && nextWorker.enabled ||
    !currentWorker.allowRealSend && nextWorker.allowRealSend
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
  const providerName = normalizeProviderName(provider);
  const requireWhitelist = settings['sms.safety']?.requireWhitelistForRealProvider !== false;

  const workerSettings = settings['sms.worker'] || {};
  const checks = {
    provider: { status: providerName === 'aliyun_dypns' && config.aliyun.accessKeyId ? 'passed' : 'blocked' },
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
    return ok({ success: true, message: '验证码已生成。' });
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
    if (!body.oldPassword || !body.newPassword) return fail('PASSWORD_REQUIRED', '原密码和新密码必填。');
    if (String(body.newPassword).length < 8) return fail('PASSWORD_TOO_SHORT', '新密码至少需要 8 位。');
    if (!verifyPassword(body.oldPassword, user.passwordHash)) return fail('OLD_PASSWORD_INVALID', '原密码不正确。', 400);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: actor.id }, data: { passwordHash: hashPassword(body.newPassword) } }),
      prisma.authSession.updateMany({
        where: { userId: actor.id, id: { not: actor.sessionId }, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
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
    const target = await prisma.adminUser.findUnique({
      where: { id: statusMatch[1] },
      include: { roles: { include: { role: true } } }
    });
    if (!target) return fail('USER_NOT_FOUND', '用户不存在。', 404);
    const body = await readJson(req);
    const nextStatus = body.status === 'disabled' || body.status === 'locked' ? body.status : 'active';
    if (target.id === actor.id && nextStatus !== 'active') return fail('CANNOT_DISABLE_SELF', '不能禁用当前登录账号。', 409);
    const isAdmin = target.roles.some((item) => item.role.code === 'admin');
    if (isAdmin && nextStatus !== 'active') {
      const remainingAdminCount = await prisma.adminUser.count({
        where: {
          id: { not: target.id },
          status: 'active',
          roles: { some: { role: { code: 'admin' } } }
        }
      });
      if (remainingAdminCount === 0) return fail('LAST_ADMIN_REQUIRED', '至少需要保留一个可用的系统管理员。', 409);
    }
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.adminUser.update({
        where: { id: target.id },
        data: { status: nextStatus },
        include: { roles: { include: { role: true } } }
      });
      if (nextStatus !== 'active') {
        await tx.authSession.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date() }
        });
      }
      return updated;
    });
    await writeOperationLog({ req, actor, action: 'change_status', resource: 'admin_user', resourceId: user.id, requestBody: body });
    return ok({ success: true, item: safeUser(user) });
  }

  const resetMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
  if (req.method === 'POST' && resetMatch) {
    const target = await prisma.adminUser.findUnique({ where: { id: resetMatch[1] } });
    if (!target) return fail('USER_NOT_FOUND', '用户不存在。', 404);
    const token = createSecret('setup');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.authPasswordSetupToken.updateMany({
        where: { userId: target.id, purpose: 'admin_reset_password', usedAt: null },
        data: { usedAt: new Date() }
      }),
      prisma.adminUser.update({
        where: { id: target.id },
        data: { passwordHash: hashPassword(createSecret('reset_password')), status: 'active' }
      }),
      prisma.authSession.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() }
      }),
      prisma.authPasswordSetupToken.create({
        data: {
          id: createId(),
          userId: target.id,
          tokenHash: hashValue(token),
          purpose: 'admin_reset_password',
          expiresAt
        }
      })
    ]);
    await writeOperationLog({
      req,
      actor,
      action: 'reset_password',
      resource: 'admin_user',
      resourceId: target.id,
      requestBody: { email: target.email, mode: 'setup_link', sessionsRevoked: true, passwordInvalidated: true }
    });
    return ok({
      success: true,
      setupToken: token,
      expiresAt: expiresAt.toISOString(),
      affected: {
        passwordInvalidated: true,
        sessionsRevoked: true,
        nextStep: 'send_setup_link'
      }
    });
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

  const deleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/delete$/);
  if (req.method === 'POST' && deleteMatch) {
    const target = await prisma.adminUser.findUnique({
      where: { id: deleteMatch[1] },
      include: { roles: { include: { role: true } } }
    });
    if (!target) return fail('USER_NOT_FOUND', '用户不存在。', 404);
    if (target.id === actor.id) return fail('CANNOT_DELETE_SELF', '不能删除当前登录账号。', 409);
    const isAdmin = target.roles.some((item) => item.role.code === 'admin');
    if (isAdmin) {
      const remainingAdminCount = await prisma.adminUser.count({
        where: {
          id: { not: target.id },
          status: 'active',
          roles: { some: { role: { code: 'admin' } } }
        }
      });
      if (remainingAdminCount === 0) return fail('LAST_ADMIN_REQUIRED', '至少需要保留一个可用的系统管理员。', 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.authPasswordSetupToken.deleteMany({ where: { userId: target.id } });
      await tx.authSession.deleteMany({ where: { userId: target.id } });
      await tx.adminUserRole.deleteMany({ where: { userId: target.id } });
      await tx.adminUser.delete({ where: { id: target.id } });
    });
    await writeOperationLog({ req, actor, action: 'delete', resource: 'admin_user', resourceId: target.id, requestBody: { email: target.email, name: target.name } });
    return ok({ success: true });
  }

  const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === 'GET' && userMatch) {
    const user = await prisma.adminUser.findUnique({
      where: { id: userMatch[1] },
      include: {
        roles: { include: { role: true } },
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        operationLogs: {
          orderBy: { createdAt: 'desc' },
          take: 8
        }
      }
    });
    if (!user) return fail('USER_NOT_FOUND', '用户不存在。', 404);
    return ok({
      item: {
        ...safeUser(user),
        recentSessions: user.sessions.map((session) => ({
          id: session.id,
          ip: session.ip,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          lastSeenAt: session.lastSeenAt,
          expiresAt: session.expiresAt,
          revokedAt: session.revokedAt,
          status: session.revokedAt ? 'revoked' : session.expiresAt < new Date() ? 'expired' : 'active'
        })),
        recentOperationLogs: user.operationLogs.map((log) => ({
          id: log.id,
          resource: log.resource,
          action: log.action,
          result: log.result,
          path: log.path,
          ip: log.ip,
          createdAt: log.createdAt
        }))
      }
    });
  }

  return null;
}

async function routeRegisterRequests(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/auth/register-requests') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.authRegisterRequest, {
      filters,
      query: {
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.keyword ? { OR: [{ email: contains(filters.keyword) }, { name: contains(filters.keyword) }, { phone: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
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

async function routeRoles(req, url, readJson, actor) {
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
  const updateMatch = url.pathname.match(/^\/api\/roles\/([^/]+)\/update$/);
  if (req.method === 'POST' && updateMatch) {
    const role = await prisma.adminRole.findFirst({ where: { OR: [{ id: updateMatch[1] }, { code: updateMatch[1] }] } });
    if (!role) return fail('ROLE_NOT_FOUND', '角色不存在。', 404);
    if (role.code === 'admin') return fail('ADMIN_ROLE_LOCKED', '系统管理员角色权限不可修改。', 409);
    const body = await readJson(req);
    const permissions = Array.isArray(body.permissions)
      ? body.permissions.map(String).map((item) => item.trim()).filter(Boolean)
      : role.permissions || [];
    if (!permissions.includes('overview:dashboard:base')) permissions.unshift('overview:dashboard:base');
    const updated = await prisma.adminRole.update({
      where: { id: role.id },
      data: {
        name: body.name ? String(body.name).trim() : role.name,
        description: body.description === undefined ? role.description : body.description || null,
        permissions,
        status: body.status === 'disabled' ? 'disabled' : 'active'
      }
    });
    await writeOperationLog({ req, actor, action: 'update_permissions', resource: 'admin_role', resourceId: updated.id, requestBody: { code: updated.code, permissions } });
    return ok({ success: true, item: toRole(updated) });
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
      const updateData = { ...data, id: undefined, phone: undefined, phoneMasked: undefined };
      if (item.path !== 'unsubscribes') updateData.createdById = actor.id;
      const created = await item.model.upsert({
        where: item.path === 'unsubscribes' ? { phone_scene: { phone, scene: body.scene || '' } } : { phone },
        create: data,
        update: updateData
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

  const phoneListStatusMatch = url.pathname.match(/^\/api\/(blacklist|unsubscribes)\/([^/]+)\/status$/);
  if (req.method === 'POST' && phoneListStatusMatch) {
    const body = await readJson(req);
    const isBlacklist = phoneListStatusMatch[1] === 'blacklist';
    const model = isBlacklist ? prisma.smsBlacklist : prisma.smsUnsubscribe;
    const resource = isBlacklist ? 'sms_blacklist' : 'sms_unsubscribe';
    const nextStatus = body.status === 'active' ? 'active' : 'removed';
    const updated = await model.update({
      where: { id: phoneListStatusMatch[2] },
      data: isBlacklist
        ? { status: nextStatus, removedAt: nextStatus === 'removed' ? new Date() : null }
        : { status: nextStatus }
    });
    await writeOperationLog({ req, actor, action: 'change_status', resource, resourceId: updated.id, requestBody: body });
    return ok({ success: true, item: updated });
  }

  const whitelistUpdateMatch = url.pathname.match(/^\/api\/whitelist\/([^/]+)\/update$/);
  if (req.method === 'POST' && whitelistUpdateMatch) {
    const body = await readJson(req);
    const updated = await prisma.smsWhitelist.update({ where: { id: whitelistUpdateMatch[1] }, data: { remark: body.remark || null, scene: body.scene || null } });
    await writeOperationLog({ req, actor, action: 'update', resource: 'sms_whitelist', resourceId: updated.id, requestBody: body });
    return ok({ success: true, item: updated });
  }

  const blacklistUpdateMatch = url.pathname.match(/^\/api\/blacklist\/([^/]+)\/update$/);
  if (req.method === 'POST' && blacklistUpdateMatch) {
    const body = await readJson(req);
    const data = {};
    const scene = cleanOptionalString(body.scene);
    const reason = cleanOptionalString(body.reason);
    const source = cleanOptionalString(body.source);
    if (scene !== undefined) data.scene = scene;
    if (reason !== undefined) data.reason = reason;
    if (source !== undefined) data.source = source || 'manual';
    const updated = await prisma.smsBlacklist.update({ where: { id: blacklistUpdateMatch[1] }, data });
    await writeOperationLog({ req, actor, action: 'update', resource: 'sms_blacklist', resourceId: updated.id, requestBody: body });
    return ok({ success: true, item: updated });
  }

  const unsubscribeUpdateMatch = url.pathname.match(/^\/api\/unsubscribes\/([^/]+)\/update$/);
  if (req.method === 'POST' && unsubscribeUpdateMatch) {
    const body = await readJson(req);
    const current = await prisma.smsUnsubscribe.findUnique({ where: { id: unsubscribeUpdateMatch[1] } });
    if (!current) return fail('PHONE_LIST_ITEM_NOT_FOUND', '退订记录不存在。', 404);
    const data = {};
    if (body.scene !== undefined) {
      const nextScene = String(body.scene || '').trim();
      const duplicated = await prisma.smsUnsubscribe.findFirst({
        where: {
          phone: current.phone,
          scene: nextScene,
          id: { not: current.id }
        }
      });
      if (duplicated) return fail('UNSUBSCRIBE_DUPLICATED', '该手机号在目标场景下已有退订记录。', 409);
      data.scene = nextScene;
    }
    const source = cleanOptionalString(body.source);
    const remark = cleanOptionalString(body.remark);
    if (source !== undefined) data.source = source || 'manual';
    if (remark !== undefined) data.remark = remark;
    const updated = await prisma.smsUnsubscribe.update({ where: { id: current.id }, data });
    await writeOperationLog({ req, actor, action: 'update', resource: 'sms_unsubscribe', resourceId: updated.id, requestBody: body });
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
        fileName: safeExportFileName(`sms_whitelist_${Date.now()}.json`),
        criteria: Object.fromEntries(url.searchParams.entries()),
        createdById: actor.id,
        completedAt: new Date()
      }
    });
    await materializeExportTask(task);
    await writeOperationLog({ req, actor, action: 'export', resource: 'sms_whitelist', resourceId: task.id });
    return ok({ success: true, item: task }, 201);
  }
  return null;
}

function workerStatusSnapshot(runtime = {}) {
  const worker = runtime.taskWorker || {};
  return {
    enabled: Boolean(worker.enabled),
    running: Boolean(worker.running),
    intervalMs: worker.intervalMs ?? config.taskWorker.intervalMs,
    batchSize: worker.batchSize ?? config.taskWorker.batchSize,
    allowRealSend: config.taskWorker.allowRealSend,
    lastRunAt: worker.lastRunAt || null,
    lastProcessed: Number(worker.lastProcessed) || 0,
    lastError: worker.lastError || null,
    disabledReason: worker.disabledReason || null
  };
}

function providerConfigsWithActiveFlag(settings) {
  const activeId = settings['sms.provider']?.providerConfigId;
  const activeProvider = normalizeProviderName(settings['sms.provider']?.provider);
  const aliyun = settings['sms.aliyun'] || {};
  return (settings['sms.provider_configs']?.items || []).map((item) => ({
    ...item,
    isActive: activeId
      ? item.id === activeId
      : item.provider === activeProvider &&
        item.signName === (aliyun.signName || config.aliyun.signName) &&
        item.templateCode === (aliyun.templateCode || config.aliyun.templateCode)
  }));
}

function providerConfigPayload(input = {}, current = {}) {
  const timestamp = now();
  const provider = normalizeProviderName(input.provider || current.provider || config.smsProvider);
  const item = normalizeProviderConfigItem({
    ...current,
    ...input,
    id: current.id || input.id || createId(),
    provider,
    createdAt: current.createdAt || timestamp,
    updatedAt: timestamp
  });
  if (!item.name) item.name = providerDisplayName(provider);
  if (!item.signName) {
    const error = new Error('服务商签名不能为空。');
    error.code = 'PROVIDER_SIGN_NAME_REQUIRED';
    throw error;
  }
  if (!item.templateCode) {
    const error = new Error('模板 Code 不能为空。');
    error.code = 'PROVIDER_TEMPLATE_CODE_REQUIRED';
    throw error;
  }
  return item;
}

async function saveProviderConfigs(items) {
  await prisma.systemSetting.upsert({
    where: { key: 'sms.provider_configs' },
    create: { id: 'setting_sms_provider_configs', key: 'sms.provider_configs', value: { items } },
    update: { value: { items } }
  });
}

async function routeSmsProviders(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/sms-providers') {
    const settings = await getSettingsObject();
    return ok({ success: true, items: providerConfigsWithActiveFlag(settings) });
  }

  if (req.method === 'POST' && url.pathname === '/api/sms-providers') {
    const body = await readJson(req);
    const settings = await getSettingsObject();
    const items = settings['sms.provider_configs']?.items || [];
    try {
      const item = providerConfigPayload(body);
      await saveProviderConfigs([item, ...items]);
      await writeOperationLog({ req, actor, action: 'create', resource: 'sms_provider', resourceId: item.id, requestBody: body });
      return ok({ success: true, item }, 201);
    } catch (error) {
      return fail(error.code || 'SMS_PROVIDER_SAVE_FAILED', error.message || '服务商保存失败。', 400);
    }
  }

  const providerMatch = url.pathname.match(/^\/api\/sms-providers\/([^/]+)$/);
  if (req.method === 'GET' && providerMatch) {
    const settings = await getSettingsObject();
    const item = providerConfigsWithActiveFlag(settings).find((provider) => provider.id === providerMatch[1]);
    if (!item) return fail('SMS_PROVIDER_NOT_FOUND', '服务商配置不存在。', 404);
    return ok({ success: true, item });
  }

  const actionMatch = url.pathname.match(/^\/api\/sms-providers\/([^/]+)\/(update|status|activate)$/);
  if (req.method === 'POST' && actionMatch) {
    const [, id, action] = actionMatch;
    const body = await readJson(req);
    const settings = await getSettingsObject();
    const items = settings['sms.provider_configs']?.items || [];
    const current = items.find((item) => item.id === id);
    if (!current) return fail('SMS_PROVIDER_NOT_FOUND', '服务商配置不存在。', 404);

    if (action === 'update') {
      try {
        const item = providerConfigPayload(body, current);
        const nextItems = items.map((provider) => provider.id === id ? item : provider);
        await saveProviderConfigs(nextItems);
        await writeOperationLog({ req, actor, action: 'update', resource: 'sms_provider', resourceId: id, requestBody: body });
        return ok({ success: true, item });
      } catch (error) {
        return fail(error.code || 'SMS_PROVIDER_SAVE_FAILED', error.message || '服务商保存失败。', 400);
      }
    }

    if (action === 'status') {
      const item = {
        ...current,
        status: body.status === 'disabled' ? 'disabled' : 'enabled',
        updatedAt: now()
      };
      const nextItems = items.map((provider) => provider.id === id ? item : provider);
      await saveProviderConfigs(nextItems);
      await writeOperationLog({ req, actor, action: 'change_status', resource: 'sms_provider', resourceId: id, requestBody: body });
      return ok({ success: true, item });
    }

    if (current.status === 'disabled') return fail('SMS_PROVIDER_DISABLED', '停用的服务商不能设为当前。', 400);
    await applySystemSettings({
      ...settings,
      'sms.provider': { provider: current.provider, providerConfigId: current.id },
      'sms.aliyun': {
        ...(settings['sms.aliyun'] || {}),
        endpoint: current.endpoint,
        region: current.region,
        signName: current.signName,
        templateCode: current.templateCode
      },
      'sms.provider_configs': { items }
    });
    await writeOperationLog({ req, actor, action: 'activate', resource: 'sms_provider', resourceId: id, requestBody: { provider: current.provider } });
    return ok({ success: true, item: { ...current, isActive: true }, settings: await getSettingsObject() });
  }

  return null;
}

async function testProviderConfig(providerName, options = {}) {
  const normalizedProvider = normalizeProviderName(providerName);
  const providerConfig = await getActiveSmsProviderConfig(normalizedProvider);
  const provider = createSmsProvider(normalizedProvider, providerConfig);
  const checks = [
    { key: 'provider', status: 'passed', message: `Provider ${provider.name || normalizedProvider} 可识别。` }
  ];

  if (typeof provider.assertConfig === 'function') {
    provider.assertConfig();
    checks.push({ key: 'config', status: 'passed', message: '必填配置完整。' });
  } else {
    checks.push({ key: 'config', status: 'passed', message: '当前 Provider 不需要额外配置。' });
  }

  if (options.checkSdk && typeof provider.createClient === 'function') {
    await provider.createClient();
    checks.push({ key: 'sdk', status: 'passed', message: 'SDK 客户端初始化成功。' });
  } else if (typeof provider.createClient === 'function') {
    checks.push({ key: 'sdk', status: 'skipped', message: '已跳过 SDK 初始化。' });
  }

  return {
    success: true,
    provider: provider.name || normalizedProvider,
    mode: 'dry_run',
    checks
  };
}

async function routeSettings(req, url, readJson, actor, runtime = {}) {
  if (req.method === 'GET' && url.pathname === '/api/worker/status') {
    return ok({ success: true, worker: workerStatusSnapshot(runtime) });
  }
  if (req.method === 'POST' && url.pathname === '/api/worker/run-once') {
    if (typeof runtime.runDueTasks !== 'function') return fail('WORKER_RUNTIME_UNAVAILABLE', '当前进程未挂载 worker 执行入口。', 503);
    const body = await readJson(req);
    const limit = Math.min(Math.max(Number(body.limit) || config.taskWorker.batchSize || 20, 1), 200);
    const startedAt = new Date();
    try {
      const result = await runtime.runDueTasks({ limit });
      if (runtime.taskWorker) {
        runtime.taskWorker.lastRunAt = startedAt.toISOString();
        runtime.taskWorker.lastProcessed = result.body?.processed || 0;
        runtime.taskWorker.lastError = null;
      }
      await writeOperationLog({ req, actor, action: 'run_once', resource: 'sms_worker', requestBody: { limit } });
      return ok({ success: true, worker: workerStatusSnapshot(runtime), result: result.body || result });
    } catch (error) {
      if (runtime.taskWorker) {
        runtime.taskWorker.lastRunAt = startedAt.toISOString();
        runtime.taskWorker.lastError = error.message || 'Worker run failed.';
      }
      await writeOperationLog({ req, actor, action: 'run_once', resource: 'sms_worker', requestBody: { limit }, result: 'failed', statusCode: 500, errorMessage: error.message });
      return fail('WORKER_RUN_FAILED', error.message || '手动执行 worker 失败。', 500);
    }
  }
  if (req.method === 'GET' && url.pathname === '/api/settings') return ok({ settings: await getSettingsObject() });
  if (req.method === 'POST' && url.pathname === '/api/settings/provider/test') {
    const body = await readJson(req);
    const settings = await getSettingsObject();
    const providerName = body.provider || settings['sms.provider']?.provider || config.smsProvider;
    try {
      const result = await testProviderConfig(providerName, { checkSdk: body.checkSdk === true });
      await writeOperationLog({ req, actor, action: 'test_provider', resource: 'system_setting', requestBody: { provider: providerName, checkSdk: body.checkSdk === true } });
      return ok(result);
    } catch (error) {
      await writeOperationLog({ req, actor, action: 'test_provider', resource: 'system_setting', requestBody: { provider: providerName, checkSdk: body.checkSdk === true }, result: 'failed', statusCode: 400, errorMessage: error.message });
      return fail(error.code || 'PROVIDER_TEST_FAILED', error.message || 'Provider 配置自检失败。', 400, {
        provider: providerName,
        mode: 'dry_run',
        checks: [{ key: 'config', status: 'failed', message: error.message || 'Provider 配置自检失败。' }]
      });
    }
  }
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
  const sourceLogsMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)\/logs$/);
  if (req.method === 'GET' && sourceLogsMatch) {
    const source = await prisma.eventSource.findUnique({ where: { id: sourceLogsMatch[1] } });
    if (!source) return fail('EVENT_SOURCE_NOT_FOUND', '事件来源不存在。', 404);
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.eventSourceLog, {
      filters,
      query: {
        where: {
          sourceId: source.id,
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
  const sourceStatsMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)\/stats$/);
  if (req.method === 'GET' && sourceStatsMatch) {
    const source = await prisma.eventSource.findUnique({ where: { id: sourceStatsMatch[1] } });
    if (!source) return fail('EVENT_SOURCE_NOT_FOUND', '事件来源不存在。', 404);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, success, failed, last24hTotal, latestLog] = await Promise.all([
      prisma.eventSourceLog.count({ where: { sourceId: source.id } }),
      prisma.eventSourceLog.count({ where: { sourceId: source.id, status: 'success' } }),
      prisma.eventSourceLog.count({ where: { sourceId: source.id, status: { not: 'success' } } }),
      prisma.eventSourceLog.count({ where: { sourceId: source.id, createdAt: { gte: last24h } } }),
      prisma.eventSourceLog.findFirst({ where: { sourceId: source.id }, orderBy: { createdAt: 'desc' } })
    ]);
    return ok({
      item: { ...source, secretHash: undefined },
      stats: {
        total,
        success,
        failed,
        last24hTotal,
        failureRate: total > 0 ? Number((failed / total).toFixed(4)) : 0,
        latestLog
      }
    });
  }
  const sourceMatch = url.pathname.match(/^\/api\/event-sources\/([^/]+)$/);
  if (req.method === 'GET' && sourceMatch) {
    const item = await prisma.eventSource.findUnique({ where: { id: sourceMatch[1] } });
    if (!item) return fail('EVENT_SOURCE_NOT_FOUND', '事件来源不存在。', 404);
    return ok({ item: { ...item, secretHash: undefined } });
  }
  return null;
}

function safeDataSource(item) {
  if (!item) return item;
  const authConfig = item.authConfig || {};
  const hasSecret = Boolean(authConfig.token || authConfig.password || authConfig.secret || authConfig.authorization);
  return {
    ...item,
    authConfig: hasSecret ? { ...authConfig, token: authConfig.token ? '******' : undefined, password: authConfig.password ? '******' : undefined, secret: authConfig.secret ? '******' : undefined, authorization: authConfig.authorization ? '******' : undefined } : authConfig
  };
}

function readPath(source, pathValue) {
  if (!pathValue) return source;
  return String(pathValue).split('.').filter(Boolean).reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, source);
}

function mapValue(row, rule) {
  if (rule === undefined || rule === null || rule === '') return undefined;
  if (typeof rule === 'string') {
    if (rule.startsWith('$')) return readPath(row, rule.slice(1));
    return readPath(row, rule);
  }
  if (typeof rule === 'object') {
    if (rule.path) return readPath(row, rule.path);
    if (Object.prototype.hasOwnProperty.call(rule, 'default')) return rule.default;
  }
  return rule;
}

function maskSensitiveAuthConfig(authConfig = {}) {
  const result = { ...authConfig };
  for (const key of ['token', 'password', 'secret', 'authorization']) {
    if (result[key]) result[key] = '******';
  }
  return result;
}

function normalizeDataSourceInput(body = {}, existing = {}) {
  const fieldMapping = body.fieldMapping || existing.fieldMapping || {
    phone: 'phone',
    userId: 'userId',
    bizId: 'bizId',
    scene: 'scene',
    variables: { name: 'name', productName: 'productName', daysLeft: 'daysLeft' }
  };
  const authConfig = body.authConfig ? { ...body.authConfig } : existing.authConfig || {};
  for (const key of Object.keys(authConfig)) {
    if (authConfig[key] === '******') authConfig[key] = existing.authConfig?.[key];
  }
  return {
    name: String(body.name ?? existing.name ?? '').trim(),
    systemName: String(body.systemName ?? existing.systemName ?? '').trim(),
    endpoint: String(body.endpoint ?? existing.endpoint ?? '').trim(),
    method: String(body.method ?? existing.method ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET',
    authType: body.authType || existing.authType || 'none',
    authConfig,
    requestConfig: body.requestConfig || existing.requestConfig || { params: {} },
    pagination: body.pagination || existing.pagination || { type: 'none' },
    responsePath: body.responsePath || existing.responsePath || 'data.items',
    fieldMapping,
    dedupeKey: body.dedupeKey || existing.dedupeKey || 'phone',
    defaultRuleId: body.defaultRuleId || null,
    defaultTemplateId: body.defaultTemplateId || null,
    status: body.status === 'disabled' ? 'disabled' : existing.status || 'enabled',
    remark: body.remark || null
  };
}

async function callDataSource(source, params = {}) {
  if (!/^https?:\/\//i.test(source.endpoint)) {
    throw new Error('接口地址必须是 http(s) URL。');
  }
  const startedAt = Date.now();
  const headers = { 'Content-Type': 'application/json' };
  const authConfig = source.authConfig || {};
  if (source.authType === 'header_token' && authConfig.token) {
    headers[authConfig.headerName || 'Authorization'] = authConfig.prefix ? `${authConfig.prefix} ${authConfig.token}` : authConfig.token;
  }
  if (source.authType === 'basic' && authConfig.username && authConfig.password) {
    headers.Authorization = `Basic ${Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64')}`;
  }
  const requestParams = { ...(source.requestConfig?.params || {}), ...params };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = new URL(source.endpoint);
    const init = { method: source.method, headers, signal: controller.signal };
    if (source.method === 'GET') {
      Object.entries(requestParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
      });
    } else {
      init.body = JSON.stringify(requestParams);
    }
    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('json') ? await response.json() : { text: await response.text() };
    if (!response.ok) throw new Error(`外部接口返回 ${response.status}`);
    return { response: body, statusCode: response.status, elapsedMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

function mapDataSourceRows(source, rows, { rule, template } = {}) {
  const mapping = source.fieldMapping || {};
  const variableMapping = mapping.variables || {};
  const seen = new Set();
  const items = [];
  rows.forEach((row, index) => {
    const phone = String(mapValue(row, mapping.phone) || '').trim();
    const scene = String(mapValue(row, mapping.scene) || template?.scene || rule?.scene || '').trim();
    const bizId = String(mapValue(row, mapping.bizId) || '').trim();
    const userId = String(mapValue(row, mapping.userId) || '').trim();
    const templateParam = {};
    for (const [key, value] of Object.entries(variableMapping)) templateParam[key] = mapValue(row, value);
    const dedupeValue = source.dedupeKey === 'bizId' ? bizId : source.dedupeKey === 'userId' ? userId : phone;
    let status = 'valid';
    let message = '可生成任务';
    if (!PHONE_PATTERN.test(phone)) {
      status = 'failed';
      message = '手机号缺失或格式错误';
    } else if (dedupeValue && seen.has(dedupeValue)) {
      status = 'skipped';
      message = '按去重键过滤重复记录';
    } else if (rule && rule.status !== 'enabled') {
      status = 'failed';
      message = '选择的规则未启用';
    } else if (template && template.status !== 'enabled') {
      status = 'failed';
      message = '选择的短信模板未启用';
    } else if (rule && scene && rule.scene !== scene) {
      status = 'skipped';
      message = `规则场景 ${rule.scene} 与记录场景 ${scene} 不一致`;
    }
    if (dedupeValue) seen.add(dedupeValue);
    items.push({
      rowIndex: index + 1,
      phone,
      phoneMasked: phone ? maskPhone(phone) : '',
      bizId,
      userId,
      scene,
      ruleId: rule?.id || null,
      templateId: template?.id || null,
      templateParam,
      status,
      message,
      raw: row,
      mapped: { phoneMasked: phone ? maskPhone(phone) : '', bizId, userId, scene, templateParam }
    });
  });
  return items;
}

async function previewDataSource(source, body = {}, actor, runType = 'preview') {
  const params = body.params || {};
  const [rule, template] = await Promise.all([
    body.ruleId || source.defaultRuleId ? prisma.smsRule.findUnique({ where: { id: body.ruleId || source.defaultRuleId } }) : null,
    body.templateId || source.defaultTemplateId ? prisma.smsTemplate.findUnique({ where: { id: body.templateId || source.defaultTemplateId } }) : null
  ]);
  const callResult = await callDataSource(source, params);
  const rows = readPath(callResult.response, source.responsePath);
  if (!Array.isArray(rows)) throw new Error(`返回数据路径 ${source.responsePath} 未提取到数组。`);
  const mappedItems = mapDataSourceRows(source, rows, { rule, template });
  const summary = {
    totalCount: rows.length,
    validCount: mappedItems.filter((item) => item.status === 'valid').length,
    failedCount: mappedItems.filter((item) => item.status === 'failed').length,
    skippedCount: mappedItems.filter((item) => item.status === 'skipped').length,
    estimatedTaskCount: mappedItems.filter((item) => item.status === 'valid').length,
    statusCode: callResult.statusCode,
    elapsedMs: callResult.elapsedMs
  };
  const run = await prisma.dataSourceRun.create({
    data: {
      id: createId(),
      dataSourceId: source.id,
      runType,
      status: 'success',
      params,
      summary,
      createdById: actor.id,
      items: {
        create: mappedItems.slice(0, 100).map((item) => ({
          id: createId(),
          rowIndex: item.rowIndex,
          phoneMasked: item.phoneMasked || null,
          bizId: item.bizId || null,
          userId: item.userId || null,
          scene: item.scene || null,
          ruleId: item.ruleId || null,
          templateId: item.templateId || null,
          status: item.status,
          message: item.message,
          raw: item.raw,
          mapped: item.mapped
        }))
      }
    },
    include: { items: true }
  });
  await prisma.dataSource.update({ where: { id: source.id }, data: { lastRunAt: new Date() } });
  return { run, summary, items: mappedItems, rule, template, responseSample: rows.slice(0, 3) };
}

async function routeDataSources(req, url, readJson, actor) {
  if (req.method === 'GET' && url.pathname === '/api/data-sources') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.dataSource, {
      filters,
      query: {
        where: {
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.systemName ? { systemName: contains(filters.systemName) } : {}),
          ...(filters.keyword ? { OR: [{ name: contains(filters.keyword) }, { systemName: contains(filters.keyword) }, { endpoint: contains(filters.keyword) }] } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' }
      }
    }, safeDataSource));
  }
  if (req.method === 'POST' && url.pathname === '/api/data-sources') {
    const body = await readJson(req);
    const data = normalizeDataSourceInput(body);
    if (!data.name || !data.systemName || !data.endpoint) return fail('DATA_SOURCE_REQUIRED', '数据来源名称、业务系统和接口地址必填。');
    const item = await prisma.dataSource.create({ data: { id: createId(), ...data, createdById: actor.id } });
    await writeOperationLog({ req, actor, action: 'create', resource: 'data_source', resourceId: item.id, requestBody: { ...body, authConfig: maskSensitiveAuthConfig(body.authConfig || {}) } });
    return ok({ success: true, item: safeDataSource(item) }, 201);
  }

  const updateMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/update$/);
  if (req.method === 'POST' && updateMatch) {
    const current = await prisma.dataSource.findUnique({ where: { id: updateMatch[1] } });
    if (!current) return fail('DATA_SOURCE_NOT_FOUND', '数据来源不存在。', 404);
    const body = await readJson(req);
    const data = normalizeDataSourceInput(body, current);
    const item = await prisma.dataSource.update({ where: { id: current.id }, data });
    await writeOperationLog({ req, actor, action: 'update', resource: 'data_source', resourceId: item.id, requestBody: { ...body, authConfig: maskSensitiveAuthConfig(body.authConfig || {}) } });
    return ok({ success: true, item: safeDataSource(item) });
  }

  const statusMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/status$/);
  if (req.method === 'POST' && statusMatch) {
    const body = await readJson(req);
    const item = await prisma.dataSource.update({ where: { id: statusMatch[1] }, data: { status: body.status === 'disabled' ? 'disabled' : 'enabled' } });
    await writeOperationLog({ req, actor, action: 'change_status', resource: 'data_source', resourceId: item.id, requestBody: body });
    return ok({ success: true, item: safeDataSource(item) });
  }

  const copyMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/copy$/);
  if (req.method === 'POST' && copyMatch) {
    const current = await prisma.dataSource.findUnique({ where: { id: copyMatch[1] } });
    if (!current) return fail('DATA_SOURCE_NOT_FOUND', '数据来源不存在。', 404);
    const item = await prisma.dataSource.create({
      data: {
        ...normalizeDataSourceInput({ ...current, name: `${current.name} 副本`, status: 'disabled' }, current),
        id: createId(),
        name: `${current.name} 副本`,
        createdById: actor.id,
        lastRunAt: null
      }
    });
    await writeOperationLog({ req, actor, action: 'copy', resource: 'data_source', resourceId: item.id, requestBody: { sourceId: current.id } });
    return ok({ success: true, item: safeDataSource(item) }, 201);
  }

  const actionMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)\/(test-call|preview|create-tasks)$/);
  if (req.method === 'POST' && actionMatch) {
    const source = await prisma.dataSource.findUnique({ where: { id: actionMatch[1] } });
    if (!source) return fail('DATA_SOURCE_NOT_FOUND', '数据来源不存在。', 404);
    if (source.status !== 'enabled') return fail('DATA_SOURCE_DISABLED', '数据来源已停用，不能执行。', 409);
    const body = await readJson(req);
    try {
      const runType = actionMatch[2] === 'test-call' ? 'test' : actionMatch[2] === 'preview' ? 'preview' : 'create_tasks';
      const preview = await previewDataSource(source, body, actor, runType);
      if (actionMatch[2] !== 'create-tasks') {
        await writeOperationLog({ req, actor, action: runType, resource: 'data_source', resourceId: source.id, requestBody: { params: body.params || {}, ruleId: body.ruleId, templateId: body.templateId } });
        return ok({
          success: true,
          run: preview.run,
          summary: preview.summary,
          items: preview.items.slice(0, 100),
          responseSample: preview.responseSample
        });
      }
      const validItems = preview.items.filter((item) => item.status === 'valid');
      if (!preview.template) return fail('DATA_SOURCE_TEMPLATE_REQUIRED', '请选择短信模板后再生成任务。');
      if (!validItems.length) return fail('DATA_SOURCE_NO_VALID_ITEM', '没有可生成任务的有效记录。', 409);
      const limited = validItems.slice(0, Math.min(Math.max(Number(body.limit) || 5000, 1), 5000));
      const taskRows = limited.map((item) => ({
        id: createId(),
        taskType: 'data_source',
        status: 'pending',
        triggerType: 'data_source',
        scene: item.scene || preview.template.scene,
        phone: item.phone,
        phoneMasked: item.phoneMasked,
        templateId: preview.template.id,
        templateName: preview.template.name,
        templateCode: preview.template.providerTemplateId,
        templateParam: item.templateParam || {},
        ruleId: preview.rule?.id || null,
        ruleName: preview.rule?.name || null,
        eventType: 'data_source',
        scheduledAt: new Date(body.scheduledAt || Date.now()),
        conditionResult: 'not_checked'
      }));
      const job = await prisma.$transaction(async (tx) => {
        for (const task of taskRows) await tx.smsTask.create({ data: task });
        const batch = await tx.batchJob.create({
          data: {
            id: createId(),
            name: `${source.name} 批量生成任务`,
            jobType: 'data_source_create_tasks',
            status: 'completed',
            totalCount: preview.items.length,
            successCount: taskRows.length,
            failedCount: preview.items.length - taskRows.length,
            createdById: actor.id,
            items: {
              create: preview.items.slice(0, 500).map((item, index) => ({
                id: createId(),
                target: item.phoneMasked || `row_${index + 1}`,
                status: item.status === 'valid' ? 'success' : item.status,
                message: item.status === 'valid' ? '已生成待发送任务' : item.message
              }))
            }
          },
          include: { items: true }
        });
        await tx.dataSourceRun.update({
          where: { id: preview.run.id },
          data: { batchJobId: batch.id, summary: { ...preview.summary, createdTaskCount: taskRows.length } }
        });
        return batch;
      });
      await writeOperationLog({ req, actor, action: 'create_tasks', resource: 'data_source', resourceId: source.id, requestBody: { params: body.params || {}, count: taskRows.length, batchJobId: job.id } });
      return ok({ success: true, job, runId: preview.run.id, createdTaskCount: taskRows.length, summary: { ...preview.summary, createdTaskCount: taskRows.length } }, 201);
    } catch (error) {
      const run = await prisma.dataSourceRun.create({
        data: {
          id: createId(),
          dataSourceId: source.id,
          runType: actionMatch[2],
          status: 'failed',
          params: body.params || {},
          summary: {},
          errorMessage: error.message,
          createdById: actor.id
        }
      });
      await writeOperationLog({ req, actor, action: actionMatch[2], resource: 'data_source', resourceId: source.id, requestBody: { params: body.params || {} }, result: 'failed', statusCode: 400, errorMessage: error.message });
      return fail('DATA_SOURCE_RUN_FAILED', error.message || '数据来源执行失败。', 400, { run });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/data-source-runs') {
    const filters = Object.fromEntries(url.searchParams.entries());
    return ok(await listWithCount(prisma.dataSourceRun, {
      filters,
      query: {
        where: {
          ...(filters.dataSourceId ? { dataSourceId: filters.dataSourceId } : {}),
          ...(filters.runType ? { runType: filters.runType } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...dateRange(filters)
        },
        orderBy: { createdAt: 'desc' },
        include: { dataSource: true }
      }
    }));
  }
  const runMatch = url.pathname.match(/^\/api\/data-source-runs\/([^/]+)$/);
  if (req.method === 'GET' && runMatch) {
    const item = await prisma.dataSourceRun.findUnique({ where: { id: runMatch[1] }, include: { dataSource: true, items: true } });
    if (!item) return fail('DATA_SOURCE_RUN_NOT_FOUND', '数据来源执行记录不存在。', 404);
    return ok({ item });
  }
  const sourceMatch = url.pathname.match(/^\/api\/data-sources\/([^/]+)$/);
  if (req.method === 'GET' && sourceMatch) {
    const item = await prisma.dataSource.findUnique({
      where: { id: sourceMatch[1] },
      include: { runs: { orderBy: { createdAt: 'desc' }, take: 5, include: { items: { take: 10 } } } }
    });
    if (!item) return fail('DATA_SOURCE_NOT_FOUND', '数据来源不存在。', 404);
    return ok({ item: safeDataSource(item) });
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
        fileName: safeExportFileName(`${body.resource || 'data'}_${Date.now()}.json`),
        criteria: body.criteria || {},
        createdById: actor.id,
        completedAt: new Date()
      }
    });
    await materializeExportTask(task);
    await writeOperationLog({ req, actor, action: 'create', resource: 'export_task', resourceId: task.id, requestBody: body });
    return ok({ success: true, item: task }, 201);
  }
  const downloadMatch = url.pathname.match(/^\/api\/export-tasks\/([^/]+)\/download$/);
  if (req.method === 'GET' && downloadMatch) {
    const task = await prisma.exportTask.findUnique({ where: { id: downloadMatch[1] } });
    if (!task) return fail('EXPORT_TASK_NOT_FOUND', '导出任务不存在。', 404);
    if (task.status !== 'completed') return fail('EXPORT_TASK_NOT_READY', '导出任务尚未完成，不能下载。', 409);
    const file = await readOrMaterializeExportFile(task);
    await writeOperationLog({ req, actor, action: 'download', resource: 'export_task', resourceId: task.id, requestBody: { resource: task.resource, fileName: file.fileName } });
    return {
      statusCode: 200,
      file: {
        buffer: file.buffer,
        fileName: file.fileName,
        contentType: 'application/json; charset=utf-8'
      }
    };
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

export async function handleGovernanceApi(req, url, readJson, runtime = {}) {
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
    '/api/sms-providers',
    '/api/worker',
    '/api/event-sources',
    '/api/data-sources',
    '/api/data-source-runs',
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
    (await routeSmsProviders(req, url, readJson, actor)) ||
    (await routeSettings(req, url, readJson, actor, runtime)) ||
    (await routeEventSources(req, url, readJson, actor)) ||
    (await routeDataSources(req, url, readJson, actor)) ||
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
  if (url.pathname === '/api/users') return req.method === 'GET' ? 'account:user:base' : 'account:user:add';
  if (url.pathname.match(/^\/api\/users\/[^/]+\/update$/)) return 'account:user:edit';
  if (url.pathname.match(/^\/api\/users\/[^/]+\/delete$/)) return 'account:user:delete';
  if (url.pathname.match(/^\/api\/users\/[^/]+\/status$/)) return 'account:user:status';
  if (url.pathname.match(/^\/api\/users\/[^/]+\/reset-password$/)) return 'account:user:resetPassword';
  if (url.pathname.match(/^\/api\/users\/[^/]+$/)) return 'account:user:view';
  if (url.pathname === '/api/auth/register-requests') return 'account:user:base';
  if (url.pathname.match(/^\/api\/auth\/register-requests\/[^/]+\/approve$/)) return 'account:user:approveRegister';
  if (url.pathname.match(/^\/api\/auth\/register-requests\/[^/]+\/reject$/)) return 'account:user:rejectRegister';
  if (url.pathname.match(/^\/api\/auth\/register-requests\/[^/]+$/)) return 'account:user:view';
  if (url.pathname.startsWith('/api/roles') && req.method === 'GET') return 'account:user:roleView';
  if (url.pathname.startsWith('/api/roles')) return 'account:user:roleEdit';
  if (url.pathname === '/api/whitelist') return req.method === 'GET' ? 'security:whitelist:base' : 'security:whitelist:add';
  if (url.pathname === '/api/whitelist/export') return 'security:whitelist:export';
  if (url.pathname.match(/^\/api\/whitelist\/[^/]+\/update$/)) return 'security:whitelist:edit';
  if (url.pathname.match(/^\/api\/whitelist\/[^/]+\/status$/)) return 'security:whitelist:status';
  if (url.pathname.match(/^\/api\/whitelist\/[^/]+$/)) return 'security:whitelist:detail';
  if (url.pathname === '/api/blacklist') return req.method === 'GET' ? 'security:blacklist:base' : 'security:blacklist:add';
  if (url.pathname === '/api/blacklist/import') return 'security:blacklist:import';
  if (url.pathname.match(/^\/api\/blacklist\/[^/]+\/update$/)) return 'security:blacklist:edit';
  if (url.pathname.match(/^\/api\/blacklist\/[^/]+\/status$/)) return 'security:blacklist:remove';
  if (url.pathname.match(/^\/api\/blacklist\/[^/]+\/remove$/)) return 'security:blacklist:remove';
  if (url.pathname.match(/^\/api\/blacklist\/[^/]+$/)) return 'security:blacklist:detail';
  if (url.pathname === '/api/unsubscribes') return req.method === 'GET' ? 'security:unsubscribe:base' : 'security:unsubscribe:add';
  if (url.pathname === '/api/unsubscribes/import') return 'security:unsubscribe:import';
  if (url.pathname.match(/^\/api\/unsubscribes\/[^/]+\/update$/)) return 'security:unsubscribe:edit';
  if (url.pathname.match(/^\/api\/unsubscribes\/[^/]+\/status$/)) return 'security:unsubscribe:status';
  if (url.pathname.match(/^\/api\/unsubscribes\/[^/]+$/)) return 'security:unsubscribe:detail';
  if (url.pathname === '/api/settings') return 'security:setting:base';
  if (url.pathname === '/api/settings/provider/test') return 'security:setting:providerTest';
  if (url.pathname === '/api/settings/update') return 'security:setting:save';
  if (url.pathname === '/api/sms-providers') return req.method === 'GET' ? 'security:setting:base' : 'security:setting:save';
  if (url.pathname.match(/^\/api\/sms-providers\/[^/]+\/(update|status|activate)$/)) return 'security:setting:save';
  if (url.pathname.match(/^\/api\/sms-providers\/[^/]+$/)) return 'security:setting:base';
  if (url.pathname === '/api/worker/status') return 'security:setting:base';
  if (url.pathname === '/api/worker/run-once') return 'security:setting:workerRun';
  if (url.pathname === '/api/event-sources') return req.method === 'GET' ? 'integration:eventSource:base' : 'integration:eventSource:add';
  if (url.pathname.match(/^\/api\/event-sources\/[^/]+\/update$/)) return 'integration:eventSource:edit';
  if (url.pathname.match(/^\/api\/event-sources\/[^/]+\/status$/)) return 'integration:eventSource:status';
  if (url.pathname.match(/^\/api\/event-sources\/[^/]+\/reset-secret$/)) return 'integration:eventSource:resetSecret';
  if (url.pathname.match(/^\/api\/event-sources\/[^/]+\/logs$/)) return 'integration:eventSourceLog:base';
  if (url.pathname.match(/^\/api\/event-sources\/[^/]+\/stats$/)) return 'integration:eventSource:detail';
  if (url.pathname.match(/^\/api\/event-sources\/[^/]+$/)) return 'integration:eventSource:detail';
  if (url.pathname === '/api/data-sources') return req.method === 'GET' ? 'integration:dataSource:base' : 'integration:dataSource:add';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+\/update$/)) return 'integration:dataSource:edit';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+\/copy$/)) return 'integration:dataSource:copy';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+\/status$/)) return 'integration:dataSource:status';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+\/test-call$/)) return 'integration:dataSource:test';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+\/preview$/)) return 'integration:dataSource:preview';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+\/create-tasks$/)) return 'integration:dataSource:createTasks';
  if (url.pathname.match(/^\/api\/data-sources\/[^/]+$/)) return 'integration:dataSource:detail';
  if (url.pathname === '/api/data-source-runs') return 'integration:dataSourceRun:base';
  if (url.pathname.match(/^\/api\/data-source-runs\/[^/]+$/)) return 'integration:dataSourceRun:detail';
  if (url.pathname === '/api/event-source-logs') return 'integration:eventSourceLog:base';
  if (url.pathname.match(/^\/api\/event-source-logs\/[^/]+$/)) return 'integration:eventSourceLog:detail';
  if (url.pathname === '/api/operation-logs') return 'audit:operationLog:base';
  if (url.pathname.match(/^\/api\/operation-logs\/[^/]+$/)) return 'audit:operationLog:detail';
  if (url.pathname === '/api/export-tasks') return req.method === 'GET' ? 'audit:exportTask:base' : 'audit:exportTask:add';
  if (url.pathname.match(/^\/api\/export-tasks\/[^/]+\/download$/)) return 'audit:exportTask:download';
  if (url.pathname.match(/^\/api\/export-tasks\/[^/]+$/)) return 'audit:exportTask:detail';
  if (url.pathname === '/api/batch-jobs') return 'audit:batchJob:base';
  if (url.pathname.match(/^\/api\/batch-jobs\/[^/]+$/)) return 'audit:batchJob:detail';
  if (url.pathname.startsWith('/api/tasks/batch-cancel')) return 'touch:task:batchCancel';
  if (url.pathname.startsWith('/api/tasks/batch-retry')) return 'touch:task:batchRetry';
  if (url.pathname === '/api/approvals') return req.method === 'GET' ? 'audit:approval:base' : 'audit:approval:add';
  if (url.pathname.match(/^\/api\/approvals\/[^/]+\/approve$/)) return 'audit:approval:approve';
  if (url.pathname.match(/^\/api\/approvals\/[^/]+\/reject$/)) return 'audit:approval:reject';
  if (url.pathname.match(/^\/api\/approvals\/[^/]+\/withdraw$/)) return 'audit:approval:withdraw';
  if (url.pathname.match(/^\/api\/approvals\/[^/]+$/)) return 'audit:approval:detail';
  if (url.pathname.startsWith('/api/safety')) return 'touch:manual:send';
  return undefined;
}
