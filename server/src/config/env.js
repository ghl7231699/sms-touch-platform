import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

function loadDotEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(name, fallback = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function parseTemplateParam() {
  const raw = process.env.ALIYUN_SMS_TEMPLATE_PARAM || '{"code":"##code##","min":"5"}';
  try {
    return JSON.parse(raw);
  } catch {
    return { code: '##code##', min: '5' };
  }
}

export const config = {
  rootDir,
  port: numberFromEnv('PORT', 3100),
  host: process.env.HOST || '127.0.0.1',
  smsProvider: process.env.SMS_PROVIDER || 'mock',
  shortLinkBaseUrl: process.env.SHORT_LINK_BASE_URL || 'http://127.0.0.1:3100',
  shortLinkDefaultTarget: process.env.SHORT_LINK_DEFAULT_TARGET || 'https://example.com/sms-touch-platform',
  taskWorker: {
    enabled: booleanFromEnv('SMS_TASK_WORKER_ENABLED', false),
    intervalMs: numberFromEnv('SMS_TASK_WORKER_INTERVAL_MS', 30000),
    batchSize: numberFromEnv('SMS_TASK_WORKER_BATCH_SIZE', 20),
    allowRealSend: booleanFromEnv('SMS_TASK_WORKER_ALLOW_REAL_SEND', false)
  },
  integrations: {
    membershipStatusUrl: process.env.MEMBERSHIP_STATUS_URL || '',
    membershipStatusToken: process.env.MEMBERSHIP_STATUS_TOKEN || '',
    timeoutMs: numberFromEnv('INTEGRATION_TIMEOUT_MS', 3000)
  },
  whitelist: (process.env.SMS_TEST_PHONE_WHITELIST || '')
    .split(',')
    .map((phone) => phone.trim())
    .filter(Boolean),
  aliyun: {
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '',
    endpoint: process.env.ALIYUN_DYPNS_ENDPOINT || 'dypnsapi.aliyuncs.com',
    region: process.env.ALIYUN_DYPNS_REGION || 'cn-hangzhou',
    signName: process.env.ALIYUN_SMS_SIGN_NAME || '速通互联验证码',
    templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '100001',
    templateParam: parseTemplateParam(),
    codeType: numberFromEnv('ALIYUN_SMS_CODE_TYPE', 1),
    codeLength: numberFromEnv('ALIYUN_SMS_CODE_LENGTH', 6),
    validTime: numberFromEnv('ALIYUN_SMS_VALID_TIME', 300)
  }
};
