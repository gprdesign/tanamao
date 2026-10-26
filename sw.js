const CACHE_NAME = 'tnm-weekly-v114';
const APP_FILES = ['./','./index.html','./config.js?v=3','./app.js?v=155','./manifest.webmanifest?v=3','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./favicon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request,copy));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || caches.match('./index.html')));
});
