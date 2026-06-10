import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(7)}` : '';
}

const templates = [
  {
    id: 'tpl_register',
    name: '注册转化提醒',
    scene: 'register',
    providerTemplateId: '100001',
    content: '您的测试验证码为${code}，${min}分钟内有效。',
    variables: ['code', 'min'],
    status: 'enabled'
  },
  {
    id: 'tpl_member_expired',
    name: '会员过期召回',
    scene: 'member',
    providerTemplateId: '100002',
    content: '您的测试验证码为${code}，${min}分钟内有效。',
    variables: ['code', 'min'],
    status: 'enabled'
  },
  {
    id: 'tpl_campaign',
    name: '活动开始通知',
    scene: 'campaign',
    providerTemplateId: '100003',
    content: '您的测试验证码为${code}，${min}分钟内有效。',
    variables: ['code', 'min'],
    status: 'enabled'
  },
  {
    id: 'tpl_after_sale',
    name: '订单完成回访',
    scene: 'after_sale',
    providerTemplateId: '100001',
    content: '您的测试验证码为${code}，${min}分钟内有效。',
    variables: ['code', 'min'],
    status: 'enabled'
  }
];

const rules = [
  {
    id: 'rule_register_24h',
    name: '注册24小时未转化提醒',
    code: 'register_24h_unpaid',
    scene: 'register',
    eventType: 'user_register',
    delayValue: 24,
    delayUnit: 'hour',
    conditionType: 'unpaid_after_register',
    conditionConfig: {
      type: 'not_purchased_membership',
      window: { value: 24, unit: 'hour' },
      membershipProductIds: ['vip_monthly', 'vip_yearly']
    },
    templateId: 'tpl_register',
    status: 'enabled'
  },
  {
    id: 'rule_member_expired_3d',
    name: '会员过期3天召回',
    code: 'member_expired_3d',
    scene: 'member',
    eventType: 'membership_expired',
    delayValue: 3,
    delayUnit: 'day',
    conditionType: 'expired_after_days',
    conditionConfig: { type: 'expired_after_days', window: { value: 3, unit: 'day' } },
    templateId: 'tpl_member_expired',
    status: 'enabled'
  },
  {
    id: 'rule_campaign_1h',
    name: '活动开始前1小时通知',
    code: 'campaign_before_1h',
    scene: 'campaign',
    eventType: 'campaign_start',
    delayValue: 1,
    delayUnit: 'hour',
    conditionType: 'before_campaign_start',
    conditionConfig: { type: 'before_campaign_start', window: { value: 1, unit: 'hour' } },
    templateId: 'tpl_campaign',
    status: 'enabled'
  },
  {
    id: 'rule_order_7d',
    name: '订单完成7天回访',
    code: 'order_completed_7d',
    scene: 'after_sale',
    eventType: 'order_completed',
    delayValue: 7,
    delayUnit: 'day',
    conditionType: 'after_order_completed',
    conditionConfig: { type: 'after_order_completed', window: { value: 7, unit: 'day' } },
    templateId: 'tpl_after_sale',
    status: 'enabled'
  }
];

const roles = [
  {
    id: 'role_admin',
    code: 'admin',
    name: '系统管理员',
    description: '拥有平台全部配置、账号、审计和触达操作权限。',
    permissions: ['*'],
    status: 'active'
  },
  {
    id: 'role_operator',
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
    ],
    status: 'active'
  },
  {
    id: 'role_readonly',
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
    ],
    status: 'active'
  }
];

const testPhones = ['18709795241', '15117970665', '18633007288', '18515385071'];

const frequencyPolicies = [
  { id: 'freq_register', scene: 'register', dailyLimit: 2, weeklyLimit: 4, cooldownMinutes: 720, quietStart: '21:00', quietEnd: '09:00' },
  { id: 'freq_member', scene: 'member', dailyLimit: 1, weeklyLimit: 3, cooldownMinutes: 1440, quietStart: '21:00', quietEnd: '09:00' },
  { id: 'freq_campaign', scene: 'campaign', dailyLimit: 1, weeklyLimit: 2, cooldownMinutes: 1440, quietStart: '21:00', quietEnd: '09:00' },
  { id: 'freq_after_sale', scene: 'after_sale', dailyLimit: 1, weeklyLimit: 2, cooldownMinutes: 1440, quietStart: '21:00', quietEnd: '09:00' },
  { id: 'freq_manual', scene: 'manual', dailyLimit: 3, weeklyLimit: 8, cooldownMinutes: 60, quietStart: '22:00', quietEnd: '08:00' }
];

const demoPhones = [
  '18515385071',
  '18709795241',
  '15117970665',
  '18633007288',
  '13900000001',
  '13900000002',
  '13900000003',
  '13900000004'
];

function dateAgo(days = 0, hours = 0, minutes = 0) {
  return new Date(Date.now() - (((days * 24 + hours) * 60 + minutes) * 60 * 1000));
}

function futureDate(hours = 1, minutes = 0) {
  return new Date(Date.now() + ((hours * 60 + minutes) * 60 * 1000));
}

function demoTemplateForScene(scene) {
  return templates.find((template) => template.scene === scene) || templates[0];
}

function demoRuleForEvent(eventType) {
  return rules.find((rule) => rule.eventType === eventType) || rules[0];
}

const demoScenarios = [
  { eventType: 'user_register', scene: 'register', userPrefix: 'reg', ruleId: 'rule_register_24h' },
  { eventType: 'membership_expired', scene: 'member', userPrefix: 'mem', ruleId: 'rule_member_expired_3d' },
  { eventType: 'campaign_start', scene: 'campaign', userPrefix: 'camp', ruleId: 'rule_campaign_1h' },
  { eventType: 'order_completed', scene: 'after_sale', userPrefix: 'order', ruleId: 'rule_order_7d' }
];

function demoEvent(index) {
  const scenario = demoScenarios[index % demoScenarios.length];
  const phone = demoPhones[index % demoPhones.length];
  return {
    id: `demo_evt_${index + 1}`,
    eventId: `demo_event_${index + 1}`,
    eventType: scenario.eventType,
    userId: `demo_${scenario.userPrefix}_user_${index + 1}`,
    phone,
    payload: {
      phone,
      source: index % 3 === 0 ? 'mini_program' : 'web',
      membershipProductId: index % 2 === 0 ? 'vip_monthly' : 'vip_yearly',
      amount: 99 + index,
      demo: true
    },
    occurredAt: dateAgo(Math.floor(index / 4), index % 6),
    createdAt: dateAgo(Math.floor(index / 4), index % 6)
  };
}

function demoLog(index) {
  const scenario = demoScenarios[index % demoScenarios.length];
  const template = demoTemplateForScene(scenario.scene);
  const rule = demoRuleForEvent(scenario.eventType);
  const phone = demoPhones[index % demoPhones.length];
  const statusCycle = ['success', 'success', 'failed', 'blocked', 'success', 'skipped'];
  const status = statusCycle[index % statusCycle.length];
  const codeMap = {
    success: 'OK',
    failed: 'PROVIDER_TIMEOUT',
    blocked: index % 2 === 0 ? 'PHONE_NOT_IN_WHITELIST' : 'PHONE_IN_BLACKLIST',
    skipped: 'CONDITION_NOT_MATCHED'
  };
  const messageMap = {
    success: '服务商已接收短信请求。',
    failed: '服务商响应超时，等待重试。',
    blocked: '发送前安全校验拦截。',
    skipped: '业务条件未满足，任务已跳过。'
  };
  const createdAt = dateAgo(Math.floor(index / 5), index % 8, index * 3);
  return {
    id: `demo_log_${index + 1}`,
    provider: index % 4 === 0 ? 'aliyun_dypns' : 'mock',
    triggerType: index % 5 === 0 ? 'manual' : 'auto',
    scene: scenario.scene,
    phone,
    phoneMasked: maskPhone(phone),
    templateId: template.id,
    templateName: template.name,
    templateCode: template.providerTemplateId,
    templateParam: { code: '***', min: '5' },
    ruleId: rule.id,
    ruleName: rule.name,
    eventId: `demo_event_${(index % 16) + 1}`,
    eventType: scenario.eventType,
    status,
    receiptStatus: status === 'success' ? (index % 3 === 0 ? 'delivered' : 'submitted') : status,
    code: codeMap[status],
    message: messageMap[status],
    bizId: status === 'success' ? `demo_biz_${index + 1}` : null,
    requestId: `demo_req_${index + 1}`,
    shortCode: status === 'success' ? `d${index + 100}` : null,
    shortUrl: status === 'success' ? `http://127.0.0.1:3100/s/d${index + 100}` : null,
    clickCount: status === 'success' ? index % 4 : 0,
    lastClickedAt: status === 'success' && index % 4 ? dateAgo(0, index % 4) : null,
    rawResponse: { demo: true, status },
    createdAt,
    updatedAt: createdAt
  };
}

