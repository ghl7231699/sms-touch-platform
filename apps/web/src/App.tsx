import { useEffect, useState } from 'react';
import { Lock, LogOut, RefreshCw } from 'lucide-react';
import { api } from './lib/api';
import type { AuthUser, EventItem, Health, Rule, SendLog, SmsTask, Stats, Template, View } from './types';
import { NavButton } from './components/NavButton';
import { menuGroups, pageTitles } from './constants/menus';
import LoginPage from './pages/Login';
import Dashboard from './pages/dashboard/Dashboard';
import Templates from './pages/templates/Templates';
import Rules from './pages/rules/Rules';
import ManualSend from './pages/manual-send/ManualSend';
import Events from './pages/events/Events';
import Tasks from './pages/tasks/Tasks';
import Logs from './pages/logs/Logs';
import UsersPage from './pages/governance/UsersPage';
import RolesPage from './pages/governance/RolesPage';
import PhoneListPage from './pages/governance/PhoneListPage';
import SettingsPage from './pages/governance/SettingsPage';
import EventSourcesPage from './pages/governance/EventSourcesPage';
import AuditPage from './pages/governance/AuditPage';
import ExportTasksPage from './pages/governance/ExportTasksPage';
import BatchJobsPage from './pages/governance/BatchJobsPage';
import ApprovalsPage from './pages/governance/ApprovalsPage';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
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

  async function loadMe() {
    const token = window.localStorage.getItem('sms_auth_token');
    if (!token) {
      setAuthChecked(true);
      return;
    }
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me');
      setCurrentUser(data.user);
    } catch {
      window.localStorage.removeItem('sms_auth_token');
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function handleLogin(token: string, user: AuthUser) {
    window.localStorage.setItem('sms_auth_token', token);
    setCurrentUser(user);
    setNotice(`欢迎回来，${user.name}`);
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      window.localStorage.removeItem('sms_auth_token');
      setCurrentUser(null);
      setView('dashboard');
    }
  }

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
    loadMe();
  }, []);

  useEffect(() => {
    if (currentUser) refresh();
  }, [currentUser]);

  const currentTitle = pageTitles[view];

  if (!authChecked) {
    return <div className="authShell"><div className="authCard"><strong>正在校验登录态</strong></div></div>;
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

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
          {menuGroups.map((group) => (
            <div className="navGroupBlock" key={group.title}>
              <span className="navGroup">{group.title}</span>
              {group.items.map((item) => (
                <NavButton
                  key={item.key}
                  active={view === item.key}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => setView(item.key)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="guard">
          <Lock size={18} />
          <div>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.roles.map((role) => role.name).join(' / ')} · {health?.provider || 'mock'}</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="pageHeader">
          <div>
            <h1>{currentTitle}</h1>
            <p>{notice}</p>
          </div>
          <div className="headerActions">
            <button className="iconButton" onClick={refresh} disabled={loading}>
              <RefreshCw size={18} />
              刷新
            </button>
            <button className="iconButton" onClick={logout}>
              <LogOut size={18} />
              退出
            </button>
          </div>
        </header>

        {view === 'dashboard' && <Dashboard stats={stats} logs={logs} rules={rules} tasks={tasks} />}
        {view === 'templates' && <Templates templates={templates} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'rules' && <Rules rules={rules} templates={templates} logs={logs} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'manual' && <ManualSend templates={templates} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'events' && <Events events={events} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'tasks' && <Tasks tasks={tasks} onRefresh={refresh} setNotice={setNotice} />}
        {view === 'logs' && <Logs logs={logs} />}
        {view === 'users' && <UsersPage setNotice={setNotice} />}
        {view === 'roles' && <RolesPage />}
        {view === 'whitelist' && <PhoneListPage kind="whitelist" title="白名单管理" setNotice={setNotice} />}
        {view === 'blacklist' && <PhoneListPage kind="blacklist" title="黑名单管理" setNotice={setNotice} />}
        {view === 'unsubscribes' && <PhoneListPage kind="unsubscribes" title="退订管理" setNotice={setNotice} />}
        {view === 'settings' && <SettingsPage setNotice={setNotice} />}
        {view === 'eventSources' && <EventSourcesPage setNotice={setNotice} />}
        {view === 'eventSourceLogs' && <AuditPage mode="eventSourceLogs" />}
        {view === 'operationLogs' && <AuditPage mode="operationLogs" />}
        {view === 'exportTasks' && <ExportTasksPage setNotice={setNotice} />}
        {view === 'batchJobs' && <BatchJobsPage />}
        {view === 'approvals' && <ApprovalsPage setNotice={setNotice} />}
      </main>
    </div>
  );
}
