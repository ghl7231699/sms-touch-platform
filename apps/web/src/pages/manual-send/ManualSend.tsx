import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../lib/api';
import { statusLabel } from '../../constants/labels';
import type { Template } from '../../types';
import { Modal } from '../../components/Modal';

export default function ManualSend({ templates, onRefresh, setNotice }: { templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [phone, setPhone] = useState('18515385071');
  const [templateId, setTemplateId] = useState('tpl_register');
  const [modalOpen, setModalOpen] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ success: boolean; status: string; code: string; message: string }>('/api/manual-send', {
      method: 'POST',
      body: JSON.stringify({ phone, templateId })
    });
    setNotice(`${statusLabel(result.status)} · ${result.code}`);
    setModalOpen(false);
    await onRefresh();
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <h2>手动发送</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><Send size={16} />发送短信</button>
        </div>
        <p>手动发送统一走发送前安全校验，命中黑名单、退订、频控或真实服务商白名单保护时会被拦截。</p>
      </section>
      <section className="panel explainPanel">
        <h2>发送策略</h2>
        <ul>
          <li>默认使用 mock provider，不触达真实手机号。</li>
          <li>切换到 aliyun_dypns 后仍只允许白名单手机号。</li>
          <li>发送记录统一进入发送记录与统计概览。</li>
        </ul>
      </section>
      <Modal open={modalOpen} title="手动发送" subtitle="白名单保护" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={submit}>
          <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label>短信模板
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
            </select>
          </label>
          <button className="primaryButton" type="submit"><Send size={16} />发送短信</button>
        </form>
      </Modal>
    </section>
  );
}

