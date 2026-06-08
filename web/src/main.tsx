import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BarChart3,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Zap
} from 'lucide-react';
import './styles.css';

type Status = 'enabled' | 'disabled' | 'pending' | 'sending' | 'success' | 'failed' | 'blocked';

interface Template {
  id: string;
  name: string;
  scene: string;
  providerTemplateId: string;
  content: string;
  variables: string[];
  status: Status;
}

interface Rule {
  id: string;
  name: string;
  code: string;
  scene: string;
  eventType: string;
  delayValue: number;
  delayUnit: string;
  conditionType: string;
  templateId: string;
  status: Status;
}

interface SendLog {
  id: string;
  provider: string;
  triggerType: string;
  scene: string;
  phoneMasked: string;
  templateName?: string;
  templateCode: string;
  ruleName?: string;
  eventType?: string;
  status: Status;
  code: string;
  message: string;
  receiptStatus?: string;
  shortUrl?: string;
  clickCount?: number;
  bizId?: string;
  requestId?: string;
  createdAt: string;
}

interface EventItem {
  id: string;
  eventId: string;
  eventType: string;
  userId: string;
  phone: string;
  createdAt: string;
}

interface SmsTask {
  id: string;
  taskType: string;
  status: Status;
  triggerType: string;
  scene: string;
  phoneMasked: string;
  templateName?: string;
  templateCode: string;
  ruleName?: string;
  eventType?: string;
  scheduledAt: string;
  sentAt?: string;
  attemptCount: number;
  maxAttempts: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  logId?: string;
  createdAt: string;
}

interface Stats {
  sendCount: number;
  successCount: number;
  failedCount: number;
  blockedCount: number;
  templateCount: number;
  enabledTemplateCount: number;
  ruleCount: number;
  enabledRuleCount: number;
  eventCount: number;
  clickCount: number;
  clickUserCount: number;
  receiptCount: number;
  taskCount: number;
  pendingTaskCount: number;
  dueTaskCount: number;
  ctr: string;
  providers: Record<string, number>;
  scenes: Record<string, number>;
}

interface Health {
  provider: string;
  whitelistCount: number;
  taskWorker?: {
    enabled: boolean;
    running: boolean;
    intervalMs: number;
    batchSize: number;
    lastRunAt: string | null;
    lastProcessed: number;
    lastError: string | null;
    disabledReason: string | null;
  };
}

type View = 'dashboard' | 'templates' | 'rules' | 'manual' | 'events' | 'tasks' | 'logs';

const sceneLabels: Record<string, string> = {
  register: '注册转化',
  member: '会员召回',
  campaign: '活动通知',
  after_sale: '售后回访'
};

const eventLabels: Record<string, string> = {
  user_register: '用户注册',
  membership_expired: '会员过期',
  campaign_start: '活动开始',
  order_completed: '订单完成'
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.message || json.error || '请求失败');
  }
  return json as T;
}

