'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, cx, EmptyState, Spinner } from '@sahyadri/ui';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  loading,
  sort,
  onSort,
  rowHref,
  empty = 'Nothing here yet',
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  loading?: boolean;
  sort?: string;
  onSort?: (s: string) => void;
  rowHref?: (row: T) => string;
  empty?: string;
}) {
  if (loading && !rows) return <div className="py-10"><Spinner /></div>;
  if (!rows?.length) return <EmptyState title={empty} />;
  const dir = (k: string) => (sort === k ? 'ascending' : sort === `-${k}` ? 'descending' : undefined);
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-muted text-left text-xs text-muted uppercase">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" aria-sort={dir(c.key)} className={cx('px-3 py-2 font-semibold whitespace-nowrap', c.className)}>
                {c.sortable && onSort ? (
                  <button className="inline-flex items-center gap-1 uppercase" onClick={() => onSort(sort === c.key ? `-${c.key}` : c.key)}>
                    {c.label}
                    <span aria-hidden>{sort === c.key ? '▲' : sort === `-${c.key}` ? '▼' : '↕'}</span>
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line hover:bg-bg">
              {columns.map((c, i) => {
                const v = c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '—');
                return (
                  <td key={c.key} className={cx('px-3 py-2 align-top', c.className)}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(r)} className="font-medium text-accent hover:underline">
                        {v}
                      </Link>
                    ) : (
                      v
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span>
        {total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
