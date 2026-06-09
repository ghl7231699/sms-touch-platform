import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { BatchJobItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export default function BatchJobsPage() {
  const [items, setItems] = useState<BatchJobItem[]>([]);
  useEffect(() => {
    api<{ items: BatchJobItem[] }>('/api/batch-jobs?pageSize=80').then((data) => setItems(data.items));
  }, []);
  return (
    <section className="panel">
      <div className="panelTitle"><h2>批量操作</h2><span>{items.length} 个批次</span></div>
      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>批次</th><th>类型</th><th>进度</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.jobType}</td><td>{item.successCount}/{item.totalCount}<span>失败 {item.failedCount}</span></td><td><StatusBadge status={item.status === 'completed' ? 'success' : item.status} /></td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

