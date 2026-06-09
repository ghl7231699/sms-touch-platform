import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import type { EventSourceItem } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

export default function EventSourcesPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<EventSourceItem[]>([]);
  const [form, setForm] = useState({ name: '', appId: '', remark: '' });
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    const data = await api<{ items: EventSourceItem[] }>('/api/event-sources?pageSize=80');
    setItems(data.items);
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '事件来源加载失败'));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ secret: string }>('/api/event-sources', {
      method: 'POST',
      body: JSON.stringify(form)
    });
    setNotice(`事件来源已创建，密钥 ${result.secret}`);
    setForm({ name: '', appId: '', remark: '' });
    setModalOpen(false);
    await load();
  }

  async function resetSecret(item: EventSourceItem) {
    const result = await api<{ secret: string }>(`/api/event-sources/${item.id}/reset-secret`, { method: 'POST' });
    setNotice(`${item.name} 新密钥 ${result.secret}`);
    await load();
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <h2>业务系统接入</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><KeyRound size={16} />新建来源</button>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>来源</th><th>AppId</th><th>密钥</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><span>{item.remark || '-'}</span></td>
                  <td>{item.appId}</td>
                  <td>{item.secretPreview}</td>
                  <td><StatusBadge status={item.status === 'enabled' ? 'enabled' : 'disabled'} /></td>
                  <td><button className="tableButton" onClick={() => resetSecret(item)}>重置密钥</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={modalOpen} title="新建来源" subtitle="用于事件鉴权" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={create}>
          <label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>AppId<input value={form.appId} onChange={(event) => setForm({ ...form, appId: event.target.value })} placeholder="留空自动生成" /></label>
          <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit"><KeyRound size={16} />创建来源</button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
