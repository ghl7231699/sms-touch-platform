import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../../lib/api';
import { statusLabel } from '../../constants/labels';
import type { AuditItem, EventSourceItem, EventSourceStats } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

const emptyForm = { name: '', appId: '', remark: '' };
const emptyFilters = { keyword: '', appId: '', status: '', dateFrom: '', dateTo: '' };

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function EventSourcesPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<EventSourceItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventSourceItem | null>(null);
  const [selected, setSelected] = useState<EventSourceItem | null>(null);
  const [selectedStats, setSelectedStats] = useState<EventSourceStats | null>(null);
  const [selectedLogs, setSelectedLogs] = useState<AuditItem[]>([]);
  const [resetTarget, setResetTarget] = useState<EventSourceItem | null>(null);
  const [secret, setSecret] = useState('');

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: EventSourceItem[]; total: number; page: number; pageSize: number }>(`/api/event-sources?${withPaginationParams(nextFilters, nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '事件来源加载失败'));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (form.appId && !/^[a-zA-Z0-9_-]{3,64}$/.test(form.appId)) {
      setNotice('AppId 只能包含字母、数字、下划线和中划线，长度 3-64 位');
      return;
    }
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

  function openEditFromDetail(item: EventSourceItem) {
    setSelected(null);
    openEdit(item);
  }

  async function toggleFromDetail(item: EventSourceItem) {
    await toggle(item);
    setSelected(null);
  }

  async function resetSecretFromDetail(item: EventSourceItem) {
    setSelected(null);
    setResetTarget(item);
  }

  async function resetSecret(item: EventSourceItem) {
    const result = await api<{ secret: string }>(`/api/event-sources/${item.id}/reset-secret`, { method: 'POST' });
    setSecret(result.secret);
    setNotice(`${item.name} 密钥已重置，请保存一次性密钥`);
    setResetTarget(null);
    await load();
  }

  async function openDetail(item: EventSourceItem) {
    const [data, statsData, logsData] = await Promise.all([
      api<{ item: EventSourceItem }>(`/api/event-sources/${item.id}`),
      api<{ stats: EventSourceStats }>(`/api/event-sources/${item.id}/stats`),
      api<{ items: AuditItem[] }>(`/api/event-sources/${item.id}/logs?pageSize=5`)
    ]);
    setSelected(data.item);
    setSelectedStats(statsData.stats);
    setSelectedLogs(logsData.items || []);
  }

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyFilters, ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    load(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '查询失败'));
  }

  function changePage(page: number, pageSize: number) {
    load(filters, { ...pagination, page, pageSize });
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>业务系统接入</h2>
            <span>管理来源系统 appId、secret、启停和调用状态</span>
          </div>
          <AuthC authKey="integration:eventSource:add">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><KeyRound size={16} />新建来源</button>
          </AuthC>
        </div>

        <QueryFilterBar
          fields={[
            { name: 'keyword', label: '名称 / AppId', placeholder: '请输入名称或 AppId' },
            { name: 'appId', label: 'AppId', placeholder: '请输入 AppId' },
            {
              name: 'status',
              label: '状态',
              type: 'select',
              placeholder: '全部状态',
              options: [{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]
            },
            { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
          ]}
          values={filters}
          onChange={(value) => setFilters({ ...emptyFilters, ...value })}
          onSearch={search}
        />

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
                      <AuthC authKey="integration:eventSource:detail">
                        <button className="tableButton" type="button" onClick={() => openDetail(item)}>详情</button>
                      </AuthC>
                      <AuthC authKey="integration:eventSource:edit">
                        <button className="tableButton" type="button" onClick={() => openEdit(item)}>编辑</button>
                      </AuthC>
                      <AuthC authKey="integration:eventSource:status">
                        <button className="tableButton" type="button" onClick={() => toggle(item)}>{item.status === 'enabled' ? '停用' : '启用'}</button>
                      </AuthC>
                      <AuthC authKey="integration:eventSource:resetSecret">
                        <button className="tableButton" type="button" onClick={() => setResetTarget(item)}>重置密钥</button>
                      </AuthC>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && <TableEmptyState colSpan={6} title="暂无事件来源" description="新建来源后，业务系统才能通过 AppId 和密钥接入事件。" />}
            </tbody>
          </table>
        </div>
        <ListPagination pagination={pagination} onChange={changePage} />
      </section>

      <Modal open={modalOpen} title="新建来源" subtitle="用于事件鉴权" onClose={() => setModalOpen(false)} showClose={false}>
        <form className="formPanel" onSubmit={create}>
          <label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>AppId<input value={form.appId} onChange={(event) => setForm({ ...form, appId: event.target.value })} placeholder="留空自动生成" /></label>
          <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">创建</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} title="编辑来源" subtitle={editing?.appId} onClose={() => setEditing(null)} showClose={false}>
        <form className="formPanel" onSubmit={update}>
          <label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>AppId<input value={form.appId} disabled /></label>
          <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setEditing(null)}>取消</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="来源详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>名称</span><strong>{selected.name}</strong></div>
              <div><span>AppId</span><strong>{selected.appId}</strong></div>
              <div><span>密钥预览</span><strong>{selected.secretPreview}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'enabled' ? 'enabled' : 'disabled'} /></div>
            </div>
            <section className="approvalBlock">
              <strong>接入状态</strong>
              <p>{selected.status === 'enabled' ? '该来源可以正常推送业务事件，系统会按 AppId 和 Secret 完成鉴权。' : '该来源已停用，业务事件会被拒绝接入。'}</p>
            </section>
            <section className="approvalBlock">
              <strong>鉴权说明</strong>
              <p>业务系统调用事件接入接口时需要携带 AppId 和签名密钥；密钥只在创建或重置后明文展示一次。</p>
            </section>
            <div className="detailCard">
              <div><span>接入总量</span><strong>{selectedStats?.total ?? 0}</strong></div>
              <div><span>成功</span><strong>{selectedStats?.success ?? 0}</strong></div>
              <div><span>失败</span><strong>{selectedStats?.failed ?? 0}</strong></div>
              <div><span>近 24 小时</span><strong>{selectedStats?.last24hTotal ?? 0}</strong></div>
              <div><span>失败率</span><strong>{selectedStats ? `${Math.round(selectedStats.failureRate * 100)}%` : '0%'}</strong></div>
              <div><span>最近调用</span><strong>{formatTime(selectedStats?.latestLog?.createdAt)}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>最近接入日志</strong>
              <div className="miniTimeline">
                {selectedLogs.length ? selectedLogs.map((log) => (
                  <div className="miniTimelineItem" key={log.id}>
                    <div>
                      <strong>{log.eventType || '-'}</strong>
                      <span>{formatTime(log.createdAt)} · {log.code || '-'}</span>
                    </div>
                    <StatusBadge status={log.status === 'success' ? 'success' : 'failed'} />
                  </div>
                )) : <span className="mutedText">暂无接入日志</span>}
              </div>
            </section>
            <div className="detailCard">
              <div><span>状态说明</span><strong>{statusLabel(selected.status)}</strong></div>
              <div><span>备注</span><strong>{selected.remark || '-'}</strong></div>
              <div><span>创建时间</span><strong>{formatTime(selected.createdAt)}</strong></div>
              <div><span>来源 ID</span><strong>{selected.id}</strong></div>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setSelected(null)}>关闭</button>
              <AuthC authKey="integration:eventSource:edit">
                <button className="secondaryButton compact" type="button" onClick={() => openEditFromDetail(selected)}>编辑</button>
              </AuthC>
              <AuthC authKey="integration:eventSource:status">
                <button className="secondaryButton compact" type="button" onClick={() => toggleFromDetail(selected)}>{selected.status === 'enabled' ? '停用' : '启用'}</button>
              </AuthC>
              <AuthC authKey="integration:eventSource:resetSecret">
                <button className="primaryButton compact" type="button" onClick={() => resetSecretFromDetail(selected)}>重置密钥</button>
              </AuthC>
            </div>
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

      <Modal open={Boolean(resetTarget)} title="重置密钥" subtitle={resetTarget?.appId} onClose={() => setResetTarget(null)} showClose={false}>
        {resetTarget && (
          <div className="formPanel">
            <div className="readonlyBox">
              <KeyRound size={18} />
              <div>
                <strong>确认重置 {resetTarget.name} 的密钥？</strong>
                <span>旧密钥会立即失效，业务系统必须更新为新密钥后才能继续上报事件。</span>
              </div>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setResetTarget(null)}>取消</button>
              <button className="primaryButton compact" type="button" onClick={() => resetSecret(resetTarget)}>重置</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
