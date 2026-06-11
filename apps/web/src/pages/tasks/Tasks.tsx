import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Eye, RotateCcw, Send, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { EventItem, Rule, SendLog, SmsTask, Template } from '../../types';
import { eventLabels, sceneLabels, statusLabel } from '../../constants/labels';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { Modal } from '../../components/Modal';
import { TableEmptyState } from '../../components/EmptyState';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';

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
    '服务商超时，可批量重试。': '服务商超时，可重试。',
    '号码命中黑名单。': '号码命中黑名单。'
  };
  return codeMap[task.lastErrorCode || ''] || reasonMap[task.conditionReason || ''] || task.lastErrorMessage || task.conditionReason || '-';
}

function timeLabel(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function jumpTo(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  window.history.pushState({}, '', `${path}?${query.toString()}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const statusTabs = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待发送' },
  { value: 'failed', label: '失败' },
  { value: 'blocked', label: '拦截' },
  { value: 'skipped', label: '跳过' },
  { value: 'success', label: '成功' },
  { value: 'cancelled', label: '已取消' }
];

export default function Tasks({
  tasks,
  events,
  rules,
  templates,
  logs,
  onRefresh,
  setNotice
}: {
  tasks: SmsTask[];
  events: EventItem[];
  rules: Rule[];
  templates: Template[];
  logs: SendLog[];
  onRefresh: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const urlParams = new URLSearchParams(window.location.search);
  const [statusTab, setStatusTab] = useState(urlParams.get('status') || 'all');
  const [filters, setFilters] = useState<QueryFilterValues>({
    keyword: urlParams.get('eventId') || urlParams.get('ruleId') || '',
    scene: '',
    triggerType: ''
  });
  const [detail, setDetail] = useState<SmsTask | null>(null);

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
    if (!window.confirm(`确认取消 ${pending.length} 条待发送任务？`)) return;
    const result = await api<{ job: { id: string; successCount: number; failedCount: number } }>('/api/tasks/batch-cancel', {
      method: 'POST',
      body: JSON.stringify({ taskIds: pending })
    });
    setNotice(`批量取消完成：成功 ${result.job.successCount}，失败 ${result.job.failedCount}`);
    await onRefresh();
    jumpTo('/audit/batch-jobs', { jobId: result.job.id });
  }

  async function batchRetry() {
    const failed = tasks.filter((task) => task.status === 'failed').map((task) => task.id);
    if (!failed.length) {
      setNotice('当前没有可重试的失败任务');
      return;
    }
    if (!window.confirm(`确认重试 ${failed.length} 条失败任务？`)) return;
    const result = await api<{ job: { id: string; successCount: number; failedCount: number } }>('/api/tasks/batch-retry', {
      method: 'POST',
      body: JSON.stringify({ taskIds: failed })
    });
    setNotice(`批量重试已入队：成功 ${result.job.successCount}，失败 ${result.job.failedCount}`);
    await onRefresh();
    jumpTo('/audit/batch-jobs', { jobId: result.job.id });
  }

  async function cancelOne(task: SmsTask) {
    if (!window.confirm(`确认取消任务 ${task.id}？`)) return;
    const result = await api<{ item: SmsTask }>(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
    setNotice(`任务已${statusLabel(result.item.status)}`);
    await onRefresh();
  }

  async function retryOne(task: SmsTask) {
    if (!window.confirm(`确认重试任务 ${task.id}？`)) return;
    const result = await api<{ success: boolean; status: string; code?: string }>(`/api/tasks/${task.id}/retry`, { method: 'POST' });
    setNotice(`重试结果：${statusLabel(result.status)}${result.code ? ` · ${result.code}` : ''}`);
    await onRefresh();
  }

  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const dueCount = tasks.filter((task) => task.status === 'pending' && new Date(task.scheduledAt).getTime() <= Date.now()).length;
  const failedCount = tasks.filter((task) => task.status === 'failed').length;
  const blockedCount = tasks.filter((task) => task.status === 'blocked').length;
  const doneCount = tasks.filter((task) => ['success', 'skipped', 'cancelled'].includes(task.status)).length;
  const sendingCount = tasks.filter((task) => task.status === 'sending').length;

  const sceneOptions = useMemo(() => {
    const scenes = Array.from(new Set(tasks.map((task) => task.scene).filter(Boolean)));
    return scenes.map((scene) => ({ value: scene, label: sceneLabels[scene] || scene }));
  }, [tasks]);

  const filteredTasks = useMemo(() => tasks
    .filter((task) => statusTab === 'all' || task.status === statusTab)
    .filter((task) => !filters.scene || task.scene === filters.scene)
    .filter((task) => !filters.triggerType || task.triggerType === filters.triggerType)
    .filter((task) => {
      const key = filters.keyword.trim().toLowerCase();
      if (!key) return true;
      return [task.id, task.ruleId, task.ruleName, task.eventId, task.templateName, task.templateCode, task.phoneMasked]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(key));
    })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()), [tasks, statusTab, filters]);

  function search(nextFilters: QueryFilterValues) {
    setFilters({ keyword: '', scene: '', triggerType: '', ...nextFilters });
  }

  const detailEvent = events.find((event) => event.eventId === detail?.eventId);
  const detailRule = rules.find((rule) => rule.id === detail?.ruleId);
  const detailTemplate = templates.find((template) => template.id === detail?.templateId);
  const detailLog = logs.find((log) => log.id === detail?.logId || log.eventId === detail?.eventId);

  function rowActions(task: SmsTask) {
    if (task.status === 'pending') return <button className="tableButton danger compact" type="button" onClick={() => cancelOne(task)}><XCircle size={15} />取消</button>;
    if (task.status === 'failed') return <button className="tableButton compact" type="button" onClick={() => retryOne(task)}><RotateCcw size={15} />重试</button>;
    if (task.status === 'success') return <button className="tableButton compact" type="button" onClick={() => jumpTo('/data/send-logs', { logId: task.logId || '' })}>发送记录</button>;
    if (['blocked', 'skipped'].includes(task.status)) return <button className="tableButton compact" type="button" onClick={() => setDetail(task)}>查看原因</button>;
    return null;
  }

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

        <div className="statusTabs">
          {statusTabs.map((tab) => (
            <button className={statusTab === tab.value ? 'active' : ''} type="button" key={tab.value} onClick={() => setStatusTab(tab.value)}>{tab.label}</button>
          ))}
        </div>
        <QueryFilterBar
          fields={[
            { name: 'keyword', label: '任务筛选', placeholder: '任务/事件/规则/模板/手机号', span: 8 },
            { name: 'scene', label: '场景', type: 'select', placeholder: '全部场景', options: sceneOptions },
            { name: 'triggerType', label: '触发方式', type: 'select', placeholder: '全部方式', options: [{ value: 'auto', label: '自动触发' }, { value: 'manual', label: '手动发送' }] }
          ]}
          values={filters}
          onChange={(value) => setFilters({ keyword: '', scene: '', triggerType: '', ...value })}
          onSearch={search}
        />

        <div className="taskSectionTitle">
          <div>
            <h2>任务明细</h2>
            <span>按计划发送时间排序，支持查看详情和行级处理。</span>
          </div>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable taskTable">
            <thead><tr><th>任务</th><th>来源</th><th>计划/发送时间</th><th>状态</th><th>次数</th><th>处理说明</th><th>操作</th></tr></thead>
            <tbody>
              {filteredTasks.map((task) => (
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
                  <td>
                    <div className="tableActions">
                      <button className="tableButton compact" type="button" onClick={() => setDetail(task)}><Eye size={15} />详情</button>
                      {rowActions(task)}
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredTasks.length && <TableEmptyState colSpan={7} title="暂无任务明细" description="当前筛选条件下没有短信任务。" />}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={Boolean(detail)} title="任务详情" subtitle={detail?.id} onClose={() => setDetail(null)} size="wide">
        <div className="stack">
          <div className="ruleMetaGrid">
            <div><span>状态</span><strong>{detail ? statusLabel(detail.status) : '-'}</strong></div>
            <div><span>场景</span><strong>{detail ? sceneLabels[detail.scene] || detail.scene : '-'}</strong></div>
            <div><span>计划时间</span><strong>{timeLabel(detail?.scheduledAt)}</strong></div>
            <div><span>发送时间</span><strong>{timeLabel(detail?.sentAt)}</strong></div>
          </div>
          <div className="detailCard">
            <div><span>处理说明</span><strong>{detail ? taskReason(detail) : '-'}</strong></div>
            <div><span>关联事件</span><strong>{detailEvent ? `${eventLabels[detailEvent.eventType] || detailEvent.eventType} · ${detailEvent.eventId}` : detail?.eventId || '无'}</strong></div>
            <div><span>关联规则</span><strong>{detailRule ? detailRule.name : detail?.ruleName || '无'}</strong></div>
            <div><span>关联模板</span><strong>{detailTemplate ? `${detailTemplate.name} · ${detailTemplate.providerTemplateId}` : detail?.templateName || detail?.templateCode || '-'}</strong></div>
            <div><span>关联发送记录</span><strong>{detailLog ? `${statusLabel(detailLog.status)} · ${detailLog.requestId || detailLog.id}` : detail?.logId || '暂无'}</strong></div>
          </div>
          <div className="modalActions">
            {detail?.eventId && <button className="secondaryButton compact" type="button" onClick={() => jumpTo('/touch/events', { eventId: detail.eventId || '' })}>查看关联事件</button>}
            {detail?.ruleId && <button className="secondaryButton compact" type="button" onClick={() => jumpTo('/touch/rules', { ruleId: detail.ruleId || '' })}>查看关联规则</button>}
            {detail?.templateId && <button className="secondaryButton compact" type="button" onClick={() => jumpTo('/touch/templates', { templateId: detail.templateId || '' })}>查看关联模板</button>}
            {detail?.logId && <button className="secondaryButton compact" type="button" onClick={() => jumpTo('/data/send-logs', { logId: detail.logId || '' })}>查看发送记录</button>}
          </div>
        </div>
      </Modal>
    </section>
  );
}