function demoTask(index) {
  const scenario = demoScenarios[index % demoScenarios.length];
  const template = demoTemplateForScene(scenario.scene);
  const rule = demoRuleForEvent(scenario.eventType);
  const phone = demoPhones[index % demoPhones.length];
  const statuses = ['pending', 'pending', 'success', 'failed', 'blocked', 'cancelled', 'skipped', 'sending'];
  const status = statuses[index % statuses.length];
  const createdAt = dateAgo(Math.floor(index / 6), index % 9, index * 2);
  const scheduledAt = status === 'pending' ? futureDate(index % 4, 15) : dateAgo(index % 3, index % 5);
  const hasLog = ['success', 'failed', 'blocked', 'skipped'].includes(status) && index < 20;
  return {
    id: `demo_task_${index + 1}`,
    taskType: index % 5 === 0 ? 'manual' : 'auto',
    status,
    triggerType: index % 5 === 0 ? 'manual' : 'auto',
    scene: scenario.scene,
    phone,
    phoneMasked: maskPhone(phone),
    templateId: template.id,
    templateName: template.name,
    templateCode: template.providerTemplateId,
    templateParam: { code: '***', min: '5' },
    ruleId: rule.id,
    ruleName: rule.name,
    eventId: `demo_event_${(index % 16) + 1}`,
    eventType: scenario.eventType,
    scheduledAt,
    sentAt: status === 'success' ? dateAgo(index % 3, index % 5) : null,
    attemptCount: status === 'failed' ? 2 : status === 'sending' ? 1 : 0,
    maxAttempts: 3,
    lastErrorCode: status === 'failed' ? 'PROVIDER_TIMEOUT' : status === 'blocked' ? 'PHONE_IN_BLACKLIST' : null,
    lastErrorMessage: status === 'failed' ? '服务商超时，可批量重试。' : status === 'blocked' ? '号码命中黑名单。' : null,
    conditionCheckedAt: ['success', 'failed', 'blocked', 'skipped'].includes(status) ? dateAgo(index % 3, index % 5) : null,
    conditionResult: status === 'skipped' ? 'not_match' : ['success', 'failed', 'blocked'].includes(status) ? 'match' : 'not_checked',
    conditionReason: status === 'skipped' ? '用户已在窗口期内购买会员。' : null,
    logId: hasLog ? `demo_log_${index + 1}` : null,
    createdAt,
    updatedAt: createdAt
  };
}

