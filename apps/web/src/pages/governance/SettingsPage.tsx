import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Collapse, Progress, Statistic, Switch, Tag, Tooltip } from 'antd';
import { AlertTriangle, CheckCircle2, KeyRound, Power, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { SelectField } from '../../components/SelectField';
import { StatusBadge } from '../../components/StatusBadge';
import { AuthC } from '../../lib/auth';
import { Modal } from '../../components/Modal';
import type { Stats, WorkerStatus } from '../../types';

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

type SmsProviderConfig = {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  region: string;
  signName: string;
  templateCode: string;
  status: 'enabled' | 'disabled';
  remark?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  isActive?: boolean;
};

type SmsProviderForm = Omit<SmsProviderConfig, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>;

type SendControlLog = {
  id: string;
  status: string;
  createdAt: string;
};

type PagedResult<T> = {
  items: T[];
  total: number;
};

const emptyProviderForm: SmsProviderForm = {
  name: '阿里云短信通道',
  provider: 'aliyun_dypns',
  endpoint: 'dypnsapi.aliyuncs.com',
  region: 'cn-hangzhou',
  signName: '速通互联验证码',
  templateCode: '100001',
  status: 'enabled' as const,
  remark: ''
};

function timeLabel(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function configLabel(key: string) {
  const labels: Record<string, string> = {
    'sms.provider': '发送服务商',
    'sms.worker': '任务执行',
    'sms.safety': '安全保护',
    'sms.frequency': '频控与安静时段',
    'sms.verification_code': '验证码策略',
    'sms.receipt': '回执配置',
    'sms.short_link': '短链追踪',
    'sms.aliyun': '阿里云配置'
  };
  return labels[key] || key;
}

function compactJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : '0.0'}%`;
}

export default function SettingsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [baselineSettings, setBaselineSettings] = useState<Record<string, any>>({});
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [todayLogs, setTodayLogs] = useState<PagedResult<SendControlLog>>({ items: [], total: 0 });
  const [recentLogs, setRecentLogs] = useState<SendControlLog[]>([]);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [whitelistCount, setWhitelistCount] = useState(0);
  const [providerConfigs, setProviderConfigs] = useState<SmsProviderConfig[]>([]);
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [providerEditing, setProviderEditing] = useState<SmsProviderConfig | null>(null);
  const [providerForm, setProviderForm] = useState(emptyProviderForm);
  const [providerTest, setProviderTest] = useState<{ success: boolean; provider: string; mode: string; checks: { key: string; status: string; message: string }[] } | null>(null);
  const [frequencyScene, setFrequencyScene] = useState('manual');
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    const today = new Date().toISOString().slice(0, 10);
    const [data, workerData, providerData, statsData, todayLogData, recentLogData, taskData, whitelistData] = await Promise.all([
      api<{ settings: Record<string, any> }>('/api/settings'),
      api<{ worker: WorkerStatus }>('/api/worker/status'),
      api<{ items: SmsProviderConfig[] }>('/api/sms-providers'),
      api<Stats>('/api/stats/overview'),
      api<PagedResult<SendControlLog>>(`/api/send-logs?startDate=${today}&endDate=${today}&pageSize=100`),
      api<PagedResult<SendControlLog>>('/api/send-logs?pageSize=1'),
      api<PagedResult<unknown>>('/api/tasks?status=pending&pageSize=1'),
      api<PagedResult<unknown>>('/api/whitelist?page=1&pageSize=1')
    ]);
    setSettings(data.settings);
    setBaselineSettings(data.settings);
    setWorkerStatus(workerData.worker);
    setProviderConfigs(providerData.items || []);
    setStats(statsData);
    setTodayLogs({ items: todayLogData.items || [], total: todayLogData.total || 0 });
    setRecentLogs(recentLogData.items || []);
    setPendingTaskCount(taskData.total || 0);
    setWhitelistCount(whitelistData.total || 0);
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '配置加载失败'));
  }, []);

  function settingChanges() {
    const keys = [...new Set([...Object.keys(settings), ...Object.keys(baselineSettings)])];
    return keys
      .filter((key) => JSON.stringify(settings[key] ?? null) !== JSON.stringify(baselineSettings[key] ?? null))
      .map((key) => ({ key, before: baselineSettings[key], after: settings[key], highRisk: ['sms.provider', 'sms.worker', 'sms.safety'].includes(key) }));
  }

  async function save(skipConfirm = false) {
    const changes = settingChanges();
    if (!skipConfirm && changes.some((item) => item.highRisk)) {
      setConfirmSaveOpen(true);
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ approvalRequired?: boolean; approval?: { id: string }; settings?: Record<string, any> }>('/api/settings/update', {
        method: 'POST',
        body: JSON.stringify({ settings })
      });
      if (result.approvalRequired) {
        setNotice(`已提交配置变更审批：${result.approval?.id?.slice(0, 8) || ''}，通过后生效`);
        await load();
        setConfirmSaveOpen(false);
        return;
      }
      setNotice('发送控制已保存');
      await load();
      setConfirmSaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function testProvider() {
    const result = await api<{ success: boolean; provider: string; mode: string; checks: { key: string; status: string; message: string }[] }>('/api/settings/provider/test', {
      method: 'POST',
      body: JSON.stringify({ provider: currentProvider })
    });
    setProviderTest(result);
    setNotice(result.success ? `${result.provider} 配置自检通过，未发送短信` : `${result.provider} 配置自检未通过`);
  }

  async function refreshWorkerStatus() {
    const data = await api<{ worker: WorkerStatus }>('/api/worker/status');
    setWorkerStatus(data.worker);
    setNotice('Worker 状态已刷新');
  }

  async function runWorkerOnce() {
    const data = await api<{ worker: WorkerStatus; result?: { processed?: number } }>('/api/worker/run-once', {
      method: 'POST',
      body: JSON.stringify({ limit: worker.batchSize || 20 })
    });
    setWorkerStatus(data.worker);
    setNotice(`已执行一次到期扫描，处理 ${data.result?.processed ?? data.worker.lastProcessed ?? 0} 条`);
  }

  function openProviderModal(item?: SmsProviderConfig) {
    setProviderEditing(item || null);
    setProviderForm(item ? {
      name: item.name,
      provider: item.provider,
      endpoint: item.endpoint,
      region: item.region,
      signName: item.signName,
      templateCode: item.templateCode,
      status: item.status,
      remark: item.remark || ''
    } : {
      ...emptyProviderForm,
      endpoint: aliyun.endpoint || emptyProviderForm.endpoint,
      region: aliyun.region || emptyProviderForm.region,
      signName: aliyun.signName || emptyProviderForm.signName,
      templateCode: aliyun.templateCode || emptyProviderForm.templateCode
    });
    setProviderModalOpen(true);
  }

  async function saveProviderConfig() {
    if (!providerForm.name.trim() || !providerForm.signName.trim() || !providerForm.templateCode.trim()) {
      setNotice('请填写服务商名称、签名和模板 Code');
      return;
    }
    const path = providerEditing ? `/api/sms-providers/${providerEditing.id}/update` : '/api/sms-providers';
    await api(path, {
      method: 'POST',
      body: JSON.stringify(providerForm)
    });
    setProviderModalOpen(false);
    setNotice(providerEditing ? '服务商配置已保存' : '服务商配置已新增');
    await load();
  }

  async function changeProviderStatus(item: SmsProviderConfig) {
    const nextStatus = item.status === 'enabled' ? 'disabled' : 'enabled';
    await api(`/api/sms-providers/${item.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: nextStatus })
    });
    setNotice(nextStatus === 'enabled' ? '服务商已启用' : '服务商已停用');
    await load();
  }

  async function activateProvider(item: SmsProviderConfig) {
    await api<{ settings?: Record<string, any> }>(`/api/sms-providers/${item.id}/activate`, {
      method: 'POST',
      body: JSON.stringify({})
    });
    setNotice('当前服务商已切换');
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
  const currentProvider = settings['sms.provider']?.provider || 'aliyun_dypns';
  const activeProviderConfig = providerConfigs.find((item) => item.isActive) || providerConfigs.find((item) => item.status === 'enabled');
  const realWorkerReady = Boolean(worker.enabled) && Boolean(worker.allowRealSend);
  const whitelistProtected = safety.requireWhitelistForRealProvider !== false;
  const providerOptions = [
    { value: 'aliyun_dypns', label: '阿里云短信通道' }
  ];
  const changes = settingChanges();
  const highRiskCount = changes.filter((item) => item.highRisk).length;
  const todaySuccessCount = todayLogs.items.filter((log) => log.status === 'success').length;
  const todayFailedCount = todayLogs.items.filter((log) => log.status === 'failed').length;
  const todayBlockedCount = todayLogs.items.filter((log) => log.status === 'blocked').length;
  const sampledTotal = todayLogs.items.length || todayLogs.total;
  const successRate = sampledTotal > 0 ? (todaySuccessCount / sampledTotal) * 100 : 0;
  const failedRate = sampledTotal > 0 ? (todayFailedCount / sampledTotal) * 100 : 0;
  const blockedRate = sampledTotal > 0 ? (todayBlockedCount / sampledTotal) * 100 : 0;
  const providerReady = Boolean(activeProviderConfig?.signName && activeProviderConfig?.templateCode);
  const channelStatus = providerReady ? (providerTest?.success === false ? '异常' : '正常') : '未配置';
  const riskLevel = !whitelistProtected ? '高风险' : (!providerReady || !worker.enabled ? '告警' : '正常');
  const riskStatus = riskLevel === '高风险' ? 'error' : riskLevel === '告警' ? 'warning' : 'success';
  const channelTagColor = channelStatus === '正常' ? '#52C41A' : channelStatus === '异常' ? '#FF4D4F' : '#FAAD14';
  const riskWarnings = [
    !whitelistProtected ? '当前已关闭白名单保护，真实发送风险较高。' : '',
    !providerReady ? '当前发送通道缺少签名或模板 Code，无法形成稳定发送配置。' : '',
    !worker.enabled ? 'Worker 已停止，任务不会自动发送。' : '',
    providerTest?.success === false ? '通道自检未通过，请检查服务商配置和环境变量。' : ''
  ].filter(Boolean);
  const flowNodes = useMemo(() => ([
    {
      title: '服务商',
      value: activeProviderConfig?.name || '未配置',
      state: providerReady ? 'normal' : 'warning',
      desc: activeProviderConfig?.templateCode ? `模板 ${activeProviderConfig.templateCode}` : '缺少模板 Code'
    },
    {
      title: '发送任务',
      value: `${pendingTaskCount} 条待执行`,
      state: pendingTaskCount > 0 ? 'warning' : 'normal',
      desc: '规则命中后进入队列'
    },
    {
      title: 'Worker',
      value: worker.enabled ? 'Running' : 'Stopped',
      state: worker.enabled ? 'normal' : 'error',
      desc: `${Number(worker.intervalMs || 30000) / 1000}s 扫描`
    },
    {
      title: '风控检查',
      value: riskLevel,
      state: riskLevel === '高风险' ? 'error' : riskLevel === '告警' ? 'warning' : 'normal',
      desc: `今日拦截率 ${percent(blockedRate)}`
    },
    {
      title: '白名单校验',
      value: whitelistProtected ? '已开启' : '已关闭',
      state: whitelistProtected ? 'normal' : 'error',
      desc: `${whitelistCount} 个号码`
    },
    {
      title: '短信发送',
      value: worker.allowRealSend ? '真实发送' : '未放行',
      state: worker.allowRealSend ? 'normal' : 'warning',
      desc: `今日 ${todayLogs.total} 条`
    },
    {
      title: '状态回执',
      value: receipt.enabled === false ? '未接收' : '接收中',
      state: receipt.enabled === false ? 'warning' : 'normal',
      desc: `累计 ${stats?.receiptCount ?? 0} 条`
    }
  ]), [activeProviderConfig, blockedRate, pendingTaskCount, providerReady, receipt.enabled, riskLevel, stats?.receiptCount, todayLogs.total, whitelistCount, worker.allowRealSend, worker.enabled, worker.intervalMs, whitelistProtected]);

  const configurationItems = [
    {
      key: 'provider',
      label: '服务商配置',
      children: (
        <div className="sendOpsConfigSection">
          <div className="providerConfigToolbar">
            <div>
              <strong>{activeProviderConfig?.name || '未选择服务商'}</strong>
              <span>{activeProviderConfig ? `${activeProviderConfig.signName} · ${activeProviderConfig.templateCode}` : '新增服务商后设为当前'}</span>
            </div>
            <AuthC authKey="security:setting:save">
              <Button type="primary" size="middle" onClick={() => openProviderModal()}>新增服务商</Button>
            </AuthC>
          </div>
          <div className="providerConfigList commercialProviderList">
            {providerConfigs.map((item) => (
              <article className={item.isActive ? 'active' : ''} key={item.id}>
                <div className="providerConfigMain">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{providerOptions.find((option) => option.value === item.provider)?.label || item.provider}</span>
                  </div>
                  <div className="providerTags">
                    <StatusBadge status={item.status === 'enabled' ? 'enabled' : 'disabled'} />
                    {item.isActive && <span className="currentProviderTag">当前</span>}
                  </div>
                </div>
                <div className="providerConfigMeta">
                  <span>签名：{item.signName || '-'}</span>
                  <span>模板 Code：{item.templateCode || '-'}</span>
                  <span>地域：{item.region || '-'}</span>
                </div>
                {item.remark && <p>{item.remark}</p>}
                <AuthC authKey="security:setting:save">
                  <div className="providerConfigActions">
                    <button type="button" onClick={() => openProviderModal(item)}>编辑</button>
                    <button type="button" onClick={() => changeProviderStatus(item)}>{item.status === 'enabled' ? '停用' : '启用'}</button>
                    <button type="button" onClick={() => activateProvider(item)} disabled={item.status !== 'enabled' || item.isActive}>设为当前</button>
                  </div>
                </AuthC>
              </article>
            ))}
            {!providerConfigs.length && <p className="settingsHint">暂无服务商配置，请先新增服务商。</p>}
          </div>
          <Alert type="info" showIcon message="AccessKey ID 和 Secret 不在页面保存；真实发送仍使用服务器环境变量中的密钥。" />
        </div>
      )
    },
    {
      key: 'worker',
      label: 'Worker 配置',
      children: (
        <div className="sendOpsConfigSection">
          <div className="commercialSwitchRow">
            <span><strong>开启自动执行</strong><small>关闭后任务只会排队，不会自动发送</small></span>
            <Switch checked={Boolean(worker.enabled)} onChange={(checked) => updateSetting('sms.worker', { ...worker, enabled: checked })} />
          </div>
          <div className="commercialSwitchRow">
            <span><strong>真实通道允许发送</strong><small>真实服务商下的最后一道确认开关</small></span>
            <Switch checked={Boolean(worker.allowRealSend)} onChange={(checked) => updateSetting('sms.worker', { ...worker, allowRealSend: checked })} />
          </div>
          <div className="formGrid two">
            <label>扫描周期 ms<input type="number" value={worker.intervalMs || 30000} onChange={(event) => updateSetting('sms.worker', { ...worker, intervalMs: Number(event.target.value) })} /></label>
            <label>批处理数量<input type="number" value={worker.batchSize || 20} onChange={(event) => updateSetting('sms.worker', { ...worker, batchSize: Number(event.target.value) })} /></label>
          </div>
        </div>
      )
    },
    {
      key: 'shortLink',
      label: '短链配置',
      children: (
        <div className="sendOpsConfigSection">
          <div className="formGrid two">
            <label>服务地址<input value={shortLink.baseUrl || ''} onChange={(event) => updateSetting('sms.short_link', { ...shortLink, baseUrl: event.target.value })} /></label>
            <label>回调地址<input value={shortLink.targetUrl || ''} onChange={(event) => updateSetting('sms.short_link', { ...shortLink, targetUrl: event.target.value })} /></label>
          </div>
        </div>
      )
    },
    {
      key: 'verification',
      label: '验证码策略',
      children: (
        <div className="sendOpsConfigSection">
          <div className="formGrid two">
            <label>有效期分钟<input type="number" value={verificationCode.validMinutes || 5} onChange={(event) => updateSetting('sms.verification_code', { ...verificationCode, validMinutes: Number(event.target.value) })} /></label>
            <label>重发间隔秒<input type="number" value={verificationCode.resendIntervalSeconds || 60} onChange={(event) => updateSetting('sms.verification_code', { ...verificationCode, resendIntervalSeconds: Number(event.target.value) })} /></label>
            <label>每日次数<input type="number" value={verificationCode.dailyLimit || 10} onChange={(event) => updateSetting('sms.verification_code', { ...verificationCode, dailyLimit: Number(event.target.value) })} /></label>
            <label>回执配置
              <SelectField
                value={receipt.enabled === false ? 'disabled' : 'enabled'}
                options={[{ value: 'enabled', label: '接收回执' }, { value: 'disabled', label: '暂不接收' }]}
                onChange={(enabled) => updateSetting('sms.receipt', { ...receipt, enabled: enabled === 'enabled' })}
              />
            </label>
          </div>
        </div>
      )
    }
  ];
  const flowStateMeta: Record<string, { label: string; color: string }> = {
    normal: { label: '正常', color: '#52C41A' },
    warning: { label: '告警', color: '#FAAD14' },
    error: { label: '异常', color: '#FF4D4F' }
  };
  const riskAlertType: 'success' | 'warning' | 'error' = riskStatus;

  return (
    <section className="stack settingsConsole sendOpsConsole">
      <section className="sendOpsTopbar">
        <div>
          <h1>短信发送控制</h1>
          <p>管理短信通道、任务执行、发送安全和配置生效状态。</p>
        </div>
        <div className="sendOpsTopActions">
          <AuthC authKey="security:setting:providerTest">
            <Button onClick={testProvider}>通道自检</Button>
          </AuthC>
          <AuthC authKey="security:setting:save">
            <Tooltip title={changes.length ? `当前有 ${changes.length} 项未保存变更` : '暂无未保存变更'}>
              <Button type="primary" onClick={() => save(false)} disabled={saving || !changes.length}>保存变更</Button>
            </Tooltip>
          </AuthC>
        </div>
      </section>

      <section className="sendOpsCockpit">
        <Card className="sendOpsStatusCard">
          <div className="sendOpsCardHead">
            <div className="sendOpsIcon blue"><KeyRound size={18} /></div>
            <Tag color={channelStatus === '正常' ? 'success' : channelStatus === '异常' ? 'error' : 'warning'}>{channelStatus}</Tag>
          </div>
          <Statistic title="通道状态" value={activeProviderConfig?.name || '未配置'} valueStyle={{ color: channelTagColor, fontSize: 22 }} />
          <div className="sendOpsCardMeta">
            <span>最近发送：{timeLabel(recentLogs[0]?.createdAt)}</span>
            <span>今日发送：{todayLogs.total} 条</span>
          </div>
        </Card>

        <Card className="sendOpsStatusCard">
          <div className="sendOpsCardHead">
            <div className="sendOpsIcon green"><Power size={18} /></div>
            <Tag color={worker.enabled ? 'success' : 'default'}>{worker.enabled ? 'Running' : 'Stopped'}</Tag>
          </div>
          <Statistic title="Worker 状态" value={worker.enabled ? '运行中' : '已停止'} valueStyle={{ color: worker.enabled ? '#52C41A' : '#8C8C8C', fontSize: 22 }} />
          <div className="sendOpsCardMeta">
            <span>扫描周期：{Number(worker.intervalMs || 30000) / 1000}s</span>
            <span>队列长度：{pendingTaskCount} 条</span>
          </div>
        </Card>

        <Card className="sendOpsStatusCard">
          <div className="sendOpsCardHead">
            <div className="sendOpsIcon amber"><AlertTriangle size={18} /></div>
            <Tag color={riskLevel === '正常' ? 'success' : riskLevel === '告警' ? 'warning' : 'error'}>{riskLevel}</Tag>
          </div>
          <Statistic title="风控状态" value={`${todayBlockedCount} 条拦截`} valueStyle={{ color: riskLevel === '高风险' ? '#FF4D4F' : '#FAAD14', fontSize: 22 }} />
          <Progress percent={Math.min(blockedRate, 100)} strokeColor={riskLevel === '高风险' ? '#FF4D4F' : '#FAAD14'} showInfo={false} />
          <div className="sendOpsCardMeta">
            <span>拦截率：{percent(blockedRate)}</span>
          </div>
        </Card>

        <Card className="sendOpsStatusCard">
          <div className="sendOpsCardHead">
            <div className="sendOpsIcon blue"><ShieldCheck size={18} /></div>
            <Tag color={whitelistProtected ? 'success' : 'error'}>{whitelistProtected ? '已开启' : '已关闭'}</Tag>
          </div>
          <Statistic title="白名单状态" value={whitelistCount} suffix="个号码" valueStyle={{ color: whitelistProtected ? '#52C41A' : '#FF4D4F', fontSize: 22 }} />
          <div className="sendOpsCardMeta">
            <span>{whitelistProtected ? '真实发送需命中白名单' : '当前存在误发风险'}</span>
          </div>
        </Card>

        <Card className="sendOpsStatusCard sendOpsTodayCard">
          <div className="sendOpsCardHead">
            <div className="sendOpsIcon green"><CheckCircle2 size={18} /></div>
            <Tag color="processing">今日</Tag>
          </div>
          <Statistic title="今日发送数据" value={todayLogs.total} suffix="条" valueStyle={{ color: '#1677FF', fontSize: 28 }} />
          <div className="sendOpsRateGrid">
            <span>成功率 <b>{percent(successRate)}</b></span>
            <span>失败率 <b>{percent(failedRate)}</b></span>
          </div>
        </Card>
      </section>

      <Card
        className="sendOpsPanel sendOpsFlowCard"
        title={<div><strong>发送链路</strong><span>通道、任务、风控和回执状态</span></div>}
        extra={<Tag color={realWorkerReady && riskLevel === '正常' ? 'success' : 'warning'}>{realWorkerReady && riskLevel === '正常' ? '可发送' : '需关注'}</Tag>}
      >
        <div className="sendOpsFlow">
          {flowNodes.map((node, index) => (
            <div className="sendOpsFlowItem" key={node.title}>
              <article className={`sendOpsFlowNode ${node.state}`}>
                <div className="sendOpsFlowDot" style={{ background: flowStateMeta[node.state].color }} />
                <div>
                  <span>{node.title}</span>
                  <strong>{node.value}</strong>
                  <small>{node.desc}</small>
                </div>
                <Tag color={node.state === 'normal' ? 'success' : node.state === 'warning' ? 'warning' : 'error'}>{flowStateMeta[node.state].label}</Tag>
              </article>
              {index < flowNodes.length - 1 && <div className="sendOpsFlowArrow">→</div>}
            </div>
          ))}
        </div>
      </Card>

      <section className="sendOpsCommercialGrid">
        <div className="sendOpsPrimary">
          <Card
            className="sendOpsPanel"
            title={<div><strong>发送安全策略</strong><span>白名单、频控和风险告警</span></div>}
            extra={<Tag color={riskAlertType}>{riskLevel}</Tag>}
          >
            <div className="sendOpsWarnings">
              {riskWarnings.length ? riskWarnings.map((warning) => (
                <Alert key={warning} type={riskAlertType} showIcon message={warning} />
              )) : <Alert type="success" showIcon message="当前发送安全策略正常，真实发送处于受控状态。" />}
            </div>

            <div className="riskStrategyGrid">
              <article className="strategyCard whitelistStrategy">
                <div className="strategyCardHead">
                  <div>
                    <span>白名单控制</span>
                    <strong>{whitelistProtected ? '真实发送前强制校验' : '白名单保护已关闭'}</strong>
                    <small>命中数量：{whitelistCount}</small>
                  </div>
                  <Switch
                    checked={whitelistProtected}
                    checkedChildren="开启"
                    unCheckedChildren="关闭"
                    onChange={(checked) => updateSetting('sms.safety', { ...safety, requireWhitelistForRealProvider: checked })}
                  />
                </div>
                <p>关闭后真实发送不再强制限定测试号码，保存时会进入高风险确认。</p>
              </article>

              <article className="strategyCard frequencyStrategy">
                <div className="strategyCardHead">
                  <div>
                    <span>频控策略</span>
                    <strong>{sceneOptions.find((item) => item.value === frequencyScene)?.label || '业务场景'}</strong>
                    <small>当前限制仅作用于所选业务场景</small>
                  </div>
                </div>
                <div className="frequencySceneControl">
                  <div>
                    <span>适用场景</span>
                    <small>切换后下方展示该场景的发送限制</small>
                  </div>
                  <SelectField value={frequencyScene} options={sceneOptions} onChange={setFrequencyScene} />
                </div>
                <div className="frequencyMetricGrid">
                  <label>
                    <span>单日上限</span>
                    <input type="number" value={activeFrequencyPolicy.dailyLimit} onChange={(event) => updateFrequencyPolicy({ dailyLimit: Number(event.target.value) })} />
                    <small>条/天</small>
                  </label>
                  <label>
                    <span>单周上限</span>
                    <input type="number" value={activeFrequencyPolicy.weeklyLimit} onChange={(event) => updateFrequencyPolicy({ weeklyLimit: Number(event.target.value) })} />
                    <small>条/周</small>
                  </label>
                  <label>
                    <span>冷却时间</span>
                    <input type="number" value={activeFrequencyPolicy.cooldownMinutes} onChange={(event) => updateFrequencyPolicy({ cooldownMinutes: Number(event.target.value) })} />
                    <small>分钟</small>
                  </label>
                  <div>
                    <span>静默时间</span>
                    <strong>{activeFrequencyPolicy.quietStart || '22:00'} - {activeFrequencyPolicy.quietEnd || '08:00'}</strong>
                    <small>避免夜间扰民</small>
                  </div>
                </div>
                <div className="quietTimeEditor">
                  <label>静默开始<input type="time" value={activeFrequencyPolicy.quietStart || '22:00'} onChange={(event) => updateFrequencyPolicy({ quietStart: event.target.value })} /></label>
                  <label>静默结束<input type="time" value={activeFrequencyPolicy.quietEnd || '08:00'} onChange={(event) => updateFrequencyPolicy({ quietEnd: event.target.value })} /></label>
                  <label>策略状态
                    <SelectField
                      value={activeFrequencyPolicy.status || 'enabled'}
                      options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]}
                      onChange={(status) => updateFrequencyPolicy({ status })}
                    />
                  </label>
                </div>
              </article>
            </div>
          </Card>

          <Card
            className="sendOpsPanel"
            title={<div><strong>配置中心</strong><span>服务商、Worker、短链和验证码策略</span></div>}
            extra={<Tag color={changes.length ? 'warning' : 'default'}>{changes.length ? `${changes.length} 项待保存` : '已同步'}</Tag>}
          >
            <Collapse bordered={false} items={configurationItems} defaultActiveKey={[]} className="sendOpsCollapse" />
          </Card>
        </div>

        <aside className="sendOpsAside">
          <Card className="sendOpsPanel" title={<div><strong>运行状态</strong><span>当前 API 进程内 worker</span></div>}>
            <div className="settingsStateList commercialStateList">
              <div><span>进程状态</span><StatusBadge status={workerStatus?.enabled ? 'enabled' : 'disabled'} /></div>
              <div><span>执行中</span><strong>{workerStatus?.running ? '是' : '否'}</strong></div>
              <div><span>最近执行</span><strong>{timeLabel(workerStatus?.lastRunAt)}</strong></div>
              <div><span>最近处理</span><strong>{workerStatus?.lastProcessed ?? 0}</strong></div>
              <div><span>停用原因</span><strong>{workerStatus?.disabledReason || '-'}</strong></div>
              <div><span>最近错误</span><strong>{workerStatus?.lastError || '-'}</strong></div>
            </div>
            <div className="sendControlActions">
              <Button onClick={refreshWorkerStatus}>刷新状态</Button>
              <AuthC authKey="security:setting:workerRun">
                <Button onClick={runWorkerOnce}>执行一次扫描</Button>
              </AuthC>
            </div>
          </Card>

          <Card className="sendOpsPanel" title={<div><strong>变更保存</strong><span>保存前确认影响范围</span></div>}>
            <div className="changeSummary commercialChangeSummary">
              <strong>{changes.length}</strong>
              <span>项未保存变更</span>
              <p>{highRiskCount ? `${highRiskCount} 项属于高风险发送控制，保存后可能进入审批。` : '当前变更无需额外审批。'}</p>
            </div>
            <div className="settingsChangeList">
              {changes.slice(0, 6).map((item) => (
                <article key={item.key}>
                  <div>
                    <strong>{configLabel(item.key)}</strong>
                    <span>{item.key}</span>
                  </div>
                  <StatusBadge status={item.highRisk ? 'pending' : 'skipped'} />
                </article>
              ))}
              {!changes.length && <p className="settingsHint">当前没有未保存的配置变更。</p>}
              {changes.length > 6 && <p className="settingsHint">还有 {changes.length - 6} 项变更会在确认弹窗中展示。</p>}
            </div>
            <AuthC authKey="security:setting:save">
              <Button type="primary" block onClick={() => save(false)} disabled={saving || !changes.length}>保存变更</Button>
            </AuthC>
          </Card>

          {providerTest && (
            <Card className="sendOpsPanel" title={<div><strong>通道自检</strong><span>{providerTest.provider}</span></div>}>
              <div className="miniTimeline">
                {providerTest.checks.map((check) => (
                  <div className="miniTimelineItem" key={check.key}>
                    <div><strong>{check.key}</strong><span>{check.message}</span></div>
                    <StatusBadge status={check.status === 'passed' ? 'success' : check.status === 'skipped' ? 'skipped' : 'failed'} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </aside>
      </section>

      <Modal
        open={providerModalOpen}
        title={providerEditing ? '编辑服务商' : '新增服务商'}
        subtitle="服务商、签名与模板 Code"
        onClose={() => setProviderModalOpen(false)}
        showClose={false}
        footerDivider={false}
        size="wide"
      >
        <div className="formPanel">
          <div className="providerModalGrid">
            <label>服务商名称
              <input value={providerForm.name} onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })} placeholder="请输入服务商名称" />
            </label>
            <label>服务商类型
              <SelectField
                value={providerForm.provider}
                options={providerOptions}
                onChange={(provider) => setProviderForm({ ...providerForm, provider })}
              />
            </label>
            <label>签名
              <input value={providerForm.signName} onChange={(event) => setProviderForm({ ...providerForm, signName: event.target.value })} placeholder="请输入短信签名" />
            </label>
            <label>模板 Code
              <input value={providerForm.templateCode} onChange={(event) => setProviderForm({ ...providerForm, templateCode: event.target.value })} placeholder="请输入模板 Code" />
            </label>
            <label>Endpoint
              <input value={providerForm.endpoint} onChange={(event) => setProviderForm({ ...providerForm, endpoint: event.target.value })} placeholder="dypnsapi.aliyuncs.com" />
            </label>
            <label>Region
              <input value={providerForm.region} onChange={(event) => setProviderForm({ ...providerForm, region: event.target.value })} placeholder="cn-hangzhou" />
            </label>
            <label>状态
              <SelectField
                value={providerForm.status}
                options={[{ value: 'enabled', label: '启用' }, { value: 'disabled', label: '停用' }]}
                onChange={(status) => setProviderForm({ ...providerForm, status: status === 'disabled' ? 'disabled' : 'enabled' })}
              />
            </label>
            <label className="providerRemark">备注
              <input value={providerForm.remark} onChange={(event) => setProviderForm({ ...providerForm, remark: event.target.value })} placeholder="请输入备注" />
            </label>
          </div>
          <div className="settingsHint providerModalTip">AccessKey ID 和 Secret 继续由服务端环境变量读取，页面不展示、不保存密钥。</div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setProviderModalOpen(false)}>取消</button>
            <button className="primaryButton compact" type="button" onClick={saveProviderConfig}>保存</button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmSaveOpen} title="确认保存发送控制" subtitle="高风险配置变更" onClose={() => setConfirmSaveOpen(false)} showClose={false} size="wide">
        <div className="formPanel">
          <section className="approvalBlock">
            <strong>变更影响</strong>
            <p>本次变更涉及发送服务商、任务 worker 或白名单保护，保存后可能进入审批；审批通过前不会生效。</p>
          </section>
          <div className="dataTableWrap">
            <table className="dataTable compactTable">
              <thead><tr><th>配置项</th><th>风险</th><th>变更前</th><th>变更后</th></tr></thead>
              <tbody>
                {changes.map((item) => (
                  <tr key={item.key}>
                    <td><strong>{configLabel(item.key)}</strong><span>{item.key}</span></td>
                    <td><StatusBadge status={item.highRisk ? 'pending' : 'skipped'} /></td>
                    <td><pre>{compactJson(item.before)}</pre></td>
                    <td><pre>{compactJson(item.after)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modalActions">
            <button className="secondaryButton compact" type="button" onClick={() => setConfirmSaveOpen(false)}>取消</button>
            <button className="primaryButton compact" type="button" onClick={() => save(true)} disabled={saving}>确认保存</button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
