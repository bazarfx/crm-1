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
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      {searchable && (
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={isServer ? serverSearch : localFilter}
              onChange={(e) => (isServer ? setServerSearch(e.target.value) : setLocalFilter(e.target.value))}
              placeholder={searchPlaceholder}
              className="w-full h-9 rounded-md border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-shadow"
            />
          </div>
          <span className="mono text-xs text-muted-foreground ml-auto tabular-nums">
            {loading ? '…' : `${(filteredCount ?? 0).toLocaleString('en-IN')} row${(filteredCount ?? 0) === 1 ? '' : 's'}`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-muted/40 border-b">
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      className={clsx(
                        'text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2.5 select-none whitespace-nowrap',
                        canSort && 'cursor-pointer hover:text-foreground'
                      )}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {canSort && (
                          <ArrowUpDown
                            size={11}
                            className={clsx(sorted ? 'text-primary' : 'text-muted-foreground opacity-60')}
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
                <tr key={`sk-${i}`} className="border-b last:border-0">
                  {columns.map((_c, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="shimmer h-4 w-3/4 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            )}

            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center">
                  {emptyState || (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox size={20} />
                      <p className="text-sm font-medium text-foreground">No results found</p>
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
                  'border-b last:border-0 transition-colors duration-100',
                  onRowClick ? 'cursor-pointer hover:bg-muted/40' : 'hover:bg-muted/40'
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-foreground">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && pageCount > 1 && (
        <div className="px-4 py-3 border-t flex items-center justify-between flex-wrap gap-2">
          <span className="mono text-xs text-muted-foreground tabular-nums">
            Showing {startRow.toLocaleString('en-IN')}–{endRow.toLocaleString('en-IN')} of {(filteredCount ?? 0).toLocaleString('en-IN')}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              disabled={!canPrev}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => (isServer ? onPageChange(n) : table.setPageIndex(n - 1))}
                className={clsx(
                  'h-7 min-w-[28px] px-2 rounded-md text-xs font-medium transition-colors mono tabular-nums',
                  n === pageIndex + 1
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {n}
              </button>
            ))}
            <button
              onClick={goNext}
              disabled={!canNext}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
