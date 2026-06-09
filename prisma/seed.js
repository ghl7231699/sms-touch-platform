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
    { key: 'sms.worker', value: { enabled: false, batchSize: 20 } },
    { key: 'sms.short_link', value: { enabled: true, baseUrl: 'http://127.0.0.1:3100', targetUrl: 'https://example.com/sms-touch-platform' } },
    { key: 'sms.safety', value: { requireWhitelistForMock: false, requireWhitelistForRealProvider: true } },
    { key: 'sms.verification_code', value: { validMinutes: 5, dailyLimit: 10 } }
  ];
  for (const setting of settings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: { id: `setting_${setting.key.replaceAll('.', '_')}`, ...setting },
      update: { value: setting.value }
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
