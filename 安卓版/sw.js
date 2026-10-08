/* 每日分支记录器 —— Service Worker
   目标只有一个：装在手机主屏之后，断网也能打开、能继续记。
   策略：
   · 应用外壳（本页 + 图标 + 清单）走 cache-first，打开就秒出，不卡网。
   · 导航请求（点图标进应用）一律回落到缓存的 index.html，
     这样离线点开不会出现「找不到网页」。
   · 只处理同源 GET。用户的记录存在 localStorage 里，不经过这里，
     所以缓存策略不会碰数据，也不会出现「换了版本记录没了」。
   版本号改动 = 重新预热缓存 + 清掉旧缓存。v2：修掉手势收尾与双指降级后的
   外壳更新，老用户重开一次就会拿到新版本。
   v3：卡片支持放多张图片（数据结构 img → imgs 数组）+ 新建分支会平滑腾地方。
   v4：接入云同步（电脑和手机一个账号）——外壳多缓存一份 wbcloud-sdk.js，
       断网时同步功能自己关掉，记录照旧存在本机。
   v5：手机端改成「列表优先」——一列大卡片、点一下从底部弹出编辑面板、
       上下滑换天，画布退成「看树」页签。记录的数据结构没动。 */
const VERSION = 'v5-20261008';
const CACHE = 'branch-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './wbcloud-sdk.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    /* 逐个 add：任何一个 404 都不该让整次安装失败 */
    await Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
