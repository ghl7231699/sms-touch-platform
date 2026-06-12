import React, { useEffect, useRef, useState } from 'react';
import { FileText, Layers3, RadioTower, Sparkles } from 'lucide-react';
import { Button, Dropdown, Empty } from 'antd';
import { api } from '../../lib/api';
import { sceneLabels } from '../../constants/labels';
import type { Template } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC, requireAuth } from '../../lib/auth';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';

const defaultVariables = ['link'];
const defaultTestPhone = '18515385071';
const defaultShortLinkTarget = 'https://example.com/sms-touch-platform';
const sceneTemplatePresets: Record<string, { content: string; variables: string[]; providerTemplateId: string; shortLinkTargetUrl: string }> = {
  register: {
    providerTemplateId: '100001',
    content: '欢迎注册速通互联，开通会员可解锁专属权益，点击查看：${link}',
    variables: ['link'],
    shortLinkTargetUrl: `${defaultShortLinkTarget}/register`
  },
  member: {
    providerTemplateId: '100002',
    content: '您的会员权益已到期，续费后可继续使用专属权益，点击续费：${link}',
    variables: ['link'],
    shortLinkTargetUrl: `${defaultShortLinkTarget}/member-renewal`
  },
  campaign: {
    providerTemplateId: '100003',
    content: '活动已开启，限时权益等你领取，点击参与：${link}',
    variables: ['link'],
    shortLinkTargetUrl: `${defaultShortLinkTarget}/campaign`
  },
  after_sale: {
    providerTemplateId: '100001',
    content: '您的订单服务已完成，欢迎查看服务详情并反馈体验：${link}',
    variables: ['link'],
    shortLinkTargetUrl: `${defaultShortLinkTarget}/service-feedback`
  }
};

function presetForScene(scene: string) {
  return sceneTemplatePresets[scene] || sceneTemplatePresets.register;
}

