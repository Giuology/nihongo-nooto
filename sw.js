/* Service Worker do Caderninho de Nihongo
   Estratégia:
   - Pré-cache do "app shell" (HTML, manifest, ícones) na instalação.
   - Navegação (HTML): network-first, caindo para o cache se offline.
   - Estáticos same-origin: cache-first com revalidação em background.
   - Fontes do Google: stale-while-revalidate.
   - Requisições cross-origin que não sejam fontes: passa direto (não intercepta).
*/

const VERSION = 'v16';
const APP_CACHE = 'nihongo-app-' + VERSION;
const RUNTIME_CACHE = 'nihongo-runtime-' + VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL).catch(() => {
        // Se algum ícone faltar, não falha a instalação inteira:
        // tenta adicionar um por um, ignorando os que derem 404.
        return Promise.all(APP_SHELL.map(url =>
          cache.add(url).catch(() => null)
        ));
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== APP_CACHE && k !== RUNTIME_CACHE)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isGoogleFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navegação (abrir o app): network-first, fallback para o shell em cache.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(APP_CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Fontes do Google: stale-while-revalidate.
  if (isGoogleFont(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Same-origin: cache-first com atualização em background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Outras origens: deixa o navegador lidar normalmente.
});
