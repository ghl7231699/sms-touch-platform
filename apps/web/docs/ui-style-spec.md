# 前端 UI 风格与交互规范

本文档用于约束短信触达平台前端实现。风格参考项目 `/Users/admin/Documents/workspace/mex-credya`，重点参考其后台管理页的组件组织、查询条件、分页列表、弹窗和操作反馈方式。

## 参考项目特征

参考项目是典型 Ant Design 后台系统：

- 技术栈：React、TypeScript、Vite、Ant Design 5。
- 页面结构：左侧菜单、顶部面包屑、内容区域白底卡片。
- 列表页结构：操作按钮区、查询表单、Table、分页。
- 编辑页结构：参考其表单分层和操作反馈方式；短信触达平台禁止使用 Drawer，统一使用 Modal 或独立详情页。
- 交互反馈：接口请求使用 loading，成功/失败使用 message 或 Modal。
- 权限控制：操作按钮可按权限包裹显示。
- 数据请求：每个页面独立 `service.ts`，页面组件不直接拼复杂请求细节。

短信触达平台后续前端应尽量贴近这个模式，避免做成营销落地页或纯 demo。

## 前端目录约定

当前前端项目位于：

```text
apps/web/
  src/
    components/
    pages/
    services/
    constants/
    types/
    hooks/
    main.tsx
    styles.css
  docs/
    ui-style-spec.md
```

建议后续从当前单文件 UI 逐步拆分为：

```text
src/pages/TemplateManage/
  index.tsx
  service.ts
  types.ts
  columns.tsx

src/pages/RuleManage/
  index.tsx
  RuleModal.tsx
  service.ts
  types.ts
  columns.tsx

src/pages/TaskQueue/
  index.tsx
  service.ts
  types.ts
  columns.tsx
```

## 基础组件风格

优先使用 Ant Design 组件体系：

| 场景 | 推荐组件 |
| --- | --- |
| 页面容器 | `Card` 或白底内容容器 |
| 查询条件 | `Form` + `Row` + `Col` |
| 文本输入 | `Input`、`Input.Search` |
| 枚举选择 | `Select` |
| 时间范围 | `DatePicker.RangePicker` |
| 列表 | `Table` |
| 普通弹窗 | `Modal` |
| 复杂表单 | 大宽度 `Modal` 或独立详情页 |
| 操作按钮组 | `Space` |
| 成功/失败提示 | `message` |
| 确认删除 | `Popconfirm` 或 `Modal.confirm` |
| 空状态 | `Empty` |
| 状态展示 | `Tag` |

当前已有自定义样式可以保留，但后续新增页面应逐步收敛到 Ant Design 后台风格。

## 页面布局规范

列表页统一结构：

```text
Page
  Header actions
  Search Form
  Data Table
  Modal
```

页面外层建议：

- 背景使用浅灰。
- 内容区使用白底容器。
- 容器圆角 `8px`。
- 页面内间距 `16px` 或 `24px`。
- 不使用大面积营销式 hero、渐变背景、装饰图形。

参考形态：

```tsx
<div style={{ padding: 24, background: '#fff', borderRadius: 8 }}>
  <Form />
  <Table />
  <Modal />
</div>
```

## 查询条件规范

查询条件使用 `Form` 承载，不直接用零散输入框。

基础规则：

- 简单查询使用水平表单：`labelCol={{ span: 8 }}`、`wrapperCol={{ span: 16 }}`。
- 多条件查询使用 `layout="vertical"`。
- 栅格优先使用 `Row gutter={[16, 16]}`。
- 常规字段每行 3 到 4 个。
- 查询按钮区右对齐。
- 查询按钮顺序：`重置` 在前，`查询` 在后或按现有页面统一。
- 查询提交前 trim 字符串。
- `Input` 默认加 `allowClear`。
- 手机号等数字字段需要过滤非数字字符。
- 空查询是否允许由业务决定；关键查询页可要求至少一个查询条件。

推荐模式：

```tsx
const [form] = Form.useForm();
const [searchParams, setSearchParams] = useState({
  pageNum: 1,
  pageSize: 10,
});

const handleSearch = (values: Record<string, any>) => {
  const next = {
    ...values,
    keyword: values.keyword?.trim() || undefined,
    pageNum: 1,
    pageSize: searchParams.pageSize,
  };
  setSearchParams(next);
  fetchList(next);
};

const handleReset = () => {
  form.resetFields();
  const next = { pageNum: 1, pageSize: 10 };
  setSearchParams(next);
  fetchList(next);
};
```

## 列表与分页规范

列表统一使用 `Table`。

基础规则：

