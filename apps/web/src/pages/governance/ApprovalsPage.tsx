import { useEffect, useState } from 'react';
import { ClipboardCheck, Eye } from 'lucide-react';
import { api } from '../../lib/api';
import { operationLabel, resourceLabel } from '../../constants/labels';
import type { ApprovalItem } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

function approvalStatus(status: string) {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'failed';
  if (status === 'withdrawn') return 'cancelled';
  return 'pending';
}

function formatJson(value: unknown) {
  if (!value) return '-';
  return JSON.stringify(value, null, 2);
}

export default function ApprovalsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [selected, setSelected] = useState<ApprovalItem | null>(null);
  const [comment, setComment] = useState('');

  async function load() {
    const data = await api<{ items: ApprovalItem[] }>('/api/approvals?pageSize=80');
    setItems(data.items);
  }

  useEffect(() => {
    load();
  }, []);

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

  return (
    <section className="panel">
      <div className="panelTitle">
        <div>
          <h2>审批记录</h2>
          <span>高风险操作从业务动作发起，审批通过后才执行</span>
        </div>
      </div>
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
                  <td><button className="tableButton" type="button" onClick={() => setSelected(item)}><Eye size={15} />详情</button></td>
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
                    <span>{record.action} · {new Date(record.createdAt).toLocaleString()}</span>
                    <p>{record.comment || '-'}</p>
                  </div>
                ))}
              </div>
            </section>
            {selected.status === 'pending' && (
              <div className="formPanel">
                <label>审批意见<input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="填写通过或驳回理由" /></label>
                <div className="modalActions">
                  <button className="secondaryButton compact" type="button" onClick={() => act(selected, 'reject')}>驳回</button>
                  <button className="primaryButton compact" type="button" onClick={() => act(selected, 'approve')}><ClipboardCheck size={16} />通过并执行</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
