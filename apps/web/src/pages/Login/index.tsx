import React, { useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { api } from '../../lib/api';
import type { AuthUser } from '../../types';
import { Modal } from '../../components/Modal';

export default function LoginPage({ onLogin }: { onLogin: (token: string, user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@sms.local');
  const [password, setPassword] = useState('Admin123!');
  const [dialog, setDialog] = useState<'apply' | 'forgot' | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('请输入后台账号登录');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      const result = await api<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      onLogin(result.token, result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function submitApply(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/api/auth/register-request', {
        method: 'POST',
        body: JSON.stringify({ email, name, reason: '申请进入短信触达平台', requestedRole: 'operator' })
      });
      setDialog(null);
      setMessage('注册申请已提交，等待管理员审核。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交申请失败');
    }
  }

  async function submitForgot(event: React.FormEvent) {
    event.preventDefault();
    try {
      const code = await api<{ devCode?: string }>('/api/auth/forgot-password/send-code', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      setDialog(null);
      setMessage(code.devCode ? `验证码已生成：${code.devCode}` : '验证码已发送。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '获取验证码失败');
    }
  }

  return (
    <main className="authShell">
      <section className="authLayout">
        <aside className="authIntro">
          <div className="brand large">
            <div className="brandMark">SMS</div>
            <div>
              <strong>短信触达平台</strong>
              <span>Marketing Automation Platform</span>
            </div>
          </div>
          <div className="authIntroCopy">
            <h1>以数据驱动每一次触达</h1>
            <p>统一管理规则、模板、任务和安全策略，让营销短信从测试到运营都可追踪。</p>
          </div>
          <div className="authProof">
            <span>规则自动化</span>
            <span>发送前安全校验</span>
            <span>审计可追踪</span>
          </div>
        </aside>

        <form className="authCard" onSubmit={submit}>
          <div className="authFormHeader">
            <span>欢迎回来</span>
            <h2>登录工作台</h2>
          </div>
          <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <button className="primaryButton authSubmit" type="submit">
            <Lock size={16} />
            进入工作台
            <ArrowRight size={16} />
          </button>
          <div className="authLinks">
            <button type="button" onClick={() => setDialog('apply')}>申请账号</button>
            <button type="button" onClick={() => setDialog('forgot')}>忘记密码</button>
          </div>
          <p>{message}</p>
        </form>
      </section>

      <Modal open={dialog === 'apply'} title="申请账号" subtitle="提交后由管理员审核开通" onClose={() => setDialog(null)}>
        <form className="formPanel" onSubmit={submitApply}>
          <label>姓名<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setDialog(null)}>取消</button>
            <button className="primaryButton compact" type="submit">提交申请</button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === 'forgot'} title="找回密码" subtitle="先获取验证码，再完成重置流程" onClose={() => setDialog(null)}>
        <form className="formPanel" onSubmit={submitForgot}>
          <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setDialog(null)}>取消</button>
            <button className="primaryButton compact" type="submit">获取验证码</button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
