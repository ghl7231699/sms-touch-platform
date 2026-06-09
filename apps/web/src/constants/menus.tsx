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
  UserCheck,
  Users,
  Zap
} from 'lucide-react';
import type { View } from '../types';

export interface MenuItem {
  key: View;
  label: string;
  icon: JSX.Element;
}

export interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export const pageTitles: Record<View, string> = {
  dashboard: '运营总览',
  templates: '短信模板',
  rules: '规则中心',
  manual: '手动发送',
  events: '事件触发',
  tasks: '任务队列',
  logs: '发送记录',
  users: '用户管理',
  roles: '角色权限',
  whitelist: '白名单管理',
  blacklist: '黑名单管理',
  unsubscribes: '退订管理',
  settings: '系统配置',
  eventSources: '事件来源',
  eventSourceLogs: '事件接入日志',
  operationLogs: '操作日志',
  exportTasks: '导出任务',
  batchJobs: '批量操作',
  approvals: '审批记录'
};

export const menuGroups: MenuGroup[] = [
  {
    title: '触达主链路',
    items: [
      { key: 'dashboard', label: '运营总览', icon: <LayoutDashboard size={18} /> },
      { key: 'templates', label: '短信模板', icon: <FileText size={18} /> },
      { key: 'rules', label: '规则中心', icon: <ListChecks size={18} /> },
      { key: 'manual', label: '手动发送', icon: <Send size={18} /> },
      { key: 'events', label: '事件触发', icon: <Zap size={18} /> },
      { key: 'tasks', label: '任务队列', icon: <Clock3 size={18} /> },
      { key: 'logs', label: '发送记录', icon: <Activity size={18} /> }
    ]
  },
  {
    title: '治理与安全',
    items: [
      { key: 'users', label: '用户管理', icon: <Users size={18} /> },
      { key: 'roles', label: '角色权限', icon: <UserCheck size={18} /> },
      { key: 'whitelist', label: '白名单', icon: <ShieldCheck size={18} /> },
      { key: 'blacklist', label: '黑名单', icon: <Ban size={18} /> },
      { key: 'unsubscribes', label: '退订记录', icon: <Bell size={18} /> },
      { key: 'settings', label: '系统配置', icon: <Settings size={18} /> },
      { key: 'eventSources', label: '事件来源', icon: <KeyRound size={18} /> },
      { key: 'eventSourceLogs', label: '接入日志', icon: <Database size={18} /> },
      { key: 'operationLogs', label: '操作日志', icon: <ScrollText size={18} /> },
      { key: 'exportTasks', label: '导出任务', icon: <FileText size={18} /> },
      { key: 'batchJobs', label: '批量操作', icon: <Database size={18} /> },
      { key: 'approvals', label: '审批记录', icon: <ClipboardCheck size={18} /> }
    ]
  }
];
