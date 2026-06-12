import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { actionLabel, approvalStatusLabel, operationLabel, resourceLabel } from '../../constants/labels';
import type { ApprovalItem } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

const emptyFilters = { keyword: '', resource: '', action: '', status: '', dateFrom: '', dateTo: '' };

function approvalStatus(status: string) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'failed';
  if (status === 'withdrawn') return 'cancelled';
  return 'approval_pending';
}

function formatJson(value: unknown) {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function ApprovalsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [comment, setComment] = useState('');
  const [actionConfirm, setActionConfirm] = useState<{ item: ApprovalItem; action: 'approve' | 'reject' | 'withdraw' } | null>(null);

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: ApprovalItem[]; total: number; page: number; pageSize: number }>(`/api/approvals?${withPaginationParams(nextFilters, nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
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
    setActionConfirm(null);
    setComment('');
    await load();
  }

  function executeResultSummary(value: unknown) {
    if (!value || typeof value !== 'object') return '-';
    const result = value as { type?: string; executed?: boolean; result?: Record<string, unknown>; message?: string };
    if (result.result?.exportTaskId) return `导出任务 ${String(result.result.exportTaskId).slice(0, 8)} 已生成`;
    if (result.result?.appliedKeys) return `已应用配置：${(result.result.appliedKeys as string[]).join('、')}`;
    if (result.result?.ruleId) return `规则 ${String(result.result.ruleId).slice(0, 8)} 状态已更新`;
    return result.message || result.type || JSON.stringify(value);
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
          <h1>审批记录</h1>
          <p>高风险操作从业务动作发起，审批通过后才执行。</p>
        </div>
      </div>

      <QueryFilterBar
        fields={[
          { name: 'keyword', label: '关键词', placeholder: '标题 / 资源 / 动作' },
          { name: 'resource', label: '资源类型', placeholder: '请输入资源类型' },
          { name: 'action', label: '动作', placeholder: '请输入动作' },
          {
            name: 'status',
            label: '状态',
            type: 'select',
            placeholder: '全部状态',
            options: [
              { value: 'pending', label: '待审批' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '已驳回' },
              { value: 'withdrawn', label: '已撤回' }
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
                  <td>
                    <AuthC authKey="audit:approval:detail">
                      <button className="tableButton" type="button" onClick={() => openDetail(item)}>详情</button>
                    </AuthC>
                  </td>
                </tr>
              );
            })}
            {!items.length && <TableEmptyState colSpan={6} title="暂无审批记录" description="高风险操作提交审批后，会在这里展示处理进度和结果。" />}
          </tbody>
        </table>
      </div>
      <ListPagination pagination={pagination} onChange={changePage} />

      <Modal open={Boolean(selected)} title="审批详情" onClose={() => setSelected(null)} size="wide">
        {selected && (
          <div className="approvalDetail">
            <div className="approvalSummaryGrid">
              <div><span>审批标题</span><strong>{selected.title}</strong></div>
              <div><span>审批场景</span><strong>{selected.payload?.summary?.scenario || selected.payload?.scenario || '-'}</strong></div>
              <div><span>风险等级</span><strong>{selected.payload?.summary?.riskLevel || selected.payload?.riskLevel || '-'}</strong></div>
              <div><span>当前状态</span><StatusBadge status={approvalStatus(selected.status)} /></div>
            </div>
            <div className="detailCard">
              <div><span>资源类型</span><strong>{resourceLabel(selected.resource)}</strong></div>
              <div><span>操作动作</span><strong>{operationLabel(selected.resource, selected.action)}</strong></div>
              <div><span>资源 ID</span><strong>{selected.resourceId || '-'}</strong></div>
              <div><span>提交时间</span><strong>{formatTime(selected.createdAt)}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>申请原因</strong>
              <p>{selected.payload?.summary?.reason || selected.payload?.reason || '-'}</p>
            </section>
            <section className="approvalBlock">
              <strong>风险说明</strong>
              <p>{selected.status === 'pending' ? '该审批仍在等待处理，通过后会执行对应业务动作；驳回或撤回则不会执行。' : `该审批已${approvalStatusLabel(selected.status)}，不会再展示处理按钮。`}</p>
            </section>
            <section className="approvalBlock">
              <strong>影响范围</strong>
              <p>{selected.payload?.summary?.impact?.description || selected.payload?.impact?.description || '-'}</p>
            </section>
            <section className="approvalBlock">
              <strong>变更内容</strong>
              <pre>{formatJson({ before: selected.payload?.before, after: selected.payload?.after, execute: selected.payload?.execute, executeResult: selected.payload?.executeResult })}</pre>
            </section>
            {Boolean(selected.payload?.executeResult) && (
              <section className="approvalBlock">
                <strong>执行结果</strong>
                <p>{executeResultSummary(selected.payload?.executeResult)}</p>
              </section>
            )}
            <section className="approvalBlock">
              <strong>处理记录</strong>
              <div className="approvalRecords">
                {(selected.records || []).length ? selected.records?.map((record) => (
                  <div key={record.id}>
                    <span>{actionLabel(record.action)} · {formatTime(record.createdAt)}</span>
                    <p>{record.comment || '-'}</p>
                  </div>
                )) : <p>暂无处理记录</p>}
              </div>
            </section>
            {selected.status === 'pending' && (
              <div className="formPanel">
                <div className="modalActions">
                  <AuthC authKey="audit:approval:withdraw">
                    <button className="secondaryButton compact" type="button" onClick={() => setActionConfirm({ item: selected, action: 'withdraw' })}>撤回</button>
                  </AuthC>
                  <AuthC authKey="audit:approval:reject">
                    <button className="secondaryButton compact" type="button" onClick={() => setActionConfirm({ item: selected, action: 'reject' })}>驳回</button>
                  </AuthC>
                  <AuthC authKey="audit:approval:approve">
                    <button className="primaryButton compact" type="button" onClick={() => setActionConfirm({ item: selected, action: 'approve' })}>通过</button>
                  </AuthC>
                </div>
              </div>
            )}
            {selected.status !== 'pending' && (
              <>
                <div className="fieldBlock"><span>审批结果</span><strong>{approvalStatusLabel(selected.status)}</strong></div>
                <div className="modalActions">
                  <button className="primaryButton compact" type="button" onClick={() => setSelected(null)}>关闭</button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(actionConfirm)} title="确认审批操作" subtitle={actionConfirm?.item.title} onClose={() => setActionConfirm(null)} showClose={false}>
        {actionConfirm && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>操作</span><strong>{actionLabel(actionConfirm.action)}</strong></div>
              <div><span>审批状态</span><StatusBadge status={approvalStatus(actionConfirm.item.status)} /></div>
              <div><span>资源</span><strong>{resourceLabel(actionConfirm.item.resource)}</strong></div>
              <div><span>影响对象</span><strong>{actionConfirm.item.payload?.summary?.impact?.title || actionConfirm.item.resourceId || '-'}</strong></div>
            </div>
            <label>审批意见<input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="填写处理理由" /></label>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setActionConfirm(null)}>取消</button>
              <button className="primaryButton compact" type="button" onClick={() => act(actionConfirm.item, actionConfirm.action)}>确认{actionLabel(actionConfirm.action)}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
