import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { api } from '../../lib/api';
import type { ApprovalItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export default function ApprovalsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  async function load() {
    const data = await api<{ items: ApprovalItem[] }>('/api/approvals?pageSize=80');
    setItems(data.items);
  }
  useEffect(() => {
    load();
  }, []);
  async function create() {
    await api('/api/approvals', {
      method: 'POST',
      body: JSON.stringify({ title: '真实发送配置变更审批', resource: 'system_setting', action: 'update' })
    });
    setNotice('审批单已创建');
    await load();
  }
  async function act(item: ApprovalItem, action: 'approve' | 'reject') {
    await api(`/api/approvals/${item.id}/${action}`, { method: 'POST', body: JSON.stringify({ comment: action === 'approve' ? '同意' : '驳回' }) });
    setNotice('审批已处理');
    await load();
  }
  return (
    <section className="panel">
      <div className="panelTitle"><h2>审批记录</h2><button className="secondaryButton compact" onClick={create}><ClipboardCheck size={16} />新建审批</button></div>
      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>审批</th><th>资源</th><th>动作</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.title}</strong><span>{new Date(item.createdAt).toLocaleString()}</span></td>
                <td>{item.resource}</td>
                <td>{item.action}</td>
                <td><StatusBadge status={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'failed' : 'pending'} /></td>
                <td>{item.status === 'pending' ? <><button className="tableButton" onClick={() => act(item, 'approve')}>通过</button> <button className="tableButton" onClick={() => act(item, 'reject')}>驳回</button></> : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

