import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, Send, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { SmsTask } from '../../types';
import { eventLabels, sceneLabels } from '../../constants/labels';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

function taskReason(task: SmsTask) {
  const codeMap: Record<string, string> = {
    PROVIDER_TIMEOUT: '服务商响应超时，可重试',
    PHONE_IN_BLACKLIST: '号码命中黑名单，发送被拦截',
    PHONE_NOT_IN_WHITELIST: '号码不在白名单，发送被拦截',
    TEMPLATE_UNAVAILABLE: '短信模板不可用',
    CONDITION_NOT_MATCHED: '业务条件未满足'
  };
  const reasonMap: Record<string, string> = {
    'Condition immediate_task_verify is treated as pass-through.': '即时任务校验通过，已继续发送。',
    'Event payload indicates user has no active membership.': '事件显示用户未开通会员，符合触达条件。',
    'User has already purchased or owns an active membership.': '用户已购买或仍有有效会员，任务跳过。',
    '服务商超时，可批量重试。': '服务商超时，可批量重试。',
    '号码命中黑名单。': '号码命中黑名单。'
  };
  return codeMap[task.lastErrorCode || ''] || reasonMap[task.conditionReason || ''] || task.lastErrorMessage || task.conditionReason || '-';
}

function timeLabel(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function Tasks({ tasks, onRefresh, setNotice }: { tasks: SmsTask[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  async function runDue() {
    const result = await api<{ processed: number }>('/api/tasks/run-due', {
      method: 'POST',
      body: JSON.stringify({ limit: 20 })
    });
    setNotice(`已执行 ${result.processed} 个到期任务`);
    await onRefresh();
  }

  async function batchCancel() {
    const pending = tasks.filter((task) => task.status === 'pending').map((task) => task.id);
    if (!pending.length) {
      setNotice('当前没有可取消的待执行任务');
      return;
    }
    const result = await api<{ job: { successCount: number; failedCount: number } }>('/api/tasks/batch-cancel', {
      method: 'POST',
      body: JSON.stringify({ taskIds: pending })
    });
    setNotice(`批量取消完成：成功 ${result.job.successCount}，失败 ${result.job.failedCount}`);
    await onRefresh();
  }

  async function batchRetry() {
    const failed = tasks.filter((task) => task.status === 'failed').map((task) => task.id);
    if (!failed.length) {
      setNotice('当前没有可重试的失败任务');
      return;
    }
    const result = await api<{ job: { successCount: number; failedCount: number } }>('/api/tasks/batch-retry', {
      method: 'POST',
      body: JSON.stringify({ taskIds: failed })
    });
    setNotice(`批量重试已入队：成功 ${result.job.successCount}，失败 ${result.job.failedCount}`);
    await onRefresh();
  }

  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const dueCount = tasks.filter((task) => task.status === 'pending' && new Date(task.scheduledAt).getTime() <= Date.now()).length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const blockedCount = tasks.filter((task) => task.status === 'blocked').length;
  const doneCount = tasks.filter((task) => ['success', 'skipped', 'cancelled'].includes(task.status)).length;
  const sendingCount = tasks.filter((task) => task.status === 'sending').length;
  const sortedTasks = [...tasks].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <section className="stack">
      <section className="panel taskIntroPanel">
        <div className="panelTitle">
          <div>
            <h2>任务中心</h2>
            <span>自动化规则命中后生成短信任务，任务中心负责排队、执行、重试和取消。</span>
          </div>
          <div className="headerActions">
            <AuthC authKey="touch:task:batchCancel">
              <button className="secondaryButton compact" type="button" onClick={batchCancel}><XCircle size={16} />批量取消</button>
            </AuthC>
            <AuthC authKey="touch:task:batchRetry">
              <button className="secondaryButton compact" type="button" onClick={batchRetry}><RotateCcw size={16} />批量重试</button>
            </AuthC>
            <AuthC authKey="touch:task:runDue">
              <button className="primaryButton compact" type="button" onClick={runDue}><Clock3 size={16} />执行到期任务</button>
            </AuthC>
          </div>
        </div>

        <div className="taskMetricGrid compact">
          <article className="secondaryMetric blue"><div><Clock3 size={18} /></div><span>待发送</span><strong>{pendingCount}</strong></article>
          <article className="secondaryMetric amber"><div><Send size={18} /></div><span>已到期</span><strong>{dueCount}</strong></article>
          <article className="secondaryMetric red"><div><AlertTriangle size={18} /></div><span>失败/拦截</span><strong>{failedCount + blockedCount}</strong></article>
          <article className="secondaryMetric green"><div><CheckCircle2 size={18} /></div><span>已完成</span><strong>{doneCount}</strong></article>
        </div>

        <div className="taskQueueSummary">
          <span>当前队列：待发送 {pendingCount} 条</span>
          <span>发送中 {sendingCount} 条</span>
          <span>失败 {failedCount} 条</span>
          <span>拦截 {blockedCount} 条</span>
          <span>已完成 {doneCount} 条</span>
        </div>

        <div className="taskSectionTitle">
          <div>
            <h2>任务明细</h2>
            <span>这里就是当前所有短信任务的位置，按计划发送时间排序。</span>
          </div>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable taskTable">
            <thead><tr><th>任务</th><th>来源</th><th>计划/发送时间</th><th>状态</th><th>次数</th><th>处理说明</th></tr></thead>
            <tbody>
              {sortedTasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <strong>{task.templateName || task.templateCode}</strong>
                    <span>{sceneLabels[task.scene] || task.scene} · {task.phoneMasked}</span>
                  </td>
                  <td>
                    <strong>{task.ruleName || '手动任务'}</strong>
                    <span>{eventLabels[task.eventType || ''] || task.eventType || task.triggerType}</span>
                  </td>
                  <td>
                    <strong>{timeLabel(task.scheduledAt)}</strong>
                    <span>发送：{timeLabel(task.sentAt)}</span>
                  </td>
                  <td><StatusBadge status={task.status} /></td>
                  <td>{task.attemptCount}/{task.maxAttempts}</td>
                  <td>{taskReason(task)}</td>
                </tr>
              ))}
              {!sortedTasks.length && <TableEmptyState colSpan={6} title="暂无任务明细" description="当前没有待发送、发送中、失败或已完成的短信任务。" />}
            </tbody>
          </table>
        </div>
      </section>

      <section className="taskExplainGrid">
        <article><Clock3 size={18} /><strong>待发送任务</strong><span>事件已命中规则，但还没到计划发送时间。</span></article>
        <article><Send size={18} /><strong>到期执行</strong><span>执行到期任务会走条件校验、白名单、黑名单、频控和服务商发送。</span></article>
        <article><RotateCcw size={18} /><strong>失败重试</strong><span>服务商异常或可恢复失败任务，可批量重新入队。</span></article>
        <article><XCircle size={18} /><strong>取消任务</strong><span>未发送的 pending 任务可取消，取消后 worker 不会再执行。</span></article>
      </section>
    </section>
  );
}
