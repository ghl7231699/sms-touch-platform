import React, { useEffect, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminUser, RoleItem } from '../../types';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';

export default function UsersPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [form, setForm] = useState({ email: '', name: '', roleCode: 'operator' });
  const [modalOpen, setModalOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<RoleItem | null>(null);
  const roleOptions = roles.map((role) => ({ value: role.code, label: role.name }));
  const roleMap = new Map(roles.map((role) => [role.code, role]));

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
                  <td>
                    <div className="inlineActions">
                      {user.roles.map((role) => {
                        const roleDetail = roleMap.get(role.code);
                        return (
                          <button
                            className="tableButton compact"
                            type="button"
                            key={role.code}
                            onClick={() => roleDetail && setActiveRole(roleDetail)}
                            disabled={!roleDetail}
                          >
                            {role.name}
                          </button>
                        );
                      })}
                    </div>
                  </td>
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
            <SelectField value={form.roleCode} options={roleOptions} onChange={(roleCode) => setForm({ ...form, roleCode })} />
          </label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="submit"><Users size={16} />创建用户</button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(activeRole)}
        title={activeRole?.name || '角色详情'}
        subtitle={activeRole ? `${activeRole.code} · 内置固定角色` : undefined}
        onClose={() => setActiveRole(null)}
      >
        {activeRole && (
          <div className="formPanel">
            <div className="detailCard">
              <div>
                <span>角色状态</span>
                <StatusBadge status={activeRole.status === 'active' ? 'enabled' : 'disabled'} />
              </div>
              <div>
                <span>角色说明</span>
                <strong>{activeRole.description || '系统内置角色'}</strong>
              </div>
            </div>
            <div className="fieldBlock">
              <span>权限范围</span>
              <div className="chips">
                {activeRole.permissions.map((permission) => (
                  <span key={permission}>{permission}</span>
                ))}
              </div>
            </div>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setActiveRole(null)}>
                <ShieldCheck size={16} />关闭
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
