import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import type { EventItem, Rule, SendLog, SmsTask, Template } from '../../types';
import { eventLabels, sceneLabels, statusLabel } from '../../constants/labels';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { TableEmptyState } from '../../components/EmptyState';
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

function copyText(value: string | undefined, setNotice: (value: string) => void) {
  if (!value) {
    setNotice('没有可复制的值');
    return;
  }
  navigator.clipboard?.writeText(value);
  setNotice(`已复制 ${value}`);
}

export default function Logs({
  logs,
  tasks,
  events,
  rules,
  templates,
  setNotice
}: {
  logs: SendLog[];
  tasks: SmsTask[];
  events: EventItem[];
  rules: Rule[];
  templates: Template[];
  setNotice: (value: string) => void;
}) {
  const urlParams = new URLSearchParams(window.location.search);
  const [filters, setFilters] = useState<QueryFilterValues>({
    keyword: urlParams.get('logId') || '',
    timeRange: '',
    status: '',
    scene: '',
    triggerType: ''
  });
  const [logItems, setLogItems] = useState<SendLog[]>([]);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [detail, setDetail] = useState<SendLog | null>(null);

  const sceneOptions = useMemo(() => {
    const scenes = Array.from(new Set(logs.map((log) => log.scene).filter(Boolean)));
    return scenes.map((scene) => ({ value: scene, label: sceneLabels[scene] || scene }));
  }, [logs]);

  async function loadLogPage(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: SendLog[]; total: number; page: number; pageSize: number }>(
      `/api/send-logs?${withPaginationParams({ keyword: '', timeRange: '', status: '', scene: '', triggerType: '', ...nextFilters }, nextPagination)}`
    );
    setLogItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { keyword: '', timeRange: '', status: '', scene: '', triggerType: '', ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    loadLogPage(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '发送记录查询失败'));
  }

  function changePage(page: number, pageSize: number) {
    loadLogPage(filters, { ...pagination, page, pageSize }).catch((error) => setNotice(error instanceof Error ? error.message : '发送记录加载失败'));
  }

  const detailTask = tasks.find((task) => task.logId === detail?.id || task.eventId === detail?.eventId);
  const detailEvent = events.find((event) => event.eventId === detail?.eventId);
  const detailRule = rules.find((rule) => rule.id === detail?.ruleId);
  const detailTemplate = templates.find((template) => template.id === detail?.templateId);

  useEffect(() => {
    loadLogPage(filters, { ...pagination, page: 1 }).catch((error) => setNotice(error instanceof Error ? error.message : '发送记录加载失败'));
  }, []);

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>发送记录</h2>
            <span>追踪 Provider 返回、回执、短链点击和触发来源。</span>
          </div>
          <span>共 {pagination.total} 条</span>
        </div>

        <QueryFilterBar
          fields={[
            { name: 'keyword', label: '记录搜索', placeholder: 'requestId / bizId / 模板 / 手机号', span: 8 },
            { name: 'timeRange', label: '时间', type: 'select', placeholder: '全部时间', options: [{ value: '1', label: '近 1 日' }, { value: '7', label: '近 7 日' }, { value: '30', label: '近 30 日' }] },
            { name: 'status', label: '状态', type: 'select', placeholder: '全部状态', options: [{ value: 'success', label: '成功' }, { value: 'failed', label: '失败' }, { value: 'blocked', label: '拦截' }, { value: 'pending', label: '待发送' }] },
            { name: 'scene', label: '场景', type: 'select', placeholder: '全部场景', options: sceneOptions },
            { name: 'triggerType', label: '触发方式', type: 'select', placeholder: '全部方式', options: [{ value: 'auto', label: '自动触发' }, { value: 'manual', label: '手动发送' }] }
          ]}
          values={filters}
          onChange={(value) => setFilters({ keyword: '', timeRange: '', status: '', scene: '', triggerType: '', ...value })}
          onSearch={search}
        />

        <div className="dataTableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>时间</th><th>触发</th><th>场景</th><th>手机号</th><th>模板</th><th>状态</th><th>回执</th><th>短链</th><th>返回</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {logItems.map((log) => (
                <tr key={log.id}>
                  <td>{timeLabel(log.createdAt)}</td>
                  <td>{log.triggerType === 'auto' ? '自动' : '手动'}</td>
                  <td>{sceneLabels[log.scene] || log.scene}</td>
                  <td>{log.phoneMasked}</td>
                  <td><strong>{log.templateName || log.templateCode}</strong><span>{log.requestId || log.id}</span></td>
                  <td><StatusBadge status={log.status} /></td>
                  <td>{log.receiptStatus || '-'}</td>
                  <td>
                    {log.shortUrl ? (
                      <a href={log.shortUrl} target="_blank" rel="noreferrer">打开 · {log.clickCount || 0}</a>
                    ) : '-'}
                  </td>
                  <td><strong>{log.code}</strong><span>{log.message}</span></td>
                  <td>
                    <div className="tableActions">
                      <button className="tableButton compact" type="button" onClick={() => setDetail(log)}>详情</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!logItems.length && <TableEmptyState colSpan={10} title="暂无发送记录" description="当前筛选条件下没有短信发送记录。" />}
            </tbody>
          </table>
        </div>
        <ListPagination pagination={pagination} onChange={changePage} />
      </section>

      <Modal open={Boolean(detail)} title="发送记录详情" subtitle={detail?.requestId || detail?.id} onClose={() => setDetail(null)} size="wide">
        <div className="stack">
          <div className="ruleMetaGrid">
            <div><span>发送状态</span><strong>{detail ? statusLabel(detail.status) : '-'}</strong></div>
            <div><span>Provider</span><strong>{detail?.provider || '-'}</strong></div>
            <div><span>回执状态</span><strong>{detail?.receiptStatus || '-'}</strong></div>
            <div><span>短链点击</span><strong>{detail?.clickCount || 0}</strong></div>
          </div>
          <div className="detailCard">
            <div><span>requestId</span><strong>{detail?.requestId || '-'}{detail?.requestId && <button className="inlineTextButton" type="button" onClick={() => copyText(detail.requestId, setNotice)}>复制</button>}</strong></div>
            <div><span>bizId</span><strong>{detail?.bizId || '-'}{detail?.bizId && <button className="inlineTextButton" type="button" onClick={() => copyText(detail.bizId, setNotice)}>复制</button>}</strong></div>
            <div><span>关联任务</span><strong>{detailTask ? detailTask.id : '暂无'}</strong></div>
            <div><span>关联事件</span><strong>{detailEvent ? `${eventLabels[detailEvent.eventType] || detailEvent.eventType} · ${detailEvent.eventId}` : detail?.eventId || '暂无'}</strong></div>
            <div><span>关联规则</span><strong>{detailRule ? detailRule.name : detail?.ruleName || '暂无'}</strong></div>
            <div><span>关联模板</span><strong>{detailTemplate ? detailTemplate.name : detail?.templateName || detail?.templateCode || '-'}</strong></div>
          </div>
          <div className="detailCard">
            <div><span>Provider 原始响应</span><pre className="jsonPreview">{prettyJson(detail?.rawResponse)}</pre></div>
          </div>
          <div className="detailCard">
            <div><span>回执详情</span><strong>{detail?.receiptStatus || '暂无回执'} · {detail?.message || '-'}</strong></div>
            <div><span>短链点击详情</span><strong>{detail?.shortUrl ? `${detail.shortUrl} · 点击 ${detail.clickCount || 0} 次` : '未生成短链'}</strong></div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
