import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Eye, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { actionLabel, approvalStatusLabel, operationLabel, resourceLabel } from '../../constants/labels';
import type { ApprovalItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';

const emptyFilters = { keyword: '', resource: '', action: '', status: '', dateFrom: '', dateTo: '' };

function approvalStatus(status: string) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'failed';
  if (status === 'withdrawn') return 'cancelled';
  return 'pending';
}

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

export default function ApprovalsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [comment, setComment] = useState('');

  async function load(nextFilters = filters) {
    const data = await api<{ items: ApprovalItem[] }>(`/api/approvals?${queryString(nextFilters)}`);
    setItems(data.items);
  }

  useEffect(() => {
    load();
  }, []);

  async function openDetail(item: ApprovalItem) {
    const data = await api<{ item: ApprovalItem }>(`/api/approvals/${item.id}`);
    setSelected(data.item);
  }

  async function act(item: ApprovalItem, action: 'approve' | 'reject' | 'withdraw') {
    const result = await api<{ item: ApprovalItem }>(`/api/approvals/${item.id}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
    setNotice(action === 'approve' ? '审批已通过，对应业务动作已执行' : action === 'reject' ? '审批已驳回' : '审批已撤回');
    setSelected(result.item);
    setComment('');
    await load();
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault();
    load();
  }

  return (
    <section className="panel">
      <div className="panelTitle">
        <div>
          <h2>审批记录</h2>
          <span>高风险操作从业务动作发起，审批通过后才执行</span>
        </div>
      </div>

      <form className="filterBar" onSubmit={applyFilters}>
        <input value={filters.keyword} onChange={(event) => setFilters({ ...filters, keyword: event.target.value })} placeholder="标题 / 资源 / 动作" />
        <input value={filters.resource} onChange={(event) => setFilters({ ...filters, resource: event.target.value })} placeholder="资源类型" />
        <input value={filters.action} onChange={(event) => setFilters({ ...filters, action: event.target.value })} placeholder="动作" />
        <SelectField
          value={filters.status}
          options={[
            { value: '', label: '全部状态' },
            { value: 'pending', label: '待审批' },
            { value: 'approved', label: '已通过' },
            { value: 'rejected', label: '已驳回' },
            { value: 'withdrawn', label: '已撤回' }
          ]}
          onChange={(status) => setFilters({ ...filters, status })}
        />
        <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
        <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
        <button className="primaryButton compact" type="submit"><Search size={16} />查询</button>
      </form>

      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>审批</th><th>场景</th><th>影响对象</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => {
              const summary = item.payload?.summary || item.payload;
              return (
                <tr key={item.id}>
                  <td><strong>{item.title}</strong><span>{operationLabel(item.resource, item.action)}</span></td>
                  <td>{summary?.scenario || '-'}</td>
                  <td>{summary?.impact?.title || item.resourceId || '-'}</td>
                  <td><StatusBadge status={approvalStatus(item.status)} /></td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td><button className="tableButton" type="button" onClick={() => openDetail(item)}><Eye size={15} />详情</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(selected)} title="审批详情" subtitle={selected?.title} onClose={() => setSelected(null)}>
        {selected && (
          <div className="approvalDetail">
            <div className="approvalSummaryGrid">
              <div><span>审批场景</span><strong>{selected.payload?.summary?.scenario || selected.payload?.scenario || '-'}</strong></div>
              <div><span>风险等级</span><strong>{selected.payload?.summary?.riskLevel || selected.payload?.riskLevel || '-'}</strong></div>
              <div><span>资源类型</span><strong>{resourceLabel(selected.resource)}</strong></div>
              <div><span>当前状态</span><StatusBadge status={approvalStatus(selected.status)} /></div>
            </div>
            <section className="approvalBlock">
              <strong>申请原因</strong>
              <p>{selected.payload?.summary?.reason || selected.payload?.reason || '-'}</p>
            </section>
            <section className="approvalBlock">
              <strong>影响范围</strong>
              <p>{selected.payload?.summary?.impact?.description || selected.payload?.impact?.description || '-'}</p>
            </section>
            <section className="approvalBlock">
              <strong>变更内容</strong>
              <pre>{formatJson({ before: selected.payload?.before, after: selected.payload?.after, execute: selected.payload?.execute, executeResult: selected.payload?.executeResult })}</pre>
            </section>
            <section className="approvalBlock">
              <strong>处理记录</strong>
              <div className="approvalRecords">
                {(selected.records || []).map((record) => (
                  <div key={record.id}>
                    <span>{actionLabel(record.action)} · {new Date(record.createdAt).toLocaleString()}</span>
                    <p>{record.comment || '-'}</p>
                  </div>
                ))}
              </div>
            </section>
            {selected.status === 'pending' && (
              <div className="formPanel">
                <label>审批意见<input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="填写通过、驳回或撤回理由" /></label>
                <div className="modalActions">
                  <button className="secondaryButton compact" type="button" onClick={() => act(selected, 'withdraw')}>撤回</button>
                  <button className="secondaryButton compact" type="button" onClick={() => act(selected, 'reject')}>驳回</button>
                  <button className="primaryButton compact" type="button" onClick={() => act(selected, 'approve')}><ClipboardCheck size={16} />通过并执行</button>
                </div>
              </div>
            )}
            {selected.status !== 'pending' && <div className="fieldBlock"><span>审批结果</span><strong>{approvalStatusLabel(selected.status)}</strong></div>}
          </div>
        )}
      </Modal>
    </section>
  );
}
