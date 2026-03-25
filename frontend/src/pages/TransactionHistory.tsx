import { useState, useEffect, useRef } from 'react';
import { Activity, Calendar, Filter, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFilterState } from '../hooks/useFilterState';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import { useSocket } from '../hooks/useSocket';
import { ConnectionStatus } from '../components/ConnectionStatus';

const POLLING_INTERVAL_MS = 15_000;

function getStatusClass(status: string): string {
  if (status === 'confirmed' || status === 'indexed') {
    return 'bg-success/10 text-success border border-success/20';
  }
  if (status === 'pending') {
    return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  }
  return 'bg-danger/10 text-danger border border-danger/20';
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {['s1', 's2', 's3', 's4', 's5', 's6'].map((key) => (
        <div key={key} className="animate-pulse rounded-xl border border-hi p-4 bg-surface-hi/20">
          <div className="h-3 w-40 bg-border-hi rounded mb-2" />
          <div className="h-3 w-64 bg-border-hi rounded mb-2" />
          <div className="h-3 w-28 bg-border-hi rounded" />
        </div>
      ))}
    </div>
  );
}

export default function TransactionHistory() {
  useTranslation();
  const { socket, connected, isPollingFallback } = useSocket();
  const [showFilters, setShowFilters] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Use filter state hook for managing filters with URL sync and debouncing
  const { filters, debouncedFilters, updateFilter, resetFilters, activeFilterCount } =
    useFilterState();

  // Use transaction history hook for data fetching with TanStack Query
  const { data, isLoading, isLoadingMore, error, hasMore, fetchNextPage, retry, refetch } =
    useTransactionHistory({
      filters: debouncedFilters,
      page: 1,
      limit: 20,
    });

  // ── WebSocket: atomically update a single item status in-place ─────────
  useEffect(() => {
    if (!socket) return;

    const onTransactionUpdate = () => {
      // Refetch to get the latest data when a transaction updates
      void refetch();
    };

    socket.on('transaction:update', onTransactionUpdate);
    return () => {
      socket.off('transaction:update', onTransactionUpdate);
    };
  }, [socket, refetch]);

  // ── Polling fallback: refresh the first page when socket is down ───────
  useEffect(() => {
    const shouldPoll = !connected || isPollingFallback;

    if (shouldPoll) {
      pollingRef.current = setInterval(() => {
        void refetch();
      }, POLLING_INTERVAL_MS);
    } else {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current !== null) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [connected, isPollingFallback, refetch]);

  return (
    <div className="flex-1 flex flex-col p-6 lg:p-12 max-w-7xl mx-auto w-full page-fade">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between border-b border-hi pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-black mb-2 tracking-tight">
            Transaction <span className="text-accent">History</span>
          </h1>
          <p className="text-muted font-mono text-xs tracking-widest uppercase">
            Unified classic + contract event timeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus />
          <Link
            to="/help?q=failed+transaction"
            className="text-xs text-muted hover:text-accent underline transition"
          >
            Troubleshoot
          </Link>
          <button
            onClick={() => setShowFilters((prev) => !prev)}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${
              showFilters
                ? 'bg-accent text-bg shadow-lg shadow-accent/20'
                : 'bg-surface-hi text-text border border-hi hover:border-muted'
            }`}
          >
            <Filter size={18} />
            Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card glass noise mb-6 p-6 animate-fadeUp">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
              Advanced Filters
            </h2>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="text-[10px] font-bold uppercase tracking-widest text-danger hover:underline flex items-center gap-1.5"
              >
                <X size={12} />
                Clear All
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  placeholder="Tx hash / actor..."
                  className="w-full bg-surface/50 border border-hi rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-accent/50 focus:bg-accent/5 transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
                className="w-full bg-surface/50 border border-hi rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent/50 focus:bg-accent/5 transition-all appearance-none"
              >
                <option value="">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">
                Employee
              </label>
              <input
                value={filters.employee}
                onChange={(event) => updateFilter('employee', event.target.value)}
                placeholder="Name or wallet..."
                className="w-full bg-surface/50 border border-hi rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent/50 focus:bg-accent/5 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">
                Asset
              </label>
              <input
                value={filters.asset}
                onChange={(event) => updateFilter('asset', event.target.value)}
                placeholder="USDC, XLM..."
                className="w-full bg-surface/50 border border-hi rounded-xl px-4 py-2.5 text-sm outline-none focus:border-accent/50 focus:bg-accent/5 transition-all"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">
                Start Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(event) => updateFilter('startDate', event.target.value)}
                  className="w-full bg-surface/50 border border-hi rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-accent/50 focus:bg-accent/5 transition-all"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted ml-1">
                End Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(event) => updateFilter('endDate', event.target.value)}
                  className="w-full bg-surface/50 border border-hi rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:border-accent/50 focus:bg-accent/5 transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card glass noise flex-1 p-0 overflow-hidden">
        <div className="p-6">
          {error ? (
            <div className="text-sm text-danger mb-4 font-medium px-4 py-3 bg-danger/10 border border-danger/20 rounded-lg flex items-center justify-between">
              <span>{error instanceof Error ? error.message : 'Failed to load transaction history'}</span>
              <button
                onClick={() => retry()}
                className="ml-4 px-3 py-1 text-xs font-bold bg-danger/20 hover:bg-danger/30 rounded transition-colors"
              >
                Retry
              </button>
            </div>
          ) : null}
          {isLoading ? <TimelineSkeleton /> : null}

          {!isLoading && (!data || data.length === 0) ? (
            <div className="text-muted text-center py-24">
              <div className="w-16 h-16 rounded-full bg-surface-hi flex items-center justify-center mx-auto mb-6 border border-hi">
                <Activity className="w-8 h-8 opacity-40 text-muted" />
              </div>
              <p className="text-lg font-bold text-text mb-1">No transactions found</p>
              <p className="text-sm">
                {activeFilterCount > 0
                  ? 'Try adjusting your filters or search terms.'
                  : 'No transaction history available yet.'}
              </p>
            </div>
          ) : null}

          {!isLoading && data && data.length > 0 ? (
            <div className="space-y-4">
              {data.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-hi p-5 hover:bg-surface-hi/40 transition-all hover:scale-[1.005] group"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="px-2 py-1 rounded-md text-[10px] font-bold border border-hi text-muted uppercase tracking-widest bg-surface">
                        {item.badge}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusClass(item.status)}`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-muted uppercase tracking-wider">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <p className="text-base font-bold text-text group-hover:text-accent transition-colors">
                        {item.label}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold text-muted uppercase tracking-widest">
                          Actor:
                        </span>
                        <span className="text-xs font-mono text-text bg-surface px-1.5 py-0.5 rounded border border-hi">
                          {item.actor}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-text">
                        {item.amount} <span className="text-accent2 text-sm">{item.asset}</span>
                      </p>
                    </div>
                  </div>

                  {item.txHash ? (
                    <div className="mt-4 pt-4 border-t border-hi/50 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-muted truncate max-w-[70%]">
                        {item.txHash}
                      </span>
                      <a
                        href={`https://stellar.expert/explorer/public/tx/${item.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-bold text-accent hover:underline uppercase tracking-widest"
                      >
                        View Expert
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {!isLoading && hasMore ? (
            <div className="mt-8 mb-4 flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={isLoadingMore}
                className="px-8 py-3 rounded-xl bg-accent text-bg font-bold text-sm shadow-lg shadow-accent/20 hover:scale-105 transition-transform disabled:opacity-70"
              >
                {isLoadingMore ? 'Loading data...' : 'Load older records'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
