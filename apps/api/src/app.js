import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config/env.js';
import {
  createRule,
  createTemplate,
  getDashboard,
  getStats,
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
  updateRuleStatus,
  updateTemplateStatus
} from './modules/sms/sms.service.js';
import { createTaskWorker } from './modules/sms/sms.worker.js';

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
      provider: config.smsProvider,
      whitelistCount: config.whitelist.length,
      taskWorker
    });
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

  if (req.method === 'POST' && (url.pathname === '/api/templates' || url.pathname === '/api/sms/templates')) {
    const result = await createTemplate(await readJson(req));
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

  if (req.method === 'POST' && (url.pathname === '/api/rules' || url.pathname === '/api/sms/rules')) {
    const result = await createRule(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  const ruleStatusMatch = url.pathname.match(/^\/api\/(?:sms\/)?rules\/([^/]+)\/status$/);
  if (req.method === 'POST' && ruleStatusMatch) {
    const result = await updateRuleStatus(ruleStatusMatch[1], (await readJson(req)).status);
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/manual-send' || url.pathname === '/api/sms/manual-send')) {
    const result = await manualSend(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/events' || url.pathname === '/api/sms/events')) {
    const result = await receiveEvent(await readJson(req));
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

  if (req.method === 'GET' && (url.pathname === '/api/tasks' || url.pathname === '/api/sms/tasks')) {
    sendJson(res, 200, await listTasks(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  if (req.method === 'POST' && (url.pathname === '/api/tasks/run-due' || url.pathname === '/api/sms/tasks/run-due')) {
    const result = await runDueTasks(await readJson(req));
    sendJson(res, result.statusCode, result.body);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/receipts') {
    sendJson(res, 200, await listReceipts(Object.fromEntries(url.searchParams.entries())));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/click-logs') {
    sendJson(res, 200, await listClickLogs(Object.fromEntries(url.searchParams.entries())));
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

  if (req.method === 'GET' && (url.pathname === '/api/sms/stats/overview' || url.pathname === '/api/sms/stats')) {
    sendJson(res, 200, await getStats());
    return;
  }

  if (req.method === 'GET' && (url.pathname === '/api/stats/overview' || url.pathname === '/api/stats')) {
    sendJson(res, 200, await getStats());
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'API not found' });
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
