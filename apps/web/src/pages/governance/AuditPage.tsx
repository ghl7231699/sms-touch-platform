import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { actionLabel, eventLabels, operationLabel, resourceLabel, statusLabel } from '../../constants/labels';
import type { AuditItem } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

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

function filteredQueryValues(filters: Record<string, string>, mode: 'eventSourceLogs' | 'operationLogs') {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    if (mode === 'eventSourceLogs' && ['keyword', 'resource', 'action', 'userName', 'result'].includes(key)) return;
    if (mode === 'operationLogs' && ['appId', 'eventId', 'eventType', 'status'].includes(key)) return;
    params[key] = value;
  });
  return params;
}

function formatJson(value: unknown) {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

export default function AuditPage({ mode }: { mode: 'eventSourceLogs' | 'operationLogs' }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const endpoint = mode === 'eventSourceLogs' ? '/api/event-source-logs' : '/api/operation-logs';
  const title = mode === 'eventSourceLogs' ? '事件接入日志' : '操作日志';
  const detailAuthKey = mode === 'eventSourceLogs' ? 'integration:eventSourceLog:detail' : 'audit:operationLog:detail';

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: AuditItem[]; total: number; page: number; pageSize: number }>(`${endpoint}?${withPaginationParams(filteredQueryValues(nextFilters, mode), nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  useEffect(() => {
    setFilters(emptyFilters);
    load(emptyFilters);
  }, [endpoint]);

  async function openDetail(item: AuditItem) {
    const data = await api<{ item: AuditItem }>(`${endpoint}/${item.id}`);
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

  function subjectLabel(item: AuditItem) {
    return mode === 'eventSourceLogs' ? item.appId || '-' : item.userName || item.userId || '-';
  }

  function actionText(item: AuditItem) {
    return mode === 'eventSourceLogs' ? eventLabels[item.eventType || ''] || item.eventType || '-' : operationLabel(item.resource, item.action);
  }

  function resultText(item: AuditItem) {
    const result = item.status || item.result || '-';
    return statusLabel(result);
  }

  return (
    <section className="panel">
      <div className="panelTitle">
        <div>
          <h2>{title}</h2>
          <span>{items.length} 条，支持按主体、结果和时间筛选</span>
        </div>
      </div>

      <QueryFilterBar
        fields={mode === 'eventSourceLogs' ? [
          { name: 'appId', label: 'AppId', placeholder: '请输入 AppId' },
          { name: 'eventId', label: 'EventId', placeholder: '请输入 EventId' },
          { name: 'eventType', label: '事件类型', placeholder: '请输入事件类型' },
          {
            name: 'status',
            label: '结果',
            type: 'select',
            placeholder: '全部结果',
            options: [{ value: 'success', label: '成功' }, { value: 'failed', label: '失败' }]
          },
          { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
        ] : [
          { name: 'userName', label: '操作人', placeholder: '请输入操作人' },
          { name: 'resource', label: '资源类型', placeholder: '请输入资源类型' },
          { name: 'action', label: '动作', placeholder: '请输入动作' },
          { name: 'keyword', label: '关键词', placeholder: '请输入关键词' },
          { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
        ]}
        values={filters}
        onChange={(value) => setFilters({ ...emptyFilters, ...value })}
        onSearch={search}
      />

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
            {!items.length && (
              <TableEmptyState
                colSpan={6}
                title={mode === 'eventSourceLogs' ? '暂无接入日志' : '暂无操作日志'}
                description={mode === 'eventSourceLogs' ? '当前没有业务系统事件接入记录。' : '当前没有后台操作审计记录。'}
              />
            )}
          </tbody>
        </table>
      </div>
      <ListPagination pagination={pagination} onChange={changePage} />

      <Modal open={Boolean(selected)} title={`${title}详情`} onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>主体</span><strong>{subjectLabel(selected)}</strong></div>
              <div><span>动作</span><strong>{actionText(selected)}</strong></div>
              <div><span>结果</span><StatusBadge status={(selected.status || selected.result) === 'success' ? 'success' : 'failed'} /></div>
              <div><span>发生时间</span><strong>{formatTime(selected.createdAt)}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>{(selected.status || selected.result) === 'success' ? '处理结果' : '失败原因'}</strong>
              <p>{selected.message || selected.errorMessage || selected.code || resultText(selected)}</p>
            </section>
            {mode === 'eventSourceLogs' && (
              <div className="detailCard">
                <div><span>手机号</span><strong>{objectValue(selected.payload).phone || '-'}</strong></div>
                <div><span>场景</span><strong>{objectValue(selected.payload).scene || '-'}</strong></div>
                <div><span>来源</span><strong>{objectValue(selected.payload).source || '-'}</strong></div>
                <div><span>业务金额</span><strong>{objectValue(selected.payload).amount ?? '-'}</strong></div>
              </div>
            )}
            <div className="detailCard">
              <div><span>{mode === 'eventSourceLogs' ? 'EventId' : '请求路径'}</span><strong>{mode === 'eventSourceLogs' ? selected.eventId || '-' : selected.path || '-'}</strong></div>
              <div><span>{mode === 'eventSourceLogs' ? '事件类型' : '资源类型'}</span><strong>{mode === 'eventSourceLogs' ? actionText(selected) : resourceLabel(selected.resource)}</strong></div>
              <div><span>{mode === 'eventSourceLogs' ? '返回编码' : '操作动作'}</span><strong>{mode === 'eventSourceLogs' ? selected.code || '-' : actionLabel(selected.action)}</strong></div>
              <div><span>IP</span><strong>{selected.ip || '-'}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>环境信息</strong>
              <p>{selected.userAgent || '-'}</p>
            </section>
            <div className="approvalBlock">
              <strong>{mode === 'eventSourceLogs' ? '事件 Payload' : '请求内容'}</strong>
              <pre>{formatJson(mode === 'eventSourceLogs' ? selected.payload : selected.requestBody)}</pre>
            </div>
            {mode === 'operationLogs' && (objectValue(selected.requestBody).before || objectValue(selected.requestBody).after) && (
              <section className="approvalBlock">
                <strong>变更对比</strong>
                <div className="dataTableWrap">
                  <table className="dataTable compactTable">
                    <thead><tr><th>变更前</th><th>变更后</th></tr></thead>
                    <tbody>
                      <tr>
                        <td><pre>{formatJson(objectValue(selected.requestBody).before)}</pre></td>
                        <td><pre>{formatJson(objectValue(selected.requestBody).after)}</pre></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <section className="approvalBlock">
              <strong>日志标识</strong>
              <p>{selected.id}</p>
            </section>
          </div>
        )}
      </Modal>
    </section>
  );
}
