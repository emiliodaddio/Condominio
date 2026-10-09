const CACHE_NAME = 'condo-store-v5'; // Bump version

self.addEventListener('install', (e) => {
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll([
            '/',
            '/index.html',
            '/login.html',
            '/style.css',
            '/app.js'
        ]))
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
    if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
        return fetch(e.request);
    }
    // Network first strategy
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
