// 서비스 워커: 앱 파일을 휴대폰에 저장해 두고, 인터넷이 없을 때 저장본으로 실행한다.
// 앱을 수정해서 배포할 때마다 VERSION을 올려야 새 파일로 교체된다 (app.js의 VERSION과 함께).
const VERSION = '1.0.0';
const CACHE = `film-exposure-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './exposure.js',
  './data.js',
  './timer.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' → 브라우저 임시 저장본이 아닌 서버의 최신 파일을 받는다
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('film-exposure-') && k !== CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(
      (hit) => hit || fetch(event.request).catch(() => caches.match('./index.html')),
    ),
  );
});
