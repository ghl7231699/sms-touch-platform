import { ShieldAlert } from 'lucide-react';

export default function ForbiddenPage({
  onBack,
  title = '403',
  message = '当前账号没有访问该页面或执行该操作的权限，请联系管理员调整角色。',
  detail = '权限变更后需要重新进入页面，系统会按当前角色实时校验可访问范围。',
  actionText = '返回可访问页面',
  hideAction = false
}: {
  onBack: () => void;
  title?: string;
  message?: string;
  detail?: string;
  actionText?: string;
  hideAction?: boolean;
}) {
  return (
    <section className="forbiddenPage">
      <div className="forbiddenIcon"><ShieldAlert size={30} /></div>
      <div>
        <span>{title}</span>
        <h2>无权限访问</h2>
        <p>{message}</p>
        <small>{detail}</small>
      </div>
      {!hideAction && <button className="primaryButton compact" type="button" onClick={onBack}>{actionText}</button>}
    </section>
  );
}
