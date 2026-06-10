import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileUp, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { statusLabel } from '../../constants/labels';
import type { PhoneGovernanceItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';

type PhoneListKind = 'whitelist' | 'blacklist' | 'unsubscribes';

const emptyForm = { phone: '', scene: '', remark: '', reason: '' };
const emptyFilters = { phone: '', scene: '', status: '', source: '', dateFrom: '', dateTo: '' };

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams({ pageSize: '80' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default function PhoneListPage({ kind, title, setNotice }: { kind: PhoneListKind; title: string; setNotice: (value: string) => void }) {
  const [items, setItems] = useState<PhoneGovernanceItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [importText, setImportText] = useState('');
  const [modal, setModal] = useState<'create' | 'import' | null>(null);
  const [editing, setEditing] = useState<PhoneGovernanceItem | null>(null);
  const [selected, setSelected] = useState<PhoneGovernanceItem | null>(null);
  const endpoint = `/api/${kind}`;
  const canImport = kind === 'blacklist' || kind === 'unsubscribes';
  const canEdit = kind === 'whitelist';
  const authPrefix = kind === 'whitelist' ? 'security:whitelist' : kind === 'blacklist' ? 'security:blacklist' : 'security:unsubscribe';

  const statusOptions = useMemo(() => {
    if (kind === 'whitelist') return [{ value: '', label: '全部状态' }, { value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }];
    return [{ value: '', label: '全部状态' }, { value: 'active', label: '生效中' }, { value: 'removed', label: '已移除' }];
  }, [kind]);

  async function load(nextFilters = filters) {
    const data = await api<{ items: PhoneGovernanceItem[] }>(`${endpoint}?${queryString(nextFilters)}`);
    setItems(data.items);
  }

  useEffect(() => {
    setFilters(emptyFilters);
    load(emptyFilters).catch((error) => setNotice(error instanceof Error ? error.message : `${title}加载失败`));
  }, [kind]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(form)
    });
    setNotice(`${title}已更新`);
    setForm(emptyForm);
    setModal(null);
    await load();
  }

  function openEdit(item: PhoneGovernanceItem) {
    setEditing(item);
    setForm({ phone: '', scene: item.scene || '', remark: item.remark || '', reason: item.reason || '' });
  }

  async function updateWhitelist(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    await api(`/api/whitelist/${editing.id}/update`, {
      method: 'POST',
      body: JSON.stringify({ scene: form.scene, remark: form.remark })
    });
    setNotice('白名单备注已更新');
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function openDetail(item: PhoneGovernanceItem) {
    const data = await api<{ item: PhoneGovernanceItem }>(`${endpoint}/${item.id}`);
    setSelected(data.item);
  }

  async function toggle(item: PhoneGovernanceItem) {
    if (kind === 'whitelist') {
      await api(`/api/whitelist/${item.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: item.status === 'enabled' ? 'disabled' : 'enabled' })
      });
    } else if (kind === 'blacklist') {
      await api(`/api/blacklist/${item.id}/remove`, { method: 'POST' });
    }
    setNotice('状态已更新');
    await load();
  }

  async function importPhones(event: React.FormEvent) {
    event.preventDefault();
    const phones = importText.split(/\s|,|，|;|；/).map((item) => item.trim()).filter(Boolean);
    await api(`/api/${kind}/import`, {
      method: 'POST',
      body: JSON.stringify({ phones, scene: form.scene, remark: form.remark, reason: form.reason })
    });
    setNotice(`已提交导入，共 ${phones.length} 个号码`);
    setImportText('');
    setForm(emptyForm);
    setModal(null);
    await load();
  }

  async function exportWhitelist() {
    const result = await api<{ item?: { fileName?: string } }>('/api/whitelist/export', { method: 'POST' });
    setNotice(`白名单导出任务已生成：${result.item?.fileName || '等待生成'}`);
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
            <h2>{title}</h2>
            <span>共 {items.length} 条，支持按手机号、状态、场景和日期查询</span>
          </div>
          <div className="inlineActions">
            <AuthC authKey={`${authPrefix}:add`}>
              <button className="secondaryButton compact" type="button" onClick={() => setModal('create')}><ShieldCheck size={16} />新增记录</button>
            </AuthC>
            {canImport && (
              <AuthC authKey={`${authPrefix}:import`}>
                <button className="secondaryButton compact" type="button" onClick={() => setModal('import')}><FileUp size={16} />批量导入</button>
              </AuthC>
            )}
            {kind === 'whitelist' && (
              <AuthC authKey="security:whitelist:export">
                <button className="secondaryButton compact" type="button" onClick={exportWhitelist}><Download size={16} />导出</button>
              </AuthC>
            )}
          </div>
        </div>

        <form className="filterBar" onSubmit={applyFilters}>
          <input value={filters.phone} onChange={(event) => setFilters({ ...filters, phone: event.target.value })} placeholder="手机号" />
          <input value={filters.scene} onChange={(event) => setFilters({ ...filters, scene: event.target.value })} placeholder="场景" />
          <SelectField value={filters.status} options={statusOptions} onChange={(status) => setFilters({ ...filters, status })} />
          {kind !== 'whitelist' && <input value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} placeholder="来源" />}
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
          <button className="primaryButton compact" type="submit"><Search size={16} />查询</button>
        </form>

        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>手机号</th><th>场景</th><th>说明</th><th>来源</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.phoneMasked}</td>
                  <td>{item.scene || '全部'}</td>
                  <td>{item.remark || item.reason || '-'}</td>
                  <td>{item.source || 'manual'}</td>
                  <td><StatusBadge status={['enabled', 'active'].includes(item.status) ? 'enabled' : 'disabled'} /></td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="inlineActions">
                      <AuthC authKey={`${authPrefix}:detail`}>
                        <button className="tableButton" type="button" onClick={() => openDetail(item)}>详情</button>
                      </AuthC>
                      {canEdit && (
                        <AuthC authKey="security:whitelist:edit">
                          <button className="tableButton" type="button" onClick={() => openEdit(item)}>编辑</button>
                        </AuthC>
                      )}
                      {kind === 'whitelist' && (
                        <AuthC authKey="security:whitelist:status">
                          <button className="tableButton" type="button" onClick={() => toggle(item)}>{item.status === 'enabled' ? '停用' : '启用'}</button>
                        </AuthC>
                      )}
                      {kind === 'blacklist' && (
                        <AuthC authKey="security:blacklist:remove">
                          <button className="tableButton" type="button" onClick={() => toggle(item)}>移除</button>
                        </AuthC>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={modal === 'create'} title="新增记录" subtitle={kind === 'whitelist' ? '真实发送保护' : '发送前拦截'} onClose={() => setModal(null)} showClose={false}>
        <form className="formPanel" onSubmit={submit}>
          <label>手机号<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
          <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} placeholder="留空表示全部场景" /></label>
          {kind === 'blacklist'
            ? <label>原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            : <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModal(null)}>取消</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'import'} title="批量导入" subtitle="每行、逗号或空格分隔手机号" onClose={() => setModal(null)} showClose={false}>
        <form className="formPanel" onSubmit={importPhones}>
          <label>号码列表<textarea value={importText} onChange={(event) => setImportText(event.target.value)} required /></label>
          <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} placeholder="留空表示全部场景" /></label>
          {kind === 'blacklist'
            ? <label>导入原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            : <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModal(null)}>取消</button>
            <button className="primaryButton compact" type="submit">导入</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} title="编辑白名单" subtitle={editing?.phoneMasked} onClose={() => setEditing(null)} showClose={false}>
        <form className="formPanel" onSubmit={updateWhitelist}>
          <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} /></label>
          <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setEditing(null)}>取消</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="记录详情" subtitle={selected?.phoneMasked} onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>手机号</span><strong>{selected.phoneMasked}</strong></div>
              <div><span>场景</span><strong>{selected.scene || '全部'}</strong></div>
              <div><span>状态</span><StatusBadge status={['enabled', 'active'].includes(selected.status) ? 'enabled' : 'disabled'} /></div>
              <div><span>创建时间</span><strong>{new Date(selected.createdAt).toLocaleString()}</strong></div>
            </div>
            <div className="fieldBlock"><span>说明</span><strong>{selected.remark || selected.reason || '-'}</strong></div>
            <div className="fieldBlock"><span>来源</span><strong>{selected.source || 'manual'}</strong></div>
            <div className="fieldBlock"><span>原始状态</span><strong>{statusLabel(selected.status)}</strong></div>
          </div>
        )}
      </Modal>
    </section>
  );
}
