import { config } from '../../../config/env.js';
import { SMS_PROVIDERS } from '../sms.types.js';
import { MockSmsProvider } from './mock-sms-provider.js';
import { AliyunDypnsVerifyProvider } from './aliyun-dypns-provider.js';

export function createSmsProvider(providerName = config.smsProvider) {
  if (providerName === SMS_PROVIDERS.MOCK) {
    return new MockSmsProvider();
  }

  if (providerName === SMS_PROVIDERS.ALIYUN_DYPNS) {
    return new AliyunDypnsVerifyProvider(config.aliyun);
  }

  const error = new Error(`Unknown SMS_PROVIDER: ${providerName}`);
  error.code = 'SMS_PROVIDER_INVALID';
  throw error;
}
