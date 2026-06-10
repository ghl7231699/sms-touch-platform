import React, { useEffect, useState } from 'react';
import { Edit3, Eye, KeyRound, RefreshCw, Search } from 'lucide-react';
import { api } from '../../lib/api';
import type { EventSourceItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';

const emptyForm = { name: '', appId: '', remark: '' };
const emptyFilters = { keyword: '', appId: '', status: '', dateFrom: '', dateTo: '' };

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams({ pageSize: '80' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default function EventSourcesPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<EventSourceItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventSourceItem | null>(null);
  const [selected, setSelected] = useState<EventSourceItem | null>(null);
  const [secret, setSecret] = useState('');

  async function load(nextFilters = filters) {
    const data = await api<{ items: EventSourceItem[] }>(`/api/event-sources?${queryString(nextFilters)}`);
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
    setSecret(result.secret);
    setNotice('事件来源已创建，请保存一次性密钥');
    setForm(emptyForm);
    setModalOpen(false);
    await load();
  }

  function openEdit(item: EventSourceItem) {
    setEditing(item);
    setForm({ name: item.name, appId: item.appId, remark: item.remark || '' });
  }

  async function update(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    await api(`/api/event-sources/${editing.id}/update`, {
      method: 'POST',
      body: JSON.stringify({ name: form.name, remark: form.remark })
    });
    setNotice('事件来源已更新');
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function toggle(item: EventSourceItem) {
    await api(`/api/event-sources/${item.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: item.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${item.name} 已${item.status === 'enabled' ? '停用' : '启用'}`);
    await load();
  }

  async function resetSecret(item: EventSourceItem) {
    const result = await api<{ secret: string }>(`/api/event-sources/${item.id}/reset-secret`, { method: 'POST' });
    setSecret(result.secret);
    setNotice(`${item.name} 密钥已重置，请保存一次性密钥`);
    await load();
  }

  async function openDetail(item: EventSourceItem) {
    const data = await api<{ item: EventSourceItem }>(`/api/event-sources/${item.id}`);
    setSelected(data.item);
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    load().catch((error) => setNotice(error instanceof Error ? error.message : '查询失败'));
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>业务系统接入</h2>
            <span>管理来源系统 appId、secret、启停和调用状态</span>
          </div>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><KeyRound size={16} />新建来源</button>
        </div>

        <form className="filterBar" onSubmit={applyFilters}>
          <input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="名称 / AppId" />
          <input value={filters.appId} onChange={(event) => setFilters({ ...filters, appId: event.target.value })} placeholder="AppId" />
          <SelectField
            value={filters.status}
            options={[{ value: '', label: '全部状态' }, { value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]}
            onChange={(status) => setFilters({ ...filters, status })}
          />
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
          <button className="primaryButton compact" type="submit"><Search size={16} />查询</button>
        </form>

        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>来源</th><th>AppId</th><th>密钥</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><span>{item.remark || '-'}</span></td>
                  <td>{item.appId}</td>
                  <td>{item.secretPreview}</td>
                  <td><StatusBadge status={item.status === 'enabled' ? 'enabled' : 'disabled'} /></td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="inlineActions">
                      <button className="tableButton" type="button" onClick={() => openDetail(item)}><Eye size={15} />详情</button>
                      <button className="tableButton" type="button" onClick={() => openEdit(item)}><Edit3 size={15} />编辑</button>
                      <button className="tableButton" type="button" onClick={() => toggle(item)}>{item.status === 'enabled' ? '停用' : '启用'}</button>
                      <button className="tableButton" type="button" onClick={() => resetSecret(item)}><RefreshCw size={15} />重置密钥</button>
                    </div>
                  </td>
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

      <Modal open={Boolean(editing)} title="编辑来源" subtitle={editing?.appId} onClose={() => setEditing(null)}>
        <form className="formPanel" onSubmit={update}>
          <label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>AppId<input value={form.appId} disabled /></label>
          <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setEditing(null)}>取消</button>
            <button className="primaryButton compact" type="submit"><Edit3 size={16} />保存修改</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="来源详情" subtitle={selected?.appId} onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>名称</span><strong>{selected.name}</strong></div>
              <div><span>AppId</span><strong>{selected.appId}</strong></div>
              <div><span>密钥预览</span><strong>{selected.secretPreview}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'enabled' ? 'enabled' : 'disabled'} /></div>
            </div>
            <div className="fieldBlock"><span>备注</span><strong>{selected.remark || '-'}</strong></div>
            <div className="fieldBlock"><span>创建时间</span><strong>{new Date(selected.createdAt).toLocaleString()}</strong></div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(secret)} title="一次性密钥" subtitle="关闭后将不再明文展示" onClose={() => setSecret('')}>
        <div className="formPanel">
          <div className="readonlyBox"><KeyRound size={18} /><div><strong>{secret}</strong><span>请在业务系统中保存该密钥，页面只展示一次。</span></div></div>
          <div className="modalActions">
            <button className="primaryButton compact" type="button" onClick={() => setSecret('')}>我已保存</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
