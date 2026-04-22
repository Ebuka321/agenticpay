import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Text } from '@stellar/design-system';
import { getTxExplorerUrl } from '../utils/stellarExpert';

export interface PendingTransaction {
  id: string;
  type: string;
  status: 'pending' | 'confirmed' | 'failed';
  hash?: string;
  timestamp: number;
  description?: string;
}

interface TransactionPendingOverlayProps {
  transactions: PendingTransaction[];
  onDismiss?: (id: string) => void;
}

export const TransactionPendingOverlay: React.FC<TransactionPendingOverlayProps> = ({
  transactions,
  onDismiss,
}) => {
  const [visible, setVisible] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setVisible((prev) => {
      const newVisible = { ...prev };
      let hasChanges = false;

      transactions.forEach((tx) => {
        if (!(tx.id in prev)) {
          newVisible[tx.id] = true;
          hasChanges = true;
        }
      });

      return hasChanges ? newVisible : prev;
    });
  }, [transactions]);

  const handleDismiss = (id: string) => {
    setVisible((prev) => ({ ...prev, [id]: false }));
    setTimeout(() => {
      onDismiss?.(id);
    }, 300);
  };

  const visibleTransactions = transactions.filter((tx) => visible[tx.id]);

  if (visibleTransactions.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-md w-full pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label="Transaction notifications"
    >
      {visibleTransactions.map((tx) => (
        <div
          key={tx.id}
          className={`pointer-events-auto rounded-xl border border-[var(--border-hi)] bg-[var(--surface)] backdrop-blur-xl shadow-2xl transition-all duration-300 ${
            visible[tx.id] ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
          }`}
          style={{
            background: 'color-mix(in srgb, var(--surface) 95%, transparent)',
          }}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Status Icon */}
              <div className="shrink-0 mt-0.5">
                {tx.status === 'pending' && (
                  <Loader2
                    className="h-5 w-5 text-[var(--accent)] animate-spin"
                    aria-hidden="true"
                  />
                )}
                {tx.status === 'confirmed' && (
                  <CheckCircle2 className="h-5 w-5 text-[var(--success)]" aria-hidden="true" />
                )}
                {tx.status === 'failed' && (
                  <XCircle className="h-5 w-5 text-[var(--danger)]" aria-hidden="true" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <Text as="p" size="sm" weight="bold" addlClassName="text-[var(--text)] mb-1">
                  {tx.status === 'pending' && 'Transaction Pending'}
                  {tx.status === 'confirmed' && 'Transaction Confirmed'}
                  {tx.status === 'failed' && 'Transaction Failed'}
                </Text>
                <Text as="p" size="xs" addlClassName="text-[var(--muted)] mb-2 line-clamp-2">
                  {tx.description || `${tx.type} transaction`}
                </Text>

                {tx.hash && (
                  <a
                    href={getTxExplorerUrl(tx.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent2)] transition-colors"
                  >
                    <span>View on Explorer</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>

              {/* Dismiss Button */}
              {tx.status !== 'pending' && (
                <button
                  type="button"
                  onClick={() => handleDismiss(tx.id)}
                  className="shrink-0 rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)] hover:bg-white/5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label="Dismiss notification"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Progress Bar for Pending */}
            {tx.status === 'pending' && (
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--border-hi)]">
                <div
                  className="h-full bg-[var(--accent)] animate-pulse"
                  style={{
                    width: '60%',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
