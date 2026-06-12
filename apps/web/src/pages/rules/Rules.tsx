import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ListChecks, MousePointerClick, Send, Zap } from 'lucide-react';
import { Button, Card, Dropdown, Empty } from 'antd';
import { api } from '../../lib/api';
import { conditionLabel, eventLabels, sceneLabels } from '../../constants/labels';
import type { Rule, SendLog, SmsTask, Template } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC, requireAuth } from '../../lib/auth';

type RuleForm = {
  name: string;
  code?: string;
  eventType: string;
  templateId: string;
  delayValue: number;
  delayUnit: string;
  conditionType: string;
  membershipProductIds: string;
};

const defaultForm: RuleForm = {
  name: '',
  eventType: 'user_register',
  templateId: 'tpl_register',
  delayValue: 24,
  delayUnit: 'hour',
  conditionType: 'not_purchased_membership',
  membershipProductIds: 'vip_monthly,vip_yearly'
};

function toConditionConfig(form: RuleForm) {
  return {
    type: form.conditionType,
    window: { value: Number(form.delayValue) || 0, unit: form.delayUnit },
    membershipProductIds: form.membershipProductIds.split(',').map((item) => item.trim()).filter(Boolean)
  };
}

function rulePayload(form: RuleForm, templates: Template[]) {
  const template = templates.find((item) => item.id === form.templateId);
  return {
    ...form,
    scene: template?.scene || 'register',
    conditionConfig: toConditionConfig(form)
  };
}

type RuleWithMeta = Rule & {
  createdAt?: string;
  updatedAt?: string;
  owner?: string;
  ownerName?: string;
};

const ruleTypeLabels: Record<string, string> = {
  register: '生命周期营销',
  campaign: '活动营销',
  after_sale: '订单营销',
  member: '会员营销'
};

const delayUnitLabels: Record<string, string> = {
  minute: '分钟',
  hour: '小时',
  day: '天'
};

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function formatPercent(value: number | null) {
  return value === null ? '-' : `${value.toFixed(1)}%`;
}

function getTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatDateTime(value?: string) {
  const time = getTime(value);
  if (!time) return '-';
  return new Date(time).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatRelativeTime(time: number) {
  if (!time) return '-';
  const diff = Date.now() - time;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return `${Math.floor(diff / 86_400_000)}天前`;
}

function isSuccessStatus(status: string) {
  return status === 'success';
}

function isFailedStatus(status: string) {
  return ['failed', 'blocked', 'partial_failed'].includes(status);
}

export default function Rules({
  rules,
  templates,
  logs,
  tasks,
  onRefresh,
  setNotice
}: {
  rules: Rule[];
  templates: Template[];
  logs: SendLog[];
  tasks: SmsTask[];
  onRefresh: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const urlParams = new URLSearchParams(window.location.search);
  const targetRuleId = urlParams.get('ruleId') || '';
  const [form, setForm] = useState<RuleForm>(defaultForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [detailRule, setDetailRule] = useState<Rule | null>(null);
  const [deletingRule, setDeletingRule] = useState<Rule | null>(null);
  const [testingRule, setTestingRule] = useState<Rule | null>(null);
  const [testPayload, setTestPayload] = useState('{\n  "phone": "18515385071",\n  "source": "operator-console"\n}');
  const [testResult, setTestResult] = useState<unknown>(null);
  const [filters, setFilters] = useState<QueryFilterValues>({ keyword: '', status: 'all', type: 'all', sort: 'ctr' });
  const handledRuleIdRef = useRef('');
  const keyword = filters.keyword || '';
  const statusFilter = filters.status || 'all';
  const typeFilter = filters.type || 'all';
  const sortKey = filters.sort || 'ctr';

  const eventOptions = Object.entries(eventLabels).map(([value, label]) => ({ value, label }));
  const templateOptions = templates.map((template) => ({ value: template.id, label: template.name }));
  const statusOptions = [
    { value: 'all', label: '全部状态' },
    { value: 'running', label: '运行中' },
    { value: 'paused', label: '暂停' },
    { value: 'error', label: '异常' }
  ];
  const typeOptions = [
    { value: 'all', label: '全部类型' },
    { value: '生命周期营销', label: '生命周期营销' },
    { value: '活动营销', label: '活动营销' },
    { value: '订单营销', label: '订单营销' },
    { value: '会员营销', label: '会员营销' },
    { value: '系统通知', label: '系统通知' }
  ];
  const sortOptions = [
    { value: 'ctr', label: '按 CTR' },
    { value: 'send', label: '按发送量' },
    { value: 'recent', label: '按最近执行' },
    { value: 'created', label: '按创建时间' }
  ];
  const delayUnitOptions = [
    { value: 'minute', label: '分钟' },
    { value: 'hour', label: '小时' },
    { value: 'day', label: '天' }
  ];
  const conditionOptions = [
    { value: 'none', label: '无条件' },
    { value: 'not_purchased_membership', label: '未购买会员' },
    { value: 'expired_after_days', label: '会员过期' },
    { value: 'before_campaign_start', label: '活动开始前' },
    { value: 'after_order_completed', label: '订单完成后' }
  ];

  const ruleRows = useMemo(() => {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrowStart = todayStart + 86_400_000;

    return rules.map((rule) => {
      const metaRule = rule as RuleWithMeta;
      const template = templates.find((item) => item.id === rule.templateId);
      const ruleLogs = logs.filter((log) => log.ruleName === rule.name || log.ruleId === rule.id);
      const ruleTasks = tasks.filter((task) => task.ruleId === rule.id || task.ruleName === rule.name);
      const todayLogs = ruleLogs.filter((log) => {
        const time = getTime(log.createdAt);
        return time >= todayStart && time < tomorrowStart;
      });
      const todayTasks = ruleTasks.filter((task) => {
        const time = getTime(task.createdAt || task.scheduledAt);
        return time >= todayStart && time < tomorrowStart;
      });
      const clicks = ruleLogs.reduce((sum, log) => sum + Number(log.clickCount || 0), 0);
      const todayClicks = todayLogs.reduce((sum, log) => sum + Number(log.clickCount || 0), 0);
      const successCount = ruleLogs.filter((log) => isSuccessStatus(log.status)).length;
      const todayFailedCount = todayLogs.filter((log) => isFailedStatus(log.status)).length + todayTasks.filter((task) => isFailedStatus(task.status)).length;
      const createdAt = [
        metaRule.createdAt,
        ...ruleTasks.map((task) => task.createdAt),
        ...ruleLogs.map((log) => log.createdAt),
        metaRule.updatedAt
      ].filter((value): value is string => Boolean(value) && getTime(value) > 0)
        .sort((first, second) => getTime(first) - getTime(second))[0];
      const recentAt = Math.max(
        0,
        ...ruleLogs.map((log) => getTime(log.createdAt)),
        ...ruleTasks.map((task) => getTime(task.sentAt || task.conditionCheckedAt || task.createdAt || task.scheduledAt)),
        getTime(metaRule.updatedAt),
        getTime(metaRule.createdAt)
      );
      const statusKey = rule.status === 'enabled'
        ? todayFailedCount > 0 ? 'error' : 'running'
        : 'paused';
      const typeLabel = ruleTypeLabels[rule.scene] || '系统通知';
      const flowSteps = [
        eventLabels[rule.eventType] || rule.eventType,
        `等待${rule.delayValue}${delayUnitLabels[rule.delayUnit] || rule.delayUnit}`,
        template ? `发送${template.name}` : '发送短信',
        '短链点击',
        '转化'
      ];

      return {
        rule,
        template,
        typeLabel,
        statusKey,
        statusLabel: statusKey === 'running' ? '运行中' : statusKey === 'error' ? '异常' : '暂停',
        owner: metaRule.ownerName || metaRule.owner || '增长运营',
        todayTrigger: todayTasks.length || todayLogs.length,
        todaySend: todayLogs.length,
        clicks,
        todayClicks,
        ctrValue: ruleLogs.length ? clicks / ruleLogs.length * 100 : 0,
        todayCtrValue: todayLogs.length ? todayClicks / todayLogs.length * 100 : null,
        successRateValue: ruleLogs.length ? successCount / ruleLogs.length * 100 : null,
        recentAt,
        recentLabel: formatRelativeTime(recentAt),
        createdAt,
        createdLabel: formatDateTime(createdAt),
        flowSteps
      };
    });
  }, [logs, rules, tasks, templates]);

  const filteredRuleRows = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return ruleRows
      .filter((row) => {
        const keywordMatched = !normalizedKeyword || [
          row.rule.name,
          row.rule.code,
          row.typeLabel,
          row.template?.name
        ].some((value) => String(value || '').toLowerCase().includes(normalizedKeyword));
        const statusMatched = statusFilter === 'all' || row.statusKey === statusFilter;
        const typeMatched = typeFilter === 'all' || row.typeLabel === typeFilter;
        return keywordMatched && statusMatched && typeMatched;
      })
      .sort((first, second) => {
        if (sortKey === 'send') return second.todaySend - first.todaySend;
        if (sortKey === 'recent') return second.recentAt - first.recentAt;
        if (sortKey === 'created') return getTime(second.createdAt) - getTime(first.createdAt);
        return second.ctrValue - first.ctrValue || second.todaySend - first.todaySend;
      });
  }, [keyword, ruleRows, sortKey, statusFilter, typeFilter]);

  const rankingRows = useMemo(
    () => [...ruleRows].sort((first, second) => second.ctrValue - first.ctrValue || second.todaySend - first.todaySend).slice(0, 5),
    [ruleRows]
  );

  const dashboardMetrics = useMemo(() => {
    const todayTrigger = ruleRows.reduce((sum, row) => sum + row.todayTrigger, 0);
    const todaySend = ruleRows.reduce((sum, row) => sum + row.todaySend, 0);
    const todayClicks = ruleRows.reduce((sum, row) => sum + row.todayClicks, 0);
    return {
      totalRules: rules.length,
      runningRules: ruleRows.filter((row) => row.statusKey === 'running').length,
      todayTrigger,
      todaySend,
      averageCtr: todaySend ? todayClicks / todaySend * 100 : 0,
      errorRules: ruleRows.filter((row) => row.statusKey === 'error').length
    };
  }, [ruleRows, rules.length]);

  useEffect(() => {
    if (!targetRuleId || handledRuleIdRef.current === targetRuleId) return;
    const target = rules.find((rule) => rule.id === targetRuleId || rule.code === targetRuleId);
    if (target) {
      handledRuleIdRef.current = targetRuleId;
      setDetailRule(target);
    }
  }, [targetRuleId, rules, detailRule]);

  function openEdit(rule: Rule) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      code: rule.code,
      eventType: rule.eventType,
      templateId: rule.templateId,
      delayValue: rule.delayValue,
      delayUnit: rule.delayUnit,
      conditionType: rule.conditionType,
      membershipProductIds: rule.conditionConfig?.membershipProductIds?.join(',') || ''
    });
  }

  async function toggle(rule: Rule) {
    if (rule.status !== 'enabled') {
      const template = templates.find((item) => item.id === rule.templateId);
      await api('/api/approvals', {
        method: 'POST',
        body: JSON.stringify({
          title: `启用规则审批：${rule.name}`,
          resource: 'sms_rule',
          resourceId: rule.id,
          action: 'enable',
          comment: '启用自动触达规则前提交审批。',
          payload: {
            scenario: '规则启用',
            reason: '启用规则后会自动匹配业务事件并创建发送任务。',
            riskLevel: 'high',
            before: { status: rule.status },
            after: { status: 'enabled' },
            impact: {
              title: rule.name,
              description: `${eventLabels[rule.eventType] || rule.eventType} · ${template?.name || '未配置模板'} · 延迟 ${rule.delayValue}${rule.delayUnit}`
            },
            execute: { type: 'update_rule_status', ruleId: rule.id, status: 'enabled' }
          }
        })
      });
      setNotice(`${rule.name} 已提交启用审批，通过后自动启用`);
      return;
    }
    await api(`/api/rules/${rule.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: 'disabled' })
    });
    setNotice(`${rule.name} 已停用`);
    await onRefresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/rules', {
      method: 'POST',
      body: JSON.stringify(rulePayload(form, templates))
    });
    setNotice(`${form.name} 已创建`);
    setForm({ ...defaultForm, templateId: templates[0]?.id || defaultForm.templateId });
    setModalOpen(false);
    await onRefresh();
  }

  async function update(event: React.FormEvent) {
    event.preventDefault();
    if (!editingRule) return;
    await api(`/api/rules/${editingRule.id}/update`, {
      method: 'POST',
      body: JSON.stringify(rulePayload(form, templates))
    });
    setNotice(`${form.name} 已更新`);
    setEditingRule(null);
    await onRefresh();
  }

  async function copy(rule: Rule) {
    await api(`/api/rules/${rule.id}/copy`, { method: 'POST' });
    setNotice(`${rule.name} 已复制为停用副本`);
    await onRefresh();
  }

  async function removeRule() {
    if (!deletingRule) return;
    await api(`/api/rules/${deletingRule.id}/delete`, { method: 'POST' });
    setNotice(`${deletingRule.name} 已删除`);
    setDeletingRule(null);
    await onRefresh();
  }

  async function runTest(event: React.FormEvent) {
    event.preventDefault();
    if (!testingRule) return;
    const payload = JSON.parse(testPayload || '{}');
    const result = await api(`/api/rules/${testingRule.id}/test`, {
      method: 'POST',
      body: JSON.stringify({
        eventType: testingRule.eventType,
        phone: payload.phone,
        userId: payload.userId || 'test-user',
        payload
      })
    });
    setTestResult(result);
  }

  function ruleMenuItems(rule: Rule) {
    return [
      requireAuth('touch:rule:edit') ? { key: 'edit', label: '编辑规则' } : null,
      requireAuth('touch:rule:test') ? { key: 'test', label: '测试规则' } : null,
      requireAuth('touch:rule:copy') ? { key: 'copy', label: '复制规则' } : null,
      requireAuth(`touch:rule:${rule.status === 'enabled' ? 'disable' : 'enable'}`)
        ? { key: 'toggle', label: rule.status === 'enabled' ? '停用规则' : '启用规则' }
        : null,
      requireAuth('touch:rule:delete') ? { key: 'delete', label: '删除规则', danger: true } : null
    ].filter((item): item is { key: string; label: string; danger?: boolean } => Boolean(item));
  }

  function handleRuleMenuClick(action: string, rule: Rule) {
    if (action === 'edit') openEdit(rule);
    if (action === 'test') {
      setTestingRule(rule);
      setTestResult(null);
    }
    if (action === 'copy') copy(rule);
    if (action === 'toggle') toggle(rule);
    if (action === 'delete') setDeletingRule(rule);
  }

  const deletingRuleTasks = deletingRule ? tasks.filter((task) => task.ruleId === deletingRule.id || task.ruleName === deletingRule.name) : [];
  const deletingRuleLogs = deletingRule ? logs.filter((log) => log.ruleName === deletingRule.name || log.ruleId === deletingRule.id) : [];
  const deletingRuleInUse = deletingRuleTasks.length > 0 || deletingRuleLogs.length > 0;
  const deletingRuleCanDelete = Boolean(deletingRule && (!deletingRuleInUse || deletingRule.status === 'disabled'));

  function renderRuleForm(onSubmit: (event: React.FormEvent) => Promise<void>, submitText: string) {
    return (
      <form className="formPanel" onSubmit={onSubmit}>
        <label>规则名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        {form.code !== undefined && <label>规则编码<input value={form.code || ''} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>}
        <label>触发事件
          <SelectField value={form.eventType} options={eventOptions} onChange={(eventType) => setForm({ ...form, eventType })} />
        </label>
        <label>短信模板
          <SelectField value={form.templateId} options={templateOptions} onChange={(templateId) => setForm({ ...form, templateId })} />
        </label>
        <div className="formGrid two">
          <label>延迟数值<input type="number" value={form.delayValue} onChange={(event) => setForm({ ...form, delayValue: Number(event.target.value) })} /></label>
          <label>延迟单位
            <SelectField value={form.delayUnit} options={delayUnitOptions} onChange={(delayUnit) => setForm({ ...form, delayUnit })} />
          </label>
        </div>
        <label>条件类型
          <SelectField value={form.conditionType} options={conditionOptions} onChange={(conditionType) => setForm({ ...form, conditionType })} />
        </label>
        {form.conditionType === 'not_purchased_membership' && (
          <label>会员商品范围<input value={form.membershipProductIds} onChange={(event) => setForm({ ...form, membershipProductIds: event.target.value })} /></label>
        )}
        <div className="templateModalPreview">
          <span>自然语言预览</span>
          <strong>{eventLabels[form.eventType]} 后延迟 {form.delayValue}{form.delayUnit}，当 {conditionLabel(form.conditionType)} 时发送 {templates.find((item) => item.id === form.templateId)?.name || '所选模板'}</strong>
        </div>
        <div className="modalActions">
          <button className="secondaryButton compact" type="button" onClick={() => { setModalOpen(false); setEditingRule(null); }}>取消</button>
          <button className="primaryButton compact" type="submit">{submitText}</button>
        </div>
      </form>
    );
  }

  return (
    <section className="stack rulesOpsPage">
      <section className="rulesOpsSummaryPanel">
        <div className="rulesOpsHeader">
          <div>
            <h1>规则中心</h1>
            <p>管理自动化触达规则，关注运行状态、发送表现和转化效率。</p>
          </div>
          <AuthC authKey="touch:rule:add">
            <Button
              type="primary"
              onClick={() => {
                setForm({ ...defaultForm, templateId: templates[0]?.id || defaultForm.templateId });
                setModalOpen(true);
              }}
            >
              新建规则
            </Button>
          </AuthC>
        </div>

        <section className="rulesOpsMetrics">
          <Card className="rulesOpsMetricCard blue">
            <div className="rulesOpsMetricHead"><span>规则总数</span><div><ListChecks size={18} /></div></div>
            <strong>{formatNumber(dashboardMetrics.totalRules)}</strong>
            <small>{formatNumber(dashboardMetrics.runningRules)} 条运行中</small>
          </Card>
          <Card className="rulesOpsMetricCard violet">
            <div className="rulesOpsMetricHead"><span>今日触发次数</span><div><Zap size={18} /></div></div>
            <strong>{formatNumber(dashboardMetrics.todayTrigger)}</strong>
            <small>来自业务事件和定时任务</small>
          </Card>
          <Card className="rulesOpsMetricCard green">
            <div className="rulesOpsMetricHead"><span>今日发送短信</span><div><Send size={18} /></div></div>
            <strong>{formatNumber(dashboardMetrics.todaySend)}</strong>
            <small>规则自动生成的发送记录</small>
          </Card>
          <Card className="rulesOpsMetricCard amber">
            <div className="rulesOpsMetricHead"><span>平均 CTR</span><div><MousePointerClick size={18} /></div></div>
            <strong>{formatPercent(dashboardMetrics.averageCtr)}</strong>
            <small>按今日点击 / 今日发送计算</small>
          </Card>
          <Card className="rulesOpsMetricCard red">
            <div className="rulesOpsMetricHead"><span>异常规则</span><div><AlertTriangle size={18} /></div></div>
            <strong>{formatNumber(dashboardMetrics.errorRules)}</strong>
            <small>今日有失败或拦截的运行规则</small>
          </Card>
        </section>
      </section>

      <section className="rulesOpsWorkbench">
        <Card
          className="rulesOpsPanel rulesOpsListPanel"
          title={<div><strong>规则运营列表</strong><span>按触发、发送、点击和最近执行表现管理规则</span></div>}
        >
          <QueryFilterBar
            fields={[
              { name: 'keyword', label: '关键词', placeholder: '搜索规则名称 / 编码 / 模板', span: 8 },
              { name: 'status', label: '状态', type: 'select', placeholder: '全部状态', options: statusOptions, span: 4 },
              { name: 'type', label: '类型', type: 'select', placeholder: '全部类型', options: typeOptions, span: 4 },
              { name: 'sort', label: '排序', type: 'select', placeholder: '按 CTR', options: sortOptions, span: 4 }
            ]}
            values={filters}
            onChange={(nextFilters) => setFilters({ keyword: '', status: 'all', type: 'all', sort: 'ctr', ...nextFilters })}
            onSearch={(nextFilters) => setFilters({ keyword: '', status: 'all', type: 'all', sort: 'ctr', ...nextFilters })}
          />

          {!filteredRuleRows.length ? (
            <div className="rulesOpsEmpty">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rules.length ? '没有匹配的规则' : '暂无自动化规则'}>
                {!rules.length && (
                  <AuthC authKey="touch:rule:add">
                    <Button
                      type="primary"
                      onClick={() => {
                        setForm({ ...defaultForm, templateId: templates[0]?.id || defaultForm.templateId });
                        setModalOpen(true);
                      }}
                    >
                      创建第一条规则
                    </Button>
                  </AuthC>
                )}
              </Empty>
            </div>
          ) : (
            <div className="rulesOpsTableWrap">
              <div className="rulesOpsTableHeader">
                <div className="rulesOpsScrollCols">
                  <span>规则</span>
                  <span>状态</span>
                  <span>今日表现</span>
                  <span>最近执行</span>
                </div>
                <span className="rulesOpsFixedHead">操作</span>
              </div>
              <div className="rulesOpsRows">
                {filteredRuleRows.map((row) => {
                  const menuItems = ruleMenuItems(row.rule);
                  return (
                    <article className="rulesOpsRow" key={row.rule.id}>
                      <div className="rulesOpsScrollCols">
                        <div className="ruleOpsNameCell">
                          <strong>{row.rule.name}</strong>
                          <span>{row.rule.code} · {row.typeLabel} · {sceneLabels[row.rule.scene] || row.rule.scene}</span>
                          <div className="ruleFlowPreview">
                            {row.flowSteps.map((step) => <b key={`${row.rule.id}-${step}`}>{step}</b>)}
                          </div>
                        </div>
                        <div className="ruleOpsStatusCell">
                          <span className={`ruleRunBadge ${row.statusKey}`}><i />{row.statusLabel}</span>
                          <small>{row.recentLabel} · 成功率 {formatPercent(row.successRateValue)}</small>
                        </div>
                        <div className="ruleOpsPerformanceCell">
                          <div><span>触发</span><strong>{formatNumber(row.todayTrigger)}</strong></div>
                          <div><span>发送</span><strong>{formatNumber(row.todaySend)}</strong></div>
                          <div><span>点击</span><strong>{formatNumber(row.todayClicks)}</strong></div>
                          <div className="accent"><span>CTR</span><strong>{formatPercent(row.todayCtrValue)}</strong></div>
                        </div>
                        <div className="ruleOpsDateCell">
                          <strong>{row.recentLabel}</strong>
                          <span>{row.owner} · 创建 {row.createdLabel}</span>
                        </div>
                      </div>
                      <div className="ruleOpsActions">
                        <Button type="primary" size="small" onClick={() => setDetailRule(row.rule)}>查看详情</Button>
                        <Dropdown
                          disabled={!menuItems.length}
                          menu={{
                            items: menuItems,
                            onClick: ({ key }) => handleRuleMenuClick(String(key), row.rule)
                          }}
                          trigger={['click']}
                        >
                          <Button size="small">更多</Button>
                        </Dropdown>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        <Card
          className="rulesOpsPanel rulesRankingPanel"
          title={<div><strong>规则排行榜</strong><span>按 CTR 和发送量排序</span></div>}
        >
          {!rankingRows.length ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无规则数据" />
          ) : (
            <div className="rulesRankingList">
              {rankingRows.map((row, index) => (
                <button className="rulesRankingItem" type="button" key={row.rule.id} onClick={() => setDetailRule(row.rule)}>
                  <span className={`rulesRankNumber rank${index + 1}`}>{index + 1}</span>
                  <div>
                    <strong>{row.rule.name}</strong>
                    <small>{row.typeLabel} · 今日发送 {formatNumber(row.todaySend)}</small>
                  </div>
                  <b>{formatPercent(row.ctrValue)}</b>
                </button>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Modal open={modalOpen} title="新建规则" subtitle="单事件单动作" onClose={() => setModalOpen(false)} showClose={false} size="wide">
        {renderRuleForm(create, '创建')}
      </Modal>

      <Modal open={Boolean(editingRule)} title="编辑规则" subtitle="调整触发事件、条件、模板和延迟配置" onClose={() => setEditingRule(null)} showClose={false} size="wide">
        {renderRuleForm(update, '保存修改')}
      </Modal>

      <Modal open={Boolean(testingRule)} title={testingRule ? `规则测试：${testingRule.name}` : '规则测试'} subtitle="输入模拟事件 payload，预览是否匹配并生成任务" onClose={() => setTestingRule(null)} size="wide">
        {testingRule && (
          <form className="formPanel" onSubmit={runTest}>
            <label>模拟事件 Payload<textarea value={testPayload} onChange={(event) => setTestPayload(event.target.value)} /></label>
            {Boolean(testResult) && <pre className="jsonPreview">{JSON.stringify(testResult, null, 2)}</pre>}
            <div className="modalActions"><button className="secondaryButton compact" type="button" onClick={() => setTestingRule(null)}>关闭</button><button className="primaryButton compact" type="submit">运行测试</button></div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(deletingRule)} title="删除规则" subtitle={deletingRule?.name} onClose={() => setDeletingRule(null)} showClose={false}>
        {deletingRule && (
          <div className="stack">
            <div className={deletingRuleCanDelete ? 'taskActionState confirm' : 'taskActionState error'}>
              <div>
                <strong>{deletingRuleCanDelete ? `确认删除 ${deletingRule.name}？` : '该规则正在启用，不能删除'}</strong>
                <span>
                  {!deletingRuleCanDelete
                    ? `当前规则已生成 ${deletingRuleTasks.length} 条任务、${deletingRuleLogs.length} 条发送记录。请先停用规则，再执行删除。`
                    : deletingRuleInUse
                      ? `当前规则已停用，删除后规则中心不再展示；历史任务 ${deletingRuleTasks.length} 条、发送记录 ${deletingRuleLogs.length} 条仍会保留。`
                      : '删除后规则中心将不再展示该规则，后续业务事件也不会再匹配它。'}
                </span>
              </div>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setDeletingRule(null)}>{deletingRuleCanDelete ? '取消' : '关闭'}</button>
              {deletingRuleCanDelete && <button className="primaryButton compact dangerButton" type="button" onClick={removeRule}>删除</button>}
              {!deletingRuleCanDelete && deletingRule.status === 'enabled' && (
                <button className="primaryButton compact" type="button" onClick={() => { setDeletingRule(null); toggle(deletingRule); }}>停用规则</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(detailRule)} title={detailRule?.name || '规则详情'} subtitle="基础信息、发送表现、关联任务和最近触发" onClose={() => setDetailRule(null)} size="wide">
        {detailRule && (
          <div className="templateDetail">
            <div className="templateDetailHeader">
              <div><span>{sceneLabels[detailRule.scene] || detailRule.scene}</span><strong>{detailRule.name}</strong><p>{detailRule.code}</p></div>
              <StatusBadge status={detailRule.status} />
            </div>
            <div className="ruleMetaGrid">
              <div><span>触发事件</span><strong>{eventLabels[detailRule.eventType] || detailRule.eventType}</strong></div>
              <div><span>条件配置</span><strong>{conditionLabel(detailRule.conditionType)}</strong></div>
              <div><span>短信模板</span><strong>{templates.find((item) => item.id === detailRule.templateId)?.name || '-'}</strong></div>
              <div><span>延迟</span><strong>{detailRule.delayValue}{detailRule.delayUnit}</strong></div>
            </div>
            <pre className="jsonPreview">{JSON.stringify(detailRule.conditionConfig || {}, null, 2)}</pre>
          </div>
        )}
      </Modal>
    </section>
  );
}
