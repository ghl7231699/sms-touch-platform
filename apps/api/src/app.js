import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import {
  createRule,
  createTemplate,
  cancelTask,
  copyRule,
  deleteRule,
  estimateRuleImpact,
  getDashboard,
  getClickLog,
  getEvent,
  getLog,
  getReceipt,
  getRule,
  getStats,
  getTask,
  getTemplate,
  listClickLogs,
  listEvents,
  listLogs,
  listReceipts,
  listRules,
  listTasks,
  listTemplates,
  manualSend,
  receiveProviderCallback,
  receiveEvent,
  recordShortLinkClick,
  runDueTasks,
  sendTestCode,
  retryTask,
  testRule,
  updateRule,
  updateRuleStatus,
  updateTemplate,
  updateTemplateStatus
} from './modules/sms/sms.service.js';
import { createTaskWorker } from './modules/sms/sms.worker.js';
import {
  getSmsProviderName,
  handleGovernanceApi,
  recordEventSourceLog,
  verifyEventSourceRequest
} from './modules/governance/governance.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, '../../web');
const builtWebDir = path.join(webRoot, 'dist');
const taskWorker = createTaskWorker();

async function resolveWebDir() {
  try {
    await fs.access(path.join(builtWebDir, 'index.html'));
    return builtWebDir;
  } catch {
    return webRoot;
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body, null, 2));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function serveStatic(req, res, pathname) {
  const webDir = await resolveWebDir();
  const target = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(webDir, target);
  if (!filePath.startsWith(webDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8'
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
}

async function handleApi(req, res, url) {
  const shortLinkMatch = url.pathname.match(/^\/s\/([^/]+)$/);
  if (req.method === 'GET' && shortLinkMatch) {
    const result = await recordShortLinkClick(shortLinkMatch[1], {
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] || ''
    });
    if (result.statusCode >= 400) {
      sendJson(res, result.statusCode, result.body);
      return;
    }
    res.writeHead(302, { Location: result.body.targetUrl });
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      provider: await getSmsProviderName(),
      whitelistCount: config.whitelist.length,
      taskWorker
    });
    return;
  }

  const governanceResult = await handleGovernanceApi(req, url, readJson, { taskWorker, runDueTasks });
  if (governanceResult.handled) {
    if (governanceResult.file) {
      res.writeHead(governanceResult.statusCode, {
        'Content-Type': governanceResult.file.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(governanceResult.file.fileName)}"`,
        'Cache-Control': 'no-store'
      });
      res.end(governanceResult.file.buffer);
      return;
    }
    sendJson(res, governanceResult.statusCode, governanceResult.body);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/sms/send-test-code') {
    try {
      const body = await readJson(req);
      const result = await sendTestCode(body);
      sendJson(res, result.statusCode, result.body);
    } catch (error) {
      sendJson(res, 400, { success: false, code: 'BAD_REQUEST', message: error.message });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    sendJson(res, 200, await getDashboard());
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/templates' || url.pathname === '/api/sms/templates')) {
    sendJson(res, 200, await listTemplates());
    return;
  }

  const templateDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?templates\/([^/]+)$/);
  if (req.method === 'GET' && templateDetailMatch) {
    const result = await getTemplate(decodeURIComponent(templateDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/templates' || url.pathname === '/api/sms/templates')) {
    const result = await createTemplate(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const templateUpdateMatch = url.pathname.match(/^\/api\/(?:sms\/)?templates\/([^/]+)\/update$/);
  if (req.method === 'POST' && templateUpdateMatch) {
    const result = await updateTemplate(templateUpdateMatch[1], await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const templateStatusMatch = url.pathname.match(/^\/api\/(?:sms\/)?templates\/([^/]+)\/status$/);
  if (req.method === 'POST' && templateStatusMatch) {
    const result = await updateTemplateStatus(templateStatusMatch[1], (await readJson(req)).status);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/rules' || url.pathname === '/api/sms/rules')) {
    sendJson(res, 200, await listRules());
    return;
  }

  const ruleDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)$/);
  if (req.method === 'GET' && ruleDetailMatch) {
    const result = await getRule(decodeURIComponent(ruleDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/rules' || url.pathname === '/api/sms/rules')) {
    const result = await createRule(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleUpdateMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/update$/);
  if (req.method === 'POST' && ruleUpdateMatch) {
    const result = await updateRule(ruleUpdateMatch[1], await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleCopyMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/copy$/);
  if (req.method === 'POST' && ruleCopyMatch) {
    const result = await copyRule(ruleCopyMatch[1]);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleDeleteMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/delete$/);
  if (req.method === 'POST' && ruleDeleteMatch) {
    const result = await deleteRule(ruleDeleteMatch[1]);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleTestMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/test$/);
  if (req.method === 'POST' && ruleTestMatch) {
    const result = await testRule(ruleTestMatch[1], await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleEstimateMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/estimate$/);
  if (req.method === 'GET' && ruleEstimateMatch) {
    const result = await estimateRuleImpact(ruleEstimateMatch[1]);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleStatusMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/status$/);
  if (req.method === 'POST' && ruleStatusMatch) {
    const result = await updateRuleStatus(ruleStatusMatch[1], (await readJson(req)).status);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/manual-send/logs' || url.pathname === '/api/sms/manual-send/logs')) {
    const result = await listLogs({
      ...Object.fromEntries(url.searchParams.entries()),
      triggerType: 'manual'
    });
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/manual-send' || url.pathname === '/api/sms/manual-send')) {
    const result = await manualSend(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/events' || url.pathname === '/api/sms/events')) {
    const body = await readJson(req);
    const sourceAuth = await verifyEventSourceRequest(req, body);
    if (!sourceAuth.passed) {
      sendJson(res, sourceAuth.error.statusCode, sourceAuth.error.body);
      return;
    }
    const result = await receiveEvent(body);
    await recordEventSourceLog({
      source: sourceAuth.source,
      input: body,
      req,
      status: result.statusCode >= 400 ? 'failed' : 'success',
      code: result.body.code || 'EVENT_ACCEPTED',
      message: result.body.message || '事件已接收。'
    });
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (
    req.method === 'POST' &&
    (
      url.pathname === '/api/sms/provider/callback' ||
      url.pathname === '/api/provider/callback' ||
      url.pathname.startsWith('/api/provider-callback/')
    )
  ) {
    const result = await receiveProviderCallback(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/events' || url.pathname === '/api/sms/events')) {
    sendJson(res, 200, await listEvents(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  const eventDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?events\/([^/]+)$/);
  if (req.method === 'GET' && eventDetailMatch) {
    const result = await getEvent(decodeURIComponent(eventDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/tasks' || url.pathname === '/api/sms/tasks')) {
    sendJson(res, 200, await listTasks(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  const taskDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?tasks\/([^/]+)$/);
  if (req.method === 'GET' && taskDetailMatch) {
    const result = await getTask(decodeURIComponent(taskDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/tasks/run-due' || url.pathname === '/api/sms/tasks/run-due')) {
    const result = await runDueTasks(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const taskCancelMatch = url.pathname.match(/^\/api\/(?:sms\/)?tasks\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && taskCancelMatch) {
    const result = await cancelTask(taskCancelMatch[1]);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const taskRetryMatch = url.pathname.match(/^\/api\/(?:sms\/)?tasks\/([^/]+)\/retry$/);
  if (req.method === 'POST' && taskRetryMatch) {
    const result = await retryTask(taskRetryMatch[1]);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/receipts' || url.pathname === '/api/sms/receipts')) {
    sendJson(res, 200, await listReceipts(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  const receiptDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?receipts\/([^/]+)$/);
  if (req.method === 'GET' && receiptDetailMatch) {
    const result = await getReceipt(decodeURIComponent(receiptDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/click-logs' || url.pathname === '/api/sms/click-logs')) {
    sendJson(res, 200, await listClickLogs(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  const clickLogDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?click-logs\/([^/]+)$/);
  if (req.method === 'GET' && clickLogDetailMatch) {
    const result = await getClickLog(decodeURIComponent(clickLogDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/sms/send-logs') {
    const result = await listLogs(Object.fromEntries(url.searchParams.entries()));
    sendJson(res, 200, result);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/send-logs') {
    const result = await listLogs(Object.fromEntries(url.searchParams.entries()));
    sendJson(res, 200, result);
    return;
  }

  const sendLogDetailMatch = url.pathname.match(/^\/api\/(?:sms\/)?send-logs\/([^/]+)$/);
  if (req.method === 'GET' && sendLogDetailMatch) {
    const result = await getLog(decodeURIComponent(sendLogDetailMatch[1]));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/sms/stats/overview' || url.pathname === '/api/sms/stats')) {
    sendJson(res, 200, await getStats());
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/stats/overview' || url.pathname === '/api/stats')) {
    sendJson(res, 200, await getStats());
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(res, 404, { success: false, code: 'API_NOT_FOUND', message: 'API not found.' });
    return;
  }

  await serveStatic(req, res, url.pathname);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  handleApi(req, res, url).catch((error) => {
    sendJson(res, 500, { error: 'Internal server error', message: error.message });
  });
});

server.listen(config.port, config.host, () => {
  console.log(`SMS touch platform running at http://${config.host}:${config.port}`);
  console.log(`SMS_PROVIDER=${config.smsProvider}`);
});
