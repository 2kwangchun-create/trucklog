/* 아빠장부 오프라인 동작용 서비스 워커
   - 앱 파일은 저장해 두고 바로 띄운 뒤, 인터넷이 되면 뒤에서 새 파일로 바꿔 둡니다.
     (앱을 고쳐서 올리면, 앱을 열 때 새 버전을 받아 바로 바꿔요 — app.js의 Updater)
   - 기록 데이터는 여기서 다루지 않습니다 (휴대폰 저장소 + 클라우드). */
const VERSION = '1.12.0';
const SHELL = 'trucklog-shell-' + VERSION;
const RUNTIME = 'trucklog-runtime';
const FILES = ['./', './index.html', './app.js', './firebase-config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './icons/call-one.webp', './icons/call-24.png'];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', e => {
  // cache:'reload' — 휴대폰·GitHub 쪽 임시 저장본이 아니라 방금 올린 파일을 바로 받음
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('trucklog-shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

function staleWhileRevalidate(e, cacheName, matchOpts) {
  e.respondWith(caches.open(cacheName).then(async cache => {
    const hit = await cache.match(e.request, matchOpts);
    const net = fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(e.request, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (e.request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
    return Response.error();
  }));
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === self.location.origin) {
    if (e.request.mode === 'navigate') {
      // 앱 화면: 저장본을 바로 보여주고 뒤에서 갱신
      e.respondWith(caches.open(SHELL).then(async cache => {
        const hit = await cache.match('./index.html');
        const net = fetch(e.request).then(res => { if (res.ok) cache.put('./index.html', res.clone()); return res; }).catch(() => null);
        if (hit) { e.waitUntil(net); return hit; }
        return (await net) || Response.error();
      }));
      return;
    }
    staleWhileRevalidate(e, SHELL, { ignoreSearch: true });
    return;
  }
  if (CDN.includes(url.hostname)) staleWhileRevalidate(e, RUNTIME);
  // 그 외(클라우드 동기화 등)는 손대지 않음
});
