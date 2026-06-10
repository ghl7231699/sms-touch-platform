import { ShieldAlert } from 'lucide-react';

export default function ForbiddenPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="panel emptyState">
      <ShieldAlert size={34} />
      <h2>无权限访问</h2>
      <p>当前账号没有访问该页面或执行该操作的权限，请联系管理员调整角色。</p>
      <button className="secondaryButton compact" type="button" onClick={onBack}>返回可访问页面</button>
    </section>
  );
}
