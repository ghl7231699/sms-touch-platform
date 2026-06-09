import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { api } from '../../lib/api';
import type { ExportTaskItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export default function ExportTasksPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [items, setItems] = useState<ExportTaskItem[]>([]);
  async function load() {
    const data = await api<{ items: ExportTaskItem[] }>('/api/export-tasks?pageSize=80');
    setItems(data.items);
  }
  useEffect(() => {
    load();
  }, []);
  async function create() {
    await api('/api/export-tasks', {
      method: 'POST',
      body: JSON.stringify({ resource: 'operation_log', name: '操作日志导出' })
    });
    setNotice('导出任务已生成');
    await load();
  }
  return (
    <section className="panel">
      <div className="panelTitle"><h2>导出任务</h2><button className="secondaryButton compact" onClick={create}><FileText size={16} />新建导出</button></div>
      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>任务</th><th>资源</th><th>文件</th><th>状态</th><th>时间</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.resource}</td><td>{item.fileName || '-'}</td><td><StatusBadge status={item.status === 'completed' ? 'success' : item.status} /></td><td>{new Date(item.createdAt).toLocaleString()}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

