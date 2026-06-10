import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { api } from './lib/api';
import {
  getAccessData,
  getAuthToken,
  removeAccessData,
  removeAuthToken,
  requireAuth,
  setAccessData,
  setAuthToken
} from './lib/auth';
import {
  filterAuthorizedMenus,
  flattenMenus,
  getFirstAccessiblePath,
  resolveMenus,
  type ResolvedMenuItem
} from './lib/menu-permissions';
import type { AuthUser, EventItem, Health, Rule, SendLog, SmsTask, Stats, Template } from './types';
import { menus, pageTitles, type PageContext } from './constants/menus';
import LoginPage from './pages/Login';
import SetPasswordPage from './pages/Login/SetPasswordPage';
import ForbiddenPage from './pages/governance/ForbiddenPage';

function routeElement(item: ResolvedMenuItem, context: PageContext, firstAccessiblePath: string, navigate: (path: string) => void) {
  if (item.authDisabled || requireAuth(item.fullKey)) {
    return item.component?.(context) || <ForbiddenPage onBack={() => navigate(firstAccessiblePath)} />;
  }
  return <ForbiddenPage onBack={() => navigate(firstAccessiblePath)} />;
}

function renderRoutes(items: ResolvedMenuItem[], context: PageContext, firstAccessiblePath: string, navigate: (path: string) => void) {
  return flattenMenus(items).map((item) => (
    <Route
      key={item.path}
      path={item.path}
      element={routeElement(item, context, firstAccessiblePath, navigate)}
    />
  ));
}

function formatChineseToday() {
  const today = new Date();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日，${weekdays[today.getDay()]}`;
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<SendLog[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<SmsTask[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [notice, setNotice] = useState('就绪');
  const [, setLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedMenus = useMemo(() => resolveMenus(menus), []);
  const filteredMenus = useMemo(() => filterAuthorizedMenus(resolvedMenus), [resolvedMenus, currentUser]);
  const accessibleRoutes = useMemo(() => flattenMenus(filteredMenus), [filteredMenus]);
  const firstAccessiblePath = useMemo(() => getFirstAccessiblePath(resolvedMenus), [resolvedMenus, currentUser]);
  const currentTitle = pageTitles[location.pathname] || '短信触达平台';

  async function loadMe() {
    const token = getAuthToken();
    const cachedUser = getAccessData();
    if (!token) {
      removeAccessData();
      setAuthChecked(true);
      return;
    }
    if (cachedUser) setCurrentUser(cachedUser);
    try {
      const data = await api<{ user: AuthUser }>('/api/auth/me');
      setAccessData(data.user);
      setCurrentUser(data.user);
    } catch {
      removeAuthToken();
      removeAccessData();
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function handleLogin(token: string, user: AuthUser) {
    setAuthToken(token);
    setAccessData(user);
    setCurrentUser(user);
    setNotice(`欢迎回来，${user.name}`);
    navigate(firstAccessiblePath, { replace: true });
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      removeAuthToken();
      removeAccessData();
      setCurrentUser(null);
      navigate('/login', { replace: true });
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

  const pageContext: PageContext = {
    templates,
    rules,
    logs,
    events,
    tasks,
    stats,
    health,
    onRefresh: refresh,
    setNotice
  };

  if (!authChecked) {
    return <div className="authShell"><div className="authCard"><strong>正在校验登录态</strong></div></div>;
  }

  if (!currentUser) {
    return (
      <Routes>
        <Route path="/set-password" element={<SetPasswordPage />} />
        <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
      </Routes>
    );
  }

  const isKnownRoute = accessibleRoutes.some((item) => item.path === location.pathname);
  const selectedPath = accessibleRoutes.find((item) => item.path === location.pathname)?.path || firstAccessiblePath;
  const selectedGroup = filteredMenus.find((group) => (group.children?.length ? group.children : [group]).some((item) => item.path === selectedPath));
  const selectedMenu = (selectedGroup?.children?.length ? selectedGroup.children : selectedGroup ? [selectedGroup] : []).find((item) => item.path === selectedPath);

  function isGroupExpanded(group: ResolvedMenuItem) {
    return expandedGroups[group.key] ?? selectedGroup?.key === group.key;
  }

  function toggleGroup(group: ResolvedMenuItem) {
    setExpandedGroups((value) => ({ ...value, [group.key]: !isGroupExpanded(group) }));
  }

  function handleGroupClick(group: ResolvedMenuItem) {
    if (sidebarCollapsed) {
      const target = (group.children?.length ? group.children[0] : group)?.path;
      if (target) navigate(target);
      return;
    }
    toggleGroup(group);
  }

  return (
    <div className={`shell${sidebarCollapsed ? ' sidebarCollapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">SMS</div>
          <div className="brandText">
            <strong>短信触达平台</strong>
            <span>运营工作台</span>
          </div>
        </div>

        <nav>
          {filteredMenus.map((group) => (
            <div className="navSection" key={group.key}>
              <button
                className={`navSectionButton${selectedGroup?.key === group.key ? ' active' : ''}`}
                type="button"
                onClick={() => handleGroupClick(group)}
                aria-expanded={isGroupExpanded(group)}
                title={group.title}
              >
                <span className="navSectionLabel">
                  {group.icon}
                  <span className="navSectionLabelText">{group.title}</span>
                </span>
                <ChevronDown className="navChevron" size={20} />
              </button>
              {!sidebarCollapsed && isGroupExpanded(group) && (
                <div className="navSubMenu">
                  {(group.children?.length ? group.children : [group]).map((item) => (
                    <button
                      className={`navSubItem${selectedPath === item.path ? ' active' : ''}`}
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      title={item.title}
                    >
                      {item.icon}
                      <span>{item.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="pageHeader">
          <div className="pageHeaderMain">
            <button
              className="menuToggle"
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              aria-label={sidebarCollapsed ? '展开菜单栏' : '收起菜单栏'}
              title={sidebarCollapsed ? '展开菜单栏' : '收起菜单栏'}
            >
              <Menu size={22} />
            </button>
          </div>
          <div className="headerRight">
            <span className="headerWelcome">
              欢迎回来，{currentUser.name} · 今天是 {formatChineseToday()} · 祝你工作顺利！
            </span>
            <div className="headerActions">
              <div className="userMeta">
                <strong>{currentUser.name}</strong>
                <span>{currentUser.email}</span>
              </div>
              <button className="iconButton topLogoutButton" onClick={logout}>
                <LogOut size={15} />
                退出
              </button>
            </div>
          </div>
        </header>

        <div className="contentBreadcrumb breadcrumb" aria-label="当前位置">
          <span>{selectedGroup?.title || '后台'}</span>
          <span>/</span>
          <span>{selectedMenu?.title || currentTitle}</span>
        </div>

        <Routes>
          <Route path="/" element={<Navigate to={firstAccessiblePath} replace />} />
          <Route path="/login" element={<Navigate to={firstAccessiblePath} replace />} />
          <Route path="/set-password" element={<SetPasswordPage />} />
          {renderRoutes(resolvedMenus, pageContext, firstAccessiblePath, navigate)}
          <Route
            path="*"
            element={isKnownRoute ? <Navigate to={firstAccessiblePath} replace /> : <ForbiddenPage onBack={() => navigate(firstAccessiblePath)} />}
          />
        </Routes>
      </main>
    </div>
  );
}