function parseVariables(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function previewContent(content: string, variables: string[]) {
  return variables.reduce((result, variable) => {
    const sample = variable === 'code'
      ? '482619'
      : variable === 'min'
        ? '5'
        : variable === 'link'
          ? 'http://127.0.0.1:3100/s/demo1'
          : `{${variable}}`;
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
    providerTemplateId: sceneTemplatePresets.register.providerTemplateId,
    content: sceneTemplatePresets.register.content,
    variables: sceneTemplatePresets.register.variables.join(', '),
    shortLinkTargetUrl: sceneTemplatePresets.register.shortLinkTargetUrl
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    scene: 'register',
    providerTemplateId: '',
    content: '',
    variables: defaultVariables.join(', '),
    shortLinkTargetUrl: ''
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
  const coveredSceneCount = new Set(templates.map((template) => template.scene)).size;
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
    return template.variables.map((item) => `${item}=${item === 'code' ? '482619' : item === 'min' ? '5' : item === 'link' ? 'http://127.0.0.1:3100/s/demo1' : ''}`).join('\n');
  }

  function openEdit(template: Template) {
    setEditingTemplate(template);
    setEditForm({
      name: template.name,
      scene: template.scene,
      providerTemplateId: template.providerTemplateId,
      content: template.content,
      variables: template.variables.join(', '),
      shortLinkTargetUrl: template.shortLinkTargetUrl || ''
    });
  }

  function openTest(template: Template) {
    setTestingTemplate(template);
    setTestForm({ phone: defaultTestPhone, variables: variableLines(template) });
  }

  function applyScenePreset(scene: string) {
    const preset = presetForScene(scene);
    setForm({
      ...form,
      scene,
      providerTemplateId: preset.providerTemplateId,
      content: preset.content,
      variables: preset.variables.join(', '),
      shortLinkTargetUrl: preset.shortLinkTargetUrl
    });
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

  async function removeTemplate() {
    if (!deletingTemplate) return;
    try {
      await api(`/api/templates/${deletingTemplate.id}/delete`, { method: 'POST' });
      setNotice(`${deletingTemplate.name} 已删除`);
      setDeletingTemplate(null);
      await onRefresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模板删除失败');
    }
  }

  function templateMenuItems(template: Template) {
    return [
      requireAuth('touch:template:edit') ? { key: 'edit', label: '编辑模板' } : null,
      requireAuth('touch:template:test') ? { key: 'test', label: '测试发送' } : null,
      requireAuth('touch:template:status')
        ? { key: 'toggle', label: template.status === 'enabled' ? '停用模板' : '启用模板' }
        : null,
      requireAuth('touch:template:delete') ? { key: 'delete', label: '删除模板', danger: true } : null
    ].filter((item): item is { key: string; label: string; danger?: boolean } => Boolean(item));
  }

  function handleTemplateMenuClick(action: string, template: Template) {
    if (action === 'edit') openEdit(template);
    if (action === 'test') openTest(template);
    if (action === 'toggle') toggle(template);
    if (action === 'delete') setDeletingTemplate(template);
  }

  return (
    <section className="stack templateOpsPage">
      <section className="templateOpsSummaryPanel">
        <div className="templateOpsHeader">
          <div>
            <h1>模板中心</h1>
            <p>统一管理运营短信内容、服务商模板 Code 和变量结构，为规则中心和手动发送提供稳定素材。</p>
          </div>
          <AuthC authKey="touch:template:add">
            <Button type="primary" onClick={() => setModalOpen(true)}>新建模板</Button>
          </AuthC>
        </div>

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
            <strong>{coveredSceneCount}</strong>
            <p>注册、会员、活动、售后等场景</p>
          </article>
          <article className="templateSummaryCard">
            <div><RadioTower size={18} /></div>
            <span>Provider Code</span>
            <strong>{new Set(templates.map((template) => template.providerTemplateId)).size}</strong>
            <p>服务商模板 Code 去重统计</p>
          </article>
        </section>
      </section>

      <section className="templateWorkspace">
        <section className="panel templateLibraryPanel">
        <div className="panelTitle">
          <div>
            <h2>模板库</h2>
            <span>按场景、状态、变量和服务商 Code 管理模板 · 当前 {filteredTemplates.length}/{templates.length} 个</span>
          </div>
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

        {!filteredTemplates.length ? (
          <div className="templateOpsEmpty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={templates.length ? '没有匹配的模板' : '暂无短信模板'}>
              {!templates.length && (
                <AuthC authKey="touch:template:add">
                  <Button type="primary" onClick={() => setModalOpen(true)}>创建第一条模板</Button>
                </AuthC>
              )}
            </Empty>
          </div>
        ) : (
          <div className="templateOpsTableWrap">
            <div className="templateOpsTableHeader">
              <div className="templateOpsScrollCols">
                <span>模板</span>
                <span>场景</span>
                <span>状态</span>
                <span>变量预览</span>
              </div>
              <span className="templateOpsFixedHead">操作</span>
            </div>
            <div className="templateOpsRows">
              {filteredTemplates.map((template) => {
                const menuItems = templateMenuItems(template);
                return (
                  <article className="templateOpsRow" key={template.id}>
                    <div className="templateOpsScrollCols">
                      <div className="templateOpsNameCell">
                        <strong title={template.name}>{template.name}</strong>
                        <span>Code {template.providerTemplateId}</span>
                        <p title={template.content}>{template.content}</p>
                      </div>
                      <div className="templateOpsSceneCell">
                        <strong>{sceneLabels[template.scene] || template.scene}</strong>
                        <span>{template.scene}</span>
                      </div>
                      <div className="templateOpsStatusCell">
                        <StatusBadge status={template.status} />
                        <span>{template.status === 'enabled' ? '可被规则和手动发送使用' : '不可用于新发送'}</span>
                      </div>
                      <div className="templateOpsPreviewCell">
                        <strong>{previewContent(template.content, template.variables)}</strong>
                        <div className="chips">
                          {template.variables.map((item) => <span key={item}>{item}</span>)}
                        </div>
                      </div>
                    </div>
                    <div className="templateOpsActions">
                      <Button type="primary" size="small" onClick={() => setSelectedTemplate(template)}>详情</Button>
                      <Dropdown
                        disabled={!menuItems.length}
                        menu={{
                          items: menuItems,
                          onClick: ({ key }) => handleTemplateMenuClick(String(key), template)
                        }}
                        trigger={['click']}
                      >
                        <Button size="small">更多</Button>
                      </Dropdown>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      </section>

      <Modal open={modalOpen} title="新建模板" subtitle="配置服务商模板 Code、内容和变量预览" onClose={() => setModalOpen(false)} showClose={false} size="wide">
        <form className="formPanel" onSubmit={create}>
          <div className="formGrid two">
            <label>模板名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>业务场景
              <SelectField value={form.scene} options={sceneOptions} onChange={applyScenePreset} />
            </label>
            <label>服务商模板 Code<input value={form.providerTemplateId} onChange={(event) => setForm({ ...form, providerTemplateId: event.target.value })} /></label>
            <label>变量列表<input value={form.variables} onChange={(event) => setForm({ ...form, variables: event.target.value })} placeholder="link" /></label>
            <label>短链目标地址<input value={form.shortLinkTargetUrl} onChange={(event) => setForm({ ...form, shortLinkTargetUrl: event.target.value })} placeholder="https://example.com/landing-page" /></label>
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
              <label>变量列表<input value={editForm.variables} onChange={(event) => setEditForm({ ...editForm, variables: event.target.value })} placeholder="link" /></label>
              <label>短链目标地址<input value={editForm.shortLinkTargetUrl} onChange={(event) => setEditForm({ ...editForm, shortLinkTargetUrl: event.target.value })} placeholder="https://example.com/landing-page" /></label>
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

      <Modal open={Boolean(deletingTemplate)} title="删除模板" subtitle={deletingTemplate?.name} onClose={() => setDeletingTemplate(null)} showClose={false}>
        {deletingTemplate && (
          <div className="stack">
            <div className="taskActionState confirm">
              <div>
                <strong>确认删除 {deletingTemplate.name}？</strong>
                <span>删除后模板中心不再展示该模板。若模板已被规则、任务或发送记录使用，系统会阻止删除，请改为停用模板。</span>
              </div>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setDeletingTemplate(null)}>取消</button>
              <button className="primaryButton compact dangerButton" type="button" onClick={removeTemplate}>删除</button>
            </div>
          </div>
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
              <article>
                <span>短链目标</span>
                <p>{selectedTemplate.shortLinkTargetUrl || '使用发送控制默认目标地址'}</p>
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
