import { config } from '../../config/env.js';
import { getSettingsObject } from '../governance/governance.service.js';
import { runDueTasks } from './sms.service.js';

export function createTaskWorker() {
  const state = {
    enabled: false,
    running: false,
    intervalMs: config.taskWorker.intervalMs,
    batchSize: config.taskWorker.batchSize,
    allowRealSend: config.taskWorker.allowRealSend,
    lastRunAt: null,
    lastProcessed: 0,
    lastError: null,
    disabledReason: null
  };

  let inFlight = false;

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    state.running = true;
    state.lastRunAt = new Date().toISOString();
    try {
      const settings = await getSettingsObject();
      const workerSettings = settings['sms.worker'] || {};
      const enabled = workerSettings.enabled ?? config.taskWorker.enabled;
      const allowRealSend = workerSettings.allowRealSend ?? config.taskWorker.allowRealSend;
      state.enabled = Boolean(enabled);
      state.batchSize = Math.min(Math.max(Number(workerSettings.batchSize) || config.taskWorker.batchSize || 20, 1), 200);
      state.intervalMs = Math.max(Number(workerSettings.intervalMs) || config.taskWorker.intervalMs || 30000, 5000);
      state.allowRealSend = Boolean(allowRealSend);

      if (!state.enabled) {
        state.disabledReason = 'Worker 未启用，请在发送控制中启用 worker。';
        state.lastProcessed = 0;
        state.lastError = null;
        return;
      }

      if (!state.allowRealSend) {
        state.disabledReason = '真实短信发送未放行，请在发送控制中启用真实发送。';
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

  function schedule(delay = state.intervalMs) {
    const timer = setTimeout(async () => {
      await tick();
      schedule();
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
  }

  schedule(100);
  console.log(`[sms-worker] runtime attached interval=${state.intervalMs}ms batch=${state.batchSize}`);
  return state;
}
