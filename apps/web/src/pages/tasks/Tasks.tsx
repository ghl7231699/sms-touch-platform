import { useEffect, useMemo, useState } from 'react';
import { Button } from 'antd';
import { AlertTriangle, CheckCircle2, Clock3, RotateCcw, Send, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { EventItem, Rule, SendLog, SmsTask, Template } from '../../types';
import { eventLabels, sceneLabels, sendStatusKey, statusLabel, taskStatusKey } from '../../constants/labels';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { Modal } from '../../components/Modal';
import { TableEmptyState } from '../../components/EmptyState';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';

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

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return '{}';
  }
}

function jumpTo(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  window.history.pushState({}, '', `${path}?${query.toString()}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const statusTabs = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待发送' },
  { value: 'due', label: '已到期' },
  { value: 'sending', label: '发送中' },
  { value: 'failed', label: '失败' },
  { value: 'blocked', label: '拦截' },
  { value: 'skipped', label: '跳过' },
  { value: 'success', label: '成功' },
  { value: 'cancelled', label: '已取消' }
];

const emptyFilters = { keyword: '', scene: '' };
type TaskActionType = 'cancelPending' | 'retryFailed' | 'runDue';
type TaskActionDialog = {
  type: TaskActionType;
  status: 'confirm' | 'running' | 'done' | 'error';
  title: string;
  description: string;
  processHint: string;
  resultText?: string;
  jobId?: string;
  errorText?: string;
};
type RelatedDetailType = 'event' | 'rule' | 'template' | 'log';

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
    scene: ''
  });
  const [taskItems, setTaskItems] = useState<SmsTask[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [detail, setDetail] = useState<SmsTask | null>(null);
  const [relatedDetail, setRelatedDetail] = useState<RelatedDetailType | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SmsTask | null>(null);
  const [retryTarget, setRetryTarget] = useState<SmsTask | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [operationOpen, setOperationOpen] = useState(false);
  const [actionDialog, setActionDialog] = useState<TaskActionDialog | null>(null);

  async function loadTaskPage(nextFilters = filters, nextPagination = pagination, nextStatus = statusTab) {
    const queryFilters = {
      ...emptyFilters,
      ...nextFilters,
      status: nextStatus === 'all' ? '' : nextStatus === 'due' ? 'pending' : nextStatus,
      dueOnly: nextStatus === 'due' ? '1' : ''
    };
    const data = await api<{ items: SmsTask[]; total: number; page: number; pageSize: number }>(`/api/tasks?${withPaginationParams(queryFilters, nextPagination)}`);
    setTaskItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  async function refreshTasks() {
    await onRefresh();
    await loadTaskPage(filters, pagination, statusTab);
  }

  async function batchCancel() {
    const pending = pendingTasks.map((task) => task.id);
    if (!pending.length) {
      setNotice('当前没有可取消的待执行任务');
      return;
    }
    const result = await api<{ job: { id: string; successCount: number; failedCount: number } }>('/api/tasks/batch-cancel', {
      method: 'POST',
      body: JSON.stringify({ taskIds: pending })
    });
    setNotice(`批量取消完成：成功 ${result.job.successCount}，失败 ${result.job.failedCount}`);
    await refreshTasks();
    return result.job;
  }

  async function batchRetry() {
    const failed = failedTasks.map((task) => task.id);
    if (!failed.length) {
      setNotice('当前没有可重试的失败任务');
      return;
    }
    const result = await api<{ job: { id: string; successCount: number; failedCount: number } }>('/api/tasks/batch-retry', {
      method: 'POST',
      body: JSON.stringify({ taskIds: failed })
    });
    setNotice(`批量重试已入队：成功 ${result.job.successCount}，失败 ${result.job.failedCount}`);
    await refreshTasks();
    return result.job;
  }

  async function cancelOne(task: SmsTask) {
    const result = await api<{ item: SmsTask }>(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
    setNotice(`任务已${statusLabel(taskStatusKey(result.item.status))}`);
    setCancelTarget(null);
    await refreshTasks();
  }

  async function retryOne(task: SmsTask) {
    setRetrying(true);
    try {
      const result = await api<{ success: boolean; status: string; code?: string }>(`/api/tasks/${task.id}/retry`, { method: 'POST' });
      setNotice(`重试结果：${statusLabel(taskStatusKey(result.status))}${result.code ? ` · ${result.code}` : ''}`);
      setRetryTarget(null);
      await refreshTasks();
    } finally {
      setRetrying(false);
    }
  }

  const pendingTasks = tasks.filter((task) => task.status === 'pending');
  const dueTasks = pendingTasks.filter((task) => new Date(task.scheduledAt).getTime() <= Date.now());
  const failedTasks = tasks.filter((task) => task.status === 'failed');
  const pendingCount = pendingTasks.length;
  const dueCount = dueTasks.length;
  const failedCount = failedTasks.length;
  const blockedCount = tasks.filter((task) => task.status === 'blocked').length;
  const sendingCount = tasks.filter((task) => task.status === 'sending').length;

  const statusCounts: Record<string, number> = {
    all: tasks.length,
    pending: pendingCount,
    due: dueCount,
    sending: sendingCount,
    failed: failedCount,
    blocked: blockedCount,
    skipped: tasks.filter((task) => task.status === 'skipped').length,
    success: tasks.filter((task) => task.status === 'success').length,
    cancelled: tasks.filter((task) => task.status === 'cancelled').length
  };

  const summaryCards = [
    { status: 'pending', label: '待发送', value: pendingCount, desc: '还未进入发送动作', tone: 'blue', icon: <Clock3 size={18} /> },
    { status: 'due', label: '已到期', value: dueCount, desc: '计划时间已到，可立即执行', tone: 'amber', icon: <Clock3 size={18} /> },
    { status: 'sending', label: '发送中', value: sendingCount, desc: '正在由 worker 处理', tone: 'cyan', icon: <Send size={18} /> },
    { status: 'failed', label: '失败', value: failedCount, desc: '可进入重试队列', tone: 'red', icon: <AlertTriangle size={18} /> },
    { status: 'blocked', label: '拦截', value: blockedCount, desc: '被风控或名单拦截', tone: 'amber', icon: <AlertTriangle size={18} /> },
    { status: 'success', label: '成功', value: statusCounts.success, desc: '已生成发送记录', tone: 'green', icon: <CheckCircle2 size={18} /> }
  ];

  function selectStatus(nextStatus: string) {
    if (nextStatus === statusTab) {
      loadTaskPage(filters, { ...pagination, page: 1 }, nextStatus).catch((error) => setNotice(error instanceof Error ? error.message : '任务加载失败'));
      return;
    }
    setStatusTab(nextStatus);
  }

  function openTaskAction(type: TaskActionType) {
    const affectedTasks = type === 'cancelPending' ? pendingTasks : type === 'retryFailed' ? failedTasks : dueTasks.slice(0, 20);
    if (!affectedTasks.length) {
      setNotice(type === 'cancelPending' ? '当前没有待发送任务' : type === 'retryFailed' ? '当前没有失败任务' : '当前没有已到期任务');
      return;
    }
    const copy: Record<TaskActionType, Omit<TaskActionDialog, 'status'>> = {
      cancelPending: {
        type,
        title: '取消待发送任务',
        description: `下面 ${pendingCount} 条任务当前处于待发送状态，确认后会被取消。已发送、发送中和已完成任务不会受影响。`,
        processHint: '确认后系统会创建批量操作记录，执行过程可在「审计与流程 / 批量操作」中查看。'
      },
      retryFailed: {
        type,
        title: '重试失败任务',
        description: `下面 ${failedCount} 条任务当前处于失败状态，确认后会重新放回待执行队列。`,
        processHint: '确认后系统会创建批量操作记录，执行过程可在「审计与流程 / 批量操作」中查看。'
      },
      runDue: {
        type,
        title: '执行已到期任务',
        description: `下面 ${Math.min(dueCount, 20)} 条任务计划时间已经到期，确认后会立即执行。当前最多一次处理 20 条。`,
        processHint: '执行过程会更新任务明细状态；成功发送后可在「数据分析 / 发送记录」查看服务商返回和回执。'
      }
    };
    setOperationOpen(false);
    setActionDialog({ ...copy[type], status: 'confirm' });
  }

  async function confirmTaskAction() {
    if (!actionDialog || actionDialog.status === 'running') return;
    setActionDialog({ ...actionDialog, status: 'running', errorText: undefined });
    try {
      if (actionDialog.type === 'cancelPending') {
        const job = await batchCancel();
        if (!job) return setActionDialog(null);
        setActionDialog({
          ...actionDialog,
          status: 'done',
          resultText: `批量取消完成：成功 ${job.successCount} 条，失败 ${job.failedCount} 条。`,
          jobId: job.id
        });
        return;
      }
      if (actionDialog.type === 'retryFailed') {
        const job = await batchRetry();
        if (!job) return setActionDialog(null);
        setActionDialog({
          ...actionDialog,
          status: 'done',
          resultText: `批量重试已入队：成功 ${job.successCount} 条，失败 ${job.failedCount} 条。`,
          jobId: job.id
        });
        return;
      }
      const result = await api<{ processed: number }>('/api/tasks/run-due', {
        method: 'POST',
        body: JSON.stringify({ limit: 20 })
      });
      setNotice(`已执行 ${result.processed} 个到期任务`);
      await refreshTasks();
      setActionDialog({
        ...actionDialog,
        status: 'done',
        resultText: `已处理 ${result.processed} 个到期任务。任务状态已刷新。`
      });
    } catch (error) {
      setActionDialog({
        ...actionDialog,
        status: 'error',
        errorText: error instanceof Error ? error.message : '执行失败'
      });
    }
  }

  function goActionTrace() {
    if (!actionDialog) return;
    const jobId = actionDialog.jobId;
    setActionDialog(null);
    if (jobId) {
      jumpTo('/audit/batch-jobs', { jobId });
      return;
    }
    jumpTo('/data/send-logs', {});
  }

  const actionAffectedTasks = actionDialog
    ? actionDialog.type === 'cancelPending'
      ? pendingTasks
      : actionDialog.type === 'retryFailed'
        ? failedTasks
        : dueTasks.slice(0, 20)
    : [];
  const actionPreviewTasks = actionAffectedTasks.slice(0, 8);

  const sceneOptions = useMemo(() => {
    const scenes = Array.from(new Set(rules.map((rule) => rule.scene).filter(Boolean)));
    return scenes.map((scene) => ({ value: scene, label: sceneLabels[scene] || scene }));
  }, [rules]);

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyFilters, ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    loadTaskPage(typedFilters, nextPagination, statusTab).catch((error) => setNotice(error instanceof Error ? error.message : '任务查询失败'));
  }

  function changePage(page: number, pageSize: number) {
    loadTaskPage(filters, { ...pagination, page, pageSize }, statusTab).catch((error) => setNotice(error instanceof Error ? error.message : '任务加载失败'));
  }

  useEffect(() => {
    const nextPagination = { ...pagination, page: 1 };
    loadTaskPage(filters, nextPagination, statusTab).catch((error) => setNotice(error instanceof Error ? error.message : '任务加载失败'));
  }, [statusTab]);

  const detailEvent = events.find((event) => event.eventId === detail?.eventId);
  const detailRule = rules.find((rule) => rule.id === detail?.ruleId);
  const detailTemplate = templates.find((template) => template.id === detail?.templateId);
  const detailLog = logs.find((log) => log.id === detail?.logId || log.eventId === detail?.eventId);

  function rowActions(task: SmsTask) {
    if (task.status === 'pending') return <button className="tableButton danger compact" type="button" onClick={() => setCancelTarget(task)}>取消</button>;
    if (task.status === 'failed') return <button className="tableButton compact" type="button" onClick={() => setRetryTarget(task)}>重试</button>;
    return null;
  }

  return (
    <section className="stack">
      <section className="panel taskOverviewPanel">
        <div className="panelTitle">
          <div>
            <h2>任务中心</h2>
            <span>自动化规则命中后生成短信任务，任务中心负责排队、执行、重试和取消。</span>
          </div>
          <div className="headerActions">
            <Button onClick={() => setOperationOpen(true)}>更多操作</Button>
          </div>
        </div>

        <div className="taskMetricGrid compact">
          {summaryCards.map((card) => (
            <button
              className={`secondaryMetric ${card.tone} taskSummaryCard ${statusTab === card.status ? 'active' : ''}`}
              type="button"
              key={card.status}
              onClick={() => selectStatus(card.status)}
            >
              <div>{card.icon}</div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.desc}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel taskListPanel">
        <div className="taskSectionTitle">
          <div>
            <h2>任务明细</h2>
            <span>按计划发送时间排序，支持查看详情、行级处理和分页浏览。共 {pagination.total} 条</span>
          </div>
        </div>
        <div className="taskListFilters">
          <div className="statusTabs">
            {statusTabs.map((tab) => (
              <button className={statusTab === tab.value ? 'active' : ''} type="button" key={tab.value} onClick={() => selectStatus(tab.value)}>
                <span>{tab.label}</span>
                <strong>{statusCounts[tab.value] ?? 0}</strong>
              </button>
            ))}
          </div>

          <div className="taskFilterSection">
            <QueryFilterBar
              fields={[
                { name: 'keyword', label: '任务筛选', placeholder: '任务/事件/规则/模板/手机号', span: 8 },
                { name: 'scene', label: '场景', type: 'select', placeholder: '全部场景', options: sceneOptions }
              ]}
              values={filters}
              onChange={(value) => setFilters({ keyword: '', scene: '', ...value })}
              onSearch={search}
            />
          </div>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable taskTable">
            <thead><tr><th>任务</th><th>来源</th><th>计划/发送时间</th><th>状态</th><th>次数</th><th>处理说明</th><th>操作</th></tr></thead>
            <tbody>
              {taskItems.map((task) => (
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
                  <td><StatusBadge status={taskStatusKey(task.status)} /></td>
                  <td>{task.attemptCount}/{task.maxAttempts}</td>
                  <td>{taskReason(task)}</td>
                  <td>
                    <div className="tableActions">
                      <button className="tableButton compact" type="button" onClick={() => setDetail(task)}>详情</button>
                      {rowActions(task)}
                    </div>
                  </td>
                </tr>
              ))}
              {!taskItems.length && <TableEmptyState colSpan={7} title="暂无任务明细" description="当前筛选条件下没有短信任务。" />}
            </tbody>
          </table>
        </div>
        <ListPagination pagination={pagination} onChange={changePage} />
      </section>

      <Modal open={Boolean(detail)} title="任务详情" subtitle={detail?.id} onClose={() => setDetail(null)} size="wide">
        <div className="stack">
          <div className="ruleMetaGrid">
            <div><span>状态</span><strong>{detail ? statusLabel(taskStatusKey(detail.status)) : '-'}</strong></div>
            <div><span>场景</span><strong>{detail ? sceneLabels[detail.scene] || detail.scene : '-'}</strong></div>
            <div><span>计划时间</span><strong>{timeLabel(detail?.scheduledAt)}</strong></div>
            <div><span>发送时间</span><strong>{timeLabel(detail?.sentAt)}</strong></div>
          </div>
          <div className="detailCard">
            <div><span>处理说明</span><strong>{detail ? taskReason(detail) : '-'}</strong></div>
          </div>
          <div className="taskSourceFlow">
            <div className="taskSourceFlowHeader">
              <strong>来源链路</strong>
              <span>用于解释任务从哪里来、按什么规则生成、最终是否发送成功</span>
            </div>
            <div className="taskSourceNodes">
              <button className={`taskSourceNode ${detailEvent ? '' : 'empty'}`} type="button" disabled={!detailEvent} onClick={() => setRelatedDetail('event')}>
                <span>业务事件</span>
                <strong>{detailEvent ? eventLabels[detailEvent.eventType] || detailEvent.eventType : detail?.eventId || '无事件'}</strong>
                <small>{detailEvent ? detailEvent.eventId : '没有找到关联事件详情'}</small>
              </button>
              <button className={`taskSourceNode ${detailRule ? '' : 'empty'}`} type="button" disabled={!detailRule} onClick={() => setRelatedDetail('rule')}>
                <span>命中规则</span>
                <strong>{detailRule ? detailRule.name : detail?.ruleName || '无规则'}</strong>
                <small>{detailRule ? `${eventLabels[detailRule.eventType] || detailRule.eventType} · 延迟 ${detailRule.delayValue}${detailRule.delayUnit}` : '没有找到关联规则详情'}</small>
              </button>
              <button className={`taskSourceNode ${detailTemplate ? '' : 'empty'}`} type="button" disabled={!detailTemplate} onClick={() => setRelatedDetail('template')}>
                <span>短信模板</span>
                <strong>{detailTemplate ? detailTemplate.name : detail?.templateName || detail?.templateCode || '无模板'}</strong>
                <small>{detailTemplate ? `Code ${detailTemplate.providerTemplateId}` : '没有找到关联模板详情'}</small>
              </button>
              <button className={`taskSourceNode ${detailLog ? '' : 'empty'}`} type="button" disabled={!detailLog} onClick={() => setRelatedDetail('log')}>
                <span>发送结果</span>
                <strong>{detailLog ? statusLabel(sendStatusKey(detailLog.status)) : detail?.logId || '暂无记录'}</strong>
                <small>{detailLog ? detailLog.requestId || detailLog.id : '任务尚未生成发送记录'}</small>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={relatedDetail === 'event' && Boolean(detailEvent)} title="关联事件详情" subtitle={detailEvent?.eventId} onClose={() => setRelatedDetail(null)} size="wide">
        {detailEvent && (
          <div className="stack">
            <div className="ruleMetaGrid">
              <div><span>事件类型</span><strong>{eventLabels[detailEvent.eventType] || detailEvent.eventType}</strong></div>
              <div><span>场景</span><strong>{detailEvent.scene ? sceneLabels[detailEvent.scene] || detailEvent.scene : '-'}</strong></div>
              <div><span>手机号</span><strong>{detailEvent.phone}</strong></div>
              <div><span>用户</span><strong>{detailEvent.userId || '-'}</strong></div>
              <div><span>接收时间</span><strong>{timeLabel(detailEvent.createdAt || detailEvent.occurredAt)}</strong></div>
            </div>
            <div className="detailCard">
              <div><span>Payload</span><pre className="jsonPreview">{prettyJson(detailEvent.payload)}</pre></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={relatedDetail === 'rule' && Boolean(detailRule)} title="关联规则详情" subtitle={detailRule?.code || detailRule?.id} onClose={() => setRelatedDetail(null)} size="wide">
        {detailRule && (
          <div className="stack">
            <div className="templateDetailHeader">
              <div>
                <span>{sceneLabels[detailRule.scene] || detailRule.scene}</span>
                <strong>{detailRule.name}</strong>
                <p>{eventLabels[detailRule.eventType] || detailRule.eventType} · 延迟 {detailRule.delayValue}{detailRule.delayUnit}</p>
              </div>
              <StatusBadge status={detailRule.status} />
            </div>
            <div className="ruleMetaGrid">
              <div><span>触发事件</span><strong>{eventLabels[detailRule.eventType] || detailRule.eventType}</strong></div>
              <div><span>条件类型</span><strong>{detailRule.conditionType}</strong></div>
              <div><span>短信模板</span><strong>{detailTemplate?.name || detailRule.templateId}</strong></div>
              <div><span>延迟配置</span><strong>{detailRule.delayValue}{detailRule.delayUnit}</strong></div>
            </div>
            <div className="detailCard">
              <div><span>条件配置</span><pre className="jsonPreview">{prettyJson(detailRule.conditionConfig)}</pre></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={relatedDetail === 'template' && Boolean(detailTemplate)} title="关联模板详情" subtitle={detailTemplate?.providerTemplateId} onClose={() => setRelatedDetail(null)} size="wide">
        {detailTemplate && (
          <div className="stack">
            <div className="templateDetailHeader">
              <div>
                <span>{sceneLabels[detailTemplate.scene] || detailTemplate.scene}</span>
                <strong>{detailTemplate.name}</strong>
                <p>服务商模板 Code：{detailTemplate.providerTemplateId}</p>
              </div>
              <StatusBadge status={detailTemplate.status} />
            </div>
            <div className="templateDetailGrid">
              <article>
                <span>模板内容</span>
                <p>{detailTemplate.content}</p>
              </article>
              <article>
                <span>变量</span>
                <p>{detailTemplate.variables.join('、') || '-'}</p>
              </article>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={relatedDetail === 'log' && Boolean(detailLog)} title="关联发送记录详情" subtitle={detailLog?.requestId || detailLog?.id} onClose={() => setRelatedDetail(null)} size="wide">
        {detailLog && (
          <div className="stack">
            <div className="ruleMetaGrid">
              <div><span>发送状态</span><strong>{statusLabel(sendStatusKey(detailLog.status))}</strong></div>
              <div><span>Provider</span><strong>{detailLog.provider || '-'}</strong></div>
              <div><span>回执状态</span><strong>{detailLog.receiptStatus || '-'}</strong></div>
              <div><span>发送时间</span><strong>{timeLabel(detailLog.createdAt)}</strong></div>
            </div>
            <div className="detailCard">
              <div><span>requestId</span><strong>{detailLog.requestId || '-'}</strong></div>
              <div><span>bizId</span><strong>{detailLog.bizId || '-'}</strong></div>
              <div><span>返回码</span><strong>{detailLog.code || '-'}</strong></div>
              <div><span>返回消息</span><strong>{detailLog.message || '-'}</strong></div>
            </div>
            <div className="detailCard">
              <div><span>原始响应</span><pre className="jsonPreview">{prettyJson(detailLog.rawResponse)}</pre></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={operationOpen} title="更多操作" subtitle="批量和手动执行类操作，不影响单条任务的行内处理" onClose={() => setOperationOpen(false)} showClose={false}>
        <div className="taskMoreActions">
          <AuthC authKey="touch:task:batchCancel">
            <button className="taskMoreAction" type="button" onClick={() => openTaskAction('cancelPending')} disabled={!pendingCount}>
              <div><XCircle size={17} /></div>
              <span>批量取消待发送</span>
              <strong>{pendingCount} 条待发送任务</strong>
              <small>用于一次性取消当前队列里尚未发送的任务。单条取消请在任务明细行内操作。</small>
            </button>
          </AuthC>
          <AuthC authKey="touch:task:batchRetry">
            <button className="taskMoreAction" type="button" onClick={() => openTaskAction('retryFailed')} disabled={!failedCount}>
              <div><RotateCcw size={17} /></div>
              <span>批量重试失败</span>
              <strong>{failedCount} 条失败任务</strong>
              <small>用于把失败任务重新放回待执行队列。单条重试请在任务明细行内操作。</small>
            </button>
          </AuthC>
          <AuthC authKey="touch:task:runDue">
            <button className="taskMoreAction" type="button" onClick={() => openTaskAction('runDue')} disabled={!dueCount}>
              <div><Clock3 size={17} /></div>
              <span>手动执行到期任务</span>
              <strong>{dueCount} 条已到期任务</strong>
              <small>偏运维/测试动作，用于立即触发计划时间已到的待发送任务。</small>
            </button>
          </AuthC>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setOperationOpen(false)}>关闭</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(cancelTarget)} title="取消任务" onClose={() => setCancelTarget(null)} showClose={false} footerDivider={false}>
        <div className="stack">
          <p className="modalPlainText">
            确认取消【{cancelTarget?.phoneMasked || '-'}】的【{cancelTarget?.templateName || cancelTarget?.templateCode || cancelTarget?.ruleName || '短信任务'}】吗？
          </p>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setCancelTarget(null)}>取消</button>
            <button className="primaryButton compact" type="button" onClick={() => cancelTarget && cancelOne(cancelTarget)}>确认</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(retryTarget)} title="重试任务" onClose={() => retrying ? undefined : setRetryTarget(null)} showClose={false} footerDivider={false}>
        <div className="stack">
          <p className="modalPlainText">
            确认重试【{retryTarget?.phoneMasked || '-'}】的【{retryTarget?.templateName || retryTarget?.templateCode || retryTarget?.ruleName || '短信任务'}】吗？
          </p>
          <div className="taskActionTrace">
            <strong>执行结果在哪里看</strong>
            <span>确认后任务会重新放回待执行队列，后续状态可在当前任务明细中查看；发送成功后可在「数据分析 / 发送记录」查看服务商返回。</span>
          </div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setRetryTarget(null)} disabled={retrying}>取消</button>
            <button className="primaryButton compact" type="button" onClick={() => retryTarget && retryOne(retryTarget)} disabled={retrying}>
              {retrying ? '处理中' : '确认'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(actionDialog)} title={actionDialog?.title || '任务操作'} onClose={() => actionDialog?.status === 'running' ? undefined : setActionDialog(null)} showClose={false} footerDivider={false}>
        <div className="stack">
          <div className={`taskActionState ${actionDialog?.status || 'confirm'}`}>
            {actionDialog?.status === 'running' && <div className="loadingSpinner small" />}
            <div>
              <strong>
                {actionDialog?.status === 'confirm' && '请确认本次操作'}
                {actionDialog?.status === 'running' && '正在执行，请稍候'}
                {actionDialog?.status === 'done' && '操作已完成'}
                {actionDialog?.status === 'error' && '操作执行失败'}
              </strong>
              <span>{actionDialog?.status === 'done' ? actionDialog.resultText : actionDialog?.status === 'error' ? actionDialog.errorText : actionDialog?.description}</span>
            </div>
          </div>

          <div className="taskActionTrace">
            <strong>在哪里看执行过程</strong>
            <span>{actionDialog?.processHint}</span>
          </div>

          {actionDialog && ['confirm', 'running'].includes(actionDialog.status) && (
            <div className="taskActionPreview">
              <div className="taskActionPreviewHeader">
                <strong>本次会处理这些任务</strong>
                <span>共 {actionAffectedTasks.length} 条{actionAffectedTasks.length > actionPreviewTasks.length ? `，先展示前 ${actionPreviewTasks.length} 条` : ''}</span>
              </div>
              <div className="taskActionPreviewList">
                {actionPreviewTasks.map((task) => (
                  <article key={task.id}>
                    <div>
                      <strong>{task.templateName || task.templateCode || task.ruleName || '短信任务'}</strong>
                      <span>{sceneLabels[task.scene] || task.scene} · {task.phoneMasked}</span>
                    </div>
                    <div>
                      <span>计划时间</span>
                      <strong>{timeLabel(task.scheduledAt)}</strong>
                    </div>
                    <div>
                      <span>状态</span>
                      <strong>{statusLabel(taskStatusKey(task.status))}</strong>
                    </div>
                  </article>
                ))}
                {!actionPreviewTasks.length && <p className="modalPlainText">当前没有符合条件的任务。</p>}
              </div>
            </div>
          )}

          <div className="modalActions">
            {actionDialog?.status === 'confirm' && (
              <>
                <button className="secondaryButton compact" type="button" onClick={() => setActionDialog(null)}>取消</button>
                <button className="primaryButton compact" type="button" onClick={confirmTaskAction}>确认执行</button>
              </>
            )}
            {actionDialog?.status === 'running' && (
              <button className="secondaryButton compact" type="button" disabled>执行中</button>
            )}
            {actionDialog?.status === 'done' && (
              <>
                <button className="secondaryButton compact" type="button" onClick={() => setActionDialog(null)}>关闭</button>
                <button className="primaryButton compact" type="button" onClick={goActionTrace}>{actionDialog.jobId ? '查看批量操作' : '查看发送记录'}</button>
              </>
            )}
            {actionDialog?.status === 'error' && (
              <>
                <button className="secondaryButton compact" type="button" onClick={() => setActionDialog(null)}>关闭</button>
                <button className="primaryButton compact" type="button" onClick={confirmTaskAction}>重新执行</button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
}