- 必须有 `loading`。
- 必须有稳定 `rowKey`。
- 分页字段统一为 `pageNum`、`pageSize`、`total`。
- 默认 `pageSize=10`。
- 开启 `showSizeChanger`。
- 重要列表开启 `showQuickJumper`。
- 列较多时使用 `scroll={{ x: number }}`。
- 操作列固定右侧：`fixed: 'right'`。
- 操作列按钮使用 `Button type="link" size="small"`。
- 多个操作用 `Space size="small" wrap`。
- 空值展示为 `-` 或 `—`，同一页面保持一致。

推荐分页：

```tsx
<Table
  columns={columns}
  dataSource={list}
  loading={loading}
  rowKey="id"
  pagination={{
    current: searchParams.pageNum,
    pageSize: searchParams.pageSize,
    total,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
  }}
  onChange={(pagination) => {
    const next = {
      ...searchParams,
      pageNum: pagination.current ?? 1,
      pageSize: pagination.pageSize ?? 10,
    };
    setSearchParams(next);
    fetchList(next);
  }}
/>
```

## 弹窗规范

短信触达平台禁止使用 Drawer。所有新增、编辑、查看、确认、选择类浮层统一使用 Modal；复杂详情可使用独立页面。

### Modal

适用场景：

- 简单新增/编辑。
- 复杂新增/编辑，使用大宽度 Modal。
- 轻量选择器。
- 删除确认。
- 状态切换确认。
- 查看详情。

规则：

- 使用 `destroyOnClose`。
- 表单提交使用 `confirmLoading`。
- 关闭前不保留脏数据，除非业务明确需要。
- `maskClosable` 对关键选择/确认弹窗设为 `false`。
- 简单表单宽度建议 `520px` 到 `640px`。
- 复杂表单宽度建议 `720px` 到 `900px`。
- 查看模式使用 `Form disabled` 或只读描述组件。
- 新增、编辑、查看可共用组件，通过 `mode` 控制。

参考：

```tsx
<Modal
  title={isEdit ? '编辑模板' : '新增模板'}
  open={open}
  onOk={handleOk}
  onCancel={onCancel}
  confirmLoading={loading}
  destroyOnClose
>
  <Form form={form} layout="vertical" />
</Modal>
```

## 状态与操作反馈

状态展示使用 `Tag`：

| 状态 | 建议颜色 |
| --- | --- |
| enabled / success / delivered | green |
| pending / submitted | blue |
| sending | processing |
| disabled | default |
| failed | red |
| blocked | orange |

接口反馈：

- 成功：`message.success`。
- 失败：`message.error`。
- 长请求：`message.loading({ key, duration: 0 })`，完成后 `message.destroy(key)`。
- 删除前确认：优先 `Popconfirm`；复杂条件使用 `Modal.warning` 或 `Modal.confirm`。

## Service 与类型规范

每个页面建议拆出：

```text
service.ts
types.ts
columns.tsx
index.tsx
```

请求函数只负责接口调用，不直接操作 UI 状态：

```ts
export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getTaskList(params: TaskSearchParams): Promise<PageResult<TaskItem>> {
  return api('/api/tasks', { params });
}
```

页面负责：

- `loading`
- `searchParams`
- `pagination`
- `message`
- Modal open 状态

## 当前短信平台页面改造建议

后续页面应按以下方式拆分：

| 当前能力 | 页面 | 弹窗/详情 |
| --- | --- | --- |
| 模板管理 | `TemplateManage` | `TemplateModal` |
| 规则中心 | `RuleManage` | `RuleModal` |
| 手动发送 | `ManualSend` | 可保留页面表单 |
| 事件触发 | `EventSimulator` | 可保留页面表单 |
| 任务队列 | `TaskQueue` | `TaskDetailModal` 或独立详情页 |
| 发送记录 | `SendLog` | `SendLogDetailModal` 或独立详情页 |
| 回执记录 | `ReceiptLog` | 无或详情 Modal |
| 短链点击 | `ClickLog` | 无或详情 Modal |

优先改造顺序：

1. 引入 Ant Design。
2. 抽出 `api` 请求封装。
3. 将 `main.tsx` 中的列表拆为独立页面。
4. 将新增、编辑、查看表单统一改为 Modal 或独立详情页。
5. 补齐列表分页、查询条件和空状态。
6. 增加状态 Tag 和统一操作列。

## 设计约束

- 后台管理系统以效率和清晰为先。
- 不做营销落地页风格。
- 不使用大面积渐变、装饰插画、浮夸卡片。
- 查询、列表、表单、弹窗保持一致模式。
- 禁止使用 Drawer。
- 所有列表必须有 loading、分页和稳定 rowKey。
- 所有新增/编辑必须有表单校验。
- 所有真实发送相关操作必须保留防误发提示和白名单说明。
