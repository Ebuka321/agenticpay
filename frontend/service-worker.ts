const serviceWorkerSource = `
const SHELL_CACHE = 'agenticpay-shell-v2';
const RUNTIME_CACHE = 'agenticpay-runtime-v2';
const OFFLINE_INDICATOR_CACHE = 'agenticpay-offline-v1';
const APP_SHELL_URLS = [
  '/',
  '/auth',
  '/dashboard',
  '/manifest.webmanifest',
  '/icons/image-192.png',
  '/icons/image-512.png',
  '/offline',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)),
      caches.open(OFFLINE_INDICATOR_CACHE).then((cache) => 
        cache.put('/offline', new Response('<html><body><h1>Offline</h1><p>You are currently offline. Your actions will be synced when the connection is restored.</p></body></html>', { 
          headers: { 'Content-Type': 'text/html' } 
        }))
      ),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE && key !== OFFLINE_INDICATOR_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function setupOfflineIndicator() {
  if ('ononline' in window) return;
  
  const originalOnOnline = window.ononline;
  const originalOnOffline = window.onoffline;
  
  window.addEventListener('online', () => {
    const event = new CustomEvent('agenticpay:online');
    window.dispatchEvent(event);
  });
  
  window.addEventListener('offline', () => {
    const event = new CustomEvent('agenticpay:offline');
    window.dispatchEvent(event);
  });
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    return caches.match('/');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    ['script', 'style', 'image', 'font'].includes(request.destination) ||
    APP_SHELL_URLS.includes(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'agenticpay-sync') {
    event.waitUntil(syncOfflineQueue());
  }
});

async function syncOfflineQueue() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('offline-queue', 'readonly');
    const store = tx.objectStore('offline-queue');
    const actions = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!actions || actions.length === 0) {
      return;
    }

    for (const action of actions) {
      try {
        const response = await fetch(self.location.origin + action.endpoint, {
          method: action.method,
          headers: {
            ...action.headers,
            'X-AgenticPay-Offline-Replay': 'true',
            'X-AgenticPay-Action-ID': action.id,
          },
          body: action.body,
        });

        if (response.ok || response.status === 409) {
          const deleteTx = db.transaction('offline-queue', 'readwrite');
          const deleteStore = deleteTx.objectStore('offline-queue');
          deleteStore.delete(action.id);
        }
      } catch {
        break;
      }
    }

    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'OFFLINE_SYNC_COMPLETE' });
    });
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('agenticpay-offline-db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    syncOfflineQueue();
  }
});
`;

export default serviceWorkerSource;
