import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import type { PhoneGovernanceItem } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

export default function PhoneListPage({ kind, title, setNotice }: { kind: 'whitelist' | 'blacklist' | 'unsubscribes'; title: string; setNotice: (value: string) => void }) {
  const [items, setItems] = useState<PhoneGovernanceItem[]>([]);
  const [form, setForm] = useState({ phone: '', scene: '', remark: '', reason: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const endpoint = `/api/${kind}`;

  async function load() {
    const data = await api<{ items: PhoneGovernanceItem[] }>(`${endpoint}?pageSize=80`);
    setItems(data.items);
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : `${title}加载失败`));
  }, [kind]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(form)
    });
    setNotice(`${title}已更新`);
    setForm({ phone: '', scene: '', remark: '', reason: '' });
    setModalOpen(false);
    await load();
  }

  async function toggle(item: PhoneGovernanceItem) {
    if (kind === 'whitelist') {
      await api(`/api/whitelist/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: item.status === 'enabled' ? 'disabled' : 'enabled' })
      });
    } else if (kind === 'blacklist') {
      await api(`/api/blacklist/${item.id}/remove`, { method: 'POST' });
    }
    setNotice('状态已更新');
    await load();
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <h2>{title}</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><ShieldCheck size={16} />新增记录</button>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>手机号</th><th>场景</th><th>说明</th><th>来源</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.phoneMasked}</td>
                  <td>{item.scene || '全部'}</td>
                  <td>{item.remark || item.reason || '-'}</td>
                  <td>{item.source || 'manual'}</td>
                  <td><StatusBadge status={['enabled', 'active'].includes(item.status) ? 'enabled' : 'disabled'} /></td>
                  <td>{kind !== 'unsubscribes' ? <button className="tableButton" onClick={() => toggle(item)}>{kind === 'blacklist' ? '移除' : item.status === 'enabled' ? '停用' : '启用'}</button> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={modalOpen} title="新增记录" subtitle={kind === 'whitelist' ? '真实发送保护' : '发送前拦截'} onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={submit}>
          <label>手机号<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
          <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} placeholder="留空表示全部场景" /></label>
          {kind === 'blacklist'
            ? <label>原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            : <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>}
          <button className="primaryButton" type="submit"><ShieldCheck size={16} />保存</button>
        </form>
      </Modal>
    </section>
  );
}

