import { Pagination } from 'antd';

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
};

export const defaultPagination: PaginationState = {
  page: 1,
  pageSize: 20,
  total: 0
};

export function withPaginationParams(filters: Record<string, string>, pagination: Pick<PaginationState, 'page' | 'pageSize'>) {
  const params = new URLSearchParams({
    page: String(pagination.page),
    pageSize: String(pagination.pageSize)
  });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export function ListPagination({
  pagination,
  onChange
}: {
  pagination: PaginationState;
  onChange: (page: number, pageSize: number) => void;
}) {
  if (pagination.total <= 0) return null;
  return (
    <div className="listPagination">
      <Pagination
        current={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        showSizeChanger
        showTotal={(total) => `共 ${total} 条`}
        onChange={onChange}
      />
    </div>
  );
}
