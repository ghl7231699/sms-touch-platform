import { Activity, BarChart3, CheckCircle2, Clock3, MessageSquare, ShieldCheck, TrendingUp, Zap } from 'lucide-react';
import { eventLabels, sceneLabels } from '../../constants/labels';
import type { Rule, SendLog, SmsTask, Stats } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

export default function Dashboard({ stats, logs, rules, tasks }: { stats: Stats | null; logs: SendLog[]; rules: Rule[]; tasks: SmsTask[] }) {
  const sendCount = stats?.sendCount ?? 0;
  const successRate = sendCount > 0 ? `${(((stats?.successCount ?? 0) / sendCount) * 100).toFixed(1)}%` : '0.0%';
  const scenarioEntries = Object.entries(stats?.scenes || {});
  const maxSceneCount = Math.max(...scenarioEntries.map(([, count]) => count), 1);
  const issueTasks = tasks.filter((task) => ['failed', 'blocked'].includes(task.status)).length;
  const statusCards = [
    { label: '启用规则', value: stats?.enabledRuleCount ?? 0, icon: <Zap size={18} />, tone: 'blue' },
    { label: '待执行任务', value: stats?.pendingTaskCount ?? 0, icon: <Clock3 size={18} />, tone: 'amber' },
    { label: '异常任务', value: issueTasks, icon: <ShieldCheck size={18} />, tone: 'red' },
    { label: '安全拦截', value: stats?.blockedCount ?? 0, icon: <ShieldCheck size={18} />, tone: 'green' }
  ];

  return (
    <section className="stack overviewPage">
      <section className="heroKpiSection">
        <article className="heroMetric primary">
          <div className="metricIcon"><MessageSquare size={22} /></div>
          <span>发送量</span>
          <strong>{sendCount}</strong>
          <p>覆盖 {stats?.eventCount ?? 0} 个业务事件</p>
        </article>
        <article className="heroMetric">
          <div className="metricIcon success"><CheckCircle2 size={22} /></div>
          <span>成功率</span>
          <strong>{successRate}</strong>
          <p>{stats?.successCount ?? 0} 次成功提交</p>
        </article>
        <article className="heroMetric">
          <div className="metricIcon trend"><TrendingUp size={22} /></div>
          <span>CTR</span>
          <strong>{stats?.ctr ?? '0.0%'}</strong>
          <p>{stats?.clickCount ?? 0} 次短链点击</p>
        </article>
      </section>

      <section className="secondaryMetricGrid">
        {statusCards.map((card) => (
          <article className={`secondaryMetric ${card.tone}`} key={card.label}>
            <div>{card.icon}</div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <div className="marketingGrid">
        <section className="panel scenarioPanel">
          <div className="panelTitle">
            <div>
              <h2>场景表现</h2>
              <span>按触达场景观察发送分布</span>
            </div>
            <BarChart3 size={18} />
          </div>
          <div className="scenarioCards">
            {(scenarioEntries.length ? scenarioEntries : Object.keys(sceneLabels).map((scene) => [scene, 0] as [string, number])).map(([scene, count]) => (
              <article className="scenarioCard" key={scene}>
                <div>
                  <strong>{sceneLabels[scene] || scene}</strong>
                  <span>{count} 次发送</span>
                </div>
                <div className="miniBarTrack">
                  <div style={{ width: `${Math.max((count / maxSceneCount) * 100, count ? 8 : 2)}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel automationPanel">
          <div className="panelTitle">
            <div>
              <h2>自动化状态</h2>
              <span>{stats?.enabledRuleCount ?? 0}/{stats?.ruleCount ?? 0} 条规则启用</span>
            </div>
          </div>
          <div className="automationList">
            {rules.slice(0, 4).map((rule) => (
              <article className="automationItem" key={rule.id}>
                <div>
                  <strong>{rule.name}</strong>
                  <span>{eventLabels[rule.eventType]} · 延迟 {rule.delayValue}{rule.delayUnit}</span>
                </div>
                <StatusBadge status={rule.status} />
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="panel activityPanel">
        <div className="panelTitle">
          <h2>最近发送</h2>
          <span>精简动态流</span>
        </div>
        <div className="activityFeed">
          {logs.slice(0, 7).map((log) => (
            <article className="activityItem" key={log.id}>
              <div className="activityDot" />
              <div>
                <strong>{log.templateName || log.templateCode}</strong>
                <span>{log.phoneMasked} · {sceneLabels[log.scene] || log.scene} · {new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <StatusBadge status={log.status} />
            </article>
          ))}
          {!logs.length && <p>暂无发送动态</p>}
        </div>
      </section>
    </section>
  );
}
