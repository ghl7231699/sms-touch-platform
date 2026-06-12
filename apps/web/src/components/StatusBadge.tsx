import { statusLabel } from '../constants/labels';

const toneClass: Record<string, string> = {
  enabled: 'bg-emerald-50 text-emerald-700',
  success: 'bg-emerald-50 text-emerald-700',
  disabled: 'bg-rose-50 text-rose-700',
  failed: 'bg-rose-50 text-rose-700',
  partial_failed: 'bg-amber-50 text-amber-700',
  blocked: 'bg-amber-50 text-amber-700',
  pending: 'bg-amber-50 text-amber-700',
  task_pending: 'bg-blue-50 text-blue-700',
  approval_pending: 'bg-amber-50 text-amber-700',
  register_pending: 'bg-amber-50 text-amber-700',
  sending: 'bg-blue-50 text-blue-700',
  skipped: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500'
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`statusBadge inline-flex h-7 w-fit shrink-0 items-center justify-center rounded-full px-3 text-xs font-semibold leading-none ${toneClass[status] || 'bg-slate-100 text-slate-600'}`}
      data-ui="status-badge"
    >
      {statusLabel(status)}
    </span>
  );
}
