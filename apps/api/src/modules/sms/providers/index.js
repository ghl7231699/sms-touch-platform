import { config } from '../../../config/env.js';
import { SMS_PROVIDERS } from '../sms.types.js';
import { MockSmsProvider } from './mock-sms-provider.js';
import { AliyunDypnsVerifyProvider } from './aliyun-dypns-provider.js';

export function createSmsProvider() {
  if (config.smsProvider === SMS_PROVIDERS.MOCK) {
    return new MockSmsProvider();
  }

  if (config.smsProvider === SMS_PROVIDERS.ALIYUN_DYPNS) {
    return new AliyunDypnsVerifyProvider(config.aliyun);
  }

  const error = new Error(`Unknown SMS_PROVIDER: ${config.smsProvider}`);
  error.code = 'SMS_PROVIDER_INVALID';
  throw error;
}
