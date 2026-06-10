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
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
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
        body: JSON.stringify({ email, name, phone, reason: reason || '申请进入短信触达平台', requestedRole: 'operator' })
      });
      setDialog(null);
      setName('');
      setPhone('');
      setReason('');
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
      setMessage(code.devCode ? `验证码已生成：${code.devCode}` : '验证码已发送，请输入验证码继续。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '获取验证码失败');
    }
  }

  async function verifyForgotCode() {
    try {
      const result = await api<{ resetToken: string }>('/api/auth/forgot-password/verify-code', {
        method: 'POST',
        body: JSON.stringify({ email, code: forgotCode })
      });
      setResetToken(result.resetToken);
      setMessage('验证码校验通过，请设置新密码。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '验证码校验失败');
    }
  }

  async function resetForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password: newPassword })
      });
      setDialog(null);
      setForgotCode('');
      setResetToken('');
      setNewPassword('');
      setPassword('');
      setMessage('密码已重置，请使用新密码登录。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '重置密码失败');
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
          <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="用于管理员联系" /></label>
          <label>申请说明<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明账号用途" /></label>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setDialog(null)}>取消</button>
            <button className="primaryButton compact" type="submit">提交申请</button>
          </div>
        </form>
      </Modal>

      <Modal open={dialog === 'forgot'} title="找回密码" subtitle="先获取验证码，再完成重置流程" onClose={() => setDialog(null)}>
        <form className="formPanel" onSubmit={resetToken ? resetForgotPassword : submitForgot}>
          <label>邮箱<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>验证码<input value={forgotCode} onChange={(event) => setForgotCode(event.target.value)} placeholder="输入邮件或测试验证码" /></label>
          {resetToken && <label>新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>}
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setDialog(null)}>取消</button>
            {!resetToken && <button className="secondaryButton compact" type="submit">获取验证码</button>}
            {!resetToken && <button className="primaryButton compact" type="button" onClick={verifyForgotCode} disabled={!forgotCode}>校验验证码</button>}
            {resetToken && <button className="primaryButton compact" type="submit">重置密码</button>}
          </div>
        </form>
      </Modal>
    </main>
  );
}
