import { Activity, BarChart3, Bell, CheckCircle2, Clock3, MessageSquare, ShieldCheck } from 'lucide-react';
import { eventLabels, sceneLabels } from '../../constants/labels';
import type { Rule, SendLog, SmsTask, Stats } from '../../types';
import { LogTable, TaskTable } from '../../components/DataTables';
import { StatusBadge } from '../../components/StatusBadge';

export default function Dashboard({ stats, logs, rules, tasks }: { stats: Stats | null; logs: SendLog[]; rules: Rule[]; tasks: SmsTask[] }) {
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

