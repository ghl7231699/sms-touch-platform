import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Database, Eye, FlaskConical, Play, Plus, Power, Settings2 } from 'lucide-react';
import { api } from '../../lib/api';
import { sceneLabels, statusLabel } from '../../constants/labels';
import type { DataSourceItem, DataSourceRunItem, Rule, Template } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

const defaultMapping = JSON.stringify({
  phone: 'phone',
  userId: 'userId',
  bizId: 'bizId',
  scene: 'scene',
  variables: {
    name: 'name',
    productName: 'productName',
    daysLeft: 'daysLeft'
  }
}, null, 2);

const emptyForm = {
  name: '',
  systemName: '',
  endpoint: '',
  method: 'GET',
  authType: 'none',
  authorization: '',
  requestParamsText: JSON.stringify({ limit: 4 }, null, 2),
  responsePath: 'data.items',
  dedupeKey: 'phone',
  defaultRuleId: '',
  defaultTemplateId: '',
  remark: '',
  fieldMappingText: defaultMapping
};

const emptyFilters = { keyword: '', systemName: '', status: '', dateFrom: '', dateTo: '' };

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-';
}

function jsonParse(text: string, fallback: unknown) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function runTypeLabel(value?: string) {
  return {
    test: '调试调用',
    preview: '数据预览',
    create_tasks: '生成任务',
    'test-call': '调试调用'
  }[value || ''] || value || '-';
}

