import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquareText, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { sceneLabels, statusLabel } from '../../constants/labels';
import type { SendLog, Template } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { AuthC } from '../../lib/auth';
import { StatusBadge } from '../../components/StatusBadge';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';

type SafetyResult = {
  passed: boolean;
  finalAction: string;
  checks: Record<string, { status: string }>;
  blockedReason?: { code: string; message: string } | null;
  nextPlanTime?: string | null;
};

type SendResult = {
  success: boolean;
  status: string;
  provider: string;
  logId: string;
  phoneMasked: string;
  templateId: string;
  code: string;
  message: string;
  bizId?: string;
  requestId?: string;
  shortUrl?: string;
};

function hydrateVariables(template: Template | undefined, previous: Record<string, string>) {
  const variables = template?.variables?.length ? template.variables : ['code', 'min'];
  return variables.reduce<Record<string, string>>((next, key) => {
    next[key] = previous[key] || (key === 'code' ? '246810' : key === 'min' ? '5' : '');
    return next;
  }, {});
}

function renderPreview(content: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((text, [key, value]) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text
      .replace(new RegExp(`{{\\s*${escaped}\\s*}}`, 'g'), value || `{{${key}}}`)
      .replace(new RegExp(`##\\s*${escaped}\\s*##`, 'g'), value || `##${key}##`)
      .replace(new RegExp(`\\$\\{\\s*${escaped}\\s*\\}`, 'g'), value || `\${${key}}`);
  }, content || '');
}

function safetyLabel(status: string) {
  return { passed: '通过', blocked: '拦截', warning: '提醒', skipped: '跳过' }[status] || status;
}

