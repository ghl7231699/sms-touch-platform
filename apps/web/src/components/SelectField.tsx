import { Select } from 'antd';

export type SelectOption = {
  value: string;
  label: string;
};

export function SelectField({
  value,
  options,
  onChange,
  placeholder = '请选择'
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Select
      allowClear
      className="selectField"
      optionFilterProp="label"
      options={options}
      placeholder={placeholder}
      showSearch
      value={value || undefined}
      onChange={(nextValue) => onChange(nextValue || '')}
    />
  );
}
