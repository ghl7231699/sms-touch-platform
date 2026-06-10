import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { api } from '../../lib/api';
import type { BatchJobItem } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

export default function BatchJobsPage() {
  const [items, setItems] = useState<BatchJobItem[]>([]);
  const [selected, setSelected] = useState<BatchJobItem | null>(null);

  async function load() {
    const data = await api<{ items: BatchJobItem[] }>('/api/batch-jobs?pageSize=80');
    setItems(data.items);
  }

  useEffect(() => {
    load();
  }, []);

  async function openDetail(item: BatchJobItem) {
    const data = await api<{ item: BatchJobItem }>(`/api/batch-jobs/${item.id}`);
    setSelected(data.item);
  }

  return (
    <section className="panel">
      <div className="panelTitle">
        <div>
          <h2>批量操作</h2>
          <span>批次由任务中心、名单导入等真实业务动作生成</span>
        </div>
      </div>
      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>批次</th><th>类型</th><th>进度</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.name}</strong><span>{item.id.slice(0, 8)}</span></td>
                <td>{item.jobType}</td>
                <td>{item.successCount}/{item.totalCount}<span>失败 {item.failedCount}</span></td>
                <td><StatusBadge status={item.status === 'completed' ? 'success' : item.status} /></td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td><button className="tableButton" type="button" onClick={() => openDetail(item)}><Eye size={15} />明细</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(selected)} title="批量操作明细" subtitle={selected?.name} onClose={() => setSelected(null)}>
        {selected && (
          <div className="batchDetail">
            <div className="approvalSummaryGrid">
              <div><span>总数</span><strong>{selected.totalCount}</strong></div>
              <div><span>成功</span><strong>{selected.successCount}</strong></div>
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
