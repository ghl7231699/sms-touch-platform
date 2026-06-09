import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminUser, RoleItem } from '../../types';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';

export default function UsersPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [form, setForm] = useState({ email: '', name: '', roleCode: 'operator' });
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    const [userData, roleData] = await Promise.all([
      api<{ items: AdminUser[] }>('/api/users?pageSize=80'),
      api<{ items: RoleItem[] }>('/api/roles')
    ]);
    setUsers(userData.items);
    setRoles(roleData.items);
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
    setForm({ ...form, email: '', name: '' });
    setModalOpen(false);
    await load();
  }

  async function changeStatus(user: AdminUser) {
    await api(`/api/users/${user.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: user.status === 'active' ? 'disabled' : 'active' })
    });
    setNotice(`${user.name} 已${user.status === 'active' ? '禁用' : '启用'}`);
    await load();
  }

  return (
    <section className="stack">
      <section className="panel">
        <div className="panelTitle">
          <h2>后台用户</h2>
          <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(true)}><Users size={16} />新建账号</button>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><strong>{user.name}</strong><span>{user.email}</span></td>
                  <td>{user.roles.map((role) => role.name).join(' / ')}</td>
                  <td><StatusBadge status={user.status === 'active' ? 'enabled' : 'disabled'} /></td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-'}</td>
                  <td><button className="tableButton" onClick={() => changeStatus(user)}>{user.status === 'active' ? '禁用' : '启用'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Modal open={modalOpen} title="新建账号" subtitle="自动生成初始密码" onClose={() => setModalOpen(false)}>
        <form className="formPanel" onSubmit={create}>
          <label>姓名<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>邮箱<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
          <label>角色
            <select value={form.roleCode} onChange={(event) => setForm({ ...form, roleCode: event.target.value })}>
              {roles.map((role) => <option key={role.code} value={role.code}>{role.name}</option>)}
            </select>
          </label>
          <button className="primaryButton" type="submit"><Users size={16} />创建用户</button>
        </form>
      </Modal>
    </section>
  );
}

