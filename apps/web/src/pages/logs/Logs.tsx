import type { SendLog } from '../../types';
import { LogTable } from '../../components/DataTables';

export default function Logs({ logs }: { logs: SendLog[] }) {
  return (
    <section className="panel">
      <div className="panelTitle">
        <h2>发送记录</h2>
        <span>{logs.length} 条</span>
      </div>
      <LogTable logs={logs} showActions />
    </section>
  );
}

