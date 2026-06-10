import { useEffect, useState } from 'react';
import { Clock3, KeyRound, Link2, Power, Settings, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';

const sceneOptions = [
  { value: 'register', label: '注册转化' },
  { value: 'member', label: '会员召回' },
  { value: 'campaign', label: '活动通知' },
  { value: 'after_sale', label: '售后回访' },
  { value: 'manual', label: '手动发送' }
];

const fallbackFrequencyPolicy = {
  scene: 'manual',
  dailyLimit: 3,
  weeklyLimit: 8,
  cooldownMinutes: 60,
  quietStart: '22:00',
  quietEnd: '08:00',
  status: 'enabled'
};

export default function SettingsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [frequencyScene, setFrequencyScene] = useState('manual');

  async function load() {
    const data = await api<{ settings: Record<string, any> }>('/api/settings');
    setSettings(data.settings);
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '配置加载失败'));
  }, []);

  async function save() {
    const result = await api<{ approvalRequired?: boolean; approval?: { id: string }; settings?: Record<string, any> }>('/api/settings/update', {
      method: 'POST',
      body: JSON.stringify({ settings })
    });
    if (result.approvalRequired) {
      setNotice(`已提交配置变更审批：${result.approval?.id?.slice(0, 8) || ''}，通过后生效`);
      await load();
      return;
    }
    setNotice('发送控制已保存');
    await load();
  }

  function updateSetting(key: string, value: Record<string, any>) {
    setSettings({ ...settings, [key]: value });
  }

  function updateFrequencyPolicy(patch: Record<string, any>) {
    const currentPolicies = frequency.policies || [];
    const exists = currentPolicies.some((policy: any) => policy.scene === frequencyScene);
    const nextPolicies = exists
      ? currentPolicies.map((policy: any) => policy.scene === frequencyScene ? { ...policy, ...patch } : policy)
      : [...currentPolicies, { ...fallbackFrequencyPolicy, scene: frequencyScene, ...patch }];
    updateSetting('sms.frequency', { ...frequency, policies: nextPolicies });
  }

  const safety = settings['sms.safety'] || {};
  const worker = settings['sms.worker'] || {};
  const shortLink = settings['sms.short_link'] || {};
  const verificationCode = settings['sms.verification_code'] || {};
  const receipt = settings['sms.receipt'] || {};
  const aliyun = settings['sms.aliyun'] || {};
  const frequency = settings['sms.frequency'] || { policies: [] };
  const activeFrequencyPolicy = frequency.policies?.find((policy: any) => policy.scene === frequencyScene) || {
    ...fallbackFrequencyPolicy,
    scene: frequencyScene
  };
  const currentProvider = settings['sms.provider']?.provider || 'mock';
  const realProvider = currentProvider !== 'mock';
  const realWorkerReady = realProvider && Boolean(worker.enabled) && Boolean(worker.allowRealSend);
  const whitelistProtected = realProvider ? safety.requireWhitelistForRealProvider !== false : Boolean(safety.requireWhitelistForMock);
  const providerOptions = [
    { value: 'mock', label: 'Mock 测试通道' },
    { value: 'aliyun_dypns', label: '阿里云号码认证测试通道' }
  ];

  return (
    <section className="stack">
      <section className="settingsHero">
        <div>
          <span>发送控制台</span>
          <h2>{realWorkerReady ? '真实短信自动发送已允许' : realProvider ? '真实通道已选择，自动发送仍受保护' : '当前处于 Mock 测试通道'}</h2>
          <p>这里控制短信系统的油门、刹车和安全锁。日常运营不需要频繁修改，主要用于联调、灰度、上线前确认和事故止血。</p>
        </div>
        <div className="settingsStatus">
          <StatusBadge status={realProvider ? 'pending' : 'skipped'} />
          <strong>{currentProvider}</strong>
          <span>{whitelistProtected ? '白名单保护已开启' : '白名单保护未开启'}</span>
        </div>
      </section>

      <section className="controlGrid">
        <section className="panel formPanel">
          <div className="panelTitle"><h2>发送通道</h2><span>是否会调用真实服务商</span></div>
          <label>当前服务商
            <SelectField
              value={currentProvider}
              options={providerOptions}
              onChange={(provider) => updateSetting('sms.provider', { provider })}
            />
          </label>
          <div className="readonlyBox">
            <KeyRound size={18} />
            <div>
              <strong>AccessKey 由环境变量托管</strong>
              <span>页面不录入、不回显、不保存密钥；签名和默认模板来自环境变量与模板中心。</span>
            </div>
          </div>
          <div className="formGrid two">
            <label>阿里云签名<input value={aliyun.signName || '速通互联验证码'} disabled /></label>
            <label>默认模板 Code<input value={aliyun.templateCode || '100001'} disabled /></label>
          </div>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>任务执行</h2><span>worker 自动扫描到期任务</span></div>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={Boolean(worker.enabled)}
              onChange={(event) => updateSetting('sms.worker', { ...worker, enabled: event.target.checked })}
            />开启 worker 自动执行到期任务
          </label>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={Boolean(worker.allowRealSend)}
              onChange={(event) => updateSetting('sms.worker', { ...worker, allowRealSend: event.target.checked })}
            />真实通道下允许 worker 发送
          </label>
          <div className="formGrid two">
            <label>扫描间隔 ms<input type="number" value={worker.intervalMs || 30000} onChange={(event) => updateSetting('sms.worker', { ...worker, intervalMs: Number(event.target.value) })} /></label>
            <label>每批处理数<input type="number" value={worker.batchSize || 20} onChange={(event) => updateSetting('sms.worker', { ...worker, batchSize: Number(event.target.value) })} /></label>
          </div>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>安全保护</h2><span>白名单和真实发送确认</span></div>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={Boolean(safety.requireWhitelistForMock)}
              onChange={(event) => updateSetting('sms.safety', { ...safety, requireWhitelistForMock: event.target.checked })}
            />Mock 测试也要求白名单
          </label>
          <label className="checkRow">
            <input
              type="checkbox"
              checked={safety.requireWhitelistForRealProvider !== false}
              onChange={(event) => updateSetting('sms.safety', { ...safety, requireWhitelistForRealProvider: event.target.checked })}
            />真实服务商必须命中白名单
          </label>
          <div className="readonlyBox">
            <ShieldCheck size={18} />
            <div>
              <strong>高风险变更需要审批</strong>
              <span>切换真实通道、关闭真实白名单保护、真实通道开启 worker 都不会直接生效。</span>
            </div>
          </div>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>频控与安静时段</h2><span>避免重复触达和夜间打扰</span></div>
          <label>业务场景
            <SelectField value={frequencyScene} options={sceneOptions} onChange={setFrequencyScene} />
          </label>
          <div className="formGrid two">
            <label>日上限<input type="number" value={activeFrequencyPolicy.dailyLimit} onChange={(event) => updateFrequencyPolicy({ dailyLimit: Number(event.target.value) })} /></label>
            <label>周上限<input type="number" value={activeFrequencyPolicy.weeklyLimit} onChange={(event) => updateFrequencyPolicy({ weeklyLimit: Number(event.target.value) })} /></label>
            <label>冷却分钟<input type="number" value={activeFrequencyPolicy.cooldownMinutes} onChange={(event) => updateFrequencyPolicy({ cooldownMinutes: Number(event.target.value) })} /></label>
            <label>策略状态
              <SelectField
                value={activeFrequencyPolicy.status || 'enabled'}
                options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]}
                onChange={(status) => updateFrequencyPolicy({ status })}
              />
            </label>
            <label>安静开始<input type="time" value={activeFrequencyPolicy.quietStart || '21:00'} onChange={(event) => updateFrequencyPolicy({ quietStart: event.target.value })} /></label>
            <label>安静结束<input type="time" value={activeFrequencyPolicy.quietEnd || '09:00'} onChange={(event) => updateFrequencyPolicy({ quietEnd: event.target.value })} /></label>
          </div>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>验证码与短链</h2><span>基础触达能力</span></div>
          <div className="formGrid two">
            <label>验证码有效期分钟<input type="number" value={verificationCode.validMinutes || 5} onChange={(event) => updateSetting('sms.verification_code', { ...verificationCode, validMinutes: Number(event.target.value) })} /></label>
            <label>重发间隔秒<input type="number" value={verificationCode.resendIntervalSeconds || 60} onChange={(event) => updateSetting('sms.verification_code', { ...verificationCode, resendIntervalSeconds: Number(event.target.value) })} /></label>
            <label>每日上限<input type="number" value={verificationCode.dailyLimit || 10} onChange={(event) => updateSetting('sms.verification_code', { ...verificationCode, dailyLimit: Number(event.target.value) })} /></label>
            <label>回执接收
              <SelectField
                value={receipt.enabled === false ? 'disabled' : 'enabled'}
                options={[{ value: 'enabled', label: '接收回执' }, { value: 'disabled', label: '暂不接收' }]}
                onChange={(enabled) => updateSetting('sms.receipt', { ...receipt, enabled: enabled === 'enabled' })}
              />
            </label>
          </div>
          <label>短链域名<input value={shortLink.baseUrl || ''} onChange={(event) => updateSetting('sms.short_link', { ...shortLink, baseUrl: event.target.value })} /></label>
          <label>默认跳转地址<input value={shortLink.targetUrl || ''} onChange={(event) => updateSetting('sms.short_link', { ...shortLink, targetUrl: event.target.value })} /></label>
        </section>

        <section className="panel formPanel">
          <div className="panelTitle"><h2>保存策略</h2><span>配置变更审计</span></div>
          <div className="riskList">
            <article><Power size={18} /><strong>真实发送</strong><span>开启真实发送相关能力会进入审批。</span></article>
            <article><Clock3 size={18} /><strong>安静时段</strong><span>命中夜间时段时，任务会被拦截或顺延。</span></article>
            <article><Link2 size={18} /><strong>短链追踪</strong><span>短链点击用于发送记录和统计复盘。</span></article>
          </div>
          <AuthC authKey="security:setting:save">
            <button className="primaryButton" onClick={save}><Settings size={16} />保存发送控制</button>
          </AuthC>
        </section>
      </section>
    </section>
  );
}
