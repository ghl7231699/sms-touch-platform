import type { ReactNode } from 'react';

export function Modal({
  open,
  title,
  subtitle,
  children,
  onClose
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/35 p-6 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[calc(100vh-48px)] w-full max-w-[560px] overflow-auto rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/20" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-5 flex min-h-10 items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal text-slate-950">{title}</h2>
            {subtitle && <span className="mt-1 block text-sm text-slate-500">{subtitle}</span>}
          </div>
          <button className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={onClose}>关闭</button>
        </div>
        {children}
      </section>
    </div>
  );
}
