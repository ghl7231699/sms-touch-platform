import { Clock3 } from 'lucide-react';
import { api } from '../../lib/api';
import type { SmsTask } from '../../types';
import { TaskTable } from '../../components/DataTables';

export default function Tasks({ tasks, onRefresh, setNotice }: { tasks: SmsTask[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  async function runDue() {
    const result = await api<{ processed: number }>('/api/tasks/run-due', {
      method: 'POST',
      body: JSON.stringify({ limit: 20 })
    });
    setNotice(`已执行 ${result.processed} 个到期任务`);
    await onRefresh();
  }

  return (
    <section className="panel">
      <div className="panelTitle">
        <h2>任务队列</h2>
        <button className="secondaryButton compact" onClick={runDue}><Clock3 size={16} />执行到期任务</button>
      </div>
      <TaskTable tasks={tasks} showDetail />
    </section>
  );
}

