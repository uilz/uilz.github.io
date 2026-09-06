'use strict';
// 伴记壳缓存（构建生成，勿手改——源在 apps/banji/scripts/swPlugin.ts）。
// 只伺候本机同源的壳文件；IndexedDB 与数据从不过这道门。
var VERSION = "634bc0916bb9";
var CACHE = 'banji-shell-' + VERSION;
var PRECACHE = ["./","index.html","assets/index-CHMjn8MX.css","assets/index-DXRW-GCa.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.json"];
var PRECACHE_HREFS = PRECACHE.map(function (p) { return new URL(p, self.location).href; });

self.addEventListener('install', function (event) {
  // addAll 全有或全无：清单里缺一个字节就不装——旧壳继续在岗，宁可不换新，不带病上岗。
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(PRECACHE); }));
  // 不 skipWaiting：新版本安静候着，下次冷启动自然接管。纸册不催更。
});

self.addEventListener('activate', function (event) {
  // 只清自家前缀的旧壳缓存。已开页面手上的旧资产走浏览器 HTTP 缓存与内存，不回头要账；
  // 本壳无懒加载分片（单 bundle），构造上不存在“半路资产被删”的断头路。
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) {
      return n.indexOf('banji-shell-') === 0 && n !== CACHE;
    }).map(function (n) { return caches.delete(n); }));
  }));
  // 不 clients.claim：把没被伺候过的页面硬拉进新壳，是催更之外的第二桩不安静。
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 册外之事，概不代理

  if (req.mode === 'navigate') {
    // 在线永远先取真页（cache:'reload' 连浏览器 HTTP 缓存都不信——旧壳指新页、新页指旧壳
    // 的经典砖法，第一步就被这行掐死）；断网才落回本版本壳里自洽的快照。
    event.respondWith(fetch(req, { cache: 'reload' }).catch(function () {
      return caches.open(CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return cache.match('index.html').then(function (shell) {
            if (!shell) throw new Error('banji: 本机还没有存档的壳（首开需要一次网络）');
            return shell;
          });
        });
      });
    }));
    return;
  }

  if (PRECACHE_HREFS.indexOf(url.href) === -1) return; // 册外资源：不碰、不缓存、放行
  event.respondWith(caches.match(req).then(function (hit) {
    // 命中即缓存优先（哈希名=内容不可变）；未命中直连网络且不回填——运行时缓存永不生长，
    // 旧壳带新页在线照常开机，砖就没有可乘之机。
    return hit || fetch(req);
  }));
});
