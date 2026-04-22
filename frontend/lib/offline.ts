const OFFLINE_QUEUE_STORAGE_KEY = 'agenticpay-offline-queue';
const OFFLINE_QUEUE_DB_NAME = 'agenticpay-offline-db';
const OFFLINE_QUEUE_STORE_NAME = 'offline-queue';
const OFFLINE_QUEUE_EVENT = 'agenticpay:offline-queue-updated';
const OFFLINE_ANALYTICS_STORE_NAME = 'offline-analytics';

export interface QueuedAction {
  id: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  createdAt: string;
  syncedAt?: string;
  retryCount: number;
}

export interface OfflineAnalyticsEvent {
  id: string;
  type: 'queued' | 'synced' | 'failed' | 'conflict';
  actionId: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

let db: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(OFFLINE_QUEUE_STORE_NAME)) {
        const queueStore = database.createObjectStore(OFFLINE_QUEUE_STORE_NAME, {
          keyPath: 'id',
        });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
        queueStore.createIndex('syncedAt', 'syncedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(OFFLINE_ANALYTICS_STORE_NAME)) {
        const analyticsStore = database.createObjectStore(OFFLINE_ANALYTICS_STORE_NAME, {
          keyPath: 'id',
        });
        analyticsStore.createIndex('timestamp', 'timestamp', { unique: false });
        analyticsStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

export class OfflineActionQueuedError extends Error {
  endpoint: string;
  actionId: string;

  constructor(message: string, endpoint: string, actionId: string) {
    super(message);
    this.name = 'OfflineActionQueuedError';
    this.endpoint = endpoint;
    this.actionId = actionId;
  }
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function emitQueueUpdate() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
}

async function trackAnalytics(event: Omit<OfflineAnalyticsEvent, 'id' | 'timestamp'>) {
  if (!canUseStorage()) return;

  try {
    const database = await openDB();
    const analyticsEvent: OfflineAnalyticsEvent = {
      ...event,
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: new Date().toISOString(),
    };

    const tx = database.transaction(OFFLINE_ANALYTICS_STORE_NAME, 'readwrite');
    const store = tx.objectStore(OFFLINE_ANALYTICS_STORE_NAME);
    store.add(analyticsEvent);
  } catch {
    // Silently fail analytics tracking
  }
}

async function readQueue(): Promise<QueuedAction[]> {
  if (!canUseStorage()) {
    return legacyReadQueue();
  }

  try {
    const database = await openDB();
    return new Promise((resolve) => {
      const tx = database.transaction(OFFLINE_QUEUE_STORE_NAME, 'readonly');
      const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const actions = (request.result as QueuedAction[]).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        resolve(actions);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return legacyReadQueue();
  }
}

async function writeQueue(queue: QueuedAction[]) {
  if (!canUseStorage()) {
    return legacyWriteQueue(queue);
  }

  try {
    const database = await openDB();
    const tx = database.transaction(OFFLINE_QUEUE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(OFFLINE_QUEUE_STORE_NAME);

    store.clear();

    for (const action of queue) {
      store.add(action);
    }

    emitQueueUpdate();
  } catch {
    legacyWriteQueue(queue);
  }
}

function legacyReadQueue(): QueuedAction[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function legacyWriteQueue(queue: QueuedAction[]) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }

  window.localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  emitQueueUpdate();
}

export async function getQueuedActions() {
  return readQueue();
}

export async function getQueuedActionCount() {
  const queue = await readQueue();
  return queue.length;
}

export async function subscribeToOfflineQueue(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(OFFLINE_QUEUE_EVENT, listener);

  return () => {
    window.removeEventListener(OFFLINE_QUEUE_EVENT, listener);
  };
}

export async function shouldQueueRequest(options: RequestInit = {}) {
  const method = (options.method || 'GET').toUpperCase();
  return !['GET', 'HEAD'].includes(method);
}

async function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)])
  );
}

export async function queueOfflineAction(endpoint: string, options: RequestInit = {}) {
  const action: QueuedAction = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    endpoint,
    method: (options.method || 'POST').toUpperCase(),
    headers: await normalizeHeaders(options.headers),
    body: typeof options.body === 'string' ? options.body : undefined,
    createdAt: new Date().toISOString(),
    retryCount: 0,
  };

  const queue = await readQueue();
  await writeQueue([...queue, action]);
  await trackAnalytics({ type: 'queued', actionId: action.id });
  return action;
}

export async function removeQueuedAction(actionId: string) {
  const queue = await readQueue();
  await writeQueue(queue.filter((action) => action.id !== actionId));
}

export function isLikelyOfflineError(error: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'TypeError' ||
    /failed to fetch/i.test(error.message) ||
    /networkerror/i.test(error.message)
  );
}

export interface FlushResult {
  processed: number;
  failed: number;
  remaining: number;
  conflicts: number;
}

export async function flushOfflineQueue(resolveApiUrl: (endpoint: string) => string): Promise<FlushResult> {
  const queue = await readQueue();
  let processed = 0;
  let failed = 0;
  let conflicts = 0;

  for (const action of queue) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      break;
    }

    try {
      const response = await fetch(resolveApiUrl(action.endpoint), {
        method: action.method,
        headers: {
          ...action.headers,
          'X-AgenticPay-Offline-Replay': 'true',
          'X-AgenticPay-Action-ID': action.id,
        },
        body: action.body,
      });

      if (response.status === 409) {
        conflicts += 1;
        await trackAnalytics({
          type: 'conflict',
          actionId: action.id,
          details: { status: response.status },
        });
        await removeQueuedAction(action.id);
        continue;
      }

      if (!response.ok) {
        failed += 1;
        await trackAnalytics({
          type: 'failed',
          actionId: action.id,
          details: { status: response.status },
        });
        continue;
      }

      await removeQueuedAction(action.id);
      await trackAnalytics({ type: 'synced', actionId: action.id });
      processed += 1;
    } catch {
      failed += 1;
      await trackAnalytics({
        type: 'failed',
        actionId: action.id,
        details: { error: 'network_error' },
      });
      break;
    }
  }

  return {
    processed,
    failed,
    remaining: await getQueuedActionCount(),
    conflicts,
  };
}

export function registerBackgroundSync(tag: string = 'agenticpay-sync'): boolean {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  navigator.serviceWorker.ready.then((registration) => {
    if ('sync' in registration) {
      (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(tag)
        .then(() => console.log('Background sync registered'))
        .catch((err) => console.warn('Background sync registration failed:', err));
    }
  });

  return true;
}

export async function getOfflineAnalytics(
  options: { limit?: number; type?: OfflineAnalyticsEvent['type'] } = {}
): Promise<OfflineAnalyticsEvent[]> {
  if (!canUseStorage()) return [];

  try {
    const database = await openDB();
    return new Promise((resolve) => {
      const tx = database.transaction(OFFLINE_ANALYTICS_STORE_NAME, 'readonly');
      const store = tx.objectStore(OFFLINE_ANALYTICS_STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        let events = request.result as OfflineAnalyticsEvent[];
        if (options.type) {
          events = events.filter((e) => e.type === options.type);
        }
        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (options.limit) {
          events = events.slice(0, options.limit);
        }
        resolve(events);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
