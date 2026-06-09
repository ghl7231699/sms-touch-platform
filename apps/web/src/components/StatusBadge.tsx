import { statusLabel } from '../constants/labels';

export function StatusBadge({ status }: { status: string }) {
  return <span className={`statusBadge ${status}`}>{statusLabel(status)}</span>;
}

