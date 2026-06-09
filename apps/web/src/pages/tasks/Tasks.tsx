import { Clock3 } from 'lucide-react';
import { api } from '../../lib/api';
import type { SmsTask } from '../../types';
import { sceneLabels } from '../../constants/labels';
import { StatusBadge } from '../../components/StatusBadge';

export default function Tasks({ tasks, onRefresh, setNotice }: { tasks: SmsTask[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  async function runDue() {
    const result = await api<{ processed: number }>('/api/tasks/run-due', {
      method: 'POST',
      body: JSON.stringify({ limit: 20 })
    });
    setNotice(`已执行 ${result.processed} 个到期任务`);
    await onRefresh();
  }

  const groups = [
    { title: '待执行', items: tasks.filter((task) => task.status === 'pending') },
    { title: '异常', items: tasks.filter((task) => ['failed', 'blocked'].includes(task.status)) },
    { title: '已完成', items: tasks.filter((task) => ['success', 'skipped', 'cancelled'].includes(task.status)) }
  ];

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>任务中心</h2>
            <span>按执行状态聚合待办和异常</span>
          </div>
          <button className="secondaryButton compact" onClick={runDue}><Clock3 size={16} />执行到期任务</button>
        </div>
        <div className="taskBoard">
          {groups.map((group) => (
            <section className="taskLane" key={group.title}>
              <div className="taskLaneHeader">
                <strong>{group.title}</strong>
                <span>{group.items.length}</span>
              </div>
              <div className="taskCards">
                {group.items.slice(0, 8).map((task) => (
                  <article className="taskCard" key={task.id}>
                    <div>
                      <strong>{task.templateName || task.templateCode}</strong>
                      <span>{sceneLabels[task.scene] || task.scene} · {new Date(task.scheduledAt).toLocaleString()}</span>
                    </div>
                    <StatusBadge status={task.status} />
                    {(task.lastErrorCode || task.conditionReason) && <p>{task.lastErrorCode || task.conditionReason}</p>}
                  </article>
                ))}
                {!group.items.length && <p>暂无任务</p>}
              </div>
            </section>
          ))}
        </div>
      </section>
    </section>
  );
}
