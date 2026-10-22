const CACHE_NAME = 'condo-store-v6';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/manifest.json'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
            );
        })
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // Only intercept same-origin GET requests that are not API calls
    if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin) || e.request.url.includes('/api/')) {
        return;
    }
    // Network-first strategy
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
