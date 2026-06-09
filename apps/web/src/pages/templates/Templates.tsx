import React, { useState } from 'react';
import { FileText, PauseCircle, PlayCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { sceneLabels } from '../../constants/labels';
import type { Template } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

export default function Templates({ templates, onRefresh, setNotice }: { templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    scene: 'register',
    providerTemplateId: '100001',
    content: '您的测试验证码为${code}，${min}分钟内有效。'
  });
  const [modalOpen, setModalOpen] = useState(false);

  async function toggle(template: Template) {
    await api(`/api/templates/${template.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: template.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${template.name} 已${template.status === 'enabled' ? '停用' : '启用'}`);
    await onRefresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ ...form, variables: ['code', 'min'] })
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
          <h2>模板库</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><FileText size={16} />新建模板</button>
        </div>
        <div className="templateGrid">
          {templates.map((template) => (
            <article className="templateCard" key={template.id}>
              <div className="templateTop">
                <div>
                  <strong>{template.name}</strong>
                  <span>{sceneLabels[template.scene] || template.scene} · {template.providerTemplateId}</span>
                </div>
                <StatusBadge status={template.status} />
              </div>
              <p>{template.content}</p>
              <div className="chips">
                {template.variables.map((item) => <span key={item}>{item}</span>)}
              </div>
              <button className="secondaryButton" onClick={() => toggle(template)}>
                {template.status === 'enabled' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                {template.status === 'enabled' ? '停用模板' : '启用模板'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <Modal open={modalOpen} title="新建模板" subtitle="变量 code/min" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={create}>
          <label>模板名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>业务场景
            <select value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })}>
              {Object.entries(sceneLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>服务商模板 Code<input value={form.providerTemplateId} onChange={(event) => setForm({ ...form, providerTemplateId: event.target.value })} /></label>
          <label>模板内容<input value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
          <button className="primaryButton" type="submit"><FileText size={16} />创建模板</button>
        </form>
      </Modal>
    </section>
  );
}

