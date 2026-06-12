import { config } from '../../config/env.js';
import { getSmsProviderName } from '../governance/governance.service.js';
import { runDueTasks } from './sms.service.js';

export function createTaskWorker() {
  const state = {
    enabled: false,
    running: false,
    intervalMs: config.taskWorker.intervalMs,
    batchSize: config.taskWorker.batchSize,
    lastRunAt: null,
    lastProcessed: 0,
    lastError: null,
    disabledReason: null
  };

  if (!config.taskWorker.enabled) {
    state.disabledReason = 'Worker 未启用，请在环境变量中配置 SMS_TASK_WORKER_ENABLED=true 后重启服务。';
    return state;
  }

  let inFlight = false;

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    state.running = true;
    state.lastRunAt = new Date().toISOString();
    try {
      const providerName = await getSmsProviderName();
      if (!config.taskWorker.allowRealSend) {
        state.disabledReason = '真实短信发送未放行，请在环境变量中配置 SMS_TASK_WORKER_ALLOW_REAL_SEND=true 后重启服务。';
        state.lastProcessed = 0;
        state.lastError = null;
        return;
      }
      state.disabledReason = null;
      const result = await runDueTasks({ limit: state.batchSize });
      state.lastProcessed = result.body.processed || 0;
      state.lastError = null;
      if (state.lastProcessed > 0) {
        console.log(`[sms-worker] processed ${state.lastProcessed} due task(s).`);
      }
    } catch (error) {
      state.lastError = error.message || 'Worker failed.';
      console.error(`[sms-worker] ${state.lastError}`);
    } finally {
      state.running = false;
      inFlight = false;
    }
  }

  state.enabled = true;
  const timer = setInterval(tick, state.intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  setTimeout(tick, 100).unref?.();
  console.log(`[sms-worker] enabled interval=${state.intervalMs}ms batch=${state.batchSize}`);
  return state;
}
