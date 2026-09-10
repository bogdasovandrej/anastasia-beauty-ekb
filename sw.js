/* Служебный работник планера.
   Задача одна: чтобы страница открывалась мгновенно и работала без сети.
   Саму страницу и оформление держим в кэше и отдаём сразу, а обновление
   подтягиваем в фоне. Запросы к серверу через кэш не идут — их данные
   планер сам складывает в память телефона. */
var CACHE = 'mk-planer-v1';
var FILES = ['planer.html', 'manifest.webmanifest', 'images/logo.jpg', 'favicon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
      return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;   // данные с сервера не кэшируем
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var live = fetch(e.request).then(function (r) {
        if (r && r.ok) caches.open(CACHE).then(function (c) { c.put(e.request, r.clone()); });
        return r;
      }).catch(function () { return hit; });
      return hit || live;   // есть в кэше — отдаём сразу, обновляем следом
    }),
  );
});