function statusLabel(status: string) {
  return {
    enabled: '启用',
    disabled: '停用',
    success: '成功',
    pending: '待发送',
    sending: '发送中',
    failed: '失败',
    blocked: '拦截'
  }[status] || status;
}

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<SmsTask[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [notice, setNotice] = useState('就绪');
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [healthData, statsData, tplData, ruleData, logData, eventData, taskData] = await Promise.all([
        api<Health>('/health'),
        api<Stats>('/api/stats/overview'),
        api<{ items: Template[] }>('/api/templates'),
        api<{ items: Rule[] }>('/api/rules'),
        api<{ items: SendLog[] }>('/api/send-logs?pageSize=40'),
        api<{ items: EventItem[] }>('/api/events?pageSize=20'),
        api<{ items: SmsTask[] }>('/api/tasks?pageSize=40')
      ]);
      setHealth(healthData);
      setStats(statsData);
      setTemplates(tplData.items);
      setRules(ruleData.items);
      setLogs(logData.items);
      setEvents(eventData.items);
      setTasks(taskData.items);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const currentTitle = useMemo(
    () =>
      ({
        dashboard: '运营总览',
        templates: '短信模板',
        rules: '规则中心',
        manual: '手动发送',
        events: '事件触发',
        tasks: '任务队列',
        logs: '发送记录'
      })[view],
    [view]
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">SMS</div>
          <div>
            <strong>短信触达平台</strong>
            <span>运营工作台</span>
          </div>
        </div>

        <nav>
          <NavButton active={view === 'dashboard'} icon={<LayoutDashboard size={18} />} label="运营总览" onClick={() => setView('dashboard')} />
          <NavButton active={view === 'templates'} icon={<FileText size={18} />} label="短信模板" onClick={() => setView('templates')} />
          <NavButton active={view === 'rules'} icon={<ListChecks size={18} />} label="规则中心" onClick={() => setView('rules')} />
          <NavButton active={view === 'manual'} icon={<Send size={18} />} label="手动发送" onClick={() => setView('manual')} />
          <NavButton active={view === 'events'} icon={<Zap size={18} />} label="事件触发" onClick={() => setView('events')} />
          <NavButton active={view === 'tasks'} icon={<Clock3 size={18} />} label="任务队列" onClick={() => setView('tasks')} />
          <NavButton active={view === 'logs'} icon={<Activity size={18} />} label="发送记录" onClick={() => setView('logs')} />
        </nav>

        <div className="guard">
          <ShieldCheck size={18} />
          <div>
            <strong>{health?.provider || 'mock'}</strong>
            <span>白名单 {health?.whitelistCount ?? 0} 个号码 · Worker {health?.taskWorker?.enabled ? '开启' : '关闭'}</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="pageHeader">
          <div>
            <h1>{currentTitle}</h1>
            <p>{notice}</p>
          </div>
          <button className="iconButton" onClick={refresh} disabled={loading}>
            <RefreshCw size={18} />
            刷新
          </button>
        </header>

        {view === 'dashboard' && <Dashboard stats={stats} logs={logs} rules={rules} tasks={tasks} />}
        {view === 'templates' && <Templates templates={templates} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'rules' && <Rules rules={rules} templates={templates} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'manual' && <ManualSend templates={templates} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'events' && <Events events={events} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'tasks' && <Tasks tasks={tasks} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'logs' && <Logs logs={logs} />}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`navButton ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Dashboard({ stats, logs, rules, tasks }: { stats: Stats | null; logs: SendLog[]; rules: Rule[]; tasks: SmsTask[] }) {
  const cards = [
    { label: '发送量', value: stats?.sendCount ?? 0, icon: <MessageSquare size={20} />, tone: 'blue' },
    { label: '成功量', value: stats?.successCount ?? 0, icon: <CheckCircle2 size={20} />, tone: 'green' },
    { label: '失败量', value: stats?.failedCount ?? 0, icon: <Bell size={20} />, tone: 'red' },
    { label: '待发送', value: stats?.pendingTaskCount ?? 0, icon: <Clock3 size={20} />, tone: 'amber' },
    { label: '点击量', value: stats?.clickCount ?? 0, icon: <Activity size={20} />, tone: 'blue' },
    { label: 'CTR', value: stats?.ctr ?? '0.0%', icon: <BarChart3 size={20} />, tone: 'green' },
    { label: '拦截量', value: stats?.blockedCount ?? 0, icon: <ShieldCheck size={20} />, tone: 'amber' }
  ];

  return (
    <section className="stack">
      <div className="metricGrid">
        {cards.map((card) => (
          <div className={`metric ${card.tone}`} key={card.label}>
            <div>{card.icon}</div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </div>

      <div className="twoCol">
        <section className="panel">
          <div className="panelTitle">
            <h2>启用规则</h2>
            <span>{stats?.enabledRuleCount ?? 0}/{stats?.ruleCount ?? 0}</span>
          </div>
          <div className="ruleList">
            {rules.slice(0, 5).map((rule) => (
              <div className="ruleItem" key={rule.id}>
                <div>
                  <strong>{rule.name}</strong>
                  <span>{eventLabels[rule.eventType]} · {rule.delayValue}{rule.delayUnit}</span>
                </div>
                <StatusBadge status={rule.status} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panelTitle">
            <h2>场景分布</h2>
            <BarChart3 size={18} />
          </div>
          <div className="sceneBars">
            {Object.entries(stats?.scenes || {}).map(([scene, count]) => (
              <div key={scene}>
                <span>{sceneLabels[scene] || scene}</span>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panelTitle">
          <h2>最近发送</h2>
        </div>
        <LogTable logs={logs.slice(0, 8)} />
      </section>

      <section className="panel">
        <div className="panelTitle">
          <h2>待处理任务</h2>
          <span>{stats?.dueTaskCount ?? 0} 个已到期</span>
        </div>
        <TaskTable tasks={tasks.slice(0, 8)} />
      </section>
    </section>
  );
}

function Templates({ templates, onRefresh, setNotice }: { templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    scene: 'register',
    providerTemplateId: '100001',
    content: '您的测试验证码为${code}，${min}分钟内有效。'
  });

  async function toggle(template: Template) {
    await api(`/api/templates/${template.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: template.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${template.name} 已${template.status === 'enabled' ? '停用' : '启用'}`);
    await onRefresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    await api('/api/templates', {
      method: 'POST',
      body: JSON.stringify({ ...form, variables: ['code', 'min'] })
    });
    setNotice(`${form.name} 已创建`);
    setForm({ ...form, name: '' });
    await onRefresh();
  }

  return (
    <section className="workspace wide">
      <section className="panel">
        <div className="panelTitle">
          <h2>模板库</h2>
          <span>{templates.length} 个模板</span>
        </div>
        <div className="templateGrid">
          {templates.map((template) => (
            <article className="templateCard" key={template.id}>
              <div className="templateTop">
                <div>
                  <strong>{template.name}</strong>
                  <span>{sceneLabels[template.scene] || template.scene} · {template.providerTemplateId}</span>
                </div>
                <StatusBadge status={template.status} />
              </div>
              <p>{template.content}</p>
              <div className="chips">
                {template.variables.map((item) => <span key={item}>{item}</span>)}
              </div>
              <button className="secondaryButton" onClick={() => toggle(template)}>
                {template.status === 'enabled' ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                {template.status === 'enabled' ? '停用模板' : '启用模板'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <form className="panel formPanel" onSubmit={create}>
        <div className="panelTitle">
          <h2>新建模板</h2>
          <span>变量 code/min</span>
        </div>
        <label>模板名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>业务场景
          <select value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })}>
            {Object.entries(sceneLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>服务商模板 Code<input value={form.providerTemplateId} onChange={(event) => setForm({ ...form, providerTemplateId: event.target.value })} /></label>
        <label>模板内容<input value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} /></label>
        <button className="primaryButton" type="submit"><FileText size={16} />创建模板</button>
      </form>
    </section>
  );
}

function Rules({ rules, templates, onRefresh, setNotice }: { rules: Rule[]; templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    eventType: 'user_register',
    templateId: 'tpl_register',
    delayValue: 24,
    delayUnit: 'hour',
    conditionType: 'unpaid_after_register'
  });

  async function toggle(rule: Rule) {
    await api(`/api/rules/${rule.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: rule.status === 'enabled' ? 'disabled' : 'enabled' })
    });
    setNotice(`${rule.name} 已${rule.status === 'enabled' ? '停用' : '启用'}`);
    await onRefresh();
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const template = templates.find((item) => item.id === form.templateId);
    await api('/api/rules', {
      method: 'POST',
      body: JSON.stringify({ ...form, scene: template?.scene || 'register' })
    });
    setNotice(`${form.name} 已创建`);
    setForm({ ...form, name: '' });
    await onRefresh();
  }

  return (
    <section className="workspace wide">
      <section className="panel">
        <div className="panelTitle">
          <h2>自动触达规则</h2>
          <span>{rules.filter((rule) => rule.status === 'enabled').length} 个启用</span>
        </div>
        <div className="dataTableWrap">
          <table className="dataTable">
            <thead>
              <tr>
                <th>规则</th>
                <th>事件</th>
                <th>条件</th>
                <th>模板</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td><strong>{rule.name}</strong><span>{rule.code}</span></td>
                  <td>{eventLabels[rule.eventType] || rule.eventType}</td>
                  <td>{rule.delayValue}{rule.delayUnit} · {rule.conditionType}</td>
                  <td>{templates.find((item) => item.id === rule.templateId)?.name || '-'}</td>
                  <td><StatusBadge status={rule.status} /></td>
                  <td><button className="tableButton" onClick={() => toggle(rule)}>{rule.status === 'enabled' ? '停用' : '启用'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form className="panel formPanel" onSubmit={create}>
        <div className="panelTitle">
          <h2>新建规则</h2>
          <span>单事件单动作</span>
        </div>
        <label>规则名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>触发事件
          <select value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })}>
            {Object.entries(eventLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>短信模板
          <select value={form.templateId} onChange={(event) => setForm({ ...form, templateId: event.target.value })}>
            {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
          </select>
        </label>
        <label>延迟数值<input type="number" value={form.delayValue} onChange={(event) => setForm({ ...form, delayValue: Number(event.target.value) })} /></label>
        <label>延迟单位
          <select value={form.delayUnit} onChange={(event) => setForm({ ...form, delayUnit: event.target.value })}>
            <option value="minute">分钟</option>
            <option value="hour">小时</option>
            <option value="day">天</option>
          </select>
        </label>
        <label>条件类型<input value={form.conditionType} onChange={(event) => setForm({ ...form, conditionType: event.target.value })} /></label>
        <button className="primaryButton" type="submit"><ListChecks size={16} />创建规则</button>
      </form>
    </section>
  );
}

function ManualSend({ templates, onRefresh, setNotice }: { templates: Template[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [phone, setPhone] = useState('18515385071');
  const [templateId, setTemplateId] = useState('tpl_register');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ success: boolean; status: string; code: string; message: string }>('/api/manual-send', {
      method: 'POST',
      body: JSON.stringify({ phone, templateId })
    });
    setNotice(`${statusLabel(result.status)} · ${result.code}`);
    await onRefresh();
  }

  return (
    <section className="workspace">
      <form className="panel formPanel" onSubmit={submit}>
        <div className="panelTitle">
          <h2>手动发送</h2>
          <span>白名单保护</span>
        </div>
        <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>短信模板
          <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}
          </select>
        </label>
        <button className="primaryButton" type="submit"><Send size={16} />发送短信</button>
      </form>
      <section className="panel explainPanel">
        <h2>发送策略</h2>
        <ul>
          <li>默认使用 mock provider，不触达真实手机号。</li>
          <li>切换到 aliyun_dypns 后仍只允许白名单手机号。</li>
          <li>发送记录统一进入发送记录与统计概览。</li>
        </ul>
      </section>
    </section>
  );
}

