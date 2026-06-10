import React, { useEffect, useState } from 'react';
import { ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminUser, RegisterRequestItem, RoleItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthTree } from '../../components/AuthTree';
import { AuthC } from '../../lib/auth';

type UserTab = 'users' | 'requests' | 'roles';

const emptyUserForm = { email: '', name: '', phone: '', roleCode: 'operator' };
const emptyRejectForm = { reason: '' };

export default function UsersPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [tab, setTab] = useState<UserTab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<RegisterRequestItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [form, setForm] = useState(emptyUserForm);
  const [editForm, setEditForm] = useState({ id: '', name: '', phone: '', roleCode: 'operator' });
  const [rejectForm, setRejectForm] = useState(emptyRejectForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [activeRole, setActiveRole] = useState<RoleItem | null>(null);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] as string[] });
  const [selectedRequest, setSelectedRequest] = useState<RegisterRequestItem | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<RegisterRequestItem | null>(null);
  const roleOptions = roles.map((role) => ({ value: role.code, label: role.name }));
  const roleMap = new Map(roles.map((role) => [role.code, role]));

  async function load() {
    const [userData, roleData, requestData] = await Promise.all([
      api<{ items: AdminUser[] }>('/api/users?pageSize=80'),
      api<{ items: RoleItem[] }>('/api/roles'),
      api<{ items: RegisterRequestItem[] }>('/api/auth/register-requests?pageSize=80')
    ]);
    setUsers(userData.items);
    setRoles(roleData.items);
    setRequests(requestData.items);
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
    setNotice(result.initialPassword ? `用户已创建，初始密码 ${result.initialPassword}` : '用户已创建');
    setForm(emptyUserForm);
    setCreateOpen(false);
    await load();
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setEditForm({
      id: user.id,
      name: user.name,
      phone: user.phone || '',
      roleCode: user.roles[0]?.code || 'operator'
    });
  }

  async function updateUser(event: React.FormEvent) {
    event.preventDefault();
    await api(`/api/users/${editForm.id}/update`, {
      method: 'POST',
      body: JSON.stringify({
        name: editForm.name,
        phone: editForm.phone,
        roleCode: editForm.roleCode
      })
    });
    setNotice('用户信息已更新');
    setEditing(null);
    await load();
  }

  async function changeStatus(user: AdminUser) {
    await api(`/api/users/${user.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: user.status === 'active' ? 'disabled' : 'active' })
    });
    setNotice(`${user.name} 已${user.status === 'active' ? '禁用' : '启用'}`);
    await load();
  }

  async function resetPassword(user: AdminUser) {
    const result = await api<{ setupToken: string }>(`/api/users/${user.id}/reset-password`, { method: 'POST' });
    setNotice(`${user.name} 的设置密码链接 token：${result.setupToken}`);
  }

  async function deleteUser() {
    if (!deletingUser) return;
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

  function openRoleEditor(role: RoleItem) {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions.includes('*') ? ['overview:dashboard:base'] : role.permissions
    });
  }

  async function saveRole(event: React.FormEvent) {
    event.preventDefault();
    if (!editingRole) return;
    const result = await api<{ item: RoleItem }>(`/api/roles/${editingRole.id}/update`, {
      method: 'POST',
      body: JSON.stringify({ ...roleForm, status: editingRole.status })
    });
    setNotice(`${result.item.name} 权限已更新`);
    setEditingRole(null);
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
          <div className="inlineActions">
            <button className={`segmentButton${tab === 'users' ? ' active' : ''}`} type="button" onClick={() => setTab('users')}>后台用户</button>
            <button className={`segmentButton${tab === 'requests' ? ' active' : ''}`} type="button" onClick={() => setTab('requests')}>注册申请</button>
            <button className={`segmentButton${tab === 'roles' ? ' active' : ''}`} type="button" onClick={() => setTab('roles')}>角色权限</button>
            {tab === 'users' && (
              <AuthC authKey="account:user:add">
                <button className="secondaryButton compact" type="button" onClick={() => setCreateOpen(true)}><Users size={16} />新建账号</button>
              </AuthC>
            )}
          </div>
        </div>

        {tab === 'users' && (
          <div className="dataTableWrap">
            <table className="dataTable">
              <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.name}</strong><span>{user.email}{user.phone ? ` · ${user.phone}` : ''}</span></td>
                    <td>
                      <div className="inlineActions">
                        {user.roles.map((role) => {
                          const roleDetail = roleMap.get(role.code);
                          return (
                            <AuthC authKey="account:user:roleView" key={role.code}>
                              <button className="tableButton compact" type="button" onClick={() => roleDetail && setActiveRole(roleDetail)} disabled={!roleDetail}>
                                {role.name}
                              </button>
                            </AuthC>
                          );
                        })}
                      </div>
                    </td>
                    <td><StatusBadge status={user.status === 'active' ? 'enabled' : 'disabled'} /></td>
                    <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-'}</td>
                    <td>
                      <div className="inlineActions">
                        <AuthC authKey="account:user:view">
                          <button className="tableButton" type="button" onClick={() => setSelectedUser(user)}>详情</button>
                        </AuthC>
                        <AuthC authKey="account:user:edit">
                          <button className="tableButton" type="button" onClick={() => openEdit(user)}>编辑</button>
                        </AuthC>
                        <AuthC authKey="account:user:resetPassword">
                          <button className="tableButton" type="button" onClick={() => resetPassword(user)}>重置密码</button>
                        </AuthC>
                        <AuthC authKey="account:user:status">
                          <button className="tableButton" type="button" onClick={() => changeStatus(user)}>{user.status === 'active' ? '禁用' : '启用'}</button>
                        </AuthC>
                        <AuthC authKey="account:user:delete">
                          <button className="tableButton danger" type="button" onClick={() => setDeletingUser(user)}>删除</button>
                        </AuthC>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'requests' && (
          <div className="dataTableWrap">
            <table className="dataTable">
              <thead><tr><th>申请人</th><th>申请角色</th><th>状态</th><th>申请时间</th><th>操作</th></tr></thead>
              <tbody>
                {requests.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong><span>{item.email}{item.phone ? ` · ${item.phone}` : ''}</span></td>
                    <td>{roleMap.get(item.requestedRole)?.name || item.requestedRole}</td>
                    <td><StatusBadge status={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'failed' : 'pending'} /></td>
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
              </tbody>
            </table>
          </div>
        )}

        {tab === 'roles' && (
          <div className="dataTableWrap">
            <table className="dataTable">
              <thead><tr><th>角色</th><th>说明</th><th>权限数</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td><strong>{role.name}</strong><span>{role.code}</span></td>
                    <td>{role.description || '-'}</td>
                    <td>{role.permissions.includes('*') ? '全部权限' : `${role.permissions.length} 项`}</td>
                    <td><StatusBadge status={role.status === 'active' ? 'enabled' : 'disabled'} /></td>
                    <td>
                      <div className="inlineActions">
                        <AuthC authKey="account:user:roleView">
                          <button className="tableButton" type="button" onClick={() => setActiveRole(role)}>查看权限</button>
                        </AuthC>
                        {role.code !== 'admin' && (
                          <AuthC authKey="account:user:roleEdit">
                            <button className="tableButton" type="button" onClick={() => openRoleEditor(role)}>权限配置</button>
                          </AuthC>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      <Modal open={Boolean(editing)} title="编辑用户" subtitle={editing?.email} onClose={() => setEditing(null)} showClose={false}>
        <form className="formPanel" onSubmit={updateUser}>
          <label>姓名<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} required /></label>
          <label>手机号<input value={editForm.phone} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} /></label>
          <label>角色<SelectField value={editForm.roleCode} options={roleOptions} onChange={(roleCode) => setEditForm({ ...editForm, roleCode })} /></label>
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

      <Modal open={Boolean(selectedUser)} title="用户详情" subtitle={selectedUser?.email} onClose={() => setSelectedUser(null)}>
        {selectedUser && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>姓名</span><strong>{selectedUser.name}</strong></div>
              <div><span>手机号</span><strong>{selectedUser.phone || '-'}</strong></div>
              <div><span>状态</span><StatusBadge status={selectedUser.status === 'active' ? 'enabled' : 'disabled'} /></div>
              <div><span>最近登录</span><strong>{selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : '-'}</strong></div>
            </div>
            <div className="fieldBlock">
              <span>角色和权限</span>
              <div className="chips">
                {selectedUser.roles.flatMap((role) => role.permissions.map((permission) => `${role.name}:${permission}`)).map((permission) => <span key={permission}>{permission}</span>)}
              </div>
            </div>
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
              <div><span>状态</span><StatusBadge status={selectedRequest.status === 'approved' ? 'success' : selectedRequest.status === 'rejected' ? 'failed' : 'pending'} /></div>
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

      <Modal open={Boolean(activeRole)} title={activeRole?.name || '角色详情'} subtitle={activeRole ? `${activeRole.code} · 角色权限` : undefined} onClose={() => setActiveRole(null)} size="wide">
        {activeRole && (
          <div className="formPanel">
            <div className="detailCard">
              <div><span>角色状态</span><StatusBadge status={activeRole.status === 'active' ? 'enabled' : 'disabled'} /></div>
              <div><span>角色说明</span><strong>{activeRole.description || '系统内置角色'}</strong></div>
            </div>
            <div className="fieldBlock">
              <span>权限范围</span>
              <div className="chips">{activeRole.permissions.map((permission) => <span key={permission}>{permission}</span>)}</div>
            </div>
            <div className="modalActions">
              {activeRole.code !== 'admin' && (
                <AuthC authKey="account:user:roleEdit">
                  <button className="primaryButton compact" type="button" onClick={() => { openRoleEditor(activeRole); setActiveRole(null); }}>权限配置</button>
                </AuthC>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(editingRole)} title="角色权限配置" subtitle={editingRole ? `${editingRole.name} · ${editingRole.code}` : undefined} onClose={() => setEditingRole(null)} size="wide" showClose={false}>
        {editingRole && (
          <form className="formPanel" onSubmit={saveRole}>
            <div className="formGrid two">
              <label>角色名称<input value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} required /></label>
              <label>角色状态
                <SelectField
                  value={editingRole.status}
                  options={[{ value: 'active', label: '启用' }, { value: 'disabled', label: '停用' }]}
                  onChange={(status) => setEditingRole({ ...editingRole, status })}
                />
              </label>
            </div>
            <label>角色说明<input value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} /></label>
            <div className="fieldBlock">
              <span>权限树</span>
              <AuthTree
                checkedKeys={roleForm.permissions}
                onCheck={(permissions) => setRoleForm({ ...roleForm, permissions })}
              />
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setEditingRole(null)}>取消</button>
              <button className="primaryButton compact" type="submit">保存</button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}
