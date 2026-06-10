import { Children, cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';

function hasClassName(value: unknown, className: string) {
  return typeof value === 'string' && value.split(/\s+/).includes(className);
}

function bindSubmitButtons(node: ReactNode, formId?: string): ReactNode {
  if (!formId) return node;
  if (Array.isArray(node)) return node.map((child) => bindSubmitButtons(child, formId));
  if (!isValidElement(node)) return node;

  const props = node.props as { children?: ReactNode; type?: string; form?: string };
  const patch: Record<string, unknown> = {};
  if (node.type === 'button' && props.type === 'submit' && !props.form) {
    patch.form = formId;
  }
  if (props.children) {
    patch.children = Children.map(props.children, (child) => bindSubmitButtons(child, formId));
  }
  return Object.keys(patch).length ? cloneElement(node as ReactElement, patch) : node;
}

function splitModalActions(node: ReactNode, generatedFormId: string, activeFormId?: string): { content: ReactNode; footer: ReactNode | null } {
  if (Array.isArray(node)) {
    let footer: ReactNode | null = null;
    const content = node.map((child) => {
      if (footer) return child;
      const result = splitModalActions(child, generatedFormId, activeFormId);
      footer = result.footer;
      return result.content;
    });
    return { content, footer };
  }

  if (!isValidElement(node)) {
    return { content: node, footer: null };
  }

  const props = node.props as { children?: ReactNode; className?: string; id?: string };
  const isForm = node.type === 'form';
  const nextFormId = isForm ? (props.id || generatedFormId) : activeFormId;

  if (hasClassName(props.className, 'modalActions')) {
    return { content: null, footer: bindSubmitButtons(node, nextFormId) };
  }

  if (!props.children) {
    return { content: node, footer: null };
  }

  const result = splitModalActions(props.children, generatedFormId, nextFormId);
  if (!result.footer) {
    return { content: node, footer: null };
  }

  const patch: Record<string, unknown> = { children: result.content };
  if (isForm && !props.id) patch.id = nextFormId;
  return { content: cloneElement(node as ReactElement, patch), footer: result.footer };
}

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
  const generatedFormId = `modal-form-${useId().replace(/:/g, '')}`;
  if (!open) return null;
  const { content, footer } = splitModalActions(children, generatedFormId);

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
        <div className="modalBody">{content}</div>
        {footer && <div className="modalFooter">{footer}</div>}
      </section>
    </div>
  );
}
