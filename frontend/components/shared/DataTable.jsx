'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, Inbox, Columns3, WrapText } from 'lucide-react';
import clsx from 'clsx';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// A column is "toggleable" in the Columns menu when it declares a plain-string
// header (so we have a readable label and a stable key) and hasn't explicitly
// opted out via `enableHiding: false`. Function/element headers (e.g. the
// select-all checkbox) are skipped — they have no label and shouldn't be hidden.
function columnKey(col) {
  return col.id ?? col.accessorKey ?? null;
}
function toggleableColumns(columns) {
  return columns.filter(
    (c) =>
      typeof c.header === 'string' &&
      c.header.length > 0 &&
      c.enableHiding !== false &&
      columnKey(c) != null
  );
}

// localStorage helpers — namespaced by tableId. No-ops when tableId is falsy so
// non-opted-in callers never touch storage.
const HIDDEN_KEY = (id) => `datatable:${id}:hiddenCols`;
const WRAP_KEY = (id) => `datatable:${id}:wrap`;

function readJSON(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / disabled storage — silently degrade */
  }
}

const LIMIT_OPTIONS = [10, 25, 50, 100];

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
  // --- Column management (all opt-in; defaults keep existing callers unchanged) ---
  // Stable id used to persist column visibility + wrap preference in
  // localStorage. When omitted, the Columns menu still works in-memory but
  // nothing is persisted.
  tableId,
  // Force-enable the Columns menu. By default the menu shows whenever there is
  // at least one toggleable (string-header) column AND a tableId is present, so
  // pages that never opted in render exactly as before.
  columnsMenu,
  // When true, expose a "Wrap text" toggle in the toolbar. Off by default.
  allowWrap = false,
  // Rows-per-page selector. Rendered only when BOTH are provided.
  onLimitChange,
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

  // --- Column visibility -----------------------------------------------------
  const toggleables = useMemo(() => toggleableColumns(columns), [columns]);
  // Whether to actually render the Columns menu. Explicit `columnsMenu` wins;
  // otherwise auto-enable only when persistence is available (tableId) and
  // there's something to toggle. This keeps ark-logs / dynamic-module pages —
  // which pass neither prop — identical to today.
  const showColumnsMenu =
    columnsMenu !== undefined ? !!columnsMenu : !!tableId && toggleables.length > 0;

  // Set of hidden column keys. Seeded from localStorage on mount (per tableId).
  const [hidden, setHidden] = useState(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!tableId) {
      setHydrated(true);
      return;
    }
    const stored = readJSON(HIDDEN_KEY(tableId), []);
    setHidden(new Set(Array.isArray(stored) ? stored : []));
    setHydrated(true);
  }, [tableId]);

  const persistHidden = useCallback(
    (next) => {
      if (tableId) writeJSON(HIDDEN_KEY(tableId), Array.from(next));
    },
    [tableId]
  );

  const toggleColumn = useCallback(
    (key) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        persistHidden(next);
        return next;
      });
    },
    [persistHidden]
  );

  // Filter hidden columns out of the render entirely. Only applies when the
  // menu is active — otherwise columns pass through untouched.
  const renderColumns = useMemo(() => {
    if (!showColumnsMenu || hidden.size === 0) return columns;
    return columns.filter((c) => {
      const key = columnKey(c);
      return key == null || !hidden.has(key);
    });
  }, [columns, hidden, showColumnsMenu]);

  // --- Wrap text -------------------------------------------------------------
  const [wrap, setWrap] = useState(false);
  useEffect(() => {
    if (!allowWrap || !tableId) return;
    setWrap(!!readJSON(WRAP_KEY(tableId), false));
  }, [allowWrap, tableId]);

  const toggleWrap = useCallback(
    (next) => {
      setWrap(next);
      if (tableId) writeJSON(WRAP_KEY(tableId), next);
    },
    [tableId]
  );

  const table = useReactTable({
    data: safeData,
    columns: renderColumns,
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

  // Rows-per-page selector renders only when the page opts in with both props.
  const showLimitSelect = typeof onLimitChange === 'function' && limit != null;
  // The toolbar row (Columns menu / Wrap toggle) only exists when something
  // lives in it — keeps the header height identical for non-opted-in callers.
  const showToolbarExtras = showColumnsMenu || allowWrap;

  const tdWrapClass = wrap ? 'whitespace-normal break-words' : '';

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      {(searchable || showToolbarExtras) && (
        <div className="px-4 py-3 border-b flex items-center gap-3">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={isServer ? serverSearch : localFilter}
                onChange={(e) => (isServer ? setServerSearch(e.target.value) : setLocalFilter(e.target.value))}
                placeholder={searchPlaceholder}
                className="w-full h-9 rounded-md border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-shadow"
              />
            </div>
          )}

          <span className="mono text-xs text-muted-foreground ml-auto tabular-nums">
            {loading ? '…' : `${(filteredCount ?? 0).toLocaleString('en-IN')} row${(filteredCount ?? 0) === 1 ? '' : 's'}`}
          </span>

          {allowWrap && (
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
              <WrapText size={14} />
              <span className="hidden sm:inline">Wrap</span>
              <Switch checked={wrap} onCheckedChange={toggleWrap} aria-label="Wrap cell text" />
            </label>
          )}

          {showColumnsMenu && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Columns3 size={14} /> Columns
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 max-h-[60vh] overflow-y-auto p-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Show columns
                </p>
                <div className="space-y-1.5">
                  {toggleables.map((c) => {
                    const key = columnKey(c);
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-2 text-xs cursor-pointer text-foreground"
                      >
                        <input
                          type="checkbox"
                          checked={!hidden.has(key)}
                          onChange={() => toggleColumn(key)}
                          className="cursor-pointer accent-primary"
                        />
                        <span>{c.header}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
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
                  {renderColumns.map((_c, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="shimmer h-4 w-3/4 rounded" />
                    </td>
                  ))}
                </tr>
              ))
            )}

            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={renderColumns.length} className="px-4 py-16 text-center">
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
                  <td key={cell.id} className={clsx('px-4 py-3 text-foreground', tdWrapClass)}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && (pageCount > 1 || showLimitSelect) && (
        <div className="px-4 py-3 border-t flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="mono text-xs text-muted-foreground tabular-nums">
              Showing {startRow.toLocaleString('en-IN')}–{endRow.toLocaleString('en-IN')} of {(filteredCount ?? 0).toLocaleString('en-IN')}
            </span>
            {showLimitSelect && (
              <div className="inline-flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Rows:</span>
                <Select
                  value={String(limit)}
                  onValueChange={(v) => onLimitChange(Number(v))}
                >
                  <SelectTrigger className="h-7 w-[64px] px-2 text-xs shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIMIT_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {pageCount > 1 && (
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
          )}
        </div>
      )}
    </div>
  );
}
