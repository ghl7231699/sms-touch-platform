import React, { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { api } from '../../lib/api';
import { conditionLabel, eventLabels } from '../../constants/labels';
import type { Rule, Template } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

export default function Rules({ rules, templates, onRefresh, setNotice }: { rules: Rule[]; templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
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
      <section className="panel">
        <div className="panelTitle">
          <h2>自动触达规则</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><ListChecks size={16} />新建规则</button>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>规则</th>
                <th>事件</th>
                <th>条件</th>
                <th>模板</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.name}</strong><span>{rule.code}</span></td>
                  <td>{eventLabels[rule.eventType] || rule.eventType}</td>
                  <td>{rule.delayValue}{rule.delayUnit} · {conditionLabel(rule.conditionType)}</td>
                  <td>{templates.find((item) => item.id === rule.templateId)?.name || '-'}</td>
                  <td><StatusBadge status={rule.status} /></td>
                  <td><button className="tableButton" onClick={() => toggle(rule)}>{rule.status === 'enabled' ? '停用' : '启用'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modalOpen} title="新建规则" subtitle="单事件单动作" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={create}>
          <label>规则名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>触发事件
            <select value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })}>
              {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>短信模板
            <select value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })}>
              {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
            </select>
          </label>
          <label>延迟数值<input type="number" value={form.delayValue} onChange={(event) => setForm({ ...form, delayValue: Number(event.target.value) })} /></label>
          <label>延迟单位
            <select value={form.delayUnit} onChange={(event) => setForm({ ...form, delayUnit: event.target.value })}>
              <option value="minute">分钟</option>
              <option value="hour">小时</option>
              <option value="day">天</option>
            </select>
          </label>
          <label>条件类型
            <select value={form.conditionType} onChange={(event) => setForm({ ...form, conditionType: event.target.value })}>
              <option value="none">无条件</option>
              <option value="not_purchased_membership">未购买会员</option>
              <option value="expired_after_days">会员过期</option>
              <option value="before_campaign_start">活动开始前</option>
              <option value="after_order_completed">订单完成后</option>
            </select>
          </label>
          {form.conditionType === 'not_purchased_membership' && (
            <label>会员商品范围<input value={form.membershipProductIds} onChange={(event) => setForm({ ...form, membershipProductIds: event.target.value })} /></label>
          )}
          <button className="primaryButton" type="submit"><ListChecks size={16} />创建规则</button>
        </form>
      </Modal>
    </section>
  );
}

