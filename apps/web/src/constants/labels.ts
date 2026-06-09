export const sceneLabels: Record<string, string> = {
  register: '注册转化',
  member: '会员召回',
  campaign: '活动通知',
  after_sale: '售后回访'
};

export const eventLabels: Record<string, string> = {
  user_register: '用户注册',
  membership_expired: '会员过期',
  campaign_start: '活动开始',
  order_completed: '订单完成'
};

export function statusLabel(status: string) {
  return {
    enabled: '启用',
    disabled: '停用',
    success: '成功',
    pending: '待发送',
    sending: '发送中',
    failed: '失败',
    blocked: '拦截',
    skipped: '已跳过',
    cancelled: '已取消'
  }[status] || status;
}

export function conditionLabel(condition: string) {
  return {
    none: '无条件',
    unpaid_after_register: '未购买会员',
    not_purchased_membership: '未购买会员',
    expired_after_days: '会员过期',
    before_campaign_start: '活动开始前',
    after_order_completed: '订单完成后'
  }[condition] || condition;
}

