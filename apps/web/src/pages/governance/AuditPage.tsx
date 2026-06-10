import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../lib/api';
import { eventLabels, operationLabel, resourceLabel } from '../../constants/labels';
import type { AuditItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';

const emptyFilters = {
  keyword: '',
  appId: '',
  eventId: '',
  eventType: '',
  resource: '',
  action: '',
  userName: '',
  status: '',
  result: '',
  dateFrom: '',
  dateTo: ''
};

function queryString(filters: Record<string, string>, mode: 'eventSourceLogs' | 'operationLogs') {
  const params = new URLSearchParams({ pageSize: '80' });
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    if (mode === 'eventSourceLogs' && ['keyword', 'resource', 'action', 'userName', 'result'].includes(key)) return;
    if (mode === 'operationLogs' && ['appId', 'eventId', 'eventType', 'status'].includes(key)) return;
    params.set(key, value);
  });
  return params.toString();
}

function formatJson(value: unknown) {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
}

export default function AuditPage({ mode }: { mode: 'eventSourceLogs' | 'operationLogs' }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const endpoint = mode === 'eventSourceLogs' ? '/api/event-source-logs' : '/api/operation-logs';
  const title = mode === 'eventSourceLogs' ? '事件接入日志' : '操作日志';
  const detailAuthKey = mode === 'eventSourceLogs' ? 'integration:eventSourceLog:detail' : 'audit:operationLog:detail';

  async function load(nextFilters = filters) {
    const data = await api<{ items: AuditItem[] }>(`${endpoint}?${queryString(nextFilters, mode)}`);
    setItems(data.items);
  }

  useEffect(() => {
    setFilters(emptyFilters);
    load(emptyFilters);
  }, [endpoint]);

  async function openDetail(item: AuditItem) {
    const data = await api<{ item: AuditItem }>(`${endpoint}/${item.id}`);
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
          <h2>{title}</h2>
          <span>{items.length} 条，支持按主体、结果和时间筛选</span>
        </div>
      </div>

      <form className="filterBar" onSubmit={applyFilters}>
        {mode === 'eventSourceLogs' ? (
          <>
            <input value={filters.appId} onChange={(event) => setFilters({ ...filters, appId: event.target.value })} placeholder="AppId" />
            <input value={filters.eventId} onChange={(event) => setFilters({ ...filters, eventId: event.target.value })} placeholder="EventId" />
            <input value={filters.eventType} onChange={(event) => setFilters({ ...filters, eventType: event.target.value })} placeholder="事件类型" />
            <SelectField value={filters.status} options={[{ value: '', label: '全部结果' }, { value: 'success', label: '成功' }, { value: 'failed', label: '失败' }]} onChange={(status) => setFilters({ ...filters, status })} />
          </>
        ) : (
          <>
            <input value={filters.userName} onChange={(event) => setFilters({ ...filters, userName: event.target.value })} placeholder="操作人" />
            <input value={filters.resource} onChange={(event) => setFilters({ ...filters, resource: event.target.value })} placeholder="资源类型" />
            <input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="动作" />
            <input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="关键词" />
          </>
        )}
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        <button className="primaryButton compact" type="submit"><Search size={16} />查询</button>
      </form>

      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>时间</th><th>主体</th><th>动作</th><th>结果</th><th>说明</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>{mode === 'eventSourceLogs' ? item.appId || '-' : item.userName || '-'}</td>
                <td>{mode === 'eventSourceLogs' ? eventLabels[item.eventType || ''] || item.eventType || '-' : operationLabel(item.resource, item.action)}</td>
                <td><StatusBadge status={(item.status || item.result) === 'success' ? 'success' : 'failed'} /></td>
                <td><strong>{item.code || resourceLabel(item.resource)}</strong><span>{item.message || item.errorMessage || item.path || '-'}</span></td>
                <td>
                  <AuthC authKey={detailAuthKey}>
                    <button className="tableButton" type="button" onClick={() => openDetail(item)}>详情</button>
                  </AuthC>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(selected)} title={`${title}详情`} subtitle={selected?.id} onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>时间</span><strong>{new Date(selected.createdAt).toLocaleString()}</strong></div>
              <div><span>主体</span><strong>{mode === 'eventSourceLogs' ? selected.appId || '-' : selected.userName || '-'}</strong></div>
              <div><span>结果</span><StatusBadge status={(selected.status || selected.result) === 'success' ? 'success' : 'failed'} /></div>
              <div><span>IP</span><strong>{selected.ip || '-'}</strong></div>
            </div>
            <div className="fieldBlock">
              <span>动作</span>
              <strong>{mode === 'eventSourceLogs' ? eventLabels[selected.eventType || ''] || selected.eventType || '-' : operationLabel(selected.resource, selected.action)}</strong>
            </div>
            <div className="fieldBlock"><span>路径 / EventId</span><strong>{selected.path || selected.eventId || '-'}</strong></div>
            <div className="fieldBlock"><span>说明</span><strong>{selected.message || selected.errorMessage || selected.code || '-'}</strong></div>
            <div className="approvalBlock">
              <strong>{mode === 'eventSourceLogs' ? '事件 Payload' : '请求内容'}</strong>
              <pre>{formatJson(mode === 'eventSourceLogs' ? selected.payload : selected.requestBody)}</pre>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
