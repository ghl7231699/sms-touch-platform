import React, { useEffect, useRef, useState } from 'react';
import { FileJson, Zap } from 'lucide-react';
import { api } from '../../lib/api';
import { eventLabels, sceneLabels, statusLabel } from '../../constants/labels';
import type { EventItem, Rule, SmsTask } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { AuthC } from '../../lib/auth';
import { EmptyState, TableEmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';

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

const emptyFilters = { keyword: '', eventType: '', phoneSuffix: '' };

export default function Events({
  events,
  tasks,
  rules,
  onRefresh,
  setNotice
}: {
  events: EventItem[];
  tasks: SmsTask[];
  rules: Rule[];
  onRefresh: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const urlParams = new URLSearchParams(window.location.search);
  const targetEventId = urlParams.get('eventId') || '';
  const [phone, setPhone] = useState('18515385071');
  const [eventType, setEventType] = useState('user_register');
  const [payloadText, setPayloadText] = useState('{\n  "source": "operator-console",\n  "hasActiveMembership": false\n}');
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<EventItem | null>(null);
  const [filters, setFilters] = useState<QueryFilterValues>({ ...emptyFilters, keyword: targetEventId });
  const [eventItems, setEventItems] = useState<EventItem[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const handledEventIdRef = useRef('');

  const eventOptions = Object.entries(eventLabels).map(([value, label]) => ({ value, label }));

  async function loadEventPage(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: EventItem[]; total: number; page: number; pageSize: number }>(`/api/events?${withPaginationParams({ ...emptyFilters, ...nextFilters }, nextPagination)}`);
    setEventItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyFilters, ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    loadEventPage(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '事件查询失败'));
  }

  function changePage(page: number, pageSize: number) {
    loadEventPage(filters, { ...pagination, page, pageSize }).catch((error) => setNotice(error instanceof Error ? error.message : '事件加载失败'));
  }

  function tasksForEvent(eventId?: string) {
    return tasks.filter((task) => task.eventId === eventId);
  }

  function rulesForEvent(type?: string) {
    return rules.filter((rule) => rule.eventType === type);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText || '{}') as Record<string, unknown>;
    } catch {
      setNotice('payload JSON 格式不正确');
      return;
    }
    const result = await api<{ matchedRuleCount: number; queuedTaskCount: number }>('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        phone,
        userId: String(payload.userId || 'test-user'),
        payload: { ...payload, phone }
      })
    });
    setNotice(`事件已接收，匹配 ${result.matchedRuleCount} 条规则，生成 ${result.queuedTaskCount} 个任务`);
    setModalOpen(false);
    await onRefresh();
    await loadEventPage(filters, { ...pagination, page: 1 });
  }

  useEffect(() => {
    loadEventPage(filters, { ...pagination, page: 1 }).catch((error) => setNotice(error instanceof Error ? error.message : '事件加载失败'));
  }, []);

  useEffect(() => {
    if (!targetEventId || handledEventIdRef.current === targetEventId) return;
    const target = eventItems.find((item) => item.eventId === targetEventId || item.id === targetEventId);
    if (target) {
      handledEventIdRef.current = targetEventId;
      setDetail(target);
    }
  }, [targetEventId, eventItems, detail]);

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>事件流水</h2>
            <span>展示业务事件进入触达系统后的匹配、派生任务和 payload。</span>
          </div>
          <AuthC authKey="touch:event:simulate">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><Zap size={16} />模拟事件</button>
          </AuthC>
        </div>

        <QueryFilterBar
          fields={[
            { name: 'keyword', label: 'eventId 搜索', placeholder: 'evt_...', span: 8 },
            { name: 'eventType', label: '事件类型', type: 'select', placeholder: '全部事件', options: eventOptions },
            { name: 'phoneSuffix', label: '手机号后四位', placeholder: '5071' }
          ]}
          values={filters}
          onChange={(value) => setFilters({ ...emptyFilters, ...value })}
          onSearch={search}
        />

        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>事件</th><th>手机号</th><th>接收时间</th><th>匹配规则</th><th>生成任务</th><th>操作</th></tr></thead>
            <tbody>
              {eventItems.map((item) => {
                const relatedTasks = tasksForEvent(item.eventId);
                return (
                  <tr key={item.id}>
                    <td><strong>{eventLabels[item.eventType] || item.eventType}</strong><span>{item.eventId}</span></td>
                    <td>{item.phone}</td>
                    <td>{timeLabel(item.createdAt || item.occurredAt)}</td>
                    <td>{rulesForEvent(item.eventType).length}</td>
                    <td>{relatedTasks.length}</td>
                    <td>
                      <div className="tableActions">
                        <button className="tableButton compact" type="button" onClick={() => setDetail(item)}>详情</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!eventItems.length && <TableEmptyState colSpan={6} title="暂无事件流水" description="业务系统接入或手动模拟事件后，这里会展示事件触发记录。" />}
            </tbody>
          </table>
        </div>
        <ListPagination pagination={pagination} onChange={changePage} />
      </section>

      <section className="eventList">
        {!events.length && <EmptyState title="暂无事件概览" description="事件会驱动自动化规则命中和短信任务生成。" />}
      </section>

      <Modal open={modalOpen} title="模拟业务事件" subtitle="可编辑 payload JSON，用于验证规则匹配和任务生成" onClose={() => setModalOpen(false)} showClose={false} size="wide">
        <form className="formPanel" onSubmit={submit}>
          <div className="formGrid two">
            <label>事件类型
              <SelectField value={eventType} options={eventOptions} onChange={setEventType} />
            </label>
            <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          </div>
          <label>payload JSON
            <textarea className="jsonTextarea" value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={8} />
          </label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">触发事件</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(detail)} title="事件详情" subtitle={detail?.eventId} onClose={() => setDetail(null)} size="wide">
        <div className="stack">
          <div className="ruleMetaGrid">
            <div><span>事件类型</span><strong>{detail ? eventLabels[detail.eventType] || detail.eventType : '-'}</strong></div>
            <div><span>手机号</span><strong>{detail?.phone || '-'}</strong></div>
            <div><span>匹配规则数</span><strong>{rulesForEvent(detail?.eventType).length}</strong></div>
            <div><span>生成任务数</span><strong>{tasksForEvent(detail?.eventId).length}</strong></div>
          </div>
          <div className="detailCard">
            <div><span><FileJson size={14} /> payload JSON</span><pre className="jsonPreview">{prettyJson(detail?.payload)}</pre></div>
          </div>
          <div className="dataTableWrap">
            <table className="dataTable">
              <thead><tr><th>关联任务</th><th>场景</th><th>状态</th><th>计划时间</th></tr></thead>
              <tbody>
                {tasksForEvent(detail?.eventId).map((task) => (
                  <tr key={task.id}>
                    <td><strong>{task.templateName || task.templateCode}</strong><span>{task.id}</span></td>
                    <td>{sceneLabels[task.scene] || task.scene}</td>
                    <td><StatusBadge status={task.status} /></td>
                    <td>{timeLabel(task.scheduledAt)}</td>
                  </tr>
                ))}
                {!tasksForEvent(detail?.eventId).length && <tr><td colSpan={4}>暂无关联任务</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="detailCard">
            <div><span>关联规则</span><strong>{rulesForEvent(detail?.eventType).map((rule) => `${rule.name}（${statusLabel(rule.status)}）`).join('、') || '暂无'}</strong></div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
