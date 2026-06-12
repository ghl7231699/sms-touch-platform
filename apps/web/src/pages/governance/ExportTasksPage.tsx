import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { api, downloadApi } from '../../lib/api';
import { resourceLabel } from '../../constants/labels';
import type { ExportTaskItem } from '../../types';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

const resourceOptions = [
  { value: 'operation_log', label: '操作日志' },
  { value: 'send_log', label: '发送记录' },
  { value: 'sms_whitelist', label: '白名单' },
  { value: 'sms_blacklist', label: '黑名单' },
  { value: 'event_source_log', label: '接入日志' },
  { value: 'approval_order', label: '审批记录' }
];

const emptyFilters = { keyword: '', resource: '', status: '', dateFrom: '', dateTo: '' };

function formatJson(value: unknown) {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function cleanFilters(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value)));
}

export default function ExportTasksPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ExportTaskItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<ExportTaskItem | null>(null);
  const [form, setForm] = useState({ resource: 'operation_log', name: '操作日志导出', sensitive: false, reason: '' });

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: ExportTaskItem[]; total: number; page: number; pageSize: number }>(`/api/export-tasks?${withPaginationParams(nextFilters, nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
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
        criteria: { ...cleanFilters(filters), createdFrom: 'export_tasks_page', maskSensitive: !form.sensitive }
      })
    });
    setModalOpen(false);
    setNotice(result.approvalRequired ? '明文导出已提交审批，通过后生成导出任务' : '导出任务已生成');
    await load();
  }

  async function download(item: ExportTaskItem) {
    const result = await downloadApi(`/api/export-tasks/${item.id}/download`);
    const fileName = result.fileName || item.fileName || `export_${item.id}.json`;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotice(`${fileName} 已开始下载`);
  }

  async function openDetail(item: ExportTaskItem) {
    const data = await api<{ item: ExportTaskItem }>(`/api/export-tasks/${item.id}`);
    setSelected(data.item);
  }

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyFilters, ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    load(typedFilters, nextPagination);
  }

  function changePage(page: number, pageSize: number) {
    load(filters, { ...pagination, page, pageSize });
  }

  return (
    <section className="moduleSummaryPanel">
      <div className="moduleHeader">
        <div>
          <h1>导出任务</h1>
          <p>按资源创建导出，明文敏感字段需审批。</p>
        </div>
        <AuthC authKey="audit:exportTask:add">
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><FileText size={16} />新建导出</button>
        </AuthC>
      </div>

      <QueryFilterBar
        fields={[
          { name: 'keyword', label: '任务名 / 文件名', placeholder: '请输入任务名或文件名' },
          { name: 'resource', label: '资源', type: 'select', placeholder: '全部资源', options: resourceOptions },
          {
            name: 'status',
            label: '状态',
            type: 'select',
            placeholder: '全部状态',
            options: [
              { value: 'completed', label: '已完成' },
              { value: 'pending', label: '处理中' },
              { value: 'failed', label: '失败' }
            ]
          },
          { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
        ]}
        values={filters}
        onChange={(value) => setFilters({ ...emptyFilters, ...value })}
        onSearch={search}
      />

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
            {!items.length && <TableEmptyState colSpan={6} title="暂无导出任务" description="创建导出任务后，这里会展示导出文件、状态和下载入口。" />}
          </tbody>
        </table>
      </div>
      <ListPagination pagination={pagination} onChange={changePage} />

      <Modal open={modalOpen} title="新建导出任务" subtitle="导出条件会进入审计" onClose={() => setModalOpen(false)} showClose={false}>
        <form className="formPanel" onSubmit={create}>
          <label>导出名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>导出资源<SelectField value={form.resource} options={resourceOptions} onChange={(resource) => setForm({ ...form, resource })} /></label>
          <div className="fieldBlock">
            <span>导出条件</span>
            <strong>{Object.keys(cleanFilters(filters)).length ? '使用当前列表筛选条件创建导出' : '当前没有筛选条件，将按资源默认范围导出'}</strong>
          </div>
          <label className="checkRow"><input type="checkbox" checked={form.sensitive} onChange={(event) => setForm({ ...form, sensitive: event.target.checked })} />包含明文手机号/敏感字段</label>
          {form.sensitive && <label>申请原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="说明明文导出的业务用途" required /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">创建</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="导出任务详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>任务名称</span><strong>{selected.name}</strong></div>
              <div><span>资源</span><strong>{resourceLabel(selected.resource)}</strong></div>
              <div><span>文件</span><strong>{selected.fileName || '-'}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'completed' ? 'success' : selected.status} /></div>
              <div><span>创建时间</span><strong>{formatTime(selected.createdAt)}</strong></div>
              <div><span>任务 ID</span><strong>{selected.id}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>导出策略</strong>
              <p>{selected.criteria?.maskSensitive === false ? '本次导出包含明文敏感字段，需要审批通过后才能生成文件。' : '本次导出默认脱敏敏感字段，可直接下载生成文件。'}</p>
            </section>
            <div className="detailCard">
              <div><span>敏感字段</span><strong>{selected.criteria?.maskSensitive === false ? '明文导出' : '脱敏导出'}</strong></div>
              <div><span>可下载</span><strong>{selected.status === 'completed' && selected.fileName ? '是' : '否'}</strong></div>
              <div><span>文件名</span><strong>{selected.fileName || '等待生成'}</strong></div>
              <div><span>资源标识</span><strong>{selected.resource}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>导出条件</strong>
              <pre>{formatJson(selected.criteria)}</pre>
            </section>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setSelected(null)}>关闭</button>
              <AuthC authKey="audit:exportTask:download">
                <button className="primaryButton compact" type="button" onClick={() => download(selected)} disabled={selected.status !== 'completed'}>下载</button>
              </AuthC>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