function Events({ events, onRefresh, setNotice }: { events: EventItem[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  const [phone, setPhone] = useState('18515385071');
  const [eventType, setEventType] = useState('user_register');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ matchedRuleCount: number }>('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        eventType,
        phone,
        userId: 'test-user',
        payload: { phone, source: 'operator-console' }
      })
    });
    setNotice(`事件已接收，匹配 ${result.matchedRuleCount} 条规则`);
    await onRefresh();
  }

  return (
    <section className="workspace">
      <form className="panel formPanel" onSubmit={submit}>
        <div className="panelTitle">
          <h2>模拟业务事件</h2>
          <span>自动规则触发</span>
        </div>
        <label>事件类型
          <select value={eventType} onChange={(event) => setEventType(event.target.value)}>
            {Object.entries(eventLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>手机号<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <button className="primaryButton" type="submit"><Zap size={16} />触发事件</button>
      </form>
      <section className="panel">
        <div className="panelTitle"><h2>事件流水</h2></div>
        <div className="eventList">
          {events.map((item) => (
            <div className="eventItem" key={item.id}>
              <strong>{eventLabels[item.eventType] || item.eventType}</strong>
              <span>{item.eventId} · {item.phone}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function Tasks({ tasks, onRefresh, setNotice }: { tasks: SmsTask[]; onRefresh: () => Promise<void>; setNotice: (value: string) => void }) {
  async function runDue() {
    const result = await api<{ processed: number }>('/api/tasks/run-due', {
      method: 'POST',
      body: JSON.stringify({ limit: 20 })
    });
    setNotice(`已执行 ${result.processed} 个到期任务`);
    await onRefresh();
  }

  return (
    <section className="panel">
      <div className="panelTitle">
        <h2>任务队列</h2>
        <button className="secondaryButton compact" onClick={runDue}><Clock3 size={16} />执行到期任务</button>
      </div>
      <TaskTable tasks={tasks} showDetail />
    </section>
  );
}

function Logs({ logs }: { logs: SendLog[] }) {
  return (
    <section className="panel">
      <div className="panelTitle">
        <h2>发送记录</h2>
        <span>{logs.length} 条</span>
      </div>
      <LogTable logs={logs} showActions />
    </section>
  );
}

function TaskTable({ tasks, showDetail = false }: { tasks: SmsTask[]; showDetail?: boolean }) {
  return (
    <div className="dataTableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>计划时间</th>
            <th>触发</th>
            <th>场景</th>
            <th>手机号</th>
            <th>模板</th>
            <th>状态</th>
            <th>尝试</th>
            {showDetail && <th>结果</th>}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>{new Date(task.scheduledAt).toLocaleString()}</td>
              <td>{task.triggerType === 'auto' ? eventLabels[task.eventType || ''] || '自动' : '手动'}</td>
              <td>{sceneLabels[task.scene] || task.scene}</td>
              <td>{task.phoneMasked}</td>
              <td>{task.templateName || task.templateCode}</td>
              <td><StatusBadge status={task.status} /></td>
              <td>{task.attemptCount}/{task.maxAttempts}</td>
              {showDetail && (
                <td>
                  {task.logId ? <span>日志 {task.logId.slice(0, 8)}</span> : <span>{task.lastErrorCode || '-'}</span>}
                  {task.lastErrorMessage && <span>{task.lastErrorMessage}</span>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogTable({ logs, showActions = false }: { logs: SendLog[]; showActions?: boolean }) {
  async function markDelivered(log: SendLog) {
    await api('/api/sms/provider/callback', {
      method: 'POST',
      body: JSON.stringify({
        bizId: log.bizId,
        requestId: log.requestId,
        receiptStatus: 'delivered'
      })
    });
    window.location.reload();
  }

  return (
    <div className="dataTableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>时间</th>
            <th>触发</th>
            <th>场景</th>
            <th>手机号</th>
            <th>模板</th>
            <th>状态</th>
            <th>回执</th>
            <th>短链</th>
            <th>返回</th>
            {showActions && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td>{new Date(log.createdAt).toLocaleString()}</td>
              <td>{log.triggerType === 'auto' ? '自动' : '手动'}</td>
              <td>{sceneLabels[log.scene] || log.scene}</td>
              <td>{log.phoneMasked}</td>
              <td>{log.templateName || log.templateCode}</td>
              <td><StatusBadge status={log.status} /></td>
              <td>{log.receiptStatus || '-'}</td>
              <td>
                {log.shortUrl ? (
                  <a href={log.shortUrl} target="_blank" rel="noreferrer">打开 · {log.clickCount || 0}</a>
                ) : '-'}
              </td>
              <td><strong>{log.code}</strong><span>{log.message}</span></td>
              {showActions && (
                <td>
                  {log.bizId || log.requestId ? (
                    <button className="tableButton" onClick={() => markDelivered(log)}>标记送达</button>
                  ) : '-'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`statusBadge ${status}`}>{statusLabel(status)}</span>;
}

createRoot(document.getElementById('root')!).render(<App />);