export default function DataSourcesPage({ rules, templates, setNotice, onRefresh }: { rules: Rule[]; templates: Template[]; setNotice: (value: string) => void; onRefresh: () => Promise<void> }) {
  const [items, setItems] = useState<DataSourceItem[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DataSourceItem | null>(null);
  const [selected, setSelected] = useState<DataSourceItem | null>(null);
  const [runner, setRunner] = useState<DataSourceItem | null>(null);
  const [runParamsText, setRunParamsText] = useState(JSON.stringify({ limit: 4 }, null, 2));
  const [runRuleId, setRunRuleId] = useState('');
  const [runTemplateId, setRunTemplateId] = useState('');
  const [preview, setPreview] = useState<{ summary?: DataSourceRunItem['summary']; items?: any[]; responseSample?: unknown[] } | null>(null);
  const [draftPreview, setDraftPreview] = useState<{ statusCode?: number; elapsedMs?: number; responsePathValid?: boolean; extractedCount?: number; responseSample?: unknown; fieldHints?: string[] } | null>(null);
  const [runDetail, setRunDetail] = useState<DataSourceRunItem | null>(null);

  const ruleOptions = useMemo(() => rules.map((rule) => ({ value: rule.id, label: `${rule.name} · ${sceneLabels[rule.scene] || rule.scene}` })), [rules]);
  const templateOptions = useMemo(() => templates.map((template) => ({ value: template.id, label: `${template.name} · ${sceneLabels[template.scene] || template.scene}` })), [templates]);

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: DataSourceItem[]; total: number; page: number; pageSize: number }>(`/api/data-sources?${withPaginationParams(nextFilters, nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '数据来源加载失败'));
  }, []);

  function payloadFromForm() {
    const requestParams = jsonParse(form.requestParamsText, null);
    return {
      name: form.name,
      systemName: form.systemName,
      endpoint: form.endpoint,
      method: form.method,
      authType: form.authType,
      authConfig: form.authType === 'authorization' ? { authorization: form.authorization } : {},
      requestConfig: { params: requestParams || {} },
      responsePath: form.responsePath,
      dedupeKey: form.dedupeKey,
      defaultRuleId: form.defaultRuleId || null,
      defaultTemplateId: form.defaultTemplateId || null,
      remark: form.remark,
      fieldMapping: jsonParse(form.fieldMappingText, null)
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const payload = payloadFromForm();
    if (!jsonParse(form.requestParamsText, null)) {
      setNotice('运行参数 JSON 格式不正确');
      return;
    }
    if (!payload.fieldMapping) {
      setNotice('字段映射 JSON 格式不正确');
      return;
    }
    if (editing) {
      await api(`/api/data-sources/${editing.id}/update`, { method: 'POST', body: JSON.stringify(payload) });
      setNotice('数据来源已更新');
    } else {
      await api('/api/data-sources', { method: 'POST', body: JSON.stringify(payload) });
      setNotice('数据来源已创建');
    }
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  function openEdit(item: DataSourceItem) {
    setDraftPreview(null);
    setEditing(item);
    setForm({
      name: item.name,
      systemName: item.systemName,
      endpoint: item.endpoint,
      method: item.method,
      authType: item.authType,
      authorization: String(item.authConfig?.authorization || item.authConfig?.token || ''),
      requestParamsText: JSON.stringify(item.requestConfig?.params || {}, null, 2),
      responsePath: item.responsePath,
      dedupeKey: item.dedupeKey,
      defaultRuleId: item.defaultRuleId || '',
      defaultTemplateId: item.defaultTemplateId || '',
      remark: item.remark || '',
      fieldMappingText: JSON.stringify(item.fieldMapping || {}, null, 2)
    });
  }

  async function toggle(item: DataSourceItem) {
    await api(`/api/data-sources/${item.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: item.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${item.name} 已${item.status === 'enabled' ? '停用' : '启用'}`);
    await load();
  }

  async function copy(item: DataSourceItem) {
    await api(`/api/data-sources/${item.id}/copy`, { method: 'POST' });
    setNotice('已复制为停用状态的数据来源');
    await load();
  }

  async function openDetail(item: DataSourceItem) {
    const data = await api<{ item: DataSourceItem }>(`/api/data-sources/${item.id}`);
    setSelected(data.item);
  }

  function openRunner(item: DataSourceItem) {
    setRunner(item);
    setRunRuleId(item.defaultRuleId || '');
    setRunTemplateId(item.defaultTemplateId || '');
    setPreview(null);
  }

  async function execute(type: 'test-call' | 'preview' | 'create-tasks') {
    if (!runner) return;
    const params = jsonParse(runParamsText, null);
    if (!params) {
      setNotice('运行参数 JSON 格式不正确');
      return;
    }
    const result = await api<{ summary: DataSourceRunItem['summary']; items?: any[]; responseSample?: unknown[]; createdTaskCount?: number; job?: { id: string } }>(`/api/data-sources/${runner.id}/${type}`, {
      method: 'POST',
      body: JSON.stringify({ params, ruleId: runRuleId || undefined, templateId: runTemplateId || undefined })
    });
    if (type === 'create-tasks') {
      setNotice(`已生成 ${result.createdTaskCount || 0} 条待发送任务，可到任务中心和批量操作查看`);
      await Promise.all([load(), onRefresh()]);
      setRunner(null);
      return;
    }
    setPreview(result);
    setNotice(type === 'test-call' ? '调试调用完成' : '预览完成');
  }

  async function openRunDetail(id: string) {
    const data = await api<{ item: DataSourceRunItem }>(`/api/data-source-runs/${id}`);
    setRunDetail(data.item);
  }

  async function previewDraftRequest() {
    const payload = payloadFromForm();
    const params = jsonParse(form.requestParamsText, null);
    if (!params) {
      setNotice('运行参数 JSON 格式不正确');
      return;
    }
    const data = await api<typeof draftPreview>('/api/data-sources/test-call', {
      method: 'POST',
      body: JSON.stringify({ ...payload, params })
    });
    setDraftPreview(data);
    setNotice(data?.responsePathValid ? '请求预览完成，已提取返回字段' : '请求成功，但返回数据路径没有提取到数组');
  }

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyFilters, ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    load(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '查询失败'));
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>数据来源</h2>
            <span>调用外部系统接口，完成字段映射、规则适配和批量生成任务</span>
          </div>
          <AuthC authKey="integration:dataSource:add">
            <button className="secondaryButton compact" type="button" onClick={() => { setForm(emptyForm); setDraftPreview(null); setModalOpen(true); }}><Plus size={16} />新建数据来源</button>
          </AuthC>
        </div>

        <QueryFilterBar
          fields={[
            { name: 'keyword', label: '关键词', placeholder: '名称 / 系统 / URL' },
            { name: 'systemName', label: '业务系统', placeholder: '例如会员中心' },
            {
              name: 'status',
              label: '状态',
              type: 'select',
              placeholder: '全部状态',
              options: [{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]
            },
            { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
          ]}
          values={filters}
          onChange={(value) => setFilters({ ...emptyFilters, ...value })}
          onSearch={search}
        />

        <div className="dataSourceGrid">
          {items.map((item) => (
            <article className="dataSourceCard" key={item.id}>
              <div className="dataSourceCardHead">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.systemName} · {item.method}</span>
                </div>
                <StatusBadge status={item.status === 'enabled' ? 'enabled' : 'disabled'} />
              </div>
              <div className="dataSourceEndpoint">{item.endpoint}</div>
              <div className="metricGrid compactMetrics">
                <div><span>返回路径</span><strong>{item.responsePath}</strong></div>
                <div><span>去重键</span><strong>{item.dedupeKey}</strong></div>
                <div><span>最近执行</span><strong>{formatTime(item.lastRunAt)}</strong></div>
              </div>
              <p className="mutedText">{item.remark || '用于从外部系统拉取候选触达数据。'}</p>
              <div className="dataSourceActions">
                <button className="tableButton" type="button" onClick={() => openDetail(item)}><Eye size={14} />详情</button>
                <AuthC authKey="integration:dataSource:preview">
                  <button className="tableButton" type="button" onClick={() => openRunner(item)}><Play size={14} />预览生成</button>
                </AuthC>
                <AuthC authKey="integration:dataSource:edit">
                  <button className="tableButton" type="button" onClick={() => openEdit(item)}><Settings2 size={14} />编辑</button>
                </AuthC>
                <AuthC authKey="integration:dataSource:copy">
                  <button className="tableButton" type="button" onClick={() => copy(item)}><Copy size={14} />复制</button>
                </AuthC>
                <AuthC authKey="integration:dataSource:status">
                  <button className="tableButton" type="button" onClick={() => toggle(item)}><Power size={14} />{item.status === 'enabled' ? '停用' : '启用'}</button>
                </AuthC>
              </div>
            </article>
          ))}
        </div>
        {!items.length && <div className="dataTableWrap"><table className="dataTable"><tbody><TableEmptyState colSpan={1} title="暂无数据来源" description="新建数据来源后，可调用外部接口并批量生成触达任务。" /></tbody></table></div>}
        <ListPagination pagination={pagination} onChange={(page, pageSize) => load(filters, { ...pagination, page, pageSize })} />
      </section>

      <Modal open={modalOpen || Boolean(editing)} title={editing ? '编辑数据来源' : '新建数据来源'} subtitle="配置外部接口和字段映射" onClose={() => { setModalOpen(false); setEditing(null); setDraftPreview(null); }} showClose={false} size="wide">
        <form className="formPanel wideForm" onSubmit={save}>
          <div className="formGrid dataSourceFormGrid">
            <label>名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>业务系统<input value={form.systemName} onChange={(event) => setForm({ ...form, systemName: event.target.value })} required /></label>
            <label>接口地址<input value={form.endpoint} onChange={(event) => setForm({ ...form, endpoint: event.target.value })} required /></label>
            <label>请求方法<SelectField value={form.method} onChange={(value) => setForm({ ...form, method: value })} options={[{ value: 'GET', label: 'GET' }, { value: 'POST', label: 'POST' }]} /></label>
            <label>认证方式<SelectField value={form.authType} onChange={(value) => setForm({ ...form, authType: value, authorization: value === 'none' ? '' : form.authorization })} options={[{ value: 'none', label: '无认证' }, { value: 'authorization', label: 'Authorization 请求头' }]} /></label>
            {form.authType === 'authorization' && (
              <label>Authorization<input value={form.authorization} onChange={(event) => setForm({ ...form, authorization: event.target.value })} placeholder="例如 Bearer xxxxxx" /></label>
            )}
            <label>返回数据路径<input value={form.responsePath} onChange={(event) => setForm({ ...form, responsePath: event.target.value })} /></label>
            <label>去重键<SelectField value={form.dedupeKey} onChange={(value) => setForm({ ...form, dedupeKey: value })} options={[{ value: 'phone', label: '手机号' }, { value: 'userId', label: '用户 ID' }, { value: 'bizId', label: '业务 ID' }]} /></label>
            <label>默认规则<SelectField value={form.defaultRuleId} onChange={(value) => setForm({ ...form, defaultRuleId: value })} options={ruleOptions} placeholder="可选" /></label>
            <label>默认模板<SelectField value={form.defaultTemplateId} onChange={(value) => setForm({ ...form, defaultTemplateId: value })} options={templateOptions} placeholder="可选" /></label>
          </div>
          <label>运行参数 JSON<textarea rows={4} value={form.requestParamsText} onChange={(event) => setForm({ ...form, requestParamsText: event.target.value })} /></label>
          <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>
          {draftPreview && (
            <section className="approvalBlock">
              <strong>请求返回预览</strong>
              <div className="detailCard">
                <div><span>HTTP</span><strong>{draftPreview.statusCode || '-'}</strong></div>
                <div><span>耗时</span><strong>{draftPreview.elapsedMs ?? '-'}ms</strong></div>
                <div><span>数据路径</span><strong>{draftPreview.responsePathValid ? '有效' : '未提取到数组'}</strong></div>
                <div><span>提取条数</span><strong>{draftPreview.extractedCount || 0}</strong></div>
              </div>
              <div className="fieldHintList">
                {(draftPreview.fieldHints || []).slice(0, 24).map((field) => <code key={field}>{field}</code>)}
              </div>
              <pre className="responsePreview">{JSON.stringify(draftPreview.responseSample, null, 2)}</pre>
            </section>
          )}
          <section className="mappingHelp">
            <strong>字段映射要求</strong>
            <span>必须配置 `phone`，用于生成任务手机号；`variables` 的 key 要和短信模板变量名一致；`scene` 可来自接口字段，也可由规则或模板兜底；`bizId` / `userId` 用于去重和排查。</span>
          </section>
          <label className="fieldMappingEditor">字段映射 JSON<textarea rows={14} value={form.fieldMappingText} onChange={(event) => setForm({ ...form, fieldMappingText: event.target.value })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => { setModalOpen(false); setEditing(null); setDraftPreview(null); }}>取消</button>
            <button className="secondaryButton compact" type="button" onClick={previewDraftRequest}>预览请求返回</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(runner)} title="数据预览与生成任务" subtitle={runner?.name} onClose={() => setRunner(null)} size="wide">
        {runner && (
          <div className="formPanel wideForm">
            <div className="formGrid two">
              <label>选择规则<SelectField value={runRuleId} onChange={setRunRuleId} options={ruleOptions} placeholder="使用默认或不选" /></label>
              <label>选择模板<SelectField value={runTemplateId} onChange={setRunTemplateId} options={templateOptions} placeholder="使用默认或不选" /></label>
            </div>
            <label>运行参数 JSON<textarea rows={5} value={runParamsText} onChange={(event) => setRunParamsText(event.target.value)} /></label>
            <div className="modalActions">
              <AuthC authKey="integration:dataSource:test">
                <button className="secondaryButton compact" type="button" onClick={() => execute('test-call')}><FlaskConical size={14} />调试调用</button>
              </AuthC>
              <AuthC authKey="integration:dataSource:preview">
                <button className="secondaryButton compact" type="button" onClick={() => execute('preview')}><Database size={14} />预览数据</button>
              </AuthC>
              <AuthC authKey="integration:dataSource:createTasks">
                <button className="primaryButton compact" type="button" onClick={() => execute('create-tasks')}>确认生成任务</button>
              </AuthC>
            </div>
            {preview && (
              <section className="approvalBlock">
                <strong>预览结果</strong>
                <div className="detailCard">
                  <div><span>拉取</span><strong>{preview.summary?.totalCount || 0}</strong></div>
                  <div><span>有效</span><strong>{preview.summary?.validCount || 0}</strong></div>
                  <div><span>失败</span><strong>{preview.summary?.failedCount || 0}</strong></div>
                  <div><span>跳过</span><strong>{preview.summary?.skippedCount || 0}</strong></div>
                </div>
                <div className="dataTableWrap compactTable">
                  <table className="dataTable">
                    <thead><tr><th>行</th><th>手机号</th><th>场景</th><th>状态</th><th>说明</th></tr></thead>
                    <tbody>
                      {(preview.items || []).slice(0, 8).map((item) => (
                        <tr key={item.rowIndex}>
                          <td>{item.rowIndex}</td>
                          <td>{item.phoneMasked}</td>
                          <td>{sceneLabels[item.scene] || item.scene || '-'}</td>
                          <td><StatusBadge status={item.status === 'valid' ? 'success' : item.status} /></td>
                          <td>{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selected)} title="数据来源详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>名称</span><strong>{selected.name}</strong></div>
              <div><span>系统</span><strong>{selected.systemName}</strong></div>
              <div><span>状态</span><StatusBadge status={selected.status === 'enabled' ? 'enabled' : 'disabled'} /></div>
              <div><span>最近执行</span><strong>{formatTime(selected.lastRunAt)}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>字段映射</strong>
              <pre>{JSON.stringify(selected.fieldMapping, null, 2)}</pre>
            </section>
            <section className="approvalBlock">
              <strong>最近执行</strong>
              <div className="miniTimeline">
                {(selected.runs || []).length ? selected.runs?.map((run) => (
                  <button className="miniTimelineItem asButton" type="button" key={run.id} onClick={() => openRunDetail(run.id)}>
                    <div><strong>{runTypeLabel(run.runType)}</strong><span>{formatTime(run.createdAt)} · 有效 {run.summary?.validCount || 0}</span></div>
                    <StatusBadge status={run.status === 'success' ? 'success' : 'failed'} />
                  </button>
                )) : <span className="mutedText">暂无执行记录</span>}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(runDetail)} title="执行记录详情" subtitle={runTypeLabel(runDetail?.runType)} onClose={() => setRunDetail(null)}>
        {runDetail && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>状态</span><StatusBadge status={runDetail.status === 'success' ? 'success' : 'failed'} /></div>
              <div><span>总数</span><strong>{runDetail.summary?.totalCount || 0}</strong></div>
              <div><span>有效</span><strong>{runDetail.summary?.validCount || 0}</strong></div>
              <div><span>生成任务</span><strong>{runDetail.summary?.createdTaskCount || 0}</strong></div>
            </div>
            <div className="dataTableWrap compactTable">
              <table className="dataTable">
                <thead><tr><th>行</th><th>手机号</th><th>业务 ID</th><th>状态</th><th>说明</th></tr></thead>
                <tbody>
                  {(runDetail.items || []).map((item) => (
                    <tr key={item.id}>
                      <td>{item.rowIndex}</td>
                      <td>{item.phoneMasked || '-'}</td>
                      <td>{item.bizId || '-'}</td>
                      <td><StatusBadge status={item.status === 'valid' ? 'success' : item.status} /></td>
                      <td>{item.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
