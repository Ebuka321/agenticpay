'use client';

import { useOfflineStatus } from './offline/OfflineProvider';

export function SyncStatusIndicator() {
  const { isOnline, queueLength, isSyncing, conflicts } = useOfflineStatus();

  if (isOnline && queueLength === 0) {
    return null;
  }

  return (
    <div
      className={`sync-status-indicator ${
        !isOnline
          ? 'offline'
          : isSyncing
          ? 'syncing'
          : queueLength > 0
          ? 'pending'
          : 'idle'
      }`}
      role="status"
      aria-live="polite"
    >
      {!isOnline && (
        <div className="status-badge offline">
          <span className="status-icon">○</span>
          <span className="status-text">Offline</span>
        </div>
      )}

      {isSyncing && (
        <div className="status-badge syncing">
          <span className="status-icon animate-spin">↻</span>
          <span className="status-text">Syncing...</span>
        </div>
      )}

      {queueLength > 0 && isOnline && !isSyncing && (
        <div className="status-badge pending">
          <span className="status-icon">{queueLength}</span>
          <span className="status-text">
            {queueLength} queued action{queueLength === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {conflicts > 0 && (
        <div className="status-badge conflict">
          <span className="status-icon">⚠</span>
          <span className="status-text">
            {conflicts} conflict{conflicts === 1 ? '' : 's'}
          </span>
        </div>
      )}
    </div>
  );
}

export default SyncStatusIndicator;