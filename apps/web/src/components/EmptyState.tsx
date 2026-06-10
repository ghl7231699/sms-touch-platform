import { Inbox } from 'lucide-react';

export function EmptyState({
  title = '暂无数据',
  description = '当前筛选条件下没有可展示的记录。'
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="emptyState">
      <Inbox size={34} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

export function TableEmptyState({
  colSpan,
  title = '暂无数据',
  description = '当前筛选条件下没有可展示的记录。'
}: {
  colSpan: number;
  title?: string;
  description?: string;
}) {
  return (
    <tr>
      <td className="tableEmptyCell" colSpan={colSpan}>
        <EmptyState title={title} description={description} />
      </td>
    </tr>
  );
}
