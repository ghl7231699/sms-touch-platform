import { Select } from 'antd';

export type SelectOption = {
  value: string;
  label: string;
};

export function SelectField({
  value,
  options,
  onChange,
  placeholder = '请选择',
  showSearch = false
}: {
  value?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  showSearch?: boolean;
}) {
  return (
    <Select
      allowClear
      className="selectField"
      optionFilterProp="label"
      options={options}
      placeholder={placeholder}
      showSearch={showSearch}
      value={value || undefined}
      onChange={(nextValue) => onChange?.(nextValue || '')}
    />
  );
}
