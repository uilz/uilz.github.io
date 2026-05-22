const CACHE_NAME = 'fruitninja-v1';

const PRECACHE_ASSETS = [
    './',
    './index.html'
];

const CDN_PREFIXES = [
    'https://cdn.jsdelivr.net/',
    'https://fastly.jsdelivr.net/',
    'https://unpkg.com/',
    'https://fonts.googleapis.com/',
    'https://fonts.gstatic.com/'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('SW: 预缓存失败', err);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    const isCdn = CDN_PREFIXES.some((p) => url.href.startsWith(p));
    const isLocal = url.origin === self.location.origin;

    if (!isCdn && !isLocal) return;

    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(() => {
                return new Response('离线不可用', { status: 503 });
            });
        })
    );
});
