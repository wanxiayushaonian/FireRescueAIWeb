/**
 * 跨域静态资产缓存 Service Worker(方案④:场景包/地图瓦片缓存,二次进入秒开)
 *
 * 策略:
 *  - 仅处理「跨域 + GET」请求;应用自身资源(Next/同源)完全放行,交给 HTTP 缓存。
 *  - 命中资产缓存 → 直接回缓存(stale-while-revalidate,后台刷新不阻塞渲染)。
 *  - 未命中 → 网络优先;成功的大响应(二进制扩展名 / >1MB / 二进制 content-type)写入缓存。
 *  - 网络失败时兜底回缓存。
 *
 * 不缓存:POST(API 调用)、Range 分段请求、非 200 响应、同源资源。
 */
const ASSET_CACHE = 'fire-rescue-scene-assets-v1';
const MIN_ASSET_BYTES = 1_000_000; // 场景包动辄数 MB;地图瓦片/接口 JSON 通常远小于此

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** 是否值得进资产缓存:二进制扩展名 / 大体积 / 二进制 content-type */
function isAssetResponse(request, response) {
  if (!response || response.status !== 200) return false;
  const url = request.url.toLowerCase();
  if (/\.(glb|gltf|bin|gz|zip|bz2|drc|kmz|draco)(\?|$)/.test(url)) return true;
  const contentType = response.headers.get('content-type') || '';
  const length = Number(response.headers.get('content-length') || 0);
  return length > MIN_ASSET_BYTES || /octet-stream|model\/|application\/(gzip|x-gzip|zip)/.test(contentType);
}

async function refresh(request) {
  try {
    const response = await fetch(request);
    if (isAssetResponse(request, response)) {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
    }
  } catch {
    /* 后台刷新失败忽略,下次请求再试 */
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) return; // 同源资源放行

  event.respondWith(
    (async () => {
      // 命中缓存(非 Range 请求):直接回 + 后台刷新
      const cached = await caches.match(request, { cacheName: ASSET_CACHE });
      if (cached && !request.headers.has('range')) {
        event.waitUntil(refresh(request));
        return cached;
      }
      // 未命中:网络优先,成功的大响应写缓存
      try {
        const response = await fetch(request);
        if (isAssetResponse(request, response)) {
          event.waitUntil(
            (async () => {
              try {
                const cache = await caches.open(ASSET_CACHE);
                await cache.put(request, response.clone());
              } catch {
                /* 写入失败忽略 */
              }
            })(),
          );
        }
        return response;
      } catch (error) {
        const fallback = await caches.match(request);
        if (fallback) return fallback;
        throw error;
      }
    })(),
  );
});
