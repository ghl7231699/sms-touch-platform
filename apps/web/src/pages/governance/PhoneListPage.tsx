import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileUp, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { statusLabel } from '../../constants/labels';
import type { PhoneGovernanceItem } from '../../types';
import { Modal } from '../../components/Modal';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { TableEmptyState } from '../../components/EmptyState';

type PhoneListKind = 'whitelist' | 'blacklist' | 'unsubscribes';

const emptyForm = { phone: '', scene: '', remark: '', reason: '', source: 'manual' };
const emptyFilters = { phone: '', scene: '', status: '', source: '', dateFrom: '', dateTo: '' };

const emptyCopy: Record<PhoneListKind, { title: string; description: string }> = {
  whitelist: { title: '暂无白名单记录', description: '当前没有真实发送白名单号码，真实服务商发送会受到保护限制。' },
  blacklist: { title: '暂无黑名单记录', description: '当前没有被拦截的黑名单号码。' },
  unsubscribes: { title: '暂无退订记录', description: '当前没有用户退订记录。' }
};

function formatTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function sourceLabel(source?: string) {
  return {
    manual: '人工录入',
    import: '批量导入',
    complaint: '投诉登记',
    risk_control: '风控命中',
    sms_reply: '短信回复',
    provider_callback: '服务商回执'
  }[source || 'manual'] || source || '人工录入';
}

