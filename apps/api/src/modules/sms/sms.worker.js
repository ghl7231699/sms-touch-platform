import { config } from '../../config/env.js';
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
    state.disabledReason = 'SMS_TASK_WORKER_ENABLED is false.';
    return state;
  }

  if (config.smsProvider !== 'mock' && !config.taskWorker.allowRealSend) {
    state.disabledReason = 'Real provider worker requires SMS_TASK_WORKER_ALLOW_REAL_SEND=true.';
    console.warn(`[sms-worker] disabled: ${state.disabledReason}`);
    return state;
  }

  let inFlight = false;

  async function tick() {
    if (inFlight) return;
    inFlight = true;
    state.running = true;
    state.lastRunAt = new Date().toISOString();
    try {
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
