import {
  Activity,
  Ban,
  Bell,
  ClipboardCheck,
  Clock3,
  Database,
  FileText,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Send,
  Settings,
  ShieldCheck,
  ScrollText,
  Users,
  Zap
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { EventItem, Health, Rule, SendLog, SmsTask, Stats, Template } from '../types';
import Dashboard from '../pages/dashboard/Dashboard';
import Templates from '../pages/templates/Templates';
import Rules from '../pages/rules/Rules';
import ManualSend from '../pages/manual-send/ManualSend';
import Events from '../pages/events/Events';
import Tasks from '../pages/tasks/Tasks';
import Logs from '../pages/logs/Logs';
import UsersPage from '../pages/governance/UsersPage';
import PhoneListPage from '../pages/governance/PhoneListPage';
import SettingsPage from '../pages/governance/SettingsPage';
import EventSourcesPage from '../pages/governance/EventSourcesPage';
import AuditPage from '../pages/governance/AuditPage';
import ExportTasksPage from '../pages/governance/ExportTasksPage';
import BatchJobsPage from '../pages/governance/BatchJobsPage';
import ApprovalsPage from '../pages/governance/ApprovalsPage';

export interface PageContext {
  templates: Template[];
  rules: Rule[];
  logs: SendLog[];
  events: EventItem[];
  tasks: SmsTask[];
  stats: Stats | null;
  health: Health | null;
  onRefresh: () => Promise<void>;
  setNotice: (value: string) => void;
}

export interface PermissionButton {
  title: string;
  key: string;
  authDisabled?: boolean;
  buttons?: PermissionButton[];
}

export interface AppMenuItem {
  key: string;
  path: string;
  title: string;
  icon?: ReactNode;
  component?: (context: PageContext) => ReactNode;
  children?: AppMenuItem[];
  buttons?: PermissionButton[];
  hidden?: boolean;
  authDisabled?: boolean;
}

const button = (title: string, key: string): PermissionButton => ({ title, key });

export const menus: AppMenuItem[] = [
  {
    key: 'overview',
    path: '/overview',
    title: '运营总览',
    icon: <LayoutDashboard size={18} />,
    children: [
      {
        key: 'dashboard',
        path: '/overview/dashboard',
        title: '增长总览',
        icon: <LayoutDashboard size={18} />,
        authDisabled: true,
        buttons: [{ title: '页面查看', key: 'base', authDisabled: true }],
        component: ({ stats, logs, rules, tasks }) => <Dashboard stats={stats} logs={logs} rules={rules} tasks={tasks} />
      }
    ]
  },
  {
    key: 'touch',
    path: '/touch',
    title: '触达运营',
    icon: <Send size={18} />,
    children: [
      {
        key: 'template',
        path: '/touch/templates',
        title: '模板中心',
        icon: <FileText size={18} />,
        buttons: [button('页面查看', 'base'), button('新建模板', 'add'), button('启停模板', 'status')],
        component: ({ templates, onRefresh, setNotice }) => <Templates templates={templates} onRefresh={onRefresh} setNotice={setNotice} />
      },
      {
        key: 'rule',
        path: '/touch/rules',
        title: '规则中心',
        icon: <ListChecks size={18} />,
        buttons: [button('页面查看', 'base'), button('新建规则', 'add'), button('启用规则', 'enable'), button('停用规则', 'disable')],
        component: ({ rules, templates, logs, onRefresh, setNotice }) => <Rules rules={rules} templates={templates} logs={logs} onRefresh={onRefresh} setNotice={setNotice} />
      },
      {
        key: 'manual',
        path: '/touch/manual-send',
        title: '手动发送',
        icon: <Send size={18} />,
        buttons: [button('页面查看', 'base'), button('发送短信', 'send')],
        component: ({ templates, onRefresh, setNotice }) => <ManualSend templates={templates} onRefresh={onRefresh} setNotice={setNotice} />
      },
      {
        key: 'task',
        path: '/touch/tasks',
        title: '任务中心',
        icon: <Clock3 size={18} />,
        buttons: [button('页面查看', 'base'), button('批量取消', 'batchCancel'), button('批量重试', 'batchRetry'), button('执行到期任务', 'runDue')],
        component: ({ tasks, onRefresh, setNotice }) => <Tasks tasks={tasks} onRefresh={onRefresh} setNotice={setNotice} />
      },
      {
        key: 'event',
        path: '/touch/events',
        title: '事件触发',
        icon: <Zap size={18} />,
        buttons: [button('页面查看', 'base'), button('模拟事件', 'simulate')],
        component: ({ events, onRefresh, setNotice }) => <Events events={events} onRefresh={onRefresh} setNotice={setNotice} />
      }
    ]
  },
  {
    key: 'data',
    path: '/data',
    title: '数据分析',
    icon: <Activity size={18} />,
    children: [
      {
        key: 'sendLog',
        path: '/data/send-logs',
        title: '发送记录',
        icon: <Activity size={18} />,
        buttons: [button('页面查看', 'base'), button('查看详情', 'detail')],
        component: ({ logs }) => <Logs logs={logs} />
      }
    ]
  },
  {
    key: 'account',
    path: '/account',
    title: '账号权限',
    icon: <Users size={18} />,
    children: [
      {
        key: 'user',
        path: '/account/users',
        title: '用户管理',
        icon: <Users size={18} />,
        buttons: [
          button('页面查看', 'base'),
          button('新建账号', 'add'),
          button('查看详情', 'view'),
          button('编辑账号', 'edit'),
          button('删除账号', 'delete'),
          button('重置密码', 'resetPassword'),
          button('启停账号', 'status'),
          button('审核注册申请', 'approveRegister'),
          button('驳回注册申请', 'rejectRegister'),
          button('查看角色权限', 'roleView'),
          button('配置角色权限', 'roleEdit')
        ],
        component: ({ setNotice }) => <UsersPage setNotice={setNotice} />
      }
    ]
  },
  {
    key: 'security',
    path: '/security',
    title: '安全治理',
    icon: <ShieldCheck size={18} />,
    children: [
      {
        key: 'whitelist',
        path: '/security/whitelist',
        title: '白名单',
        icon: <ShieldCheck size={18} />,
        buttons: [button('页面查看', 'base'), button('新增记录', 'add'), button('编辑记录', 'edit'), button('启停记录', 'status'), button('导出', 'export'), button('查看详情', 'detail')],
        component: ({ setNotice }) => <PhoneListPage kind="whitelist" title="白名单管理" setNotice={setNotice} />
      },
      {
        key: 'blacklist',
        path: '/security/blacklist',
        title: '黑名单',
        icon: <Ban size={18} />,
        buttons: [button('页面查看', 'base'), button('新增记录', 'add'), button('批量导入', 'import'), button('移除记录', 'remove'), button('查看详情', 'detail')],
        component: ({ setNotice }) => <PhoneListPage kind="blacklist" title="黑名单管理" setNotice={setNotice} />
      },
      {
        key: 'unsubscribe',
        path: '/security/unsubscribes',
        title: '退订记录',
        icon: <Bell size={18} />,
        buttons: [button('页面查看', 'base'), button('新增记录', 'add'), button('批量导入', 'import'), button('查看详情', 'detail')],
        component: ({ setNotice }) => <PhoneListPage kind="unsubscribes" title="退订管理" setNotice={setNotice} />
      },
      {
        key: 'setting',
        path: '/security/settings',
        title: '发送控制',
        icon: <Settings size={18} />,
        buttons: [button('页面查看', 'base'), button('保存配置', 'save')],
        component: ({ setNotice }) => <SettingsPage setNotice={setNotice} />
      }
    ]
  },
  {
    key: 'integration',
    path: '/integration',
    title: '接入管理',
    icon: <KeyRound size={18} />,
    children: [
      {
        key: 'eventSource',
        path: '/integration/event-sources',
        title: '事件来源',
        icon: <KeyRound size={18} />,
        buttons: [button('页面查看', 'base'), button('新建来源', 'add'), button('查看详情', 'detail'), button('编辑来源', 'edit'), button('启停来源', 'status'), button('重置密钥', 'resetSecret')],
        component: ({ setNotice }) => <EventSourcesPage setNotice={setNotice} />
      },
      {
        key: 'eventSourceLog',
        path: '/integration/event-source-logs',
        title: '接入日志',
        icon: <Database size={18} />,
        buttons: [button('页面查看', 'base'), button('查看详情', 'detail')],
        component: () => <AuditPage mode="eventSourceLogs" />
      }
    ]
  },
  {
    key: 'audit',
    path: '/audit',
    title: '审计与流程',
    icon: <ScrollText size={18} />,
    children: [
      {
        key: 'operationLog',
        path: '/audit/operation-logs',
        title: '操作日志',
        icon: <ScrollText size={18} />,
        buttons: [button('页面查看', 'base'), button('查看详情', 'detail')],
        component: () => <AuditPage mode="operationLogs" />
      },
      {
        key: 'exportTask',
        path: '/audit/export-tasks',
        title: '导出任务',
        icon: <FileText size={18} />,
        buttons: [button('页面查看', 'base'), button('新建导出', 'add'), button('下载文件', 'download'), button('查看详情', 'detail')],
        component: ({ setNotice }) => <ExportTasksPage setNotice={setNotice} />
      },
      {
        key: 'batchJob',
        path: '/audit/batch-jobs',
        title: '批量操作',
        icon: <Database size={18} />,
        buttons: [button('页面查看', 'base'), button('查看明细', 'detail')],
        component: () => <BatchJobsPage />
      },
      {
        key: 'approval',
        path: '/audit/approvals',
        title: '审批记录',
        icon: <ClipboardCheck size={18} />,
        buttons: [button('页面查看', 'base'), button('查看详情', 'detail'), button('通过审批', 'approve'), button('驳回审批', 'reject'), button('撤回审批', 'withdraw')],
        component: ({ setNotice }) => <ApprovalsPage setNotice={setNotice} />
      }
    ]
  }
];

export const pageTitles: Record<string, string> = Object.fromEntries(
  menus.flatMap((menu) => menu.children?.length ? menu.children.map((item) => [item.path, item.title]) : [[menu.path, menu.title]])
);
