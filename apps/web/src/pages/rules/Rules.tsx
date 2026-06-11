import React, { useState } from 'react';
import { Copy, Eye, FileSearch, FlaskConical, ListChecks, MousePointerClick, Pencil, Send, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { conditionLabel, eventLabels, sceneLabels } from '../../constants/labels';
import type { Rule, SendLog, SmsTask, Template } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { EmptyState } from '../../components/EmptyState';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';

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

function jumpTo(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  window.history.pushState(null, '', `${path}${query.toString() ? `?${query}` : ''}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
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
  const [form, setForm] = useState<RuleForm>(defaultForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [detailRule, setDetailRule] = useState<Rule | null>(null);
  const [testingRule, setTestingRule] = useState<Rule | null>(null);
  const [testPayload, setTestPayload] = useState('{\n  "phone": "18515385071",\n  "source": "operator-console"\n}');
  const [testResult, setTestResult] = useState<unknown>(null);
  const [estimateResult, setEstimateResult] = useState<unknown>(null);
  const [filters, setFilters] = useState<QueryFilterValues>({ keyword: '', scene: '', eventType: '', status: '' });

  const eventOptions = Object.entries(eventLabels).map(([value, label]) => ({ value, label }));
  const eventFilterOptions = eventOptions;
  const sceneFilterOptions = Object.entries(sceneLabels).map(([value, label]) => ({ value, label }));
  const statusFilterOptions = [
    { value: 'enabled', label: '启用' },
    { value: 'disabled', label: '停用' }
  ];
  const templateOptions = templates.map((template) => ({ value: template.id, label: template.name }));
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

  const normalizedKeyword = filters.keyword.trim().toLowerCase();
  const filteredRules = rules.filter((rule) => {
    const template = templates.find((item) => item.id === rule.templateId);
    const keywordMatched = !normalizedKeyword || [
      rule.name,
      rule.code,
      rule.scene,
      sceneLabels[rule.scene],
      eventLabels[rule.eventType],
      conditionLabel(rule.conditionType),
      template?.name
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedKeyword));
    return keywordMatched &&
      (!filters.scene || rule.scene === filters.scene) &&
      (!filters.eventType || rule.eventType === filters.eventType) &&
      (!filters.status || rule.status === filters.status);
  });

  function search(nextFilters: QueryFilterValues) {
    setFilters({ keyword: '', scene: '', eventType: '', status: '', ...nextFilters });
  }

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

  async function estimate(rule: Rule) {
    const result = await api(`/api/rules/${rule.id}/estimate`);
    setEstimateResult(result);
    setDetailRule(rule);
  }

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
    <section className="stack">
      <section className="ruleHero">
        <article className="secondaryMetric blue"><div><Zap size={18} /></div><span>启用规则</span><strong>{rules.filter((rule) => rule.status === 'enabled').length}</strong></article>
        <article className="secondaryMetric green"><div><Send size={18} /></div><span>规则发送</span><strong>{logs.filter((log) => log.ruleName).length}</strong></article>
        <article className="secondaryMetric amber"><div><MousePointerClick size={18} /></div><span>规则点击</span><strong>{logs.filter((log) => log.ruleName).reduce((sum, log) => sum + Number(log.clickCount || 0), 0)}</strong></article>
        <article className="secondaryMetric red"><div><ListChecks size={18} /></div><span>异常规则</span><strong>{rules.filter((rule) => rule.status === 'disabled').length}</strong></article>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div><h2>自动化规则</h2><span>当前 {filteredRules.length}/{rules.length} 条，每条规则都是一个独立触达单元</span></div>
          <AuthC authKey="touch:rule:add"><button className="secondaryButton compact" type="button" onClick={() => { setForm({ ...defaultForm, templateId: templates[0]?.id || defaultForm.templateId }); setModalOpen(true); }}><ListChecks size={16} />新建规则</button></AuthC>
        </div>

        <QueryFilterBar
          fields={[
            { name: 'keyword', label: '搜索规则', placeholder: '名称、编码、模板或条件', span: 8 },
            { name: 'scene', label: '场景', type: 'select', placeholder: '全部场景', options: sceneFilterOptions },
            { name: 'eventType', label: '事件', type: 'select', placeholder: '全部事件', options: eventFilterOptions },
            { name: 'status', label: '状态', type: 'select', placeholder: '全部状态', options: statusFilterOptions }
          ]}
          values={filters}
          onChange={(value) => setFilters({ keyword: '', scene: '', eventType: '', status: '', ...value })}
          onSearch={search}
        />

        <div className="automationRuleGrid">
          {!rules.length && <EmptyState title="暂无自动化规则" description="新建规则后，业务事件才能自动生成短信触达任务。" />}
          {rules.length > 0 && !filteredRules.length && <EmptyState title="没有匹配的规则" description="试试调整搜索、场景、事件或状态筛选。" />}
          {filteredRules.map((rule) => {
            const template = templates.find((item) => item.id === rule.templateId);
            const ruleLogs = logs.filter((log) => log.ruleName === rule.name || log.ruleId === rule.id);
            const ruleTasks = tasks.filter((task) => task.ruleId === rule.id || task.ruleName === rule.name);
            const clicks = ruleLogs.reduce((sum, log) => sum + Number(log.clickCount || 0), 0);
            const ctr = ruleLogs.length ? `${((clicks / ruleLogs.length) * 100).toFixed(1)}%` : '0.0%';
            return (
              <article className="automationRuleCard" key={rule.id}>
                <div className="automationRuleTop">
                  <div className="ruleTitleBlock">
                    <strong>{rule.name}</strong>
                    <span>{rule.code}</span>
                  </div>
                  <StatusBadge status={rule.status} />
                </div>
                <div className="ruleSummary">
                  <span>{sceneLabels[rule.scene] || rule.scene}</span>
                  <strong>{eventLabels[rule.eventType] || rule.eventType} 后延迟 {rule.delayValue}{rule.delayUnit}，当“{conditionLabel(rule.conditionType)}”时发送“{template?.name || '未配置模板'}”。</strong>
                </div>
                <div className="ruleMetricStrip">
                  <div><span>生成任务</span><strong>{ruleTasks.length}</strong></div>
                  <div><span>发送记录</span><strong>{ruleLogs.length}</strong></div>
                  <div><span>短链点击</span><strong>{clicks}</strong></div>
                  <div><span>CTR</span><strong>{ctr}</strong></div>
                </div>
                <div className="ruleCardActions">
                  <div className="rulePrimaryActions">
                    <button className="primaryButton compact ruleDetailButton" type="button" onClick={() => setDetailRule(rule)}><Eye size={15} />查看规则详情</button>
                    <AuthC authKey="touch:rule:edit"><button className="secondaryButton compact" type="button" onClick={() => openEdit(rule)}><Pencil size={15} />编辑配置</button></AuthC>
                    <AuthC authKey="touch:rule:test"><button className="secondaryButton compact" type="button" onClick={() => { setTestingRule(rule); setTestResult(null); }}><FlaskConical size={15} />模拟测试</button></AuthC>
                    <AuthC authKey={`touch:rule:${rule.status === 'enabled' ? 'disable' : 'enable'}`}><button className={rule.status === 'enabled' ? 'secondaryButton compact dangerSoft' : 'primaryButton compact'} type="button" onClick={() => toggle(rule)}>{rule.status === 'enabled' ? '停用规则' : '启用规则'}</button></AuthC>
                  </div>
                  <div className="ruleSecondaryActions">
                    <button className="ruleUtilityButton" type="button" onClick={() => jumpTo('/touch/tasks', { ruleId: rule.id })}><span>查看生成任务</span><small>{ruleTasks.length} 条任务</small></button>
                    <button className="ruleUtilityButton" type="button" onClick={() => jumpTo('/data/send-logs', { ruleId: rule.id })}><span>查看发送记录</span><small>{ruleLogs.length} 条记录</small></button>
                    <AuthC authKey="touch:rule:copy"><button className="ruleUtilityButton" type="button" onClick={() => copy(rule)}><span><Copy size={14} />复制规则</span><small>创建停用副本</small></button></AuthC>
                    <button className="ruleUtilityButton" type="button" onClick={() => estimate(rule)}><span><FileSearch size={14} />影响范围预估</span><small>预估命中和发送影响</small></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
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

      <Modal open={Boolean(detailRule)} title={detailRule?.name || '规则详情'} subtitle="基础信息、发送表现、关联任务和最近触发" onClose={() => { setDetailRule(null); setEstimateResult(null); }} size="wide">
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
            {Boolean(estimateResult) && <pre className="jsonPreview">{JSON.stringify(estimateResult, null, 2)}</pre>}
            <div className="modalActions"><button className="secondaryButton compact" type="button" onClick={() => jumpTo('/touch/tasks', { ruleId: detailRule.id })}>查看生成任务</button><button className="secondaryButton compact" type="button" onClick={() => jumpTo('/data/send-logs', { ruleId: detailRule.id })}>查看发送记录</button></div>
          </div>
        )}
      </Modal>
    </section>
  );
}
