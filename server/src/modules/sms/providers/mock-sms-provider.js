export class MockSmsProvider {
  name = 'mock';

  async sendVerifyCode() {
    return {
      success: true,
      provider: this.name,
      code: 'OK',
      message: 'Mock sms submitted.',
      bizId: `mock_${Date.now()}`,
      requestId: `mock_${Math.random().toString(36).slice(2)}`
    };
  }
}
