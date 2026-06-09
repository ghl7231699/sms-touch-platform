import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { RoleItem } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  useEffect(() => {
    api<{ items: RoleItem[] }>('/api/roles').then((data) => setRoles(data.items));
  }, []);
  return (
    <section className="templateGrid">
      {roles.map((role) => (
        <article className="templateCard" key={role.id}>
          <div className="templateTop">
            <div><strong>{role.name}</strong><span>{role.code}</span></div>
            <StatusBadge status={role.status === 'active' ? 'enabled' : 'disabled'} />
          </div>
          <p>{role.description}</p>
          <div className="chips">{role.permissions.slice(0, 12).map((item) => <span key={item}>{item}</span>)}</div>
        </article>
      ))}
    </section>
  );
}

