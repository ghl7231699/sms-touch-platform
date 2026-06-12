import { config } from '../../../config/env.js';
import { SMS_PROVIDERS } from '../sms.types.js';
import { AliyunDypnsVerifyProvider } from './aliyun-dypns-provider.js';

export function createSmsProvider(providerName = config.smsProvider, overrideConfig = {}) {
  if (providerName === SMS_PROVIDERS.ALIYUN_DYPNS) {
    return new AliyunDypnsVerifyProvider({ ...config.aliyun, ...overrideConfig });
  }

  const error = new Error(`Unknown SMS_PROVIDER: ${providerName}`);
  error.code = 'SMS_PROVIDER_INVALID';
  throw error;
}
