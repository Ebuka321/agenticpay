'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  flushOfflineQueue,
  getQueuedActionCount,
  subscribeToOfflineQueue,
  getOfflineAnalytics,
} from '@/lib/offline';
import { resolveApiUrl } from '@/lib/api/client';

interface OfflineContextValue {
  isOnline: boolean;
  queueLength: number;
  isSyncing: boolean;
  conflicts: number;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  queueLength: 0,
  isSyncing: false,
  conflicts: 0,
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [queueLength, setQueueLength] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conflicts, setConflicts] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncQueueState = async () => {
      setIsOnline(window.navigator.onLine);
      setQueueLength(await getQueuedActionCount());
      const analytics = await getOfflineAnalytics({ type: 'conflict', limit: 100 });
      setConflicts(analytics.length);
    };

    const flushQueuedActions = async () => {
      if (!window.navigator.onLine) {
        return;
      }

      const pendingActions = await getQueuedActionCount();
      if (pendingActions === 0) {
        await syncQueueState();
        return;
      }

      setIsSyncing(true);
      toast.info(`Back online. Syncing ${pendingActions} queued action${pendingActions === 1 ? '' : 's'}...`);

      const result = await flushOfflineQueue(resolveApiUrl);

      setIsSyncing(false);
      await syncQueueState();

      if (result.processed > 0) {
        toast.success(`Synced ${result.processed} queued action${result.processed === 1 ? '' : 's'}.`);
      }

      if (result.conflicts > 0) {
        toast.info(`Resolved ${result.conflicts} conflict${result.conflicts === 1 ? '' : 's'}.`);
      }

      if (result.remaining > 0) {
        toast.error(`${result.remaining} queued action${result.remaining === 1 ? '' : 's'} still need attention.`);
      }
    };

    syncQueueState();

    const handleOnline = () => {
      void syncQueueState();
      void flushQueuedActions();
    };

    const handleOffline = () => {
      void syncQueueState();
      toast.warning('You are offline. New API actions will be queued until the connection returns.');
    };

    const unsubscribe = subscribeToOfflineQueue(() => void syncQueueState());
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (window.navigator.onLine) {
      void flushQueuedActions();
    }

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const value = useMemo(
    () => ({
      isOnline,
      queueLength,
      isSyncing,
      conflicts,
    }),
    [isOnline, isSyncing, queueLength, conflicts]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOfflineStatus() {
  return useContext(OfflineContext);
}
