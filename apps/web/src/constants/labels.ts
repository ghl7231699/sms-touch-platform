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
    pending: '待处理',
    task_pending: '待发送',
    approval_pending: '待审批',
    register_pending: '待审核',
    sending: '发送中',
    failed: '失败',
    partial_failed: '部分失败',
    blocked: '拦截',
    skipped: '已跳过',
    cancelled: '已取消',
    active: '生效中',
    removed: '已移除',
    approved: '已通过',
    rejected: '已驳回',
    withdrawn: '已撤回',
    locked: '锁定'
  }[status] || status;
}

export function taskStatusKey(status?: string) {
  return status === 'pending' ? 'task_pending' : status || '';
}

export function sendStatusKey(status?: string) {
  return status === 'pending' ? 'task_pending' : status || '';
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

export function resourceLabel(resource?: string) {
  return {
    auth: '账号登录',
    admin_user: '后台用户',
    auth_register_request: '注册申请',
    sms_whitelist: '白名单',
    sms_blacklist: '黑名单',
    sms_unsubscribe: '退订记录',
    blacklist_import: '黑名单导入',
    unsubscribe_import: '退订导入',
    system_setting: '发送控制',
    sms_worker: 'Worker',
    event_source: '事件来源',
    data_source: '数据来源',
    data_source_run: '数据来源执行',
    sms_task: '短信任务',
    export_task: '导出任务',
    operation_log: '操作日志',
    operation_logs: '操作日志',
    send_log: '发送记录',
    sms_send_log: '发送记录',
    event_source_log: '接入日志',
    approval_order: '审批单',
    sms_rule: '自动化规则',
    sms_template: '短信模板'
  }[resource || ''] || resource || '-';
}

export function actionLabel(action?: string) {
  return {
    create: '创建',
    update: '更新',
    change_status: '变更状态',
    update_permissions: '更新权限',
    delete: '删除',
    download: '下载',
    reset_password: '重置密码',
    change_password: '修改密码',
    approve: '通过',
    reject: '驳回',
    withdraw: '撤回',
    remove: '移除',
    import: '导入',
    export: '导出',
    login: '登录',
    logout: '退出登录',
    reset_secret: '重置密钥',
    batch_cancel: '批量取消',
    batch_retry: '批量重试',
    execute_failed: '执行失败',
    test_provider: 'Provider 自检',
    run_once: '执行一次',
    enable: '启用',
    disable: '停用'
  }[action || ''] || action || '-';
}

export function batchJobLabel(jobType?: string) {
  return {
    task_cancel: '批量取消任务',
    task_retry: '批量重试任务',
    blacklist_import: '批量导入黑名单',
    unsubscribe_import: '批量导入退订',
    data_source_create_tasks: '数据来源生成任务'
  }[jobType || ''] || jobType || '-';
}

export function approvalStatusLabel(status?: string) {
  return {
    pending: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    withdrawn: '已撤回'
  }[status || ''] || status || '-';
}

export function operationLabel(resource?: string, action?: string) {
  const combined = `${resource || ''}:${action || ''}`;
  return {
    'auth:login': '登录系统',
    'auth:logout': '退出登录',
    'auth:change_password': '修改登录密码',
    'admin_user:create': '创建后台用户',
    'admin_user:update': '更新后台用户',
    'admin_user:delete': '删除后台用户',
    'admin_user:change_status': '变更用户状态',
    'admin_user:reset_password': '重置用户密码',
    'auth_register_request:approve': '通过注册申请',
    'auth_register_request:reject': '驳回注册申请',
    'sms_whitelist:create': '新增白名单',
    'sms_whitelist:update': '编辑白名单',
    'sms_whitelist:change_status': '变更白名单状态',
    'sms_whitelist:export': '导出白名单',
    'sms_blacklist:create': '新增黑名单',
    'sms_blacklist:update': '编辑黑名单',
    'sms_blacklist:remove': '移除黑名单',
    'sms_blacklist:change_status': '变更黑名单状态',
    'sms_unsubscribe:create': '新增退订记录',
    'sms_unsubscribe:update': '编辑退订记录',
    'sms_unsubscribe:change_status': '变更退订状态',
    'blacklist_import:import': '批量导入黑名单',
    'unsubscribe_import:import': '批量导入退订',
    'system_setting:update': '更新发送控制',
    'system_setting:test_provider': 'Provider 配置自检',
    'sms_worker:run_once': '手动执行 Worker',
    'event_source:create': '新建事件来源',
    'event_source:update': '编辑事件来源',
    'event_source:change_status': '变更事件来源状态',
    'event_source:reset_secret': '重置事件来源密钥',
    'data_source:create': '新建数据来源',
    'data_source:update': '编辑数据来源',
    'data_source:copy': '复制数据来源',
    'data_source:change_status': '变更数据来源状态',
    'data_source:test': '调试数据来源',
    'data_source:preview': '预览数据来源',
    'data_source:create_tasks': '数据来源生成任务',
    'sms_task:batch_cancel': '批量取消短信任务',
    'sms_task:batch_retry': '批量重试短信任务',
    'export_task:create': '创建导出任务',
    'export_task:download': '下载导出文件',
    'approval_order:create': '创建审批单',
    'approval_order:approve': '通过审批单',
    'approval_order:reject': '驳回审批单',
    'approval_order:withdraw': '撤回审批单'
  }[combined] || `${resourceLabel(resource)} · ${actionLabel(action)}`;
}
