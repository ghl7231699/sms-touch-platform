import React, { useState } from 'react';
import { ListChecks, MousePointerClick, Send, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { conditionLabel, eventLabels, sceneLabels } from '../../constants/labels';
import type { Rule, SendLog, Template } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';

export default function Rules({ rules, templates, logs, onRefresh, setNotice }: { rules: Rule[]; templates: Template[]; logs: SendLog[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    eventType: 'user_register',
    templateId: 'tpl_register',
    delayValue: 24,
    delayUnit: 'hour',
    conditionType: 'not_purchased_membership',
    membershipProductIds: 'vip_monthly,vip_yearly'
  });
  const [modalOpen, setModalOpen] = useState(false);
  const eventOptions = Object.entries(eventLabels).map(([value, label]) => ({ value, label }));
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

  async function toggle(rule: Rule) {
    await api(`/api/rules/${rule.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: rule.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${rule.name} 已${rule.status === 'enabled' ? '停用' : '启用'}`);
    await onRefresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const template = templates.find((item) => item.id === form.templateId);
    const conditionConfig = {
      type: form.conditionType,
      window: { value: Number(form.delayValue) || 0, unit: form.delayUnit },
      membershipProductIds: form.membershipProductIds
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    };
    await api('/api/rules', {
      method: 'POST',
      body: JSON.stringify({ ...form, scene: template?.scene || 'register', conditionConfig })
    });
    setNotice(`${form.name} 已创建`);
    setForm({ ...form, name: '' });
    setModalOpen(false);
    await onRefresh();
  }

  return (
    <section className="stack">
      <section className="ruleHero">
        <article className="secondaryMetric blue">
          <div><Zap size={18} /></div>
          <span>启用规则</span>
          <strong>{rules.filter((rule) => rule.status === 'enabled').length}</strong>
        </article>
        <article className="secondaryMetric green">
          <div><Send size={18} /></div>
          <span>规则发送</span>
          <strong>{logs.filter((log) => log.ruleName).length}</strong>
        </article>
        <article className="secondaryMetric amber">
          <div><MousePointerClick size={18} /></div>
          <span>规则点击</span>
          <strong>{logs.filter((log) => log.ruleName).reduce((sum, log) => sum + Number(log.clickCount || 0), 0)}</strong>
        </article>
        <article className="secondaryMetric red">
          <div><ListChecks size={18} /></div>
          <span>异常规则</span>
          <strong>{rules.filter((rule) => rule.status === 'disabled').length}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>自动化规则</h2>
            <span>每条规则都是一个独立触达单元</span>
          </div>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><ListChecks size={16} />新建规则</button>
        </div>
        <div className="automationRuleGrid">
          {rules.map((rule) => {
            const template = templates.find((item) => item.id === rule.templateId);
            const ruleLogs = logs.filter((log) => log.ruleName === rule.name || log.ruleId === rule.id);
            const clicks = ruleLogs.reduce((sum, log) => sum + Number(log.clickCount || 0), 0);
            const ctr = ruleLogs.length ? `${((clicks / ruleLogs.length) * 100).toFixed(1)}%` : '0.0%';
            return (
              <article className="automationRuleCard" key={rule.id}>
                <div className="automationRuleTop">
                  <div>
                    <strong>{rule.name}</strong>
                    <span>{rule.code}</span>
                  </div>
                  <StatusBadge status={rule.status} />
                </div>
                <div className="automationFlow">
                  <span>{eventLabels[rule.eventType] || rule.eventType}</span>
                  <b />
                  <span>{conditionLabel(rule.conditionType)}</span>
                  <b />
                  <span>{template?.name || '未配置模板'}</span>
                </div>
                <div className="ruleMetaGrid">
                  <div><span>场景</span><strong>{sceneLabels[rule.scene] || rule.scene}</strong></div>
                  <div><span>延迟</span><strong>{rule.delayValue}{rule.delayUnit}</strong></div>
                  <div><span>发送</span><strong>{ruleLogs.length}</strong></div>
                  <div><span>CTR</span><strong>{ctr}</strong></div>
                </div>
                <button className="tableButton ruleActionButton" type="button" onClick={() => toggle(rule)}>
                  {rule.status === 'enabled' ? '停用规则' : '启用规则'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <Modal open={modalOpen} title="新建规则" subtitle="单事件单动作" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={create}>
          <label>规则名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>触发事件
            <SelectField value={form.eventType} options={eventOptions} onChange={(eventType) => setForm({ ...form, eventType })} />
          </label>
          <label>短信模板
            <SelectField value={form.templateId} options={templateOptions} onChange={(templateId) => setForm({ ...form, templateId })} />
          </label>
          <label>延迟数值<input type="number" value={form.delayValue} onChange={(event) => setForm({ ...form, delayValue: Number(event.target.value) })} /></label>
          <label>延迟单位
            <SelectField value={form.delayUnit} options={delayUnitOptions} onChange={(delayUnit) => setForm({ ...form, delayUnit })} />
          </label>
          <label>条件类型
            <SelectField value={form.conditionType} options={conditionOptions} onChange={(conditionType) => setForm({ ...form, conditionType })} />
          </label>
          {form.conditionType === 'not_purchased_membership' && (
            <label>会员商品范围<input value={form.membershipProductIds} onChange={(event) => setForm({ ...form, membershipProductIds: event.target.value })} /></label>
          )}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit"><ListChecks size={16} />创建规则</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