export default function PhoneListPage({ kind, title, setNotice }: { kind: PhoneListKind; title: string; setNotice: (value: string) => void }) {
  const [items, setItems] = useState<PhoneGovernanceItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [importText, setImportText] = useState('');
  const [modal, setModal] = useState<'create' | 'import' | null>(null);
  const [editing, setEditing] = useState<PhoneGovernanceItem | null>(null);
  const [selected, setSelected] = useState<PhoneGovernanceItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<PhoneGovernanceItem | null>(null);
  const endpoint = `/api/${kind}`;
  const canImport = kind === 'blacklist' || kind === 'unsubscribes';
  const canEdit = true;
  const authPrefix = kind === 'whitelist' ? 'security:whitelist' : kind === 'blacklist' ? 'security:blacklist' : 'security:unsubscribe';
  const parsedImportPhones = useMemo(() => {
    const raw = importText.split(/\s|,|，|;|；/).map((item) => item.trim()).filter(Boolean);
    const unique = [...new Set(raw)];
    return {
      raw,
      valid: unique.filter((phone) => /^1\d{10}$/.test(phone)),
      invalid: unique.filter((phone) => !/^1\d{10}$/.test(phone)),
      duplicatedCount: raw.length - unique.length
    };
  }, [importText]);

  const statusOptions = useMemo(() => {
    if (kind === 'whitelist') return [{ value: '', label: '全部状态' }, { value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }];
    return [{ value: '', label: '全部状态' }, { value: 'active', label: '生效中' }, { value: 'removed', label: '已移除' }];
  }, [kind]);

  async function load(nextFilters = filters, nextPagination = pagination) {
    const data = await api<{ items: PhoneGovernanceItem[]; total: number; page: number; pageSize: number }>(`${endpoint}?${withPaginationParams(nextFilters, nextPagination)}`);
    setItems(data.items);
    setPagination({ page: data.page, pageSize: data.pageSize, total: data.total });
  }

  useEffect(() => {
    setFilters(emptyFilters);
    load(emptyFilters).catch((error) => setNotice(error instanceof Error ? error.message : `${title}加载失败`));
  }, [kind]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(form)
    });
    setNotice(`${title}已更新`);
    setForm(emptyForm);
    setModal(null);
    await load();
  }

  async function fetchRecord(item: PhoneGovernanceItem) {
    const data = await api<{ item: PhoneGovernanceItem }>(`${endpoint}/${item.id}`);
    return data.item;
  }

  async function openEdit(item: PhoneGovernanceItem) {
    try {
      const detail = await fetchRecord(item);
      setEditing(detail);
      setForm({ phone: '', scene: detail.scene || '', remark: detail.remark || '', reason: detail.reason || '', source: detail.source || 'manual' });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${title}记录不存在`);
      await load();
    }
  }

  async function updateRecord(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const payload = kind === 'whitelist'
      ? { scene: form.scene, remark: form.remark }
      : kind === 'blacklist'
        ? { scene: form.scene, reason: form.reason, source: form.source }
        : { scene: form.scene, remark: form.remark, source: form.source };
    await api(`/api/${kind}/${editing.id}/update`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setNotice(`${title}记录已更新`);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function openDetail(item: PhoneGovernanceItem) {
    try {
      const detail = await fetchRecord(item);
      setSelected(detail);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${title}详情加载失败`);
      await load();
    }
  }

  function governanceEffect(item: PhoneGovernanceItem) {
    const active = ['enabled', 'active'].includes(item.status);
    if (kind === 'whitelist') {
      return active ? '真实短信发送前会放行该号码。' : '该号码不会参与真实发送白名单放行。';
    }
    if (kind === 'blacklist') {
      return active ? '发送前命中该号码会被拦截。' : '该号码当前不再参与黑名单拦截。';
    }
    return active ? '发送前命中该号码和场景会按退订拦截。' : '该退订记录当前不参与发送前拦截。';
  }

  function governanceDescription() {
    if (kind === 'whitelist') return '白名单用于真实服务商发送保护，仅白名单号码允许触达真实短信服务。';
    if (kind === 'blacklist') return '黑名单用于发送前强制拦截，适合投诉、风控、合规禁发等场景。';
    return '退订记录用于尊重用户退订意愿，同一手机号可按不同业务场景分别退订。';
  }

  function openStatusFromDetail(item: PhoneGovernanceItem) {
    setSelected(null);
    setStatusTarget(item);
  }

  function openEditFromDetail(item: PhoneGovernanceItem) {
    setSelected(null);
    void openEdit(item);
  }

  function statusActionText(item?: PhoneGovernanceItem | null) {
    if (!item) return '更新状态';
    if (kind === 'whitelist') return item.status === 'enabled' ? '停用' : '启用';
    return item.status === 'active' ? '移除' : '恢复';
  }

  async function toggle(item: PhoneGovernanceItem) {
    try {
      if (kind === 'whitelist') {
        await api(`/api/whitelist/${item.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: item.status === 'enabled' ? 'disabled' : 'enabled' })
        });
      } else {
        await api(`/api/${kind}/${item.id}/status`, {
          method: 'POST',
          body: JSON.stringify({ status: item.status === 'active' ? 'removed' : 'active' })
        });
      }
      setNotice(`${title}记录已${statusActionText(item)}`);
      setStatusTarget(null);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '状态更新失败');
    }
  }

  async function importPhones(event: React.FormEvent) {
    event.preventDefault();
    if (!parsedImportPhones.valid.length) {
      setNotice('没有可导入的有效手机号');
      return;
    }
    if (parsedImportPhones.invalid.length) {
      setNotice(`存在 ${parsedImportPhones.invalid.length} 个格式错误号码，请修正后再导入`);
      return;
    }
    const result = await api<{ jobId?: string; imported?: number }>(`/api/${kind}/import`, {
      method: 'POST',
      body: JSON.stringify({ phones: parsedImportPhones.valid, scene: form.scene, remark: form.remark, reason: form.reason, source: form.source })
    });
    setNotice(`已提交导入 ${result.imported ?? parsedImportPhones.valid.length} 个号码${result.jobId ? `，批次 ${result.jobId.slice(0, 8)}` : ''}`);
    setImportText('');
    setForm(emptyForm);
    setModal(null);
    await load();
  }

  async function exportWhitelist() {
    const result = await api<{ item?: { fileName?: string } }>('/api/whitelist/export', { method: 'POST' });
    setNotice(`白名单导出任务已生成：${result.item?.fileName || '等待生成'}`);
  }

  function search(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyFilters, ...nextFilters };
    const nextPagination = { ...pagination, page: 1 };
    setFilters(typedFilters);
    load(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '查询失败'));
  }

  function changePage(page: number, pageSize: number) {
    load(filters, { ...pagination, page, pageSize });
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>{title}</h2>
            <span>共 {items.length} 条，支持按手机号、状态、场景和日期查询</span>
          </div>
          <div className="inlineActions">
            <AuthC authKey={`${authPrefix}:add`}>
              <button className="secondaryButton compact" type="button" onClick={() => setModal('create')}><ShieldCheck size={16} />新增记录</button>
            </AuthC>
            {canImport && (
              <AuthC authKey={`${authPrefix}:import`}>
                <button className="secondaryButton compact" type="button" onClick={() => setModal('import')}><FileUp size={16} />批量导入</button>
              </AuthC>
            )}
            {kind === 'whitelist' && (
              <AuthC authKey="security:whitelist:export">
                <button className="secondaryButton compact" type="button" onClick={exportWhitelist}><Download size={16} />导出</button>
              </AuthC>
            )}
          </div>
        </div>

        <QueryFilterBar
          fields={[
            { name: 'phone', label: '手机号', placeholder: '请输入手机号' },
            { name: 'scene', label: '场景', placeholder: '请输入场景' },
            { name: 'status', label: '状态', type: 'select', placeholder: '全部状态', options: statusOptions.filter((option) => option.value) },
            ...(kind !== 'whitelist' ? [{ name: 'source', label: '来源', placeholder: '请输入来源' } as const] : []),
            { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
          ]}
          values={filters}
          onChange={(value) => setFilters({ ...emptyFilters, ...value })}
          onSearch={search}
        />

        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>手机号</th><th>场景</th><th>说明</th><th>来源</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.phoneMasked}</td>
                  <td>{item.scene || '全部'}</td>
                  <td>{item.remark || item.reason || '-'}</td>
                  <td>{item.source || 'manual'}</td>
                  <td><StatusBadge status={['enabled', 'active'].includes(item.status) ? 'enabled' : 'disabled'} /></td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>
                    <div className="inlineActions">
                      <AuthC authKey={`${authPrefix}:detail`}>
                        <button className="tableButton" type="button" onClick={() => openDetail(item)}>详情</button>
                      </AuthC>
                      {canEdit && (
                        <AuthC authKey={`${authPrefix}:edit`}>
                          <button className="tableButton" type="button" onClick={() => void openEdit(item)}>编辑</button>
                        </AuthC>
                      )}
                      {kind === 'whitelist' && (
                        <AuthC authKey="security:whitelist:status">
                          <button className="tableButton" type="button" onClick={() => setStatusTarget(item)}>{statusActionText(item)}</button>
                        </AuthC>
                      )}
                      {kind === 'blacklist' && (
                        <AuthC authKey="security:blacklist:remove">
                          <button className="tableButton" type="button" onClick={() => setStatusTarget(item)}>{statusActionText(item)}</button>
                        </AuthC>
                      )}
                      {kind === 'unsubscribes' && (
                        <AuthC authKey="security:unsubscribe:status">
                          <button className="tableButton" type="button" onClick={() => setStatusTarget(item)}>{statusActionText(item)}</button>
                        </AuthC>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && <TableEmptyState colSpan={7} title={emptyCopy[kind].title} description={emptyCopy[kind].description} />}
            </tbody>
          </table>
        </div>
        <ListPagination pagination={pagination} onChange={changePage} />
      </section>

      <Modal open={modal === 'create'} title="新增记录" subtitle={kind === 'whitelist' ? '真实发送保护' : '发送前拦截'} onClose={() => setModal(null)} showClose={false}>
        <form className="formPanel" onSubmit={submit}>
            <label>手机号<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
            <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} placeholder="留空表示全部场景" /></label>
            {kind !== 'whitelist' && (
              <label>来源
                <SelectField
                  value={form.source}
                  options={[
                    { value: 'manual', label: '人工录入' },
                    { value: 'complaint', label: '投诉登记' },
                    { value: 'risk_control', label: '风控命中' },
                    { value: 'provider_callback', label: '服务商回执' }
                  ]}
                  onChange={(source) => setForm({ ...form, source })}
                />
              </label>
            )}
            {kind === 'blacklist'
              ? <label>原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
              : <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModal(null)}>取消</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={modal === 'import'} title="批量导入" subtitle="每行、逗号或空格分隔手机号" onClose={() => setModal(null)} showClose={false}>
        <form className="formPanel" onSubmit={importPhones}>
          <label>号码列表<textarea value={importText} onChange={(event) => setImportText(event.target.value)} required /></label>
          <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} placeholder="留空表示全部场景" /></label>
          {importText && (
            <div className="fieldBlock">
              <span>导入预检查</span>
              <strong>有效 {parsedImportPhones.valid.length} 个，错误 {parsedImportPhones.invalid.length} 个，重复 {parsedImportPhones.duplicatedCount} 个</strong>
            </div>
          )}
          {kind === 'blacklist'
            ? <label>导入原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            : <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModal(null)}>取消</button>
            <button className="primaryButton compact" type="submit">导入</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editing)} title={`编辑${kind === 'whitelist' ? '白名单' : kind === 'blacklist' ? '黑名单' : '退订记录'}`} subtitle={editing?.phoneMasked} onClose={() => setEditing(null)} showClose={false}>
        <form className="formPanel" onSubmit={updateRecord}>
          <label>场景<input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} /></label>
          {kind !== 'whitelist' && (
            <label>来源
              <SelectField
                value={form.source}
                options={[
                  { value: 'manual', label: '人工录入' },
                  { value: 'complaint', label: '投诉登记' },
                  { value: 'risk_control', label: '风控命中' },
                  { value: 'provider_callback', label: '服务商回执' },
                  { value: 'import', label: '批量导入' }
                ]}
                onChange={(source) => setForm({ ...form, source })}
              />
            </label>
          )}
          {kind === 'blacklist'
            ? <label>原因<input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
            : <label>备注<input value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setEditing(null)}>取消</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(statusTarget)} title={`${statusActionText(statusTarget)}记录`} subtitle={statusTarget?.phoneMasked} onClose={() => setStatusTarget(null)} showClose={false}>
        {statusTarget && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>手机号</span><strong>{statusTarget.phoneMasked}</strong></div>
              <div><span>场景</span><strong>{statusTarget.scene || '全部'}</strong></div>
              <div><span>当前状态</span><StatusBadge status={['enabled', 'active'].includes(statusTarget.status) ? 'enabled' : 'disabled'} /></div>
            </div>
            <div className="fieldBlock">
              <span>操作说明</span>
              <strong>{kind === 'whitelist' ? '停用后该号码将不能通过真实发送白名单校验。' : '移除后该号码不再参与发送前拦截；恢复后会重新生效。'}</strong>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setStatusTarget(null)}>取消</button>
              <button className="primaryButton compact" type="button" onClick={() => toggle(statusTarget)}>{statusActionText(statusTarget)}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selected)} title={`${title}详情`} onClose={() => setSelected(null)}>
        {selected && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>手机号</span><strong>{selected.phoneMasked}</strong></div>
              <div><span>场景</span><strong>{selected.scene || '全部'}</strong></div>
              <div><span>状态</span><StatusBadge status={['enabled', 'active'].includes(selected.status) ? 'enabled' : 'disabled'} /></div>
              <div><span>状态说明</span><strong>{statusLabel(selected.status)}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>治理效果</strong>
              <p>{governanceEffect(selected)}</p>
            </section>
            <section className="approvalBlock">
              <strong>业务说明</strong>
              <p>{governanceDescription()}</p>
            </section>
            <div className="detailCard">
              <div><span>{kind === 'blacklist' ? '拦截原因' : '备注'}</span><strong>{selected.reason || selected.remark || '-'}</strong></div>
              <div><span>来源</span><strong>{sourceLabel(selected.source)}</strong></div>
              <div><span>创建人</span><strong>{selected.createdById || '-'}</strong></div>
              <div><span>记录 ID</span><strong>{selected.id}</strong></div>
            </div>
            <div className="detailCard">
              <div><span>创建时间</span><strong>{formatTime(selected.createdAt)}</strong></div>
              <div><span>更新时间</span><strong>{formatTime(selected.updatedAt)}</strong></div>
              {kind === 'blacklist' && <div><span>移除时间</span><strong>{formatTime(selected.removedAt)}</strong></div>}
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setSelected(null)}>关闭</button>
              {canEdit && (
                <AuthC authKey={`${authPrefix}:edit`}>
                  <button className="secondaryButton compact" type="button" onClick={() => openEditFromDetail(selected)}>编辑</button>
                </AuthC>
              )}
              {kind === 'whitelist' && (
                <AuthC authKey="security:whitelist:status">
                  <button className="primaryButton compact" type="button" onClick={() => openStatusFromDetail(selected)}>{statusActionText(selected)}</button>
                </AuthC>
              )}
              {kind === 'blacklist' && (
                <AuthC authKey="security:blacklist:remove">
                  <button className="primaryButton compact" type="button" onClick={() => openStatusFromDetail(selected)}>{statusActionText(selected)}</button>
                </AuthC>
              )}
              {kind === 'unsubscribes' && (
                <AuthC authKey="security:unsubscribe:status">
                  <button className="primaryButton compact" type="button" onClick={() => openStatusFromDetail(selected)}>{statusActionText(selected)}</button>
                </AuthC>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