async function main() {
  for (const template of templates) {
    await prisma.smsTemplate.upsert({
      where: { id: template.id },
      create: template,
      update: template
    });
  }

  for (const rule of rules) {
    await prisma.smsRule.upsert({
      where: { id: rule.id },
      create: rule,
      update: rule
    });
  }

  for (const role of roles) {
    await prisma.adminRole.upsert({
      where: { code: role.code },
      create: role,
      update: role
    });
  }

  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@sms.local';
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin123!';
  const admin = await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: {
      id: 'admin_bootstrap',
      email: adminEmail,
      name: '平台管理员',
      passwordHash: hashPassword(adminPassword),
      status: 'active'
    },
    update: {
      name: '平台管理员',
      status: 'active'
    }
  });

  await prisma.adminUserRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: 'role_admin' } },
    create: { id: 'admin_bootstrap_role', userId: admin.id, roleId: 'role_admin' },
    update: {}
  });

  for (const phone of testPhones) {
    await prisma.smsWhitelist.upsert({
      where: { phone },
      create: {
        id: `wl_${phone}`,
        phone,
        phoneMasked: maskPhone(phone),
        scene: null,
        remark: '项目测试手机号',
        status: 'enabled'
      },
      update: {
        phoneMasked: maskPhone(phone),
        remark: '项目测试手机号',
        status: 'enabled'
      }
    });
  }

  for (const policy of frequencyPolicies) {
    await prisma.smsFrequencyPolicy.upsert({
      where: { scene: policy.scene },
      create: { ...policy, status: 'enabled' },
      update: { ...policy, status: 'enabled' }
    });
  }

  const settings = [
    { key: 'sms.provider', value: { provider: process.env.SMS_PROVIDER || 'mock' } },
    { key: 'sms.worker', value: { enabled: false, intervalMs: 30000, batchSize: 20, allowRealSend: false } },
    { key: 'sms.short_link', value: { enabled: true, baseUrl: 'http://127.0.0.1:3100', targetUrl: 'https://example.com/sms-touch-platform' } },
    { key: 'sms.safety', value: { requireWhitelistForMock: false, requireWhitelistForRealProvider: true } },
    { key: 'sms.verification_code', value: { validMinutes: 5, resendIntervalSeconds: 60, dailyLimit: 10 } },
    { key: 'sms.receipt', value: { enabled: true, allowMockDelivered: true } },
    {
      key: 'sms.aliyun',
      value: {
        credentialMode: 'env',
        endpoint: process.env.ALIYUN_DYPNS_ENDPOINT || 'dypnsapi.aliyuncs.com',
        region: process.env.ALIYUN_DYPNS_REGION || 'cn-hangzhou',
        signName: process.env.ALIYUN_SMS_SIGN_NAME || '速通互联验证码',
        templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '100001'
      }
    }
  ];
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: { id: `setting_${setting.key.replaceAll('.', '_')}`, ...setting },
      update: { value: setting.value }
    });
  }

  const operator = await prisma.adminUser.upsert({
    where: { email: 'operator@sms.local' },
    create: {
      id: 'demo_operator',
      email: 'operator@sms.local',
      name: '运营专员',
      passwordHash: hashPassword('Operator123!'),
      status: 'active',
      lastLoginAt: dateAgo(0, 2)
    },
    update: {
      name: '运营专员',
      status: 'active',
      lastLoginAt: dateAgo(0, 2)
    }
  });

  await prisma.adminUserRole.upsert({
    where: { userId_roleId: { userId: operator.id, roleId: 'role_operator' } },
    create: { id: 'demo_operator_role', userId: operator.id, roleId: 'role_operator' },
    update: {}
  });

  const readonly = await prisma.adminUser.upsert({
    where: { email: 'readonly@sms.local' },
    create: {
      id: 'demo_readonly',
      email: 'readonly@sms.local',
      name: '只读观察员',
      passwordHash: hashPassword('Readonly123!'),
      status: 'active',
      lastLoginAt: dateAgo(1, 1)
    },
    update: {
      name: '只读观察员',
      status: 'active',
      lastLoginAt: dateAgo(1, 1)
    }
  });

  await prisma.adminUserRole.upsert({
    where: { userId_roleId: { userId: readonly.id, roleId: 'role_readonly' } },
    create: { id: 'demo_readonly_role', userId: readonly.id, roleId: 'role_readonly' },
    update: {}
  });

  const blacklistSamples = [
    { id: 'demo_blacklist_1', phone: '13900000003', reason: '投诉号码', source: 'complaint' },
    { id: 'demo_blacklist_2', phone: '13900000004', reason: '风控命中', source: 'risk_control' }
  ];
  for (const item of blacklistSamples) {
    await prisma.smsBlacklist.upsert({
      where: { phone: item.phone },
      create: { ...item, phoneMasked: maskPhone(item.phone), status: 'active', createdById: admin.id },
      update: { phoneMasked: maskPhone(item.phone), reason: item.reason, source: item.source, status: 'active' }
    });
  }

  const unsubscribeSamples = [
    { id: 'demo_unsubscribe_1', phone: '13900000001', scene: 'campaign', source: 'sms_reply', remark: '回复 TD 退订活动通知' },
    { id: 'demo_unsubscribe_2', phone: '13900000002', scene: 'member', source: 'manual', remark: '客服登记退订会员召回' }
  ];
  for (const item of unsubscribeSamples) {
    await prisma.smsUnsubscribe.upsert({
      where: { phone_scene: { phone: item.phone, scene: item.scene } },
      create: { ...item, phoneMasked: maskPhone(item.phone), status: 'active' },
      update: { phoneMasked: maskPhone(item.phone), source: item.source, remark: item.remark, status: 'active' }
    });
  }

  const source = await prisma.eventSource.upsert({
    where: { appId: 'demo_shop_app' },
    create: {
      id: 'demo_event_source_shop',
      appId: 'demo_shop_app',
      name: '线上商城事件源',
      secretHash: crypto.createHash('sha256').update('demo_secret').digest('hex'),
      secretPreview: 'demo_sec...cret',
      status: 'enabled',
      remark: '演示用业务系统事件来源'
    },
    update: {
      name: '线上商城事件源',
      status: 'enabled',
      remark: '演示用业务系统事件来源'
    }
  });

  const demoEvents = Array.from({ length: 20 }, (_, index) => demoEvent(index));
  for (const item of demoEvents) {
    await prisma.smsEvent.upsert({
      where: { eventId: item.eventId },
      create: item,
      update: item
    });
  }

  const demoLogs = Array.from({ length: 24 }, (_, index) => demoLog(index));
  for (const item of demoLogs) {
    await prisma.smsSendLog.upsert({
      where: { id: item.id },
      create: item,
      update: item
    });
  }

  for (const log of demoLogs.filter((item) => item.status === 'success').slice(0, 8)) {
    await prisma.smsShortLink.upsert({
      where: { logId: log.id },
      create: {
        id: `demo_short_${log.id}`,
        shortCode: log.shortCode,
        shortUrl: log.shortUrl,
        targetUrl: 'https://example.com/sms-touch-platform/campaign',
        logId: log.id,
        userId: `demo_click_user_${log.id}`,
        phoneMasked: log.phoneMasked,
        clickCount: log.clickCount,
        createdAt: log.createdAt
      },
      update: {
        shortCode: log.shortCode,
        shortUrl: log.shortUrl,
        clickCount: log.clickCount,
        phoneMasked: log.phoneMasked
      }
    });
    if (log.clickCount > 0) {
      await prisma.smsClickLog.upsert({
        where: { id: `demo_click_${log.id}` },
        create: {
          id: `demo_click_${log.id}`,
          shortCode: log.shortCode,
          logId: log.id,
          userId: `demo_click_user_${log.id}`,
          ip: '127.0.0.1',
          userAgent: 'Demo Browser',
          clickedAt: log.lastClickedAt || dateAgo(0, 1)
        },
        update: {
          shortCode: log.shortCode,
          logId: log.id,
          clickedAt: log.lastClickedAt || dateAgo(0, 1)
        }
      });
    }
    await prisma.smsReceipt.upsert({
      where: { bizId_receiptStatus: { bizId: log.bizId, receiptStatus: log.receiptStatus || 'submitted' } },
      create: {
        id: `demo_receipt_${log.id}`,
        logId: log.id,
        bizId: log.bizId,
        requestId: log.requestId,
        receiptStatus: log.receiptStatus || 'submitted',
        raw: { demo: true, provider: log.provider },
        createdAt: log.createdAt
      },
      update: {
        logId: log.id,
        requestId: log.requestId,
        raw: { demo: true, provider: log.provider }
      }
    });
  }

  const demoTasks = Array.from({ length: 32 }, (_, index) => demoTask(index));
  for (const item of demoTasks) {
    await prisma.smsTask.upsert({
      where: { id: item.id },
      create: item,
      update: item
    });
  }

  const eventSourceLogs = Array.from({ length: 10 }, (_, index) => {
    const event = demoEvents[index % demoEvents.length];
    const failed = index % 4 === 3;
    return {
      id: `demo_event_source_log_${index + 1}`,
      sourceId: source.id,
      appId: source.appId,
      eventType: event.eventType,
      eventId: event.eventId,
      status: failed ? 'failed' : 'success',
      code: failed ? 'EVENT_SOURCE_SECRET_INVALID' : 'EVENT_ACCEPTED',
      message: failed ? '事件来源密钥不正确。' : '事件已接收并完成规则匹配。',
      ip: '127.0.0.1',
      userAgent: 'Demo Event Client',
      payload: event.payload,
      createdAt: dateAgo(0, index)
    };
  });
  for (const item of eventSourceLogs) {
    await prisma.eventSourceLog.upsert({
      where: { id: item.id },
      create: item,
      update: item
    });
  }

  const exportTasks = [
    { id: 'demo_export_operation_log', name: '操作日志脱敏导出', resource: 'operation_log', status: 'completed', fileName: `operation_log_demo.json`, criteria: { range: 'last_7_days', maskSensitive: true }, completedAt: dateAgo(0, 3), createdAt: dateAgo(0, 3) },
    { id: 'demo_export_send_log', name: '发送记录脱敏导出', resource: 'send_log', status: 'completed', fileName: `send_log_demo.json`, criteria: { scene: 'register', maskSensitive: true }, completedAt: dateAgo(1, 2), createdAt: dateAgo(1, 2) },
    { id: 'demo_export_plain_pending', name: '明文手机号导出申请', resource: 'sms_whitelist', status: 'pending', fileName: null, criteria: { sensitive: true, maskSensitive: false }, completedAt: null, createdAt: dateAgo(0, 5) }
  ];
  for (const item of exportTasks) {
    await prisma.exportTask.upsert({
      where: { id: item.id },
      create: { ...item, createdById: admin.id },
      update: { ...item, createdById: admin.id }
    });
  }

  const batchJobs = [
    {
      id: 'demo_batch_retry_failed',
      name: '批量重试失败任务',
      jobType: 'task_retry',
      status: 'completed',
      totalCount: 6,
      successCount: 5,
      failedCount: 1,
      createdAt: dateAgo(0, 4),
      items: [
        ['demo_task_4', 'success', '已重新进入待执行队列'],
        ['demo_task_12', 'success', '已重新进入待执行队列'],
        ['demo_task_20', 'success', '已重新进入待执行队列'],
        ['demo_task_28', 'success', '已重新进入待执行队列'],
        ['demo_task_30', 'success', '已重新进入待执行队列'],
        ['demo_task_31', 'failed', '任务已超过最大重试次数']
      ]
    },
    {
      id: 'demo_batch_cancel_pending',
      name: '批量取消待发送任务',
      jobType: 'task_cancel',
      status: 'partial_failed',
      totalCount: 5,
      successCount: 4,
      failedCount: 1,
      createdAt: dateAgo(1, 3),
      items: [
        ['demo_task_1', 'success', '已取消'],
        ['demo_task_2', 'success', '已取消'],
        ['demo_task_9', 'success', '已取消'],
        ['demo_task_10', 'success', '已取消'],
        ['demo_task_19', 'failed', '任务状态已变化，无法取消']
      ]
    }
  ];
  for (const job of batchJobs) {
    await prisma.batchJob.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        name: job.name,
        jobType: job.jobType,
        status: job.status,
        totalCount: job.totalCount,
        successCount: job.successCount,
        failedCount: job.failedCount,
        createdById: admin.id,
        createdAt: job.createdAt
      },
      update: {
        name: job.name,
        jobType: job.jobType,
        status: job.status,
        totalCount: job.totalCount,
        successCount: job.successCount,
        failedCount: job.failedCount,
        createdById: admin.id
      }
    });
    await prisma.batchJobItem.deleteMany({ where: { jobId: job.id } });
    await prisma.batchJobItem.createMany({
      data: job.items.map(([target, status, message], index) => ({
        id: `${job.id}_item_${index + 1}`,
        jobId: job.id,
        target,
        status,
        message,
        createdAt: job.createdAt
      }))
    });
  }

  const approvals = [
    {
      id: 'demo_approval_rule_enable',
      title: '启用规则审批：注册24小时未转化提醒',
      resource: 'sms_rule',
      resourceId: 'rule_register_24h',
      action: 'enable',
      status: 'pending',
      createdAt: dateAgo(0, 1),
      payload: {
        scenario: '规则启用',
        reason: '该规则启用后会自动创建营销触达任务。',
        riskLevel: 'high',
        before: { status: 'disabled' },
        after: { status: 'enabled' },
        impact: { title: '注册24小时未转化提醒', description: '预计影响最近 24 小时注册未购会员用户。', count: 126 },
        execute: { type: 'update_rule_status', ruleId: 'rule_register_24h', status: 'enabled' },
        summary: { scenario: '规则启用', reason: '自动触达前置审批', riskLevel: 'high', impact: { title: '注册24小时未转化提醒', count: 126 } }
      },
      records: [['create', '运营提交规则启用申请']]
    },
    {
      id: 'demo_approval_provider_switch',
      title: '高风险运行配置变更',
      resource: 'system_setting',
      resourceId: null,
      action: 'update',
      status: 'approved',
      createdAt: dateAgo(1, 2),
      payload: {
        scenario: '配置变更',
        reason: '从 mock 切换到阿里云测试通道。',
        riskLevel: 'high',
        before: { provider: { provider: 'mock' } },
        after: { provider: { provider: 'aliyun_dypns' } },
        impact: { title: '真实发送安全策略', description: '审批通过后真实服务商配置生效。' },
        execute: { type: 'update_system_settings', settings: { 'sms.provider': { provider: 'aliyun_dypns' } } },
        executeResult: { executed: true, type: 'update_system_settings', result: { appliedKeys: ['sms.provider'] } },
        summary: { scenario: '配置变更', reason: 'Provider 切换', riskLevel: 'high', impact: { title: '真实发送安全策略' } }
      },
      records: [['create', '申请切换阿里云测试通道'], ['approve', '测试手机号均已加入白名单，同意。']]
    },
    {
      id: 'demo_approval_plain_export',
      title: '明文白名单导出审批',
      resource: 'export_task',
      resourceId: 'demo_export_plain_pending',
      action: 'create',
      status: 'rejected',
      createdAt: dateAgo(2, 1),
      payload: {
        scenario: '明文数据导出',
        reason: '需要核对测试手机号。',
        riskLevel: 'high',
        impact: { title: '白名单明文导出', description: '包含手机号明文字段。', count: 4 },
        execute: { type: 'create_export_task', resource: 'sms_whitelist', criteria: { sensitive: true } },
        summary: { scenario: '明文数据导出', reason: '导出敏感字段', riskLevel: 'high', impact: { title: '白名单明文导出', count: 4 } }
      },
      records: [['create', '申请导出测试手机号明细'], ['reject', '无需明文，使用脱敏导出即可。']]
    }
  ];
  await prisma.approvalRecord.deleteMany({ where: { approvalId: { in: approvals.map((item) => item.id) } } });
  for (const item of approvals) {
    await prisma.approvalOrder.upsert({
      where: { id: item.id },
      create: {
        id: item.id,
        title: item.title,
        resource: item.resource,
        resourceId: item.resourceId,
        action: item.action,
        payload: item.payload,
        status: item.status,
        createdById: operator.id,
        createdAt: item.createdAt
      },
      update: {
        title: item.title,
        resource: item.resource,
        resourceId: item.resourceId,
        action: item.action,
        payload: item.payload,
        status: item.status,
        createdById: operator.id
      }
    });
    await prisma.approvalRecord.createMany({
      data: item.records.map(([action, comment], index) => ({
        id: `${item.id}_record_${index + 1}`,
        approvalId: item.id,
        action,
        comment,
        operatorId: index === 0 ? operator.id : admin.id,
        createdAt: new Date(item.createdAt.getTime() + index * 30 * 60 * 1000)
      }))
    });
  }

  const operationLogs = [
    ['demo_op_login_admin', admin.id, '平台管理员', 'login', 'auth', admin.id, 'POST', '/api/auth/login', 'success', 200, null, dateAgo(0, 1)],
    ['demo_op_logout_admin', admin.id, '平台管理员', 'logout', 'auth', admin.id, 'POST', '/api/auth/logout', 'success', 200, null, dateAgo(0, 0, 45)],
    ['demo_op_user_create', admin.id, '平台管理员', 'create', 'admin_user', operator.id, 'POST', '/api/users', 'success', 201, { email: operator.email }, dateAgo(3, 2)],
    ['demo_op_approval_create', operator.id, '运营专员', 'create', 'approval_order', 'demo_approval_rule_enable', 'POST', '/api/approvals', 'success', 201, { title: '启用规则审批' }, dateAgo(0, 1)],
    ['demo_op_approval_approve', admin.id, '平台管理员', 'approve', 'approval_order', 'demo_approval_provider_switch', 'POST', '/api/approvals/demo_approval_provider_switch/approve', 'success', 200, { comment: '同意' }, dateAgo(1, 1)],
    ['demo_op_approval_reject', admin.id, '平台管理员', 'reject', 'approval_order', 'demo_approval_plain_export', 'POST', '/api/approvals/demo_approval_plain_export/reject', 'success', 200, { comment: '使用脱敏导出' }, dateAgo(2, 0, 20)],
    ['demo_op_export_create', admin.id, '平台管理员', 'create', 'export_task', 'demo_export_operation_log', 'POST', '/api/export-tasks', 'success', 201, { resource: 'operation_log' }, dateAgo(0, 3)],
    ['demo_op_batch_retry', operator.id, '运营专员', 'batch_retry', 'sms_task', 'demo_batch_retry_failed', 'POST', '/api/tasks/batch-retry', 'success', 200, { count: 6 }, dateAgo(0, 4)],
    ['demo_op_batch_cancel', operator.id, '运营专员', 'batch_cancel', 'sms_task', 'demo_batch_cancel_pending', 'POST', '/api/tasks/batch-cancel', 'success', 200, { count: 5 }, dateAgo(1, 3)],
    ['demo_op_whitelist_create', admin.id, '平台管理员', 'create', 'sms_whitelist', 'wl_18515385071', 'POST', '/api/whitelist', 'success', 201, { phone: maskPhone('18515385071') }, dateAgo(4, 2)],
    ['demo_op_source_reset', admin.id, '平台管理员', 'reset_secret', 'event_source', source.id, 'POST', `/api/event-sources/${source.id}/reset-secret`, 'success', 200, {}, dateAgo(1, 5)]
  ];
  for (const [id, userId, userName, action, resource, resourceId, method, path, result, statusCode, requestBody, createdAt] of operationLogs) {
    await prisma.adminOperationLog.upsert({
      where: { id },
      create: {
        id,
        userId,
        userName,
        action,
        resource,
        resourceId,
        method,
        path,
        ip: '127.0.0.1',
        userAgent: 'Demo Browser',
        requestBody,
        result,
        statusCode,
        createdAt
      },
      update: {
        userId,
        userName,
        action,
        resource,
        resourceId,
        method,
        path,
        requestBody,
        result,
        statusCode
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
