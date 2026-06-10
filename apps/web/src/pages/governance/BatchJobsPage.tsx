import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../../lib/api';
import { batchJobLabel } from '../../constants/labels';
import type { BatchJobItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';

const emptyFilters = { keyword: '', jobType: '', status: '', dateFrom: '', dateTo: '' };

function queryString(filters: Record<string, string>) {
  const params = new URLSearchParams({ pageSize: '80' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default function BatchJobsPage() {
  const [items, setItems] = useState<BatchJobItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<BatchJobItem | null>(null);

  async function load(nextFilters = filters) {
    const data = await api<{ items: BatchJobItem[] }>(`/api/batch-jobs?${queryString(nextFilters)}`);
    setItems(data.items);
  }

  useEffect(() => {
    load();
  }, []);

  async function openDetail(item: BatchJobItem) {
    const data = await api<{ item: BatchJobItem }>(`/api/batch-jobs/${item.id}`);
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
          <h2>批量操作</h2>
          <span>批次由任务中心、名单导入等真实业务动作生成</span>
        </div>
      </div>

      <form className="filterBar" onSubmit={applyFilters}>
        <input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="批次名称 / 类型" />
        <SelectField
          value={filters.jobType}
          options={[
            { value: '', label: '全部类型' },
            { value: 'task_cancel', label: '批量取消任务' },
            { value: 'task_retry', label: '批量重试任务' },
            { value: 'blacklist_import', label: '导入黑名单' },
            { value: 'unsubscribe_import', label: '导入退订' }
          ]}
          onChange={(jobType) => setFilters({ ...filters, jobType })}
        />
        <SelectField
          value={filters.status}
          options={[{ value: '', label: '全部状态' }, { value: 'completed', label: '已完成' }, { value: 'partial_failed', label: '部分失败' }, { value: 'failed', label: '失败' }]}
          onChange={(status) => setFilters({ ...filters, status })}
        />
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        <button className="primaryButton compact" type="submit"><Search size={16} />查询</button>
      </form>

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
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(selected)} title="批量操作明细" subtitle={selected?.name} onClose={() => setSelected(null)}>
        {selected && (
          <div className="batchDetail">
            <div className="approvalSummaryGrid">
              <div><span>类型</span><strong>{batchJobLabel(selected.jobType)}</strong></div>
              <div><span>成功</span><strong>{selected.successCount}/{selected.totalCount}</strong></div>
              <div><span>失败</span><strong>{selected.failedCount}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'completed' ? 'success' : selected.status} /></div>
            </div>
            <div className="dataTableWrap">
              <table className="dataTable compactTable">
                <thead><tr><th>对象</th><th>状态</th><th>原因</th></tr></thead>
                <tbody>
                  {(selected.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.target}</td>
                      <td><StatusBadge status={item.status === 'success' ? 'success' : 'failed'} /></td>
                      <td>{item.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
