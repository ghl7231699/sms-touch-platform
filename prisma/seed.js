import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
    templateId: 'tpl_after_sale',
    status: 'enabled'
  }
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
