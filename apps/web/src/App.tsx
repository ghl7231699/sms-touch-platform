import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Menu as AntMenu } from 'antd';
import { LogOut, Menu as MenuIcon } from 'lucide-react';
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
import { Modal } from './components/Modal';

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
  const [loadingCount, setLoadingCount] = useState(0);
  const [forbidden, setForbidden] = useState<{ message: string; code?: string; path?: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const location = useLocation();
  const navigate = useNavigate();
  const resolvedMenus = useMemo(() => resolveMenus(menus), []);
  const filteredMenus = useMemo(() => filterAuthorizedMenus(resolvedMenus), [resolvedMenus, currentUser]);
  const accessibleRoutes = useMemo(() => flattenMenus(filteredMenus), [filteredMenus]);
  const firstAccessiblePath = useMemo(() => getFirstAccessiblePath(resolvedMenus), [resolvedMenus, currentUser]);
  const currentTitle = pageTitles[location.pathname] || '短信触达平台';
  const selectedPath = accessibleRoutes.find((item) => item.path === location.pathname)?.path || firstAccessiblePath;
  const selectedGroup = filteredMenus.find((group) => (group.children?.length ? group.children : [group]).some((item) => item.path === selectedPath));
  const selectedMenu = (selectedGroup?.children?.length ? selectedGroup.children : selectedGroup ? [selectedGroup] : []).find((item) => item.path === selectedPath);
  const menuItems = useMemo(() => filteredMenus.map((group) => ({
    key: group.children?.length ? group.path : group.path,
    icon: group.icon,
    label: group.title,
    children: group.children?.length
      ? group.children.map((item) => ({
        key: item.path,
        icon: item.icon,
        label: item.title
      }))
      : undefined
  })), [filteredMenus]);

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

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      setNotice('新密码至少需要 8 位');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setNotice('两次输入的新密码不一致');
      return;
    }
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword
        })
      });
      setNotice('密码已修改');
      setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '密码修改失败');
    }
  }

  async function refresh() {
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
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (currentUser) refresh();
  }, [currentUser]);

  useEffect(() => {
    if (!notice || notice === '就绪') return undefined;
    const timer = window.setTimeout(() => setNotice('就绪'), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function handleLoadingStart() {
      setLoadingCount((value) => value + 1);
    }

    function handleLoadingEnd() {
      setLoadingCount((value) => Math.max(0, value - 1));
    }

    function handleForbidden(event: Event) {
      const detail = (event as CustomEvent<{ message?: string; code?: string; path?: string }>).detail || {};
      setForbidden({
        message: detail.message || '当前账号没有执行该操作的权限。',
        code: detail.code,
        path: detail.path
      });
    }

    window.addEventListener('app:loading-start', handleLoadingStart);
    window.addEventListener('app:loading-end', handleLoadingEnd);
    window.addEventListener('app:forbidden', handleForbidden);
    return () => {
      window.removeEventListener('app:loading-start', handleLoadingStart);
      window.removeEventListener('app:loading-end', handleLoadingEnd);
      window.removeEventListener('app:forbidden', handleForbidden);
    };
  }, []);

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
    return (
      <div className="authShell">
        <div className="pageLoadingCard">
          <div className="loadingSpinner" />
          <strong>正在校验登录态</strong>
          <span>请稍候，系统正在确认当前账号状态。</span>
        </div>
      </div>
    );
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
  return (
    <div className={`shell${sidebarCollapsed ? ' sidebarCollapsed' : ''}`}>
      {loadingCount > 0 && <div className="globalLoadingBar"><span /></div>}
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">SMS</div>
          <div className="brandText">
            <strong>短信触达平台</strong>
            <span>运营工作台</span>
          </div>
        </div>

        <AntMenu
          className="sideMenu"
          defaultOpenKeys={selectedGroup ? [selectedGroup.path] : []}
          inlineCollapsed={sidebarCollapsed}
          items={menuItems}
          mode="inline"
          selectedKeys={[selectedPath]}
          onClick={({ key }) => navigate(String(key))}
        />
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
              <MenuIcon size={22} />
            </button>
          </div>
          <div className="headerRight">
            <span className="headerWelcome">
              欢迎回来，{currentUser.name} · 今天是 {formatChineseToday()} · 祝你工作顺利！
            </span>
            <div className="headerActions">
              <button className="topTextButton" type="button" onClick={() => setPasswordOpen(true)}>修改密码</button>
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
          <Route path="/403" element={<ForbiddenPage onBack={() => navigate(firstAccessiblePath)} />} />
          {renderRoutes(resolvedMenus, pageContext, firstAccessiblePath, navigate)}
          <Route
            path="*"
            element={isKnownRoute ? <Navigate to={firstAccessiblePath} replace /> : <ForbiddenPage onBack={() => navigate(firstAccessiblePath)} />}
          />
        </Routes>
        {notice !== '就绪' && <div className="noticeToast">{notice}</div>}
        <Modal open={Boolean(forbidden)} title="权限不足" onClose={() => setForbidden(null)} showClose={false}>
          {forbidden && (
            <div className="formPanel">
              <ForbiddenPage
                title="403"
                message={forbidden.message}
                detail={forbidden.path ? `请求地址：${forbidden.path}${forbidden.code ? ` · 错误码：${forbidden.code}` : ''}` : '请联系管理员检查角色权限配置。'}
                actionText="我知道了"
                hideAction
                onBack={() => setForbidden(null)}
              />
              <div className="modalActions">
                <button className="primaryButton compact" type="button" onClick={() => setForbidden(null)}>关闭</button>
              </div>
            </div>
          )}
        </Modal>
        <Modal open={passwordOpen} title="修改密码" subtitle={currentUser.email} onClose={() => setPasswordOpen(false)} showClose={false}>
          <form className="formPanel" onSubmit={changePassword}>
            <label>原密码<input type="password" value={passwordForm.oldPassword} onChange={(event) => setPasswordForm({ ...passwordForm, oldPassword: event.target.value })} required /></label>
            <label>新密码<input type="password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })} required /></label>
            <label>确认新密码<input type="password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })} required /></label>
            <div className="modalActions">
              <button className="secondaryButton compact" type="button" onClick={() => setPasswordOpen(false)}>取消</button>
              <button className="primaryButton compact" type="submit">保存</button>
            </div>
          </form>
        </Modal>
      </main>
    </div>
  );
}
