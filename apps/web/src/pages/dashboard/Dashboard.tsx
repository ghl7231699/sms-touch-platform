import { useState } from 'react';
import { Activity, BarChart3, CalendarDays, CheckCircle2, Clock3, MessageSquare, MousePointerClick, ShieldCheck, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { eventLabels, sceneLabels } from '../../constants/labels';
import type { Rule, SendLog, SmsTask, Stats } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';

const DAY_MS = 24 * 60 * 60 * 1000;
type FocusMetric = 'send' | 'success' | 'ctr';
type TrendRange = 'day' | 'week' | 'month';

function startOfLocalDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function countLogsInRange(logs: SendLog[], start: Date, end: Date) {
  return logs.filter((log) => {
    const createdAt = new Date(log.createdAt).getTime();
    return createdAt >= start.getTime() && createdAt < end.getTime() && log.status !== 'blocked';
  }).length;
}

function countSuccessInRange(logs: SendLog[], start: Date, end: Date) {
  return logs.filter((log) => {
    const createdAt = new Date(log.createdAt).getTime();
    return createdAt >= start.getTime() && createdAt < end.getTime() && log.status === 'success';
  }).length;
}

function sumClicksInRange(logs: SendLog[], start: Date, end: Date) {
  return logs.reduce((total, log) => {
    const createdAt = new Date(log.createdAt).getTime();
    if (createdAt < start.getTime() || createdAt >= end.getTime()) return total;
    return total + Number(log.clickCount || 0);
  }, 0);
}

function aggregateLogsInRange(logs: SendLog[], start: Date, end: Date) {
  const items = logs.filter((log) => {
    const createdAt = new Date(log.createdAt).getTime();
    return createdAt >= start.getTime() && createdAt < end.getTime();
  });
  const send = items.filter((log) => log.status !== 'blocked').length;
  const success = items.filter((log) => log.status === 'success').length;
  const failed = items.filter((log) => log.status === 'failed').length;
  const blocked = items.filter((log) => log.status === 'blocked').length;
  const clicks = items.reduce((total, log) => total + Number(log.clickCount || 0), 0);
  return {
    send,
    success,
    failed,
    blocked,
    clicks,
    successRate: send > 0 ? (success / send) * 100 : 0,
    ctr: success > 0 ? (clicks / success) * 100 : 0
  };
}

function formatDelta(current: number, previous: number, unit: 'count' | 'rate' = 'count') {
  const delta = current - previous;
  if (!previous && !current) return { text: '持平', tone: 'flat', delta };
  const formatValue = (value: number) => unit === 'rate' ? `${Math.abs(value).toFixed(1)} 个百分点` : String(Math.round(Math.abs(value)));
  if (!previous) return { text: `新增 ${formatValue(current)}`, tone: 'up', delta };
  const percent = (delta / previous) * 100;
  if (delta === 0) return { text: '持平', tone: 'flat', delta };
  if (unit === 'rate') {
    return {
      text: `${delta > 0 ? '+' : '-'}${formatValue(delta)}`,
      tone: delta > 0 ? 'up' : 'down',
      delta
    };
  }
  return {
    text: `${delta > 0 ? '+' : '-'}${formatValue(delta)} / ${delta > 0 ? '+' : ''}${percent.toFixed(1)}%`,
    tone: delta > 0 ? 'up' : 'down',
    delta
  };
}

function formatPointValue(value: number, unit: 'count' | 'rate') {
  return unit === 'rate' ? `${value.toFixed(1)}%` : String(Math.round(value));
}

function formatRate(value: number) {
  return `${Math.max(value, 0).toFixed(1)}%`;
}

function windowStart(days: number, end: Date) {
  return new Date(end.getTime() - days * DAY_MS);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfMonth(date: Date) {
  const value = new Date(date);
  value.setDate(1);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addMonths(date: Date, months: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + months);
  return value;
}

function dateLabel(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function MiniBarChart({ points, tone = 'blue' }: { points: { label: string; value: number }[]; tone?: 'blue' | 'green' | 'amber' }) {
  const maxValue = Math.max(...points.map((item) => item.value), 1);
  return (
    <div className={`miniChartBars ${tone}`} aria-label="近 7 日柱状趋势">
      {points.map((item) => (
        <span key={item.label} title={`${item.label}: ${item.value}`}>
          <i style={{ height: `${Math.max((item.value / maxValue) * 100, item.value ? 14 : 4)}%` }} />
        </span>
      ))}
    </div>
  );
}

function MiniLineChart({ points, tone = 'green', suffix = '%' }: { points: { label: string; value: number }[]; tone?: 'green' | 'amber'; suffix?: string }) {
  const width = 168;
  const height = 56;
  const maxValue = Math.max(...points.map((item) => item.value), 1);
  const minValue = Math.min(...points.map((item) => item.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const coordinates = points.map((item, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((item.value - minValue) / range) * (height - 8) - 4;
    return { ...item, x, y };
  });
  const line = coordinates.map((item) => `${item.x},${item.y}`).join(' ');
  const area = `0,${height} ${coordinates.map((item) => `${item.x},${item.y}`).join(' ')} ${width},${height}`;
  return (
    <svg className={`miniLineChart ${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 7 日折线趋势">
      <polygon className="miniLineArea" points={area} />
      <polyline className="miniLinePath" points={line} />
      {coordinates.map((item) => (
        <circle key={item.label} cx={item.x} cy={item.y} r="2.6">
          <title>{`${item.label}: ${item.value.toFixed(1)}${suffix}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function LargeTrendChart({ points, type, tone = 'blue', unit = 'count' }: { points: { label: string; value: number }[]; type: 'bar' | 'line'; tone?: 'blue' | 'green' | 'amber'; unit?: 'count' | 'rate' }) {
  if (type === 'bar') {
    const maxValue = Math.max(...points.map((item) => item.value), 1);
    return (
      <div className={`dailyTrend ${tone}`}>
        {points.map((item) => (
          <div className="dailyTrendItem" key={item.label}>
            <div className="dailyTrendBar">
              <span style={{ height: `${Math.max((item.value / maxValue) * 100, item.value ? 12 : 4)}%` }} />
            </div>
            <strong>{formatPointValue(item.value, unit)}</strong>
            <small>{item.label}</small>
          </div>
        ))}
      </div>
    );
  }

  const width = 720;
  const height = 180;
  const maxValue = Math.max(...points.map((item) => item.value), 1);
  const minValue = Math.min(...points.map((item) => item.value), 0);
  const range = Math.max(maxValue - minValue, 1);
  const coordinates = points.map((item, index) => {
    const x = 28 + (index / Math.max(points.length - 1, 1)) * (width - 56);
    const y = 22 + (1 - ((item.value - minValue) / range)) * (height - 74);
    return { ...item, x, y };
  });
  const line = coordinates.map((item) => `${item.x},${item.y}`).join(' ');
  const area = `${coordinates[0]?.x || 28},${height - 34} ${coordinates.map((item) => `${item.x},${item.y}`).join(' ')} ${coordinates[coordinates.length - 1]?.x || width - 28},${height - 34}`;

  return (
    <div className={`largeLineChart ${tone}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="近 7 日折线趋势">
        <line className="largeGridLine" x1="28" x2={width - 28} y1={height - 34} y2={height - 34} />
        <polygon className="largeLineArea" points={area} />
        <polyline className="largeLinePath" points={line} />
        {coordinates.map((item) => (
          <g key={item.label}>
            <circle cx={item.x} cy={item.y} r="4">
              <title>{`${item.label}: ${formatPointValue(item.value, unit)}`}</title>
            </circle>
            <text x={item.x} y={item.y - 10}>{formatPointValue(item.value, unit)}</text>
            <text className="largeLineLabel" x={item.x} y={height - 10}>{item.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

type OverviewTrendPoint = {
  label: string;
  period: string;
  send: number;
  success: number;
  clicks: number;
  successRate: number;
  ctr: number;
};

function aggregateOverviewPoint(logs: SendLog[], start: Date, end: Date, label: string, period: string): OverviewTrendPoint {
  const items = logs.filter((log) => {
    const createdAt = new Date(log.createdAt).getTime();
    return createdAt >= start.getTime() && createdAt < end.getTime();
  });
  const send = items.filter((log) => log.status !== 'blocked').length;
  const success = items.filter((log) => log.status === 'success').length;
  const clicks = items.reduce((sum, log) => sum + Number(log.clickCount || 0), 0);
  return {
    label,
    period,
    send,
    success,
    clicks,
    successRate: send > 0 ? (success / send) * 100 : 0,
    ctr: success > 0 ? (clicks / success) * 100 : 0
  };
}

function createOverviewTrend(logs: SendLog[], range: TrendRange, todayStart: Date): OverviewTrendPoint[] {
  if (range === 'day') {
    return Array.from({ length: 14 }).map((_, index) => {
      const start = addDays(todayStart, -(13 - index));
      const end = addDays(start, 1);
      return aggregateOverviewPoint(logs, start, end, dateLabel(start), `${dateLabel(start)} 当日`);
    });
  }

  if (range === 'week') {
    return Array.from({ length: 8 }).map((_, index) => {
      const start = addDays(todayStart, -(7 * (7 - index)));
      const end = addDays(start, 7);
      const lastDay = addDays(end, -1);
      return aggregateOverviewPoint(logs, start, end, `第${index + 1}周`, `${dateLabel(start)}-${dateLabel(lastDay)}`);
    });
  }

  const currentMonthStart = startOfMonth(todayStart);
  return Array.from({ length: 6 }).map((_, index) => {
    const start = addMonths(currentMonthStart, -(5 - index));
    const end = addMonths(start, 1);
    return aggregateOverviewPoint(logs, start, end, `${start.getFullYear()}.${start.getMonth() + 1}`, `${start.getFullYear()}年${start.getMonth() + 1}月`);
  });
}

function OverviewMultiLineChart({ points }: { points: OverviewTrendPoint[] }) {
  const width = 980;
  const height = 300;
  const padding = { top: 28, right: 34, bottom: 48, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...points.flatMap((item) => [item.send, item.success, item.clicks]), 1);
  const yTicks = Array.from({ length: 5 }).map((_, index) => Math.round((maxValue / 4) * index));
  const visibleLabelStep = points.length > 12 ? Math.ceil(points.length / 8) : 1;
  const toXY = (value: number, index: number) => {
    const x = padding.left + (index / Math.max(points.length - 1, 1)) * innerWidth;
    const y = padding.top + (1 - value / maxValue) * innerHeight;
    return { x, y };
  };
  const makeLine = (key: 'send' | 'success' | 'clicks') => points.map((item, index) => {
    const { x, y } = toXY(item[key], index);
    return `${x},${y}`;
  }).join(' ');
  const series = [
    { key: 'send' as const, label: '总发送量', className: 'send' },
    { key: 'success' as const, label: '发送成功量', className: 'success' },
    { key: 'clicks' as const, label: '短链点击量', className: 'clicks' }
  ];

  return (
    <div className="overviewTrendChart" aria-label="总发送量、发送成功量、短链点击量趋势">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {yTicks.map((tick) => {
          const y = padding.top + (1 - tick / maxValue) * innerHeight;
          return (
            <g key={tick}>
              <line className="overviewTrendGrid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="overviewTrendAxis" x={padding.left - 12} y={y + 4}>{tick}</text>
            </g>
          );
        })}
        {series.map((item) => (
          <polyline key={item.key} className={`overviewTrendLine ${item.className}`} points={makeLine(item.key)} />
        ))}
        {points.map((point, index) => (
          <g className="overviewTrendHover" key={point.period}>
            <rect
              className="overviewTrendHitArea"
              x={toXY(0, index).x - innerWidth / Math.max(points.length - 1, 1) / 2}
              y={padding.top}
              width={Math.max(innerWidth / Math.max(points.length - 1, 1), 42)}
              height={innerHeight}
            />
            <line className="overviewTrendGuide" x1={toXY(0, index).x} x2={toXY(0, index).x} y1={padding.top} y2={padding.top + innerHeight} />
            {series.map((item) => {
              const { x, y } = toXY(point[item.key], index);
              return (
                <circle key={item.key} className={`overviewTrendPoint ${item.className}`} cx={x} cy={y} r="3.4">
                  <title>{`${point.period} · ${item.label}: ${point[item.key]}`}</title>
                </circle>
              );
            })}
            <g className="overviewTrendTooltip" transform={`translate(${Math.min(Math.max(toXY(0, index).x - 88, padding.left + 4), width - padding.right - 176)}, ${padding.top + 8})`}>
              <rect width="176" height="116" rx="8" />
              <text className="tooltipTitle" x="12" y="20">{point.period}</text>
              <text x="12" y="44">总发送：{point.send}</text>
              <text x="12" y="62">成功发送：{point.success}</text>
              <text x="12" y="80">短链点击：{point.clicks}</text>
              <text x="12" y="98">成功率 {formatRate(point.successRate)} · CTR {formatRate(point.ctr)}</text>
            </g>
            {index % visibleLabelStep === 0 && (
              <text className="overviewTrendLabel" x={toXY(0, index).x} y={height - 16}>{point.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function Dashboard({ stats, logs, rules, tasks }: { stats: Stats | null; logs: SendLog[]; rules: Rule[]; tasks: SmsTask[] }) {
  const [focusMetric, setFocusMetric] = useState<FocusMetric>('send');
  const [trendRange, setTrendRange] = useState<TrendRange>('week');
  const todayStart = startOfLocalDay();
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const weekStart = windowStart(7, tomorrowStart);
  const previousWeekStart = windowStart(14, tomorrowStart);
  const monthStart = windowStart(30, tomorrowStart);
  const previousMonthStart = windowStart(60, tomorrowStart);

  const sendCount = stats?.sendCount ?? 0;
  const successRate = sendCount > 0 ? `${(((stats?.successCount ?? 0) / sendCount) * 100).toFixed(1)}%` : '0.0%';
  const failedRate = sendCount > 0 ? ((stats?.failedCount ?? 0) / sendCount) * 100 : 0;
  const blockedRate = sendCount + (stats?.blockedCount ?? 0) > 0 ? ((stats?.blockedCount ?? 0) / (sendCount + (stats?.blockedCount ?? 0))) * 100 : 0;
  const scenarioEntries = Object.entries(stats?.scenes || {});
  const maxSceneCount = Math.max(...scenarioEntries.map(([, count]) => count), 1);
  const issueTasks = tasks.filter((task) => ['failed', 'blocked'].includes(task.status)).length;
  const dueTasks = tasks.filter((task) => ['pending', 'failed'].includes(task.status) && new Date(task.scheduledAt).getTime() <= Date.now()).length;
  const todaySendCount = countLogsInRange(logs, todayStart, tomorrowStart);
  const yesterdaySendCount = countLogsInRange(logs, yesterdayStart, todayStart);
  const todayAgg = aggregateLogsInRange(logs, todayStart, tomorrowStart);
  const yesterdayAgg = aggregateLogsInRange(logs, yesterdayStart, todayStart);
  const weekAgg = aggregateLogsInRange(logs, weekStart, tomorrowStart);
  const previousWeekAgg = aggregateLogsInRange(logs, previousWeekStart, weekStart);
  const monthAgg = aggregateLogsInRange(logs, monthStart, tomorrowStart);
  const previousMonthAgg = aggregateLogsInRange(logs, previousMonthStart, monthStart);
  const weekSendCount = weekAgg.send;
  const monthSendCount = monthAgg.send;
  const todayDelta = formatDelta(todayAgg.send, yesterdayAgg.send);
  const weekDelta = formatDelta(weekAgg.send, previousWeekAgg.send);
  const monthDelta = formatDelta(monthAgg.send, previousMonthAgg.send);
  const todaySuccessDelta = formatDelta(todayAgg.successRate, yesterdayAgg.successRate, 'rate');
  const weekSuccessDelta = formatDelta(weekAgg.successRate, previousWeekAgg.successRate, 'rate');
  const monthSuccessDelta = formatDelta(monthAgg.successRate, previousMonthAgg.successRate, 'rate');
  const todayCtrDelta = formatDelta(todayAgg.ctr, yesterdayAgg.ctr, 'rate');
  const weekCtrDelta = formatDelta(weekAgg.ctr, previousWeekAgg.ctr, 'rate');
  const monthCtrDelta = formatDelta(monthAgg.ctr, previousMonthAgg.ctr, 'rate');
  const todaySuccessCount = countSuccessInRange(logs, todayStart, tomorrowStart);
  const todaySuccessRate = todaySendCount > 0 ? (todaySuccessCount / todaySendCount) * 100 : 0;
  const activeRuleRate = (stats?.ruleCount ?? 0) > 0 ? ((stats?.enabledRuleCount ?? 0) / (stats?.ruleCount ?? 0)) * 100 : 0;
  const dailyTrend = Array.from({ length: 7 }).map((_, index) => {
    const start = new Date(todayStart.getTime() - (6 - index) * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);
    const send = countLogsInRange(logs, start, end);
    const success = countSuccessInRange(logs, start, end);
    const clicks = sumClicksInRange(logs, start, end);
    return {
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      count: send,
      successRate: send > 0 ? (success / send) * 100 : 0,
      ctr: success > 0 ? (clicks / success) * 100 : 0
    };
  });
  const maxDailyCount = Math.max(...dailyTrend.map((item) => item.count), 1);
  const sendChartPoints = dailyTrend.map((item) => ({ label: item.label, value: item.count }));
  const successChartPoints = dailyTrend.map((item) => ({ label: item.label, value: item.successRate }));
  const ctrChartPoints = dailyTrend.map((item) => ({ label: item.label, value: item.ctr }));
  const todayCtr = ctrChartPoints[ctrChartPoints.length - 1]?.value || 0;
  const focusConfig = {
    send: {
      title: '发送量变化笔记',
      subtitle: '按自然日、近 7 日、近 30 日观察运营节奏',
      icon: <Activity size={18} />,
      chartType: 'bar' as const,
      chartTone: 'blue' as const,
      chartUnit: 'count' as const,
      points: sendChartPoints,
      cards: [
        { label: '今日发送', value: String(todayAgg.send), helper: '较昨日', delta: todayDelta },
        { label: '近 7 日发送', value: String(weekAgg.send), helper: '较前 7 日', delta: weekDelta },
        { label: '近 30 日发送', value: String(monthAgg.send), helper: '较前 30 日', delta: monthDelta },
        { label: '今日成功率', value: formatRate(todaySuccessRate), helper: `今日成功 ${todaySuccessCount} 条，失败和拦截需进入发送记录排查`, accent: true }
      ]
    },
    success: {
      title: '成功率变化笔记',
      subtitle: '比例指标用折线观察稳定性，同时结合失败量判断质量',
      icon: <CheckCircle2 size={18} />,
      chartType: 'line' as const,
      chartTone: 'green' as const,
      chartUnit: 'rate' as const,
      points: successChartPoints,
      cards: [
        { label: '今日成功率', value: formatRate(todayAgg.successRate), helper: '较昨日', delta: todaySuccessDelta },
        { label: '近 7 日成功率', value: formatRate(weekAgg.successRate), helper: '较前 7 日', delta: weekSuccessDelta },
        { label: '近 30 日成功率', value: formatRate(monthAgg.successRate), helper: '较前 30 日', delta: monthSuccessDelta },
        { label: '失败与拦截', value: `${todayAgg.failed + todayAgg.blocked}`, helper: `今日失败 ${todayAgg.failed} 条，拦截 ${todayAgg.blocked} 条`, accent: true }
      ]
    },
    ctr: {
      title: 'CTR 变化笔记',
      subtitle: '点击率关注内容吸引力，需结合成功送达和点击次数一起看',
      icon: <MousePointerClick size={18} />,
      chartType: 'line' as const,
      chartTone: 'amber' as const,
      chartUnit: 'rate' as const,
      points: ctrChartPoints,
      cards: [
        { label: '今日 CTR', value: formatRate(todayAgg.ctr), helper: '较昨日', delta: todayCtrDelta },
        { label: '近 7 日 CTR', value: formatRate(weekAgg.ctr), helper: '较前 7 日', delta: weekCtrDelta },
        { label: '近 30 日 CTR', value: formatRate(monthAgg.ctr), helper: '较前 30 日', delta: monthCtrDelta },
        { label: '今日点击', value: String(todayAgg.clicks), helper: `基于今日成功 ${todayAgg.success} 条计算`, accent: true }
      ]
    }
  }[focusMetric];
  const leadingScene = scenarioEntries.sort((a, b) => b[1] - a[1])[0];
  const insightItems = [
    weekDelta.delta > 0
      ? `近 7 日发送量较上一周期增加 ${weekDelta.delta} 条，触达节奏正在放大。`
      : weekDelta.delta < 0
        ? `近 7 日发送量较上一周期减少 ${Math.abs(weekDelta.delta)} 条，可检查规则启用和事件上报。`
        : '近 7 日发送量与上一周期持平，适合观察场景结构变化。',
    failedRate > 10
      ? `失败率 ${formatRate(failedRate)} 偏高，建议优先查看 Provider 返回和失败任务。`
      : `成功率 ${successRate}，发送质量处于可观察状态。`,
    blockedRate > 15
      ? `安全拦截占比 ${formatRate(blockedRate)}，需要确认白名单、黑名单、退订或频控策略是否符合预期。`
      : `安全拦截 ${stats?.blockedCount ?? 0} 条，当前没有明显误发风险信号。`
  ];
  const statusCards = [
    { label: '启用规则', value: stats?.enabledRuleCount ?? 0, icon: <Zap size={18} />, tone: 'blue' },
    { label: '待执行任务', value: stats?.pendingTaskCount ?? 0, icon: <Clock3 size={18} />, tone: 'amber' },
    { label: '异常任务', value: issueTasks, icon: <ShieldCheck size={18} />, tone: 'red' },
    { label: '安全拦截', value: stats?.blockedCount ?? 0, icon: <ShieldCheck size={18} />, tone: 'green' }
  ];
  const overviewTrendPoints = createOverviewTrend(logs, trendRange, todayStart);
  const trendRangeOptions = [
    { value: 'day' as const, label: '按日' },
    { value: 'week' as const, label: '按周' },
    { value: 'month' as const, label: '按月' }
  ];

  return (
    <section className="stack overviewPage">
      <section className="overviewCommandCenter">
        <div>
          <span className="eyebrow">Growth overview</span>
          <h1>增长总览</h1>
          <p>聚焦发送量变化、规则运行和场景表现，快速判断今天、近 7 日、近 30 日触达节奏是否健康。</p>
        </div>
        <div className="dateNote">
          <CalendarDays size={18} />
          <div>
            <strong>{todayStart.getFullYear()}年{todayStart.getMonth() + 1}月{todayStart.getDate()}日</strong>
            <span>以发送记录创建时间统计日、周、月变化</span>
          </div>
        </div>
      </section>

      <section className="overviewTrendPanel panel">
        <div className="panelTitle">
          <div>
            <h2>核心数据趋势</h2>
            <span>对比总发送量、发送成功量和短链点击量，快速判断触达规模和内容吸引力。</span>
          </div>
          <div className="trendRangeTabs">
            {trendRangeOptions.map((item) => (
              <button className={trendRange === item.value ? 'active' : ''} type="button" key={item.value} onClick={() => setTrendRange(item.value)}>{item.label}</button>
            ))}
          </div>
        </div>
        <div className="overviewTrendLegend">
          <span className="send">总发送量</span>
          <span className="success">发送成功量</span>
          <span className="clicks">短链点击量</span>
        </div>
        <OverviewMultiLineChart points={overviewTrendPoints} />
      </section>

      <section className="heroKpiSection">
        <button className={`heroMetric primary clickable ${focusMetric === 'send' ? 'active' : ''}`} type="button" onClick={() => setFocusMetric('send')}>
          <div className="heroMetricTop">
            <div className="metricIcon"><MessageSquare size={22} /></div>
            <span className={`deltaPill ${weekDelta.tone}`}>{weekDelta.delta >= 0 ? '近 7 日增长' : '近 7 日下降'} {Math.abs(weekDelta.delta)}</span>
          </div>
          <div className="heroMetricBody">
            <span>发送量</span>
            <strong>{sendCount}</strong>
            <p>覆盖 {stats?.eventCount ?? 0} 个业务事件 · 今日 {todaySendCount} 条</p>
          </div>
          <MiniBarChart points={sendChartPoints} />
        </button>
        <button className={`heroMetric clickable ${focusMetric === 'success' ? 'active' : ''}`} type="button" onClick={() => setFocusMetric('success')}>
          <div className="heroMetricTop">
            <div className="metricIcon success"><CheckCircle2 size={22} /></div>
            <span className="deltaPill flat">今日 {formatRate(todaySuccessRate)}</span>
          </div>
          <div className="heroMetricBody">
            <span>成功率</span>
            <strong>{successRate}</strong>
            <p>{stats?.successCount ?? 0} 次成功提交 · 近 7 日趋势</p>
          </div>
          <MiniLineChart points={successChartPoints} tone="green" />
        </button>
        <button className={`heroMetric clickable ${focusMetric === 'ctr' ? 'active' : ''}`} type="button" onClick={() => setFocusMetric('ctr')}>
          <div className="heroMetricTop">
            <div className="metricIcon trend"><TrendingUp size={22} /></div>
            <span className="deltaPill flat">今日 {formatRate(todayCtr)}</span>
          </div>
          <div className="heroMetricBody">
            <span>CTR</span>
            <strong>{stats?.ctr ?? '0.0%'}</strong>
            <p>{stats?.clickCount ?? 0} 次短链点击 · 跟随发送趋势观察</p>
          </div>
          <MiniLineChart points={ctrChartPoints} tone="amber" />
        </button>
      </section>

      <section className="sendPulsePanel panel">
        <div className="panelTitle">
          <div>
            <h2>{focusConfig.title}</h2>
            <span>{focusConfig.subtitle}</span>
          </div>
          {focusConfig.icon}
        </div>
        <div className="pulseGrid">
          {focusConfig.cards.map((item) => (
            <article className={`pulseCard ${item.accent ? 'accent' : ''}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              {'delta' in item && item.delta ? (
                <p className={`deltaText ${item.delta.tone}`}>
                  {item.delta.delta > 0 ? <TrendingUp size={14} /> : item.delta.delta < 0 ? <TrendingDown size={14} /> : <Activity size={14} />}
                  {item.helper} {item.delta.text}
                </p>
              ) : <p>{item.helper}</p>}
            </article>
          ))}
        </div>
        <LargeTrendChart points={focusConfig.points} type={focusConfig.chartType} tone={focusConfig.chartTone} unit={focusConfig.chartUnit} />
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

      <section className="overviewInsightGrid">
        <article className="panel healthPanel">
          <div className="panelTitle">
            <div>
              <h2>运营健康度</h2>
              <span>规则启用、任务积压和异常状态的综合观察</span>
            </div>
          </div>
          <div className="healthMetrics">
            <div>
              <strong>{formatRate(activeRuleRate)}</strong>
              <span>规则启用率</span>
            </div>
            <div>
              <strong>{dueTasks}</strong>
              <span>已到期待处理</span>
            </div>
            <div>
              <strong>{formatRate(blockedRate)}</strong>
              <span>安全拦截占比</span>
            </div>
          </div>
        </article>
        <article className="panel insightPanel">
          <div className="panelTitle">
            <div>
              <h2>运营洞察</h2>
              <span>基于当前总览数据自动生成</span>
            </div>
          </div>
          <ul>
            {insightItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </section>

      <div className="marketingGrid">
        <section className="panel scenarioPanel">
          <div className="panelTitle">
            <div>
              <h2>场景表现</h2>
              <span>{leadingScene ? `${sceneLabels[leadingScene[0]] || leadingScene[0]} 当前贡献最高` : '按触达场景观察发送分布'}</span>
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
