import React, { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { resourceLabel } from '../../constants/labels';
import type { ExportTaskItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';

const resourceOptions = [
  { value: 'operation_log', label: '操作日志' },
  { value: 'send_log', label: '发送记录' },
  { value: 'sms_whitelist', label: '白名单' },
  { value: 'sms_blacklist', label: '黑名单' },
  { value: 'approval_order', label: '审批记录' }
];

const emptyFilters = { keyword: '', resource: '', status: '', dateFrom: '', dateTo: '' };

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams({ pageSize: '80' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function formatJson(value: unknown) {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
}

export default function ExportTasksPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ExportTaskItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<ExportTaskItem | null>(null);
  const [form, setForm] = useState({ resource: 'operation_log', name: '操作日志导出', sensitive: false, reason: '' });

  async function load(nextFilters = filters) {
    const data = await api<{ items: ExportTaskItem[] }>(`/api/export-tasks?${queryString(nextFilters)}`);
    setItems(data.items);
  }

  useEffect(() => {
    load();
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ approvalRequired?: boolean; approval?: { id: string } }>('/api/export-tasks', {
      method: 'POST',
      body: JSON.stringify({
        resource: form.resource,
        name: form.name,
        sensitive: form.sensitive,
        reason: form.reason,
        criteria: { createdFrom: 'export_tasks_page', maskSensitive: !form.sensitive }
      })
    });
    setModalOpen(false);
    setNotice(result.approvalRequired ? '明文导出已提交审批，通过后生成导出任务' : '导出任务已生成');
    await load();
  }

  async function download(item: ExportTaskItem) {
    const result = await api<{ fileName?: string; expiresAt?: string }>(`/api/export-tasks/${item.id}/download`);
    setNotice(`${result.fileName || item.fileName || '导出文件'} 可下载，有效期至 ${result.expiresAt ? new Date(result.expiresAt).toLocaleString() : '7 天后'}`);
  }

  async function openDetail(item: ExportTaskItem) {
    const data = await api<{ item: ExportTaskItem }>(`/api/export-tasks/${item.id}`);
    setSelected(data.item);
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    load();
  }

  return (
    <section className="panel">
      <div className="panelTitle">
        <div>
          <h2>导出任务</h2>
          <span>按资源创建导出，明文敏感字段需审批</span>
        </div>
        <AuthC authKey="audit:exportTask:add">
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><FileText size={16} />新建导出</button>
        </AuthC>
      </div>

      <form className="filterBar" onSubmit={applyFilters}>
        <input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="任务名 / 文件名" />
        <SelectField value={filters.resource} options={[{ value: '', label: '全部资源' }, ...resourceOptions]} onChange={(resource) => setFilters({ ...filters, resource })} />
        <SelectField value={filters.status} options={[{ value: '', label: '全部状态' }, { value: 'completed', label: '已完成' }, { value: 'pending', label: '处理中' }, { value: 'failed', label: '失败' }]} onChange={(status) => setFilters({ ...filters, status })} />
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        <button className="primaryButton compact" type="submit"><Search size={16} />查询</button>
      </form>

      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>任务</th><th>资源</th><th>文件</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong><span>{item.criteria ? JSON.stringify(item.criteria) : '-'}</span></td>
                <td>{resourceLabel(item.resource)}</td>
                <td>{item.fileName || '-'}</td>
                <td><StatusBadge status={item.status === 'completed' ? 'success' : item.status} /></td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>
                  <div className="inlineActions">
                    <AuthC authKey="audit:exportTask:detail">
                      <button className="tableButton" type="button" onClick={() => openDetail(item)}>详情</button>
                    </AuthC>
                    <AuthC authKey="audit:exportTask:download">
                      <button className="tableButton" type="button" onClick={() => download(item)}>下载</button>
                    </AuthC>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} title="新建导出任务" subtitle="导出条件会进入审计" onClose={() => setModalOpen(false)} showClose={false}>
        <form className="formPanel" onSubmit={create}>
          <label>导出名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>导出资源<SelectField value={form.resource} options={resourceOptions} onChange={(resource) => setForm({ ...form, resource })} /></label>
          <label className="checkRow"><input type="checkbox" checked={form.sensitive} onChange={(event) => setForm({ ...form, sensitive: event.target.checked })} />包含明文手机号/敏感字段</label>
          {form.sensitive && <label>申请原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="说明明文导出的业务用途" required /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">创建</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="导出任务详情" subtitle={selected?.name} onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>资源</span><strong>{resourceLabel(selected.resource)}</strong></div>
              <div><span>文件</span><strong>{selected.fileName || '-'}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'completed' ? 'success' : selected.status} /></div>
              <div><span>创建时间</span><strong>{new Date(selected.createdAt).toLocaleString()}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>导出条件</strong>
              <pre>{formatJson(selected.criteria)}</pre>
            </section>
          </div>
        )}
      </Modal>
    </section>
  );
}
