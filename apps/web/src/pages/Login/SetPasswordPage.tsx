import React, { useMemo, useState } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { api } from '../../lib/api';

export default function SetPasswordPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState(token ? '请设置新的登录密码' : '设置密码链接缺少 token');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) {
      setMessage('设置密码链接无效。');
      return;
    }
    if (password.length < 8) {
      setMessage('密码至少需要 8 位。');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('两次输入的密码不一致。');
      return;
    }
    try {
      await api('/api/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
      setMessage('密码已设置，可以返回登录页登录。');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '设置密码失败');
    }
  }

  function backToLogin() {
    window.history.replaceState(null, '', '/');
    window.location.reload();
  }

  return (
    <main className="authShell">
      <section className="authLayout compactAuthLayout">
        <form className="authCard" onSubmit={submit}>
          <div className="authFormHeader">
            <span>账号安全</span>
            <h2>设置密码</h2>
          </div>
          <label>新密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <label>确认密码<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          <button className="primaryButton authSubmit" type="submit" disabled={!token}>
            <LockKeyhole size={16} />
            保存新密码
            <ArrowRight size={16} />
          </button>
          <button className="secondaryButton compact" type="button" onClick={backToLogin}>
            返回登录
          </button>
          <p>{message}</p>
        </form>
      </section>
    </main>
  );
}
