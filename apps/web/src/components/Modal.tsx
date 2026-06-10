import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  size = 'default',
  showClose = true
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'default' | 'wide';
  showClose?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modalOverlay" role="presentation" onMouseDown={onClose}>
      <section className={`modalPanel ${size === 'wide' ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modalHeader">
          <div>
            <h2>{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          {showClose && (
            <button className="modalCloseButton" type="button" onClick={onClose} aria-label="关闭弹窗" title="关闭">
              <X size={18} />
            </button>
          )}
        </div>
        {children}
      </section>
    </div>
  );
}
