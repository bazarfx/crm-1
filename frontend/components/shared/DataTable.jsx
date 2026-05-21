'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, Inbox } from 'lucide-react';
import clsx from 'clsx';

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function DataTable({
  columns,
  data = [],
  loading = false,
  pageSize = 25,
  searchPlaceholder = 'Search…',
  searchable = true,
  emptyState = null,
  onRowClick,
  // server-side pagination (optional)
  total,
  page,
  limit,
  onPageChange,
  onSearch,
}) {
  const isServer = typeof onPageChange === 'function';

  const [localFilter, setLocalFilter] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const debounced = useDebounced(serverSearch, 300);
  const [sorting, setSorting] = useState([]);

  useEffect(() => {
    if (isServer && onSearch) onSearch(debounced);
  }, [debounced, isServer, onSearch]);

  const safeData = useMemo(() => data ?? [], [data]);

  const table = useReactTable({
    data: safeData,
    columns,
    state: isServer ? { sorting } : { sorting, globalFilter: localFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: isServer ? undefined : setLocalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: isServer ? undefined : getFilteredRowModel(),
    getPaginationRowModel: isServer ? undefined : getPaginationRowModel(),
    manualPagination: isServer,
    pageCount: isServer ? Math.max(1, Math.ceil((total || 0) / (limit || pageSize))) : undefined,
    initialState: { pagination: { pageSize } },
  });

  const visibleRows = table.getRowModel().rows;
  const filteredCount = isServer ? total : table.getFilteredRowModel().rows.length;
  const pageIndex = isServer ? Math.max(0, (page || 1) - 1) : table.getState().pagination.pageIndex;
  const pageCount = isServer
    ? Math.max(1, Math.ceil((total || 0) / (limit || pageSize)))
    : table.getPageCount();
  const startRow = isServer
    ? (filteredCount ? pageIndex * (limit || pageSize) + 1 : 0)
    : (visibleRows.length ? pageIndex * pageSize + 1 : 0);
  const endRow = isServer
    ? Math.min(filteredCount || 0, (pageIndex + 1) * (limit || pageSize))
    : Math.min(filteredCount || 0, (pageIndex + 1) * pageSize);

  const goPrev = () => isServer ? onPageChange(Math.max(1, (page || 1) - 1)) : table.previousPage();
  const goNext = () => isServer ? onPageChange((page || 1) + 1) : table.nextPage();
  const canPrev = isServer ? pageIndex > 0 : table.getCanPreviousPage();
  const canNext = isServer ? pageIndex + 1 < pageCount : table.getCanNextPage();

  // up to 5 numbered pages around current
  const pageNumbers = useMemo(() => {
    const total = pageCount;
    const cur = pageIndex + 1;
    const span = 5;
    let start = Math.max(1, cur - Math.floor(span / 2));
    let end = Math.min(total, start + span - 1);
    start = Math.max(1, end - span + 1);
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [pageCount, pageIndex]);

  return (
    <div className="card p-0 overflow-hidden">
      {searchable && (
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={isServer ? serverSearch : localFilter}
              onChange={(e) => (isServer ? setServerSearch(e.target.value) : setLocalFilter(e.target.value))}
              placeholder={searchPlaceholder}
              className="input pl-9 py-1.5 text-sm"
            />
          </div>
          <span className="mono text-xs text-ink-muted ml-auto tabular-nums">
            {loading ? '…' : `${filteredCount ?? 0} row${(filteredCount ?? 0) === 1 ? '' : 's'}`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-surface-alt border-b border-slate-100">
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className={clsx(
                        'text-left text-[11px] font-semibold text-ink-secondary uppercase tracking-wide px-4 py-2.5 select-none whitespace-nowrap',
                        canSort && 'cursor-pointer hover:text-ink-primary'
                      )}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {canSort && (
                          <ArrowUpDown
                            size={11}
                            className={clsx(sorted ? 'text-accent' : 'text-ink-muted opacity-60')}
                          />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-slate-50">
                  {columns.map((_c, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            )}

            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  {emptyState || (
                    <div className="flex flex-col items-center gap-2 text-ink-muted">
                      <Inbox size={20} />
                      <p className="text-sm font-medium text-ink-secondary">No results found</p>
                      <p className="text-xs">Try adjusting your search or filters.</p>
                    </div>
                  )}
                </td>
              </tr>
            )}

            {!loading && visibleRows.map((row) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={clsx(
                  'border-b border-slate-50 transition-colors duration-100',
                  onRowClick ? 'cursor-pointer hover:bg-surface-alt' : 'hover:bg-surface-alt'
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-ink-primary">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && pageCount > 1 && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <span className="mono text-xs text-ink-muted tabular-nums">
            Showing {startRow}–{endRow} of {filteredCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              disabled={!canPrev}
              className="btn-ghost p-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => (isServer ? onPageChange(n) : table.setPageIndex(n - 1))}
                className={clsx(
                  'h-7 min-w-[28px] px-2 rounded-md text-xs font-medium transition-all duration-150 mono tabular-nums',
                  n === pageIndex + 1
                    ? 'bg-accent text-white'
                    : 'text-ink-secondary hover:bg-surface-alt'
                )}
              >
                {n}
              </button>
            ))}
            <button
              onClick={goNext}
              disabled={!canNext}
              className="btn-ghost p-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