function timeLabel(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

export default function ManualSend({
  templates,
  logs,
  onRefresh,
  setNotice
}: {
  templates: Template[];
  logs: SendLog[];
  onRefresh: () => Promise<void>;
  setNotice: (value: string) => void;
}) {
  const enabledTemplates = templates.filter((template) => template.status === 'enabled');
  const [phone, setPhone] = useState('18515385071');
  const [templateId, setTemplateId] = useState(enabledTemplates[0]?.id || templates[0]?.id || '');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [safety, setSafety] = useState<SafetyResult | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const [selectedLog, setSelectedLog] = useState<SendLog | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ ...defaultPagination, pageSize: 10 });
  const [manualLogItems, setManualLogItems] = useState<SendLog[]>([]);
  const [manualLogLoading, setManualLogLoading] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templateId, templates]
  );
  const templateOptions = templates.map((template) => ({
    value: template.id,
    label: `${template.name}${template.status !== 'enabled' ? '（停用）' : ''}`
  }));
  const preview = renderPreview(selectedTemplate?.content || '', variables);
  const manualLogs = logs.filter((log) => log.triggerType === 'manual');

  useEffect(() => {
    setVariables((current) => hydrateVariables(selectedTemplate, current));
  }, [selectedTemplate]);

  async function loadManualLogs(nextPagination = pagination) {
    setManualLogLoading(true);
    try {
      const data = await api<{ items: SendLog[]; total: number; page: number; pageSize: number }>(
        `/api/send-logs?${withPaginationParams({ triggerType: 'manual' }, nextPagination)}`
      );
      setManualLogItems(data.items);
      setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '手动发送记录加载失败');
    } finally {
      setManualLogLoading(false);
    }
  }

  useEffect(() => {
    loadManualLogs({ ...pagination, page: 1 }).catch(() => undefined);
  }, []);

  function changePage(page: number, pageSize: number) {
    loadManualLogs({ ...pagination, page, pageSize }).catch(() => undefined);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTemplate) {
      setNotice('请先选择短信模板');
      return;
    }
    const check = await api<SafetyResult>('/api/safety/send-check', {
      method: 'POST',
      body: JSON.stringify({ phone, scene: selectedTemplate.scene, triggerType: 'manual' })
    });
    setSafety(check);
    setConfirmOpen(true);
  }

  async function confirmSend() {
    const sent = await api<SendResult>('/api/manual-send', {
      method: 'POST',
      body: JSON.stringify({ phone, templateId, templateParam: variables })
    });
    setResult(sent);
    setNotice(`${statusLabel(sent.status)} · ${sent.code}`);
    setConfirmOpen(false);
    setModalOpen(false);
    await onRefresh();
    await loadManualLogs({ ...pagination, page: 1 });
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>手动发送</h2>
            <span>面向客服补发、运营小范围验证和异常通知的单号码触达。</span>
          </div>
          <AuthC authKey="touch:manual:send">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}>新建发送</button>
          </AuthC>
        </div>
        <div className="manualPolicyGrid">
          <article>
            <strong>单号码触达</strong>
            <span>不承载批量营销，适合明确对象的一次性补发。</span>
          </article>
          <article>
            <strong>发送前校验</strong>
            <span>频控、安静时段、黑名单和退订状态会先进入安全校验。</span>
          </article>
          <article>
            <strong>结果可追踪</strong>
            <span>发送后沉淀到发送记录，可查看 Provider 返回和回执。</span>
          </article>
        </div>
        <div className="taskMetricGrid compact">
          <article className="secondaryMetric blue"><div><MessageSquareText size={18} /></div><span>可用模板</span><strong>{enabledTemplates.length}</strong></article>
          <article className="secondaryMetric green"><div><CheckCircle2 size={18} /></div><span>手动成功</span><strong>{manualLogs.filter((log) => log.status === 'success').length}</strong></article>
          <article className="secondaryMetric amber"><div><ShieldCheck size={18} /></div><span>安全拦截</span><strong>{manualLogs.filter((log) => log.status === 'blocked').length}</strong></article>
          <article className="secondaryMetric red"><div><AlertTriangle size={18} /></div><span>发送失败</span><strong>{manualLogs.filter((log) => log.status === 'failed').length}</strong></article>
        </div>
      </section>

      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>最近手动发送记录</h2>
            <span>{manualLogLoading ? '正在加载记录...' : `共 ${pagination.total} 条，按发送时间分页浏览。`}</span>
          </div>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>模板</th><th>场景</th><th>手机号</th><th>状态</th><th>Provider</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {manualLogItems.map((log) => (
                <tr key={log.id}>
                  <td><strong>{log.templateName || log.templateCode}</strong><span>{log.requestId || log.id}</span></td>
                  <td>{sceneLabels[log.scene] || log.scene}</td>
                  <td>{log.phoneMasked}</td>
                  <td><StatusBadge status={log.status} /></td>
                  <td>{log.provider}</td>
                  <td>{timeLabel(log.createdAt)}</td>
                  <td><button className="tableButton compact" type="button" onClick={() => setSelectedLog(log)}>详情</button></td>
                </tr>
              ))}
              {!manualLogLoading && !manualLogItems.length && <tr><td colSpan={7}>暂无手动发送记录</td></tr>}
              {manualLogLoading && <tr><td colSpan={7}>正在加载手动发送记录...</td></tr>}
            </tbody>
          </table>
        </div>
        <ListPagination pagination={pagination} onChange={changePage} />
      </section>

      <Modal open={modalOpen} title="新建手动发送" subtitle="单号码、单模板、发送前校验" onClose={() => setModalOpen(false)} showClose={false} size="wide">
        <form className="formPanel" onSubmit={submit}>
          <div className="manualSendComposer">
            <section>
              <strong>收件人与模板</strong>
              <div className="formGrid two">
                <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                <label>短信模板
                  <SelectField value={templateId} options={templateOptions} onChange={setTemplateId} />
                </label>
              </div>
            </section>
            <section>
              <strong>模板信息</strong>
              <div className="detailCard">
                <div><span>模板内容</span><strong>{selectedTemplate?.content || '请选择模板'}</strong></div>
                <div><span>适用场景</span><strong>{selectedTemplate ? sceneLabels[selectedTemplate.scene] || selectedTemplate.scene : '-'}</strong></div>
                <div><span>服务商 Code</span><strong>{selectedTemplate?.providerTemplateId || '-'}</strong></div>
              </div>
            </section>
            <section>
              <strong>变量配置</strong>
              <div className="formGrid two">
                {Object.keys(variables).map((key) => (
                  <label key={key}>变量：{key}
                    <input value={variables[key]} onChange={(event) => setVariables((current) => ({ ...current, [key]: event.target.value }))} />
                  </label>
                ))}
              </div>
            </section>
            <section>
              <strong>发送内容预览</strong>
              <div className="templateModalPreview">
                <p>{preview || '填写变量后展示最终短信内容'}</p>
              </div>
            </section>
          </div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">安全校验</button>
          </div>
        </form>
      </Modal>

      <Modal open={confirmOpen} title="发送前确认" subtitle={safety?.passed ? '安全校验通过，可继续发送' : '安全校验未通过，请确认拦截原因'} onClose={() => setConfirmOpen(false)}>
        <div className="stack">
          <div className={`safetySummary ${safety?.passed ? 'passed' : 'blocked'}`}>
            {safety?.passed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <strong>{safety?.passed ? '本次发送允许继续' : safety?.blockedReason?.message || '本次发送会被拦截'}</strong>
          </div>
          <div className="chipGrid">
            {Object.entries(safety?.checks || {}).map(([key, value]) => (
              <span className={`checkChip ${value.status}`} key={key}>{key}：{safetyLabel(value.status)}</span>
            ))}
          </div>
          <div className="templateModalPreview"><div>确认内容</div><p>{preview}</p></div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setConfirmOpen(false)}>返回修改</button>
            <button className="primaryButton compact" type="button" onClick={confirmSend} disabled={!safety?.passed}>确认发送</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(result)} title="发送结果详情" subtitle={result ? `${statusLabel(result.status)} · ${result.code}` : undefined} onClose={() => setResult(null)}>
        <div className="detailCard">
          <div><span>发送状态</span><strong>{result ? statusLabel(result.status) : '-'}</strong></div>
          <div><span>Provider</span><strong>{result?.provider || '-'}</strong></div>
          <div><span>手机号</span><strong>{result?.phoneMasked || '-'}</strong></div>
          <div><span>requestId / bizId</span><strong>{result?.requestId || '-'} / {result?.bizId || '-'}</strong></div>
          <div><span>返回消息</span><strong>{result?.message || '-'}</strong></div>
        </div>
      </Modal>

      <Modal open={Boolean(selectedLog)} title="手动发送记录详情" subtitle={selectedLog?.requestId || selectedLog?.id} onClose={() => setSelectedLog(null)} size="wide">
        <div className="stack">
          <div className="ruleMetaGrid">
            <div><span>发送状态</span><strong>{selectedLog ? statusLabel(selectedLog.status) : '-'}</strong></div>
            <div><span>Provider</span><strong>{selectedLog?.provider || '-'}</strong></div>
            <div><span>回执状态</span><strong>{selectedLog?.receiptStatus || '-'}</strong></div>
            <div><span>发送时间</span><strong>{timeLabel(selectedLog?.createdAt)}</strong></div>
          </div>
          <div className="detailCard">
            <div><span>手机号</span><strong>{selectedLog?.phoneMasked || '-'}</strong></div>
            <div><span>业务场景</span><strong>{selectedLog ? sceneLabels[selectedLog.scene] || selectedLog.scene : '-'}</strong></div>
            <div><span>模板</span><strong>{selectedLog?.templateName || selectedLog?.templateCode || '-'}</strong></div>
            <div><span>requestId</span><strong>{selectedLog?.requestId || '-'}</strong></div>
            <div><span>bizId</span><strong>{selectedLog?.bizId || '-'}</strong></div>
            <div><span>返回消息</span><strong>{selectedLog?.message || '-'}</strong></div>
          </div>
        </div>
      </Modal>
    </section>
  );
}
