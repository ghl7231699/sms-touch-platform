import { Button, Col, DatePicker, Form, Input, Row, Select, Space } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect } from 'react';

export type QueryFilterValues = Record<string, string>;

export type QueryFilterField =
  | {
      name: string;
      label: string;
      type?: 'input';
      placeholder?: string;
      span?: number;
    }
  | {
      name: string;
      label: string;
      type: 'select';
      placeholder?: string;
      span?: number;
      options: { value: string; label: string }[];
    }
  | {
      name: string;
      label: string;
      type: 'dateRange';
      fromName: string;
      toName: string;
      span?: number;
    };

function toFormValues(fields: QueryFilterField[], values: QueryFilterValues) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'dateRange') {
      const start = values[field.fromName];
      const end = values[field.toName];
      result[field.name] = start || end ? [start ? dayjs(start) : null, end ? dayjs(end) : null] : undefined;
    } else {
      result[field.name] = values[field.name] || undefined;
    }
  }
  return result;
}

function toFilterValues(fields: QueryFilterField[], raw: Record<string, unknown>) {
  const result: QueryFilterValues = {};
  for (const field of fields) {
    if (field.type === 'dateRange') {
      const range = raw[field.name] as [Dayjs | null, Dayjs | null] | undefined;
      result[field.fromName] = range?.[0] ? range[0].format('YYYY-MM-DD') : '';
      result[field.toName] = range?.[1] ? range[1].format('YYYY-MM-DD') : '';
    } else {
      result[field.name] = raw[field.name] ? String(raw[field.name]) : '';
    }
  }
  return result;
}

export function QueryFilterBar({
  fields,
  values,
  onChange,
  onSearch
}: {
  fields: QueryFilterField[];
  values: QueryFilterValues;
  onChange: (values: QueryFilterValues) => void;
  onSearch: (values: QueryFilterValues) => void;
}) {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldsValue(toFormValues(fields, values));
  }, [fields, form, values]);

  function handleFinish(raw: Record<string, unknown>) {
    const nextValues = { ...values, ...toFilterValues(fields, raw) };
    onChange(nextValues);
    onSearch(nextValues);
  }

  function handleReset() {
    const nextValues = { ...values };
    for (const field of fields) {
      if (field.type === 'dateRange') {
        nextValues[field.fromName] = '';
        nextValues[field.toName] = '';
      } else {
        nextValues[field.name] = '';
      }
    }
    form.resetFields();
    onChange(nextValues);
    onSearch(nextValues);
  }

  return (
    <Form
      className="queryFilterForm"
      form={form}
      initialValues={toFormValues(fields, values)}
      layout="vertical"
      onFinish={handleFinish}
    >
      <Row gutter={[16, 16]}>
        {fields.map((field) => (
          <Col key={field.name} span={field.span || (field.type === 'dateRange' ? 8 : 6)}>
            <Form.Item name={field.name} label={field.label}>
              {field.type === 'select' ? (
                <Select
                  allowClear
                  optionFilterProp="label"
                  options={field.options.filter((option) => option.value !== '')}
                  placeholder={field.placeholder || '请选择'}
                  showSearch
                />
              ) : field.type === 'dateRange' ? (
                <DatePicker.RangePicker style={{ width: '100%' }} />
              ) : (
                <Input allowClear placeholder={field.placeholder || '请输入'} />
              )}
            </Form.Item>
          </Col>
        ))}
      </Row>
      <Row>
        <Col span={24} className="queryFilterActions">
          <Space>
            <Button onClick={handleReset}>重置</Button>
            <Button type="primary" htmlType="submit">查询</Button>
          </Space>
        </Col>
      </Row>
    </Form>
  );
}
