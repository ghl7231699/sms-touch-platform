import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { batchJobLabel } from '../../constants/labels';
import type { BatchJobItem } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

const emptyFilters = { keyword: '', jobType: '', status: '', dateFrom: '', dateTo: '' };

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export default function BatchJobsPage() {
  const [items, setItems] = useState<BatchJobItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [selected, setSelected] = useState<BatchJobItem | null>(null);

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: BatchJobItem[]; total: number; page: number; pageSize: number }>(`/api/batch-jobs?${withPaginationParams(nextFilters, nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  useEffect(() => {
    load();
  }, []);

  async function openDetail(item: BatchJobItem) {
    const data = await api<{ item: BatchJobItem }>(`/api/batch-jobs/${item.id}`);
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
    <section className="panel">
      <div className="panelTitle">
        <div>
          <h2>批量操作</h2>
          <span>批次由任务中心、名单导入等真实业务动作生成</span>
        </div>
      </div>

      <QueryFilterBar
        fields={[
          { name: 'keyword', label: '关键词', placeholder: '批次名称 / 类型' },
          {
            name: 'jobType',
            label: '类型',
            type: 'select',
            placeholder: '全部类型',
            options: [
              { value: 'task_cancel', label: '批量取消任务' },
              { value: 'task_retry', label: '批量重试任务' },
              { value: 'blacklist_import', label: '导入黑名单' },
              { value: 'unsubscribe_import', label: '导入退订' }
            ]
          },
          {
            name: 'status',
            label: '状态',
            type: 'select',
            placeholder: '全部状态',
            options: [
              { value: 'completed', label: '已完成' },
              { value: 'partial_failed', label: '部分失败' },
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
          <thead><tr><th>批次</th><th>类型</th><th>进度</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong><span>{item.id.slice(0, 8)}</span></td>
                <td>{batchJobLabel(item.jobType)}</td>
                <td>{item.successCount}/{item.totalCount}<span>失败 {item.failedCount}</span></td>
                <td><StatusBadge status={item.status === 'completed' ? 'success' : item.status} /></td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>
                  <AuthC authKey="audit:batchJob:detail">
                    <button className="tableButton" type="button" onClick={() => openDetail(item)}>明细</button>
                  </AuthC>
                </td>
              </tr>
            ))}
            {!items.length && <TableEmptyState colSpan={6} title="暂无批量操作" description="名单导入、任务批量取消或重试后，这里会展示批次执行结果。" />}
          </tbody>
        </table>
      </div>
      <ListPagination pagination={pagination} onChange={changePage} />

      <Modal open={Boolean(selected)} title="批量操作明细" onClose={() => setSelected(null)} size="wide">
        {selected && (
          <div className="batchDetail">
            <div className="approvalSummaryGrid">
              <div><span>类型</span><strong>{batchJobLabel(selected.jobType)}</strong></div>
              <div><span>成功</span><strong>{selected.successCount}/{selected.totalCount}</strong></div>
              <div><span>失败</span><strong>{selected.failedCount}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'completed' ? 'success' : selected.status} /></div>
            </div>
            <section className="approvalBlock">
              <strong>执行进度</strong>
              <div className="progressTrack" aria-label="批量操作执行进度">
                <span style={{ width: `${percent(selected.successCount + selected.failedCount, selected.totalCount)}%` }} />
              </div>
              <p>已处理 {selected.successCount + selected.failedCount} / {selected.totalCount}，成功率 {percent(selected.successCount, selected.totalCount)}%。</p>
            </section>
            <div className="detailCard">
              <div><span>批次名称</span><strong>{selected.name}</strong></div>
              <div><span>批次 ID</span><strong>{selected.id}</strong></div>
              <div><span>创建时间</span><strong>{formatTime(selected.createdAt)}</strong></div>
              <div><span>失败数量</span><strong>{selected.failedCount}</strong></div>
            </div>
            {selected.failedCount > 0 && (
              <section className="approvalBlock">
                <strong>失败概览</strong>
                <p>存在 {selected.failedCount} 条失败记录，请在明细中查看失败原因后重新导入或重新执行对应业务动作。</p>
              </section>
            )}
            <div className="dataTableWrap">
              <table className="dataTable compactTable">
                <thead><tr><th>对象</th><th>状态</th><th>原因</th></tr></thead>
                <tbody>
                  {(selected.items || []).length ? selected.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.target}</td>
                      <td><StatusBadge status={item.status === 'success' ? 'success' : 'failed'} /></td>
                      <td>{item.message || '-'}</td>
                    </tr>
                  )) : <TableEmptyState colSpan={3} title="暂无批次明细" description="当前批次没有可展示的执行明细。" />}
                </tbody>
              </table>
            </div>
            <div className="modalActions">
              <button className="primaryButton compact" type="button" onClick={() => setSelected(null)}>关闭</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
