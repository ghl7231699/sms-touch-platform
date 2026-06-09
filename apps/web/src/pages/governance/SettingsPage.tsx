import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { api } from '../../lib/api';
import { SelectField } from '../../components/SelectField';

export default function SettingsPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [settings, setSettings] = useState<Record<string, any>>({});

  async function load() {
    const data = await api<{ settings: Record<string, any> }>('/api/settings');
    setSettings(data.settings);
  }

  useEffect(() => {
    load().catch((error) => setNotice(error instanceof Error ? error.message : '配置加载失败'));
  }, []);

  async function save() {
    await api('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ settings })
    });
    setNotice('系统配置已保存');
    await load();
  }

  const safety = settings['sms.safety'] || {};
  const worker = settings['sms.worker'] || {};
  const shortLink = settings['sms.short_link'] || {};
  const providerOptions = [
    { value: 'mock', label: 'mock' },
    { value: 'aliyun_dypns', label: 'aliyun_dypns' }
  ];

  return (
    <section className="workspace">
      <section className="panel formPanel">
        <div className="panelTitle"><h2>发送保护</h2><span>Provider / Worker / 白名单</span></div>
        <label>服务商
          <SelectField
            value={settings['sms.provider']?.provider || 'mock'}
            options={providerOptions}
            onChange={(provider) => setSettings({ ...settings, 'sms.provider': { provider } })}
          />
        </label>
        <label>Worker 批量大小<input type="number" value={worker.batchSize || 20} onChange={(event) => setSettings({ ...settings, 'sms.worker': { ...worker, batchSize: Number(event.target.value) } })} /></label>
        <label className="checkRow"><input type="checkbox" checked={Boolean(safety.requireWhitelistForMock)} onChange={(event) => setSettings({ ...settings, 'sms.safety': { ...safety, requireWhitelistForMock: event.target.checked } })} />mock 发送也要求白名单</label>
        <label className="checkRow"><input type="checkbox" checked={safety.requireWhitelistForRealProvider !== false} onChange={(event) => setSettings({ ...settings, 'sms.safety': { ...safety, requireWhitelistForRealProvider: event.target.checked } })} />真实服务商要求白名单</label>
        <button className="primaryButton" onClick={save}><Settings size={16} />保存配置</button>
      </section>
      <section className="panel formPanel">
        <div className="panelTitle"><h2>短链配置</h2><span>点击追踪</span></div>
        <label>短链域名<input value={shortLink.baseUrl || ''} onChange={(event) => setSettings({ ...settings, 'sms.short_link': { ...shortLink, baseUrl: event.target.value } })} /></label>
        <label>默认跳转地址<input value={shortLink.targetUrl || ''} onChange={(event) => setSettings({ ...settings, 'sms.short_link': { ...shortLink, targetUrl: event.target.value } })} /></label>
      </section>
    </section>
  );
}
