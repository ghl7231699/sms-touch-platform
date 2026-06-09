import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { api } from '../../lib/api';
import type { AuthUser } from '../../types';

export default function LoginPage({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@sms.local');
  const [password, setPassword] = useState('Admin123!');
  const [mode, setMode] = useState<'login' | 'apply' | 'forgot'>('login');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('请输入后台账号登录');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (mode === 'login') {
        const result = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        onLogin(result.token, result.user);
        return;
      }
      if (mode === 'apply') {
        await api('/api/auth/register-request', {
          method: 'POST',
          body: JSON.stringify({ email, name, reason: '申请进入短信触达平台', requestedRole: 'operator' })
        });
        setMessage('注册申请已提交，等待管理员审核。');
        setMode('login');
        return;
      }
      const code = await api<{ devCode?: string }>('/api/auth/forgot-password/send-code', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setMessage(code.devCode ? `验证码已生成：${code.devCode}` : '验证码已发送。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  return (
    <main className="authShell">
      <form className="authCard" onSubmit={submit}>
        <div className="brand large">
          <div className="brandMark">SMS</div>
          <div>
            <strong>短信触达平台</strong>
            <span>治理与安全入口</span>
          </div>
        </div>
        <div className="segmented">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>登录</button>
          <button type="button" className={mode === 'apply' ? 'active' : ''} onClick={() => setMode('apply')}>注册申请</button>
          <button type="button" className={mode === 'forgot' ? 'active' : ''} onClick={() => setMode('forgot')}>忘记密码</button>
        </div>
        {mode === 'apply' && <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} required /></label>}
        <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        {mode === 'login' && <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>}
        <button className="primaryButton" type="submit">
          <Lock size={16} />
          {mode === 'login' ? '进入工作台' : mode === 'apply' ? '提交申请' : '获取验证码'}
        </button>
        <p>{message}</p>
      </form>
    </main>
  );
}

