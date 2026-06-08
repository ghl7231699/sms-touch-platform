# 阿里云短信测试配置

本文档记录当前项目用于测试短信发送链路的阿里云 OpenAPI 配置信息。

当前项目定位为测试程序，短信发送仅用于验证事件、规则、任务、日志和统计链路，不作为正式营销短信生产环境使用。

## 测试策略

- 默认开发环境建议使用 `mock` 短信通道。
- 需要真实验证短信到达时，使用 `aliyun_dypns` 通道通过阿里云 SDK 调用号码认证服务 `SendSmsVerifyCode` OpenAPI。
- 阿里云 CLI 只作为人工验证工具，项目代码不依赖 CLI。
- 只允许向白名单测试手机号发送。
- 当前签名为验证码类签名，真实发送内容应按验证码/测试码场景处理，不承载正式营销文案。
- AccessKey 属于敏感信息，不写入项目文档、代码仓库或截图。

## 已确认信息

| 配置项 | 值 |
| --- | --- |
| 短信服务商 | 阿里云号码认证服务 |
| OpenAPI 产品 | `dypnsapi` |
| OpenAPI 接口 | `SendSmsVerifyCode` |
| OpenAPI Endpoint | `dypnsapi.aliyuncs.com` |
| Region | `cn-hangzhou` |
| 签名 | `速通互联验证码` |
| 可用模板 Code | `100001`、`100002`、`100003` |
| 模板参数 | `{"code":"123456","min":"5"}` |
| 模板变量 | `code`、`min` |

## 测试手机号白名单

```text
18709795241
15117970665
18633007288
18515385071
```

建议项目环境变量写成：

```text
SMS_TEST_PHONE_WHITELIST=18709795241,15117970665,18633007288,18515385071
```

## 推荐环境变量

```text
SMS_PROVIDER=aliyun_dypns
SMS_TEST_PHONE_WHITELIST=18709795241,15117970665,18633007288,18515385071

ALIYUN_DYPNS_ENDPOINT=dypnsapi.aliyuncs.com
ALIYUN_DYPNS_REGION=cn-hangzhou
ALIYUN_SMS_SIGN_NAME=速通互联验证码
ALIYUN_SMS_TEMPLATE_CODE=100001
ALIYUN_SMS_TEMPLATE_PARAM={"code":"123456","min":"5"}
ALIYUN_SMS_CODE_TYPE=1
ALIYUN_SMS_CODE_LENGTH=6
ALIYUN_SMS_VALID_TIME=300

ALIBABA_CLOUD_ACCESS_KEY_ID=请在本地环境中填写
ALIBABA_CLOUD_ACCESS_KEY_SECRET=请在本地环境中填写
```

如需要保留 3 个模板映射，可配置为：

```text
ALIYUN_SMS_TEMPLATE_CODE_DEFAULT=100001
ALIYUN_SMS_TEMPLATE_CODE_REGISTER=100001
ALIYUN_SMS_TEMPLATE_CODE_MEMBER_EXPIRED=100002
ALIYUN_SMS_TEMPLATE_CODE_NOTIFY=100003
```

## Provider 设计建议

项目实现时建议抽象统一短信发送接口：

```text
SmsProvider
- MockSmsProvider
- AliyunDypnsVerifyProvider
- AliyunSmsProvider（未来正式短信通道预留）
```

建议默认值：

```text
SMS_PROVIDER=mock
```

只有需要真实测试短信到达时，再切换为：

```text
SMS_PROVIDER=aliyun_dypns
```

项目实现应使用阿里云 SDK 直接调用 OpenAPI。CLI 只用于人工验证，不作为运行时依赖。

## 发送前校验

发送短信前必须校验：

- 目标手机号在 `SMS_TEST_PHONE_WHITELIST` 中。
- `ALIYUN_SMS_SIGN_NAME` 不为空。
- `ALIYUN_SMS_TEMPLATE_CODE` 不为空。
- `TemplateParam` 包含模板变量 `code` 和 `min`。
- 如果使用 `{"code":"##code##","min":"5"}`，必须同时传 `CodeType`、`CodeLength`、`ValidTime`，由阿里云生成验证码。
- AccessKey 只从本地环境变量读取。

手机号不在白名单时，建议直接拒绝发送并记录状态：

```text
blocked
```

## OpenAPI 调用结果记录

调用阿里云 `SendSmsVerifyCode` 后，发送日志建议记录：

| 字段 | 说明 |
| --- | --- |
| `provider` | `aliyun_dypns` |
| `templateCode` | 实际使用的模板 Code |
| `phoneMasked` | 脱敏手机号 |
| `requestId` | 阿里云返回的 `RequestId` |
| `bizId` | 阿里云返回的 `BizId` |
| `code` | 阿里云返回的 `Code` |
| `message` | 阿里云返回的 `Message` |
| `status` | 本地发送状态 |

当阿里云返回 `Code = OK` 且 `Success = true` 时，可将任务标记为发送成功或已提交。其他返回值记录为失败，并保存错误码和错误信息。

## 当前待补充

- RAM 用户权限配置方式。
- AccessKey 本地存放方式。
- 模板 `100001`、`100002`、`100003` 的具体模板内容。

## 已验证记录

### 2026-06-05 验证码发送

使用阿里云 CLI 调用号码认证服务 `dypnsapi` 的 `send-sms-verify-code` 接口，已成功向白名单手机号 `18515385071` 发送验证码短信。

执行命令：

```bash
aliyun dypnsapi send-sms-verify-code \
  --phone-number 18515385071 \
  --sign-name '速通互联验证码' \
  --template-code 100001 \
  --template-param '{"code":"##code##","min":"5"}' \
  --code-type 1 \
  --code-length 6 \
  --valid-time 300 \
  --region cn-hangzhou
```

返回结果摘要：

```json
{
  "Code": "OK",
  "Message": "OK",
  "Model": {
    "BizId": "575014180657052749^0",
    "RequestId": "233f6cb7-df18-4544-a17e-0dcfb45c13d4"
  },
  "Success": true
}
```
