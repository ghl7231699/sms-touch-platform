import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminUser, AdminUserDetail, RegisterRequestItem, RoleItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthTree } from '../../components/AuthTree';
import { AuthC, getAccessData, requireAuth } from '../../lib/auth';
import { operationLabel } from '../../constants/labels';
import { QueryFilterBar, type QueryFilterValues } from '../../components/QueryFilterBar';
import { defaultPagination, ListPagination, withPaginationParams, type PaginationState } from '../../components/ListPagination';
import { TableEmptyState } from '../../components/EmptyState';

type UserTab = 'users' | 'requests';

const emptyUserForm = { email: '', name: '', phone: '', roleCode: 'operator' };
const emptyRejectForm = { reason: '' };
const emptyUserFilters = { keyword: '', status: '', dateFrom: '', dateTo: '' };
const emptyRequestFilters = { keyword: '', status: '', dateFrom: '', dateTo: '' };
const emptyResetResult = { setupToken: '', setupUrl: '', expiresAt: '' };
const emptyCreateResult = { name: '', email: '', initialPassword: '' };

async function copyText(value: string) {
  if (!value) return false;
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return true;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function UsersPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [tab, setTab] = useState<UserTab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<RegisterRequestItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [userFilters, setUserFilters] = useState(emptyUserFilters);
  const [requestFilters, setRequestFilters] = useState(emptyRequestFilters);
  const [userPagination, setUserPagination] = useState<PaginationState>(defaultPagination);
  const [requestPagination, setRequestPagination] = useState<PaginationState>(defaultPagination);
  const [form, setForm] = useState(emptyUserForm);
  const [editForm, setEditForm] = useState({ id: '', name: '', phone: '', roleCode: 'operator' });
  const [rejectForm, setRejectForm] = useState(emptyRejectForm);
  const [createResult, setCreateResult] = useState(emptyCreateResult);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [statusUser, setStatusUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [resetResult, setResetResult] = useState(emptyResetResult);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] as string[] });
  const [selectedRequest, setSelectedRequest] = useState<RegisterRequestItem | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<RegisterRequestItem | null>(null);
  const roleOptions = roles.map((role) => ({ value: role.code, label: role.name }));
  const roleMap = new Map(roles.map((role) => [role.code, role]));
  const editingRole = roleMap.get(editForm.roleCode);
  const canEditSelectedRolePermission = Boolean(editingRole && editingRole.code !== 'admin' && requireAuth('account:user:roleEdit'));

  function syncRoleForm(roleCode: string) {
    const role = roleMap.get(roleCode);
    setRoleForm({
      name: role?.name || '',
      description: role?.description || '',
      permissions: role?.permissions || []
    });
  }

  function permissionChanged(role?: RoleItem) {
    if (!role) return false;
    const source = [...new Set(role.permissions)].sort();
    const next = [...new Set(roleForm.permissions)].sort();
    return source.length !== next.length || source.some((permission, index) => permission !== next[index]);
  }

  function isSystemAdmin(user?: Pick<AdminUser, 'roles'> | null) {
    return Boolean(user?.roles.some((role) => role.code === 'admin'));
  }

  function isCurrentPlatformAdmin() {
    return Boolean(getAccessData()?.roles?.some((role) => role.code === 'admin'));
  }

  async function loadUsers(nextFilters = userFilters, nextPagination = userPagination) {
    const userData = await api<{ items: AdminUser[]; total: number; page: number; pageSize: number }>(`/api/users?${withPaginationParams(nextFilters, nextPagination)}`);
    setUsers(userData.items);
    setUserPagination({ page: userData.page, pageSize: userData.pageSize, total: userData.total });
  }

  async function loadRequests(nextFilters = requestFilters, nextPagination = requestPagination) {
    const requestData = await api<{ items: RegisterRequestItem[]; total: number; page: number; pageSize: number }>(`/api/auth/register-requests?${withPaginationParams(nextFilters, nextPagination)}`);
    setRequests(requestData.items);
    setRequestPagination({ page: requestData.page, pageSize: requestData.pageSize, total: requestData.total });
  }

  async function loadRoles() {
    const roleData = await api<{ items: RoleItem[] }>('/api/roles');
    setRoles(roleData.items);
  }

  async function load() {
    await Promise.all([loadUsers(), loadRoles(), loadRequests()]);
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '用户加载失败'));
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ initialPassword?: string }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(form)
    });
    setCreateResult({
      name: form.name,
      email: form.email,
      initialPassword: result.initialPassword || ''
    });
    setNotice('用户已创建');
    setForm(emptyUserForm);
    setCreateOpen(false);
    await load();
  }

  function searchUsers(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyUserFilters, ...nextFilters };
    const nextPagination = { ...userPagination, page: 1 };
    setUserFilters(typedFilters);
    loadUsers(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '用户查询失败'));
  }

  function searchRequests(nextFilters: QueryFilterValues) {
    const typedFilters = { ...emptyRequestFilters, ...nextFilters };
    const nextPagination = { ...requestPagination, page: 1 };
    setRequestFilters(typedFilters);
    loadRequests(typedFilters, nextPagination).catch((error) => setNotice(error instanceof Error ? error.message : '注册申请查询失败'));
  }

  function changeUserPage(page: number, pageSize: number) {
    loadUsers(userFilters, { ...userPagination, page, pageSize }).catch((error) => setNotice(error instanceof Error ? error.message : '用户加载失败'));
  }

  function changeRequestPage(page: number, pageSize: number) {
    loadRequests(requestFilters, { ...requestPagination, page, pageSize }).catch((error) => setNotice(error instanceof Error ? error.message : '注册申请加载失败'));
  }

  function openEdit(user: AdminUser) {
    const roleCode = user.roles[0]?.code || 'operator';
    setEditing(user);
    setEditForm({
      id: user.id,
      name: user.name,
      phone: user.phone || '',
      roleCode
    });
    syncRoleForm(roleCode);
  }

  async function updateUser(event: React.FormEvent) {
    event.preventDefault();
    const roleToUpdate = roleMap.get(editForm.roleCode);
    const shouldUpdateRolePermission = Boolean(
      roleToUpdate &&
      roleToUpdate.code !== 'admin' &&
      requireAuth('account:user:roleEdit') &&
      permissionChanged(roleToUpdate)
    );
    await api(`/api/users/${editForm.id}/update`, {
      method: 'POST',
      body: JSON.stringify({
        name: editForm.name,
        phone: editForm.phone,
        roleCode: editForm.roleCode
      })
    });
    if (shouldUpdateRolePermission && roleToUpdate) {
      await api(`/api/roles/${roleToUpdate.id}/update`, {
        method: 'POST',
        body: JSON.stringify({
          name: roleForm.name,
          description: roleForm.description,
          permissions: roleForm.permissions,
          status: roleToUpdate.status
        })
      });
    }
    setNotice(shouldUpdateRolePermission ? '用户信息和角色权限已更新' : '用户信息已更新');
    setEditing(null);
    await load();
  }

  async function changeStatus(user: AdminUser) {
    if (isSystemAdmin(user)) {
      setNotice('系统管理员账号不能在前端禁用');
      setStatusUser(null);
      return;
    }
    try {
      await api(`/api/users/${user.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: user.status === 'active' ? 'disabled' : 'active' })
      });
      setNotice(`${user.name} 已${user.status === 'active' ? '禁用' : '启用'}`);
      setStatusUser(null);
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '用户状态更新失败');
    }
  }

  async function resetPassword() {
    if (!resetUser) return;
    const result = await api<{ setupToken: string; expiresAt?: string }>(`/api/users/${resetUser.id}/reset-password`, { method: 'POST' });
    const setupUrl = `${window.location.origin}/set-password?token=${encodeURIComponent(result.setupToken)}`;
    setResetResult({ setupToken: result.setupToken, setupUrl, expiresAt: result.expiresAt || '' });
    setNotice(`${resetUser.name} 的密码已重置，请发送设置密码链接给用户`);
    await load();
  }

  async function copyResetLink() {
    if (!resetResult.setupUrl) return;
    try {
      const copied = await copyText(resetResult.setupUrl);
      setNotice(copied ? '设置密码链接已复制' : '复制失败，请手动复制链接');
    } catch {
      setNotice('复制失败，请手动复制链接');
    }
  }

  async function copyInitialPassword() {
    if (!createResult.initialPassword) return;
    try {
      const copied = await copyText(createResult.initialPassword);
      setNotice(copied ? '初始密码已复制' : '复制失败，请手动复制初始密码');
    } catch {
      setNotice('复制失败，请手动复制初始密码');
    }
  }

  async function openUserDetail(user: AdminUser) {
    const data = await api<{ item: AdminUserDetail }>(`/api/users/${user.id}`);
    setSelectedUser(data.item);
  }

  async function deleteUser() {
    if (!deletingUser) return;
    if (isSystemAdmin(deletingUser)) {
      setNotice('系统管理员账号不能在前端删除');
      setDeletingUser(null);
      return;
    }
    await api(`/api/users/${deletingUser.id}/delete`, { method: 'POST' });
    setNotice(`${deletingUser.name} 已删除`);
    setDeletingUser(null);
    await load();
  }

  async function approveRequest(item: RegisterRequestItem) {
    await api(`/api/auth/register-requests/${item.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ roleCode: item.requestedRole || 'operator' })
    });
    setNotice('注册申请已通过，账号已创建');
    setSelectedRequest(null);
    await load();
  }

  async function rejectRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!rejectingRequest) return;
    await api(`/api/auth/register-requests/${rejectingRequest.id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: rejectForm.reason })
    });
    setNotice('注册申请已驳回');
    setRejectingRequest(null);
    setRejectForm(emptyRejectForm);
    await load();
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <div>
            <h2>用户管理</h2>
            <span>后台账号、固定角色和注册申请审核</span>
          </div>
        </div>

        <div className="accountPageToolbar">
          <div className="accountTextTabs" role="tablist" aria-label="用户管理视图">
            <button className={`accountTextTab${tab === 'users' ? ' active' : ''}`} type="button" role="tab" aria-selected={tab === 'users'} onClick={() => setTab('users')}>
              <span>账号列表</span>
              <em>{userPagination.total}</em>
            </button>
            <button className={`accountTextTab${tab === 'requests' ? ' active' : ''}`} type="button" role="tab" aria-selected={tab === 'requests'} onClick={() => setTab('requests')}>
              <span>注册审核</span>
              <em>{requestPagination.total}</em>
            </button>
          </div>
          <div className="accountToolbarActions">
            {tab === 'users' && isCurrentPlatformAdmin() && (
              <AuthC authKey="account:user:add">
                <Button type="primary" onClick={() => setCreateOpen(true)}>新建账号</Button>
              </AuthC>
            )}
          </div>
        </div>

        {tab === 'users' && (
          <>
            <QueryFilterBar
              fields={[
                { name: 'keyword', label: '关键词', placeholder: '姓名 / 邮箱 / 手机号' },
                {
                  name: 'status',
                  label: '状态',
                  type: 'select',
                  placeholder: '全部状态',
                  options: [{ value: 'active', label: '启用' }, { value: 'disabled', label: '禁用' }, { value: 'locked', label: '锁定' }]
                },
                { name: 'createdAt', label: '创建日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
              ]}
              values={userFilters}
              onChange={(value) => setUserFilters({ ...emptyUserFilters, ...value })}
              onSearch={searchUsers}
            />
            <div className="dataTableWrap">
              <table className="dataTable">
                <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.name}</strong><span>{user.email}{user.phone ? ` · ${user.phone}` : ''}</span></td>
                      <td>
                        <div className="chips">
                          {user.roles.length ? user.roles.map((role) => <span key={role.code}>{role.name}</span>) : <span>-</span>}
                        </div>
                      </td>
                      <td><StatusBadge status={user.status === 'active' ? 'enabled' : 'disabled'} /></td>
                      <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-'}</td>
                      <td>
                        <div className="inlineActions">
                          <AuthC authKey="account:user:view">
                            <button className="tableButton" type="button" onClick={() => openUserDetail(user)}>详情</button>
                          </AuthC>
                          <AuthC authKey="account:user:edit">
                            <button className="tableButton" type="button" onClick={() => openEdit(user)}>编辑</button>
                          </AuthC>
                          <AuthC authKey="account:user:resetPassword">
                            <button className="tableButton" type="button" onClick={() => {
                              setResetUser(user);
                              setResetResult(emptyResetResult);
                            }}>重置密码</button>
                          </AuthC>
                          {!isSystemAdmin(user) && (
                            <AuthC authKey="account:user:status">
                              <button className="tableButton" type="button" onClick={() => setStatusUser(user)}>{user.status === 'active' ? '禁用' : '启用'}</button>
                            </AuthC>
                          )}
                          {!isSystemAdmin(user) && (
                            <AuthC authKey="account:user:delete">
                              <button className="tableButton danger" type="button" onClick={() => setDeletingUser(user)}>删除</button>
                            </AuthC>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!users.length && <TableEmptyState colSpan={5} title="暂无后台用户" description="当前筛选条件下没有后台账号记录。" />}
                </tbody>
              </table>
            </div>
            <ListPagination pagination={userPagination} onChange={changeUserPage} />
          </>
        )}

        {tab === 'requests' && (
          <>
            <QueryFilterBar
              fields={[
                { name: 'keyword', label: '关键词', placeholder: '姓名 / 邮箱 / 手机号' },
                {
                  name: 'status',
                  label: '状态',
                  type: 'select',
                  placeholder: '全部状态',
                  options: [{ value: 'pending', label: '待审核' }, { value: 'approved', label: '已通过' }, { value: 'rejected', label: '已驳回' }]
                },
                { name: 'createdAt', label: '申请日期', type: 'dateRange', fromName: 'dateFrom', toName: 'dateTo' }
              ]}
              values={requestFilters}
              onChange={(value) => setRequestFilters({ ...emptyRequestFilters, ...value })}
              onSearch={searchRequests}
            />
            <div className="dataTableWrap">
              <table className="dataTable">
                <thead><tr><th>申请人</th><th>申请角色</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
                <tbody>
                  {requests.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.name}</strong><span>{item.email}{item.phone ? ` · ${item.phone}` : ''}</span></td>
                      <td>{roleMap.get(item.requestedRole)?.name || item.requestedRole}</td>
                      <td><StatusBadge status={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'failed' : 'register_pending'} /></td>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>
                        <div className="inlineActions">
                          <AuthC authKey="account:user:view">
                            <button className="tableButton" type="button" onClick={() => setSelectedRequest(item)}>详情</button>
                          </AuthC>
                          {item.status === 'pending' && (
                            <AuthC authKey="account:user:approveRegister">
                              <button className="tableButton" type="button" onClick={() => approveRequest(item)}>通过</button>
                            </AuthC>
                          )}
                          {item.status === 'pending' && (
                            <AuthC authKey="account:user:rejectRegister">
                              <button className="tableButton" type="button" onClick={() => setRejectingRequest(item)}>驳回</button>
                            </AuthC>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!requests.length && <TableEmptyState colSpan={5} title="暂无注册申请" description="当前没有待处理或符合筛选条件的注册申请。" />}
                </tbody>
              </table>
            </div>
            <ListPagination pagination={requestPagination} onChange={changeRequestPage} />
          </>
        )}

      </section>

      <Modal open={createOpen} title="新建账号" subtitle="自动生成初始密码" onClose={() => setCreateOpen(false)} showClose={false}>
        <form className="formPanel" onSubmit={create}>
          <label>姓名<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>邮箱<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>手机号<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
          <label>角色<SelectField value={form.roleCode} options={roleOptions} onChange={(roleCode) => setForm({ ...form, roleCode })} /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setCreateOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit">创建</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(createResult.email)} title="账号创建成功" subtitle={createResult.email} onClose={() => setCreateResult(emptyCreateResult)} showClose={false}>
        <div className="formPanel">
          <div className="readonlyBox">
            <div>
              <strong>{createResult.name} 已创建</strong>
              <span>请将初始密码安全发送给用户。用户首次登录后可在右上角修改密码。</span>
            </div>
          </div>
          <div className="detailCard">
            <div><span>账号邮箱</span><strong>{createResult.email}</strong></div>
            <div><span>初始密码</span><strong>{createResult.initialPassword || '-'}</strong></div>
          </div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setCreateResult(emptyCreateResult)}>关闭</button>
            <button className="primaryButton compact" type="button" onClick={copyInitialPassword} disabled={!createResult.initialPassword}>复制密码</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(editing)} title="编辑用户" subtitle={editing?.email} onClose={() => setEditing(null)} size="wide" showClose={false}>
        <form className="formPanel" onSubmit={updateUser}>
          <label>姓名<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label>
          <label>手机号<input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
          <label>角色
            <SelectField
              value={editForm.roleCode}
              options={roleOptions}
              onChange={(roleCode) => {
                setEditForm({ ...editForm, roleCode });
                syncRoleForm(roleCode);
              }}
            />
          </label>
          {editingRole && (
            <section className="approvalBlock">
              <strong>权限配置</strong>
              <span className="mutedText">
                {editingRole.code === 'admin' ? '管理员拥有全部权限，系统角色不可修改。' : '角色权限为共享配置，保存后会影响所有使用该角色的账号。'}
              </span>
              <AuthTree
                checkedKeys={editingRole.code === 'admin' ? ['*'] : roleForm.permissions}
                onCheck={(permissions) => setRoleForm({ ...roleForm, permissions })}
                disabled={!canEditSelectedRolePermission}
              />
            </section>
          )}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setEditing(null)}>取消</button>
            <button className="primaryButton compact" type="submit">保存</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deletingUser)} title="删除用户" subtitle={deletingUser?.email} onClose={() => setDeletingUser(null)} showClose={false}>
        {deletingUser && (
          <div className="formPanel">
            <div className="readonlyBox">
              <Trash2 size={18} />
              <div>
                <strong>确认删除 {deletingUser.name}？</strong>
                <span>删除后该账号会立即失去登录能力，历史操作日志会保留但不再关联到用户。</span>
              </div>
            </div>
            <div className="detailCard">
              <div><span>邮箱</span><strong>{deletingUser.email}</strong></div>
              <div><span>角色</span><strong>{deletingUser.roles.map((role) => role.name).join(' / ') || '-'}</strong></div>
              <div><span>状态</span><StatusBadge status={deletingUser.status === 'active' ? 'enabled' : 'disabled'} /></div>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setDeletingUser(null)}>取消</button>
              <button className="primaryButton compact dangerButton" type="button" onClick={deleteUser}>删除</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(statusUser)} title={`${statusUser?.status === 'active' ? '禁用' : '启用'}用户`} subtitle={statusUser?.email} onClose={() => setStatusUser(null)} showClose={false}>
        {statusUser && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>用户</span><strong>{statusUser.name}</strong></div>
              <div><span>角色</span><strong>{statusUser.roles.map((role) => role.name).join(' / ') || '-'}</strong></div>
              <div><span>当前状态</span><StatusBadge status={statusUser.status === 'active' ? 'enabled' : 'disabled'} /></div>
            </div>
            <div className="fieldBlock">
              <span>操作说明</span>
              <strong>{statusUser.status === 'active' ? '禁用后该用户会立即失去登录能力，现有会话将被撤销。' : '启用后该用户可以重新登录后台。'}</strong>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setStatusUser(null)}>取消</button>
              <button className="primaryButton compact" type="button" onClick={() => changeStatus(statusUser)}>{statusUser.status === 'active' ? '禁用' : '启用'}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(resetUser)} title="重置密码" subtitle={resetUser?.email} onClose={() => setResetUser(null)} showClose={false}>
        {resetUser && (
          <div className="formPanel">
            {!resetResult.setupUrl ? (
              <>
                <div className="detailCard">
                  <div><span>用户</span><strong>{resetUser.name}</strong></div>
                  <div><span>邮箱</span><strong>{resetUser.email}</strong></div>
                  <div><span>角色</span><strong>{resetUser.roles.map((role) => role.name).join(' / ') || '-'}</strong></div>
                </div>
                <div className="fieldBlock">
                  <span>重置影响</span>
                  <strong>确认后该用户当前密码会失效，已登录会话会被退出。系统会生成一次性设置密码链接，由管理员发送给用户自行设置新密码。</strong>
                </div>
                <div className="modalActions">
                  <button className="secondaryButton compact" type="button" onClick={() => setResetUser(null)}>取消</button>
                  <button className="primaryButton compact" type="button" onClick={resetPassword}>确认重置</button>
                </div>
              </>
            ) : (
              <>
                <div className="readonlyBox">
                  <div>
                    <strong>密码已重置，等待用户重新设置</strong>
                    <span>旧密码和原登录会话已失效。请把下面链接发送给 {resetUser.name}，链接有效期至 {resetResult.expiresAt ? new Date(resetResult.expiresAt).toLocaleString() : '24 小时后'}。</span>
                  </div>
                </div>
                <label>设置密码链接<input value={resetResult.setupUrl} readOnly /></label>
                <div className="modalActions">
                  <button className="secondaryButton compact" type="button" onClick={() => setResetUser(null)}>关闭</button>
                  <button className="primaryButton compact" type="button" onClick={copyResetLink}>复制链接</button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selectedUser)} title="用户详情" onClose={() => setSelectedUser(null)}>
        {selectedUser && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>姓名</span><strong>{selectedUser.name}</strong></div>
              <div><span>手机号</span><strong>{selectedUser.phone || '-'}</strong></div>
              <div><span>状态</span><StatusBadge status={selectedUser.status === 'active' ? 'enabled' : 'disabled'} /></div>
              <div><span>最近登录</span><strong>{selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : '-'}</strong></div>
              <div><span>创建时间</span><strong>{new Date(selectedUser.createdAt).toLocaleString()}</strong></div>
              <div><span>角色</span><strong>{selectedUser.roles.map((role) => role.name).join(' / ') || '-'}</strong></div>
            </div>
            <section className="approvalBlock">
              <strong>角色权限</strong>
              <span className="mutedText">只读展示，权限修改请在编辑用户时调整对应角色。</span>
              <AuthTree
                checkedKeys={[...new Set(selectedUser.roles.flatMap((role) => role.permissions))]}
                onCheck={() => undefined}
                disabled
              />
            </section>
            <section className="approvalBlock">
              <strong>最近登录会话</strong>
              <div className="miniTimeline">
                {(selectedUser.recentSessions || []).length ? selectedUser.recentSessions?.map((session) => (
                  <div className="miniTimelineItem" key={session.id}>
                    <div>
                      <strong>{new Date(session.createdAt).toLocaleString()}</strong>
                      <span>{session.ip || '-'} · {session.userAgent || '-'}</span>
                    </div>
                    <StatusBadge status={session.status === 'active' ? 'enabled' : session.status === 'expired' ? 'skipped' : 'disabled'} />
                  </div>
                )) : <span className="mutedText">暂无登录会话</span>}
              </div>
            </section>
            <section className="approvalBlock">
              <strong>近期操作</strong>
              <div className="miniTimeline">
                {(selectedUser.recentOperationLogs || []).length ? selectedUser.recentOperationLogs?.map((log) => (
                  <div className="miniTimelineItem" key={log.id}>
                    <div>
                      <strong>{operationLabel(log.resource, log.action)}</strong>
                      <span>{new Date(log.createdAt).toLocaleString()} · {log.path || '-'}</span>
                    </div>
                    <StatusBadge status={log.result === 'success' ? 'success' : 'failed'} />
                  </div>
                )) : <span className="mutedText">暂无操作记录</span>}
              </div>
            </section>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(selectedRequest)} title="注册申请详情" subtitle={selectedRequest?.email} onClose={() => setSelectedRequest(null)}>
        {selectedRequest && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>申请人</span><strong>{selectedRequest.name}</strong></div>
              <div><span>手机号</span><strong>{selectedRequest.phone || '-'}</strong></div>
              <div><span>申请角色</span><strong>{roleMap.get(selectedRequest.requestedRole)?.name || selectedRequest.requestedRole}</strong></div>
              <div><span>状态</span><StatusBadge status={selectedRequest.status === 'approved' ? 'success' : selectedRequest.status === 'rejected' ? 'failed' : 'register_pending'} /></div>
            </div>
            <div className="fieldBlock"><span>申请说明</span><strong>{selectedRequest.reason || '-'}</strong></div>
            {selectedRequest.rejectReason && <div className="fieldBlock"><span>驳回原因</span><strong>{selectedRequest.rejectReason}</strong></div>}
            {selectedRequest.status === 'pending' && (
              <div className="modalActions">
                <AuthC authKey="account:user:rejectRegister">
                  <button className="secondaryButton compact" type="button" onClick={() => setRejectingRequest(selectedRequest)}>驳回</button>
                </AuthC>
                <AuthC authKey="account:user:approveRegister">
                  <button className="primaryButton compact" type="button" onClick={() => approveRequest(selectedRequest)}>通过</button>
                </AuthC>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(rejectingRequest)} title="驳回注册申请" subtitle={rejectingRequest?.email} onClose={() => setRejectingRequest(null)} showClose={false}>
        <form className="formPanel" onSubmit={rejectRequest}>
          <label>驳回原因<input value={rejectForm.reason} onChange={(event) => setRejectForm({ reason: event.target.value })} required /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setRejectingRequest(null)}>取消</button>
            <button className="primaryButton compact" type="submit">驳回</button>
          </div>
        </form>
      </Modal>

    </section>
  );
}
