import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { eventLabels, operationLabel } from '../../constants/labels';
import type { AuditItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export default function AuditPage({ mode }: { mode: 'eventSourceLogs' | 'operationLogs' }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const endpoint = mode === 'eventSourceLogs' ? '/api/event-source-logs' : '/api/operation-logs';
  useEffect(() => {
    api<{ items: AuditItem[] }>(`${endpoint}?pageSize=80`).then((data) => setItems(data.items));
  }, [endpoint]);
  return (
    <section className="panel">
      <div className="panelTitle"><h2>{mode === 'eventSourceLogs' ? '事件接入日志' : '操作日志'}</h2><span>{items.length} 条</span></div>
      <div className="dataTableWrap">
        <table className="dataTable">
          <thead><tr><th>时间</th><th>主体</th><th>动作</th><th>结果</th><th>说明</th></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>{mode === 'eventSourceLogs' ? item.appId || '-' : item.userName || '-'}</td>
                <td>{mode === 'eventSourceLogs' ? eventLabels[item.eventType || ''] || item.eventType || '-' : operationLabel(item.resource, item.action)}</td>
                <td><StatusBadge status={(item.status || item.result) === 'success' ? 'success' : 'failed'} /></td>
                <td><strong>{item.code || '-'}</strong><span>{item.message || '-'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
