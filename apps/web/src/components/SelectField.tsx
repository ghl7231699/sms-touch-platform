import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <div className="selectField" ref={rootRef}>
      <button
        aria-expanded={open}
        className="selectTrigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>{current?.label || placeholder}</span>
        <ChevronDown className="selectChevron" size={18} />
      </button>
      {open && (
        <div className="selectMenu" role="listbox">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                aria-selected={selected}
                className={`selectOption${selected ? ' selected' : ''}`}
                key={option.value}
                onClick={() => choose(option.value)}
                role="option"
                type="button"
              >
                <span>{option.label}</span>
                {selected && <Check size={16} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
