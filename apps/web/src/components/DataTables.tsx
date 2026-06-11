import { eventLabels, sceneLabels } from '../constants/labels';
import type { SendLog, SmsTask } from '../types';
import { TableEmptyState } from './EmptyState';
import { StatusBadge } from './StatusBadge';

export function TaskTable({ tasks, showDetail = false }: { tasks: SmsTask[]; showDetail?: boolean }) {
  return (
    <div className="dataTableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>计划时间</th>
            <th>触发</th>
            <th>场景</th>
            <th>手机号</th>
            <th>模板</th>
            <th>状态</th>
            <th>尝试</th>
            {showDetail && <th>结果</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{new Date(task.scheduledAt).toLocaleString()}</td>
              <td>{task.triggerType === 'auto' ? eventLabels[task.eventType || ''] || '自动' : '手动'}</td>
              <td>{sceneLabels[task.scene] || task.scene}</td>
              <td>{task.phoneMasked}</td>
              <td>{task.templateName || task.templateCode}</td>
              <td><StatusBadge status={task.status} /></td>
              <td>{task.attemptCount}/{task.maxAttempts}</td>
              {showDetail && (
                <td>
                  {task.logId ? <span>日志 {task.logId.slice(0, 8)}</span> : <span>{task.lastErrorCode || '-'}</span>}
                  {task.conditionResult && <span>条件：{task.conditionResult}</span>}
                  {task.conditionReason && <span>{task.conditionReason}</span>}
                  {task.lastErrorMessage && <span>{task.lastErrorMessage}</span>}
                </td>
              )}
            </tr>
          ))}
          {!tasks.length && <TableEmptyState colSpan={showDetail ? 8 : 7} title="暂无短信任务" description="当前还没有待发送、发送中或已完成的短信任务。" />}
        </tbody>
      </table>
    </div>
  );
}

export function LogTable({ logs }: { logs: SendLog[]; showActions?: boolean }) {
  return (
    <div className="dataTableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>时间</th>
            <th>触发</th>
            <th>场景</th>
            <th>手机号</th>
            <th>模板</th>
            <th>状态</th>
            <th>回执</th>
            <th>短链</th>
            <th>返回</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.triggerType === 'auto' ? '自动' : '手动'}</td>
              <td>{sceneLabels[log.scene] || log.scene}</td>
              <td>{log.phoneMasked}</td>
              <td>{log.templateName || log.templateCode}</td>
              <td><StatusBadge status={log.status} /></td>
              <td>{log.receiptStatus || '-'}</td>
              <td>
                {log.shortUrl ? (
                  <a href={log.shortUrl} target="_blank" rel="noreferrer">打开 · {log.clickCount || 0}</a>
                ) : '-'}
              </td>
              <td><strong>{log.code}</strong><span>{log.message}</span></td>
            </tr>
          ))}
          {!logs.length && <TableEmptyState colSpan={9} title="暂无发送记录" description="当前筛选条件下没有短信发送记录。" />}
        </tbody>
      </table>
    </div>
  );
}
