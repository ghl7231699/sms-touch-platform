import React, { useEffect, useRef, useState } from 'react';
import { FileText, Layers3, MessageSquareText, Plus, RadioTower, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { sceneLabels } from '../../constants/labels';
import type { Template } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { EmptyState } from '../../components/EmptyState';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';

const defaultVariables = ['code', 'min'];
const defaultTestPhone = '18515385071';

function parseVariables(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function previewContent(content: string, variables: string[]) {
  return variables.reduce((result, variable) => {
    const sample = variable === 'code' ? '482619' : variable === 'min' ? '5' : `{${variable}}`;
    const pattern = new RegExp(`\\$\\{${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g');
    return result.replace(pattern, sample);
  }, content);
}

function previewWithParams(content: string, params: Record<string, string>) {
  return Object.entries(params).reduce((result, [key, value]) => {
    const pattern = new RegExp(`\\$\\{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`, 'g');
    return result.replace(pattern, value || `{${key}}`);
  }, content);
}

export default function Templates({ templates, onRefresh, setNotice }: { templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const urlParams = new URLSearchParams(window.location.search);
  const targetTemplateId = urlParams.get('templateId') || '';
  const [form, setForm] = useState({
    name: '',
    scene: 'register',
    providerTemplateId: '100001',
    content: '您的测试验证码为${code}，${min}分钟内有效。',
    variables: defaultVariables.join(', ')
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    scene: 'register',
    providerTemplateId: '',
    content: '',
    variables: defaultVariables.join(', ')
  });
  const [testingTemplate, setTestingTemplate] = useState<Template | null>(null);
  const [testForm, setTestForm] = useState({
    phone: defaultTestPhone,
    variables: 'code=482619\nmin=5'
  });
  const [filters, setFilters] = useState<QueryFilterValues>({
    keyword: '',
    scene: '',
    status: ''
  });
  const handledTemplateIdRef = useRef('');
  const sceneOptions = Object.entries(sceneLabels).map(([value, label]) => ({ value, label }));
  const sceneFilterOptions = sceneOptions;
  const statusFilterOptions = [
    { value: 'enabled', label: '启用' },
    { value: 'disabled', label: '停用' }
  ];
  const enabledCount = templates.filter((template) => template.status === 'enabled').length;
  const sceneEntries = Object.entries(sceneLabels).map(([scene, label]) => {
    const count = templates.filter((template) => template.scene === scene).length;
    const enabled = templates.filter((template) => template.scene === scene && template.status === 'enabled').length;
    return { scene, label, count, enabled };
  });
  const maxSceneCount = Math.max(...sceneEntries.map((item) => item.count), 1);
  const formVariables = parseVariables(form.variables);
  const editVariables = parseVariables(editForm.variables);
  const normalizedKeyword = filters.keyword.trim().toLowerCase();
  const filteredTemplates = templates.filter((template) => {
    const keywordMatched = !normalizedKeyword || [
      template.name,
      template.scene,
      sceneLabels[template.scene],
      template.providerTemplateId,
      template.content,
      template.variables.join(',')
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedKeyword));
    const sceneMatched = !filters.scene || template.scene === filters.scene;
    const statusMatched = !filters.status || template.status === filters.status;
    return keywordMatched && sceneMatched && statusMatched;
  });

  function search(nextFilters: QueryFilterValues) {
    setFilters({ keyword: '', scene: '', status: '', ...nextFilters });
  }

  useEffect(() => {
    if (!targetTemplateId || handledTemplateIdRef.current === targetTemplateId) return;
    const target = templates.find((template) => template.id === targetTemplateId || template.providerTemplateId === targetTemplateId);
    if (target) {
      handledTemplateIdRef.current = targetTemplateId;
      setSelectedTemplate(target);
    }
  }, [targetTemplateId, templates, selectedTemplate]);

  function parseTemplateParam(value: string) {
    return value.split('\n').reduce<Record<string, string>>((result, line) => {
      const [key, ...rest] = line.split('=');
      if (!key?.trim()) return result;
      result[key.trim()] = rest.join('=').trim();
      return result;
    }, {});
  }

  function variableLines(template: Template) {
    return template.variables.map((item) => `${item}=${item === 'code' ? '482619' : item === 'min' ? '5' : ''}`).join('\n');
  }

  function openEdit(template: Template) {
    setEditingTemplate(template);
    setEditForm({
      name: template.name,
      scene: template.scene,
      providerTemplateId: template.providerTemplateId,
      content: template.content,
      variables: template.variables.join(', ')
    });
  }

  function openTest(template: Template) {
    setTestingTemplate(template);
    setTestForm({ phone: defaultTestPhone, variables: variableLines(template) });
  }

  async function toggle(template: Template) {
    await api(`/api/templates/${template.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: template.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${template.name} 已${template.status === 'enabled' ? '停用' : '启用'}`);
    await onRefresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ ...form, variables: formVariables.length ? formVariables : defaultVariables })
    });
    setNotice(`${form.name} 已创建`);
    setForm({ ...form, name: '', variables: defaultVariables.join(', ') });
    setModalOpen(false);
    await onRefresh();
  }

  async function update(event: React.FormEvent) {
    event.preventDefault();
    if (!editingTemplate) return;
    const variables = editVariables.length ? editVariables : defaultVariables;
    await api(`/api/templates/${editingTemplate.id}/update`, {
      method: 'POST',
      body: JSON.stringify({ ...editForm, variables })
    });
    setNotice(`${editForm.name} 已更新`);
    setEditingTemplate(null);
    await onRefresh();
  }

  async function testSend(event: React.FormEvent) {
    event.preventDefault();
    if (!testingTemplate) return;
    await api('/api/manual-send', {
      method: 'POST',
      body: JSON.stringify({
        templateId: testingTemplate.id,
        phone: testForm.phone,
        templateParam: parseTemplateParam(testForm.variables)
      })
    });
    setNotice(`${testingTemplate.name} 测试短信已提交`);
    setTestingTemplate(null);
    await onRefresh();
  }

  return (
    <section className="stack">
      <section className="templateHero">
        <div>
          <span className="eyebrow">Template center</span>
          <h1>模板中心</h1>
          <p>统一管理运营短信内容、服务商模板 Code 和变量结构，为规则中心和手动发送提供稳定素材。</p>
        </div>
        <AuthC authKey="touch:template:add">
          <button className="primaryButton compact" type="button" onClick={() => setModalOpen(true)}><Plus size={16} />新建模板</button>
        </AuthC>
      </section>

      <section className="templateSummaryGrid">
        <article className="templateSummaryCard">
          <div><FileText size={18} /></div>
          <span>模板总数</span>
          <strong>{templates.length}</strong>
          <p>{enabledCount} 个已启用</p>
        </article>
        <article className="templateSummaryCard green">
          <div><Sparkles size={18} /></div>
          <span>启用率</span>
          <strong>{templates.length ? `${((enabledCount / templates.length) * 100).toFixed(1)}%` : '0.0%'}</strong>
          <p>停用模板不可被新规则误用</p>
        </article>
        <article className="templateSummaryCard amber">
          <div><Layers3 size={18} /></div>
          <span>覆盖场景</span>
          <strong>{sceneEntries.filter((item) => item.count > 0).length}</strong>
          <p>注册、会员、活动、售后等场景</p>
        </article>
        <article className="templateSummaryCard">
          <div><RadioTower size={18} /></div>
          <span>Provider Code</span>
          <strong>{new Set(templates.map((template) => template.providerTemplateId)).size}</strong>
          <p>服务商模板 Code 去重统计</p>
        </article>
      </section>

      <section className="templateWorkspace">
        <section className="panel templateLibraryPanel">
        <div className="panelTitle">
          <div>
            <h2>模板库</h2>
            <span>卡片展示模板状态、变量和发送预览 · 当前 {filteredTemplates.length}/{templates.length} 个</span>
          </div>
          <AuthC authKey="touch:template:add">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><FileText size={16} />新建模板</button>
          </AuthC>
        </div>
        <QueryFilterBar
          fields={[
            { name: 'keyword', label: '关键词', placeholder: '名称、Code、变量或内容', span: 8 },
            { name: 'scene', label: '业务场景', type: 'select', placeholder: '全部场景', options: sceneFilterOptions },
            { name: 'status', label: '状态', type: 'select', placeholder: '全部状态', options: statusFilterOptions }
          ]}
          values={filters}
          onChange={(value) => setFilters({ keyword: '', scene: '', status: '', ...value })}
          onSearch={search}
        />
        <div className="templateGrid">
          {!templates.length && <EmptyState title="暂无短信模板" description="新建模板后，规则中心和手动发送才能选择对应短信内容。" />}
          {templates.length > 0 && !filteredTemplates.length && <EmptyState title="没有匹配的模板" description="试试调整关键词、业务场景或状态筛选条件。" />}
          {filteredTemplates.map((template) => (
            <article className="templateCard" key={template.id}>
              <div className="templateTop">
                <div>
                  <strong>{template.name}</strong>
                  <span>{sceneLabels[template.scene] || template.scene} · Code {template.providerTemplateId}</span>
                </div>
                <StatusBadge status={template.status} />
              </div>
              <p className="templateContent">{template.content}</p>
              <div className="chips">
                {template.variables.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="templatePreviewBox">
                <span>变量预览</span>
                <strong>{previewContent(template.content, template.variables)}</strong>
              </div>
              <div className="templateActions">
                <button className="secondaryButton compact" type="button" onClick={() => setSelectedTemplate(template)}>详情</button>
                <AuthC authKey="touch:template:edit">
                  <button className="secondaryButton compact" type="button" onClick={() => openEdit(template)}>编辑</button>
                </AuthC>
                <AuthC authKey="touch:template:test">
                  <button className="secondaryButton compact" type="button" onClick={() => openTest(template)}>测试发送</button>
                </AuthC>
                <AuthC authKey="touch:template:status">
                  <button className="secondaryButton compact" type="button" onClick={() => toggle(template)}>
                    {template.status === 'enabled' ? '停用' : '启用'}
                  </button>
                </AuthC>
              </div>
            </article>
          ))}
        </div>
      </section>

        <aside className="panel templateScenePanel">
          <div className="panelTitle">
            <div>
              <h2>场景覆盖</h2>
              <span>观察模板素材是否覆盖主要运营场景</span>
            </div>
          </div>
          <div className="templateSceneList">
            {sceneEntries.map((item) => (
              <article key={item.scene}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.enabled}/{item.count} 启用</span>
                </div>
                <div className="miniBarTrack"><div style={{ width: `${Math.max((item.count / maxSceneCount) * 100, item.count ? 8 : 2)}%` }} /></div>
              </article>
            ))}
          </div>
          <div className="templateGuidance">
            <MessageSquareText size={18} />
            <div>
              <strong>模板建议</strong>
              <span>创建新规则前，先确认模板变量、服务商 Code 和场景一致，避免规则上线后发送内容不可控。</span>
            </div>
          </div>
        </aside>
      </section>

      <Modal open={modalOpen} title="新建模板" subtitle="配置服务商模板 Code、内容和变量预览" onClose={() => setModalOpen(false)} showClose={false} size="wide">
        <form className="formPanel" onSubmit={create}>
          <div className="formGrid two">
            <label>模板名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>业务场景
              <SelectField value={form.scene} options={sceneOptions} onChange={(scene) => setForm({ ...form, scene })} />
            </label>
            <label>服务商模板 Code<input value={form.providerTemplateId} onChange={(event) => setForm({ ...form, providerTemplateId: event.target.value })} /></label>
            <label>变量列表<input value={form.variables} onChange={(event) => setForm({ ...form, variables: event.target.value })} placeholder="code, min" /></label>
          </div>
          <label>模板内容<textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
          <div className="templateModalPreview">
            <span>短信预览</span>
            <strong>{previewContent(form.content, formVariables.length ? formVariables : defaultVariables)}</strong>
          </div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">创建</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editingTemplate)} title="编辑模板" subtitle="修改模板名称、场景、服务商 Code 和变量配置" onClose={() => setEditingTemplate(null)} showClose={false} size="wide">
        {editingTemplate && (
          <form className="formPanel" onSubmit={update}>
            <div className="formGrid two">
              <label>模板名称<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label>
              <label>业务场景
                <SelectField value={editForm.scene} options={sceneOptions} onChange={(scene) => setEditForm({ ...editForm, scene })} />
              </label>
              <label>服务商模板 Code<input value={editForm.providerTemplateId} onChange={(event) => setEditForm({ ...editForm, providerTemplateId: event.target.value })} /></label>
              <label>变量列表<input value={editForm.variables} onChange={(event) => setEditForm({ ...editForm, variables: event.target.value })} placeholder="code, min" /></label>
            </div>
            <label>模板内容<textarea value={editForm.content} onChange={(event) => setEditForm({ ...editForm, content: event.target.value })} /></label>
            <div className="templateModalPreview">
              <span>短信预览</span>
              <strong>{previewContent(editForm.content, editVariables.length ? editVariables : defaultVariables)}</strong>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setEditingTemplate(null)}>取消</button>
              <button className="primaryButton compact" type="submit">保存修改</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(testingTemplate)} title="模板测试发送" subtitle="复用手动发送链路，发送后可在发送记录查看结果" onClose={() => setTestingTemplate(null)} showClose={false} size="wide">
        {testingTemplate && (
          <form className="formPanel" onSubmit={testSend}>
            <div className="templateDetailHeader">
              <div>
                <span>{sceneLabels[testingTemplate.scene] || testingTemplate.scene}</span>
                <strong>{testingTemplate.name}</strong>
                <p>测试发送前请确认该手机号符合当前发送控制和白名单策略。</p>
              </div>
              <StatusBadge status={testingTemplate.status} />
            </div>
            <label>测试手机号<input value={testForm.phone} onChange={(event) => setTestForm({ ...testForm, phone: event.target.value })} required /></label>
            <label>变量参数<textarea value={testForm.variables} onChange={(event) => setTestForm({ ...testForm, variables: event.target.value })} /></label>
            <div className="templateModalPreview">
              <span>测试短信预览</span>
              <strong>{previewWithParams(testingTemplate.content, parseTemplateParam(testForm.variables))}</strong>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setTestingTemplate(null)}>取消</button>
              <button className="primaryButton compact" type="submit" disabled={testingTemplate.status !== 'enabled'}>发送测试</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(selectedTemplate)} title={selectedTemplate?.name || '模板详情'} subtitle="查看模板内容、变量和规则引用前信息" onClose={() => setSelectedTemplate(null)} size="wide">
        {selectedTemplate && (
          <div className="templateDetail">
            <div className="templateDetailHeader">
              <div>
                <span>{sceneLabels[selectedTemplate.scene] || selectedTemplate.scene}</span>
                <strong>{selectedTemplate.name}</strong>
                <p>服务商模板 Code：{selectedTemplate.providerTemplateId}</p>
              </div>
              <StatusBadge status={selectedTemplate.status} />
            </div>
            <div className="templateDetailGrid">
              <article>
                <span>模板内容</span>
                <p>{selectedTemplate.content}</p>
              </article>
              <article>
                <span>变量预览</span>
                <p>{previewContent(selectedTemplate.content, selectedTemplate.variables)}</p>
              </article>
            </div>
            <div className="chips">
              {selectedTemplate.variables.map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setSelectedTemplate(null)}>关闭</button>
              <button className="secondaryButton compact" type="button" onClick={() => {
                navigator.clipboard?.writeText(selectedTemplate.content);
                setNotice('模板内容已复制');
              }}>复制内容</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
