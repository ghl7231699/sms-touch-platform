export class AliyunDypnsVerifyProvider {
  name = 'aliyun_dypns';

  constructor(config) {
    this.config = config;
  }

  assertConfig() {
    const required = [
      ['ALIBABA_CLOUD_ACCESS_KEY_ID', this.config.accessKeyId],
      ['ALIBABA_CLOUD_ACCESS_KEY_SECRET', this.config.accessKeySecret],
      ['ALIYUN_SMS_SIGN_NAME', this.config.signName],
      ['ALIYUN_SMS_TEMPLATE_CODE', this.config.templateCode]
    ];
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length > 0) {
      const error = new Error(`Missing Aliyun config: ${missing.join(', ')}`);
      error.code = 'ALIYUN_CONFIG_MISSING';
      throw error;
    }
  }

  async createClient() {
    const Dypnsapi = await import('@alicloud/dypnsapi20170525');
    const OpenApi = await import('@alicloud/openapi-client');

    const Client = Dypnsapi.default;
    const Config = OpenApi.Config || OpenApi.default?.Config;
    if (!Client || !Config) {
      throw new Error('Aliyun SDK exports are unavailable.');
    }

    const sdkConfig = new Config({
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret
    });
    sdkConfig.endpoint = this.config.endpoint;
    sdkConfig.regionId = this.config.region;

    return new Client(sdkConfig);
  }

  async sendVerifyCode(input) {
    this.assertConfig();

    const Dypnsapi = await import('@alicloud/dypnsapi20170525');
    const Util = await import('@alicloud/tea-util');
    const client = await this.createClient();

    const Request = Dypnsapi.SendSmsVerifyCodeRequest || Dypnsapi.default?.SendSmsVerifyCodeRequest;
    const RuntimeOptions = Util.RuntimeOptions || Util.default?.RuntimeOptions;
    if (!Request || !RuntimeOptions) {
      throw new Error('Aliyun SendSmsVerifyCode SDK types are unavailable.');
    }

    const request = new Request({
      phoneNumber: input.phone,
      signName: this.config.signName,
      templateCode: input.templateCode || this.config.templateCode,
      templateParam: JSON.stringify(input.templateParam || this.config.templateParam),
      codeType: this.config.codeType,
      codeLength: input.codeLength || this.config.codeLength,
      validTime: input.validTime || this.config.validTime
    });

    const response = await client.sendSmsVerifyCodeWithOptions(request, new RuntimeOptions({}));
    const body = response?.body || response;
    const success = body?.code === 'OK' || body?.Code === 'OK' || body?.success === true || body?.Success === true;
    const model = body?.model || body?.Model || {};

    return {
      success,
      provider: this.name,
      code: body?.code || body?.Code || (success ? 'OK' : 'ALIYUN_SEND_FAILED'),
      message: body?.message || body?.Message || '',
      bizId: model.bizId || model.BizId,
      requestId: model.requestId || model.RequestId || body?.requestId || body?.RequestId,
      raw: body
    };
  }
}
