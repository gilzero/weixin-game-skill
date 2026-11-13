# Assets and network

Last verified against the official docs: 2026-11-13.

## Package strategy

Keep only what the first screen needs in the 4MB main package. Put levels in subpackages, and download large or
frequently changing assets from a CDN after launch. [All packages together are capped at 30MB](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.md).

Only [whitelisted file extensions](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.md)
upload. Others load fine in DevTools and then go missing from the uploaded package, which is an easy way to ship a broken
build. `wasm` and `br` (Brotli, e.g. `.wasm.br`) are whitelisted, whereas `webp` is not; `*.js` and `game.json` are
compiled and cannot be read as raw files after upload.

## Subpackages

Declare them in `game.json`. A directory's `game.js` is its entry point, and anything not declared goes into the main
package:

```json
{
  "subpackages": [{ "name": "stage1", "root": "stage1/" }]
}
```

Declaring a subpackage does not load it. The game has to request it:

```js
const loadTask = wx.loadSubpackage({
  name: 'stage1',
  success() {
    startStage();
  },
  fail(error) {
    showRetry(error);
  },
  complete() {
    hideProgress();
  },
});
loadTask.onProgressUpdate(result => drawProgress(result.progress));
```

- The API page marks `success`, `fail` and `complete` as required, so pass all three.
- `wx.preDownloadSubpackage` (base library 3.4.9) downloads without running, and `wx.loadSubpackage` runs it later.
- In `game.json`, [`parallelPreloadSubpackages`](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-start-parallel-download.md)
  (`[{ "name": "stage1" }]`) downloads listed subpackages in parallel with the main package during cold start on released
  builds, and [`preloadPackages`](https://developers.weixin.qq.com/minigame/dev/guide/performance/predownload-of-minigame-packages.md)
  (WeChat 8.0.70+ on iOS and Android) pre-downloads subpackages conditionally by `system` and `query` rules.
- [Independent subpackages](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/independent-sub-packages.md)
  (2.12.1, 4MB) start without downloading the main package, so a share card can open a leaderboard quickly. Pass their
  path as `path` when sharing.
- The open data context directory cannot be a subpackage or sit inside one.
- Worker code counts toward the main package unless [configured as a subpackage](performance.md#workers).

## Downloading and caching

```js
const fileSystem = wx.getFileSystemManager();
const pendingImages = new Map();
const cacheUrls = new Map();

// cacheKey is an immutable versioned filename from the asset manifest.
function loadCachedImage(url, cacheKey) {
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(cacheKey)) return Promise.reject(new Error('Invalid cache key'));
  if (cacheUrls.has(cacheKey) && cacheUrls.get(cacheKey) !== url)
    return Promise.reject(new Error('Cache key reused for another URL'));
  cacheUrls.set(cacheKey, url);
  if (pendingImages.has(cacheKey)) return pendingImages.get(cacheKey);
  const cachedPath = `${wx.env.USER_DATA_PATH}/${cacheKey}`;
  const task = new Promise((resolve, reject) => {
    function discard(path, error) {
      fileSystem.unlink({
        filePath: path,
        success: () => reject(error),
        fail: cleanupError => {
          console.error('cache staging cleanup failed', cleanupError);
          reject(error);
        },
      });
    }
    fileSystem.access({
      path: cachedPath,
      success: () => resolve(cachedPath),
      fail: () =>
        wx.downloadFile({
          url,
          success: result => {
            const temporaryPath = result.tempFilePath;
            if (result.statusCode !== 200) {
              discard(temporaryPath, new Error(`Image download HTTP ${result.statusCode}`));
              return;
            }
            const image = wx.createImage();
            image.onerror = () => discard(temporaryPath, new Error('Downloaded image cannot be decoded'));
            image.onload = () =>
              fileSystem.rename({
                oldPath: temporaryPath,
                newPath: cachedPath,
                success: () => resolve(cachedPath),
                fail: error => discard(temporaryPath, error),
              });
            image.src = temporaryPath;
          },
          fail: reject,
        }),
    });
  });
  const sharedTask = task.finally(() => pendingImages.delete(cacheKey));
  pendingImages.set(cacheKey, sharedTask);
  return sharedTask;
}
```

Use a new manifest key when content changes, including across launches; do not reuse a key for another URL.
Concurrent loads share one promise. The temporary download is checked for HTTP success and image decoding before
[rename](https://developers.weixin.qq.com/minigame/dev/api/file/FileSystemManager.rename.md) promotes it. Rejected
staging files are [removed](https://developers.weixin.qq.com/minigame/dev/api/file/FileSystemManager.unlink.md).
For larger pipelines, add integrity checks, bounded eviction and low-storage recovery; preserve assets used by the
currently running version. Engine projects should use their engine cache instead.

From the [file system guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.md):

- Temporary files only last for the current run, so never store a temporary path for next time.
- `wx.env.USER_DATA_PATH` is the only directory you can freely write to. Cached and user files share a 200MB limit; a
  qualifying game can apply for **1GB** in MP (`功能 → 游戏能力地图 → 研发能力 → 生产提效包 → 空间提升`,
  [disk space guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/diskspace.md)), but low device
  storage evicts caches at **whole-game granularity**.
- Do not hardcode local file protocols. They differ between phones (`wxfile://`) and DevTools (`http://`).
- Package files cannot be changed at runtime, and paths must not start with `./` or `../`.
- Version your cached file names, or players keep stale assets after an update.

## Cold-start data pre-fetch

[Data pre-fetch](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/pre-fetch.md) (`开发管理 → 开发设置 → 数据预加载`)
fetches a string payload of at most **256KB** while the cold-start package downloads. Individual accounts only support
CloudBase; business accounts support HTTPS or CloudBase. A rollout percentage cannot be lowered once raised (`0%` tests
developers/experiencers only). Read with [`wx.getBackgroundFetchData`](https://developers.weixin.qq.com/minigame/dev/api/storage/background-fetch/wx.getBackgroundFetchData.md)
(`{ fetchType: 'pre' }`) plus [`wx.onBackgroundFetchData`](https://developers.weixin.qq.com/minigame/dev/api/storage/background-fetch/wx.onBackgroundFetchData.md),
and optionally set [`wx.setBackgroundFetchToken`](https://developers.weixin.qq.com/minigame/dev/api/storage/background-fetch/wx.setBackgroundFetchToken.md)
after login.

[Periodic update](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/background-fetch.md) (2.8.0,
`数据周期性更新` in the same settings page) is the companion for returning players: for anyone who used the game within
7 days, the client fetches the configured URL about every 12 hours, even while the game is closed, with `appid`, `token`
and `timestamp` query parameters. The same 256KB string limit and one-way rollout percentage apply. Read it with
`wx.getBackgroundFetchData({ fetchType: 'periodic' })` (`fetchedData`, `timeStamp`), and treat both payloads as a cache
hint that may be missing or stale, never as authoritative state. DevTools has a debug panel for it, since waiting 12
hours is impractical.

## Official plugins

Mini games [cannot publish their own plugins](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/plugins.md);
only official ones are available (social components, the cover-image loader, the open data rendering library, BLE Mesh,
the Unity plugin and the Cocos Creator, LayaAir and Egret engine plugins). Add the plugin in the MP console first, then
declare it and load it with [`requirePlugin`](https://developers.weixin.qq.com/minigame/dev/reference/api/requirePlugin.md):

```json
{
  "plugins": {
    "MinigameLoading": {
      "version": "latest",
      "provider": "wxbd990766293b9dc4",
      "contexts": [{ "type": "isolatedContext" }]
    }
  }
}
```

- The key is your own reference name, `provider` is the plugin's AppID, and `contexts` is only for isolated-context plugins.
- Plugin code does not count toward the game's package size. The example above is the
  [cover-image plugin](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-start-loading-plugin.md),
  which draws a first frame without the engine while the game's own code loads from a subpackage.
- Read each plugin's own page for its API. Engine plugins are covered in [engines](engines.md#official-routes).

## Local storage

```js
wx.setStorageSync('save', { level: 5 });
const save = wx.getStorageSync('save') || { level: 1 };
```

- [1MB per key and 10MB in total](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.setStorage.md), isolated
  per user and per game. Writes can throw when full, so catch and log them.
- Local storage is cleared with the code package, so keep anything valuable on a server.
- For in-memory binary blobs, [`wx.createBufferURL`](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.createBufferURL.md)
  (2.14.0) exposes an `ArrayBuffer` or TypedArray as a memory URL; call `wx.revokeBufferURL(url)` as soon as loading
  completes so native memory is released.
- Global `TextEncoder` and `TextDecoder` are not part of the runtime baseline; use [`wx.encode`](https://developers.weixin.qq.com/minigame/dev/api/util/wx.encode.md)
  and [`wx.decode`](https://developers.weixin.qq.com/minigame/dev/api/util/wx.decode.md). In iOS High Performance and High
  Performance+ modes, `wx.encode` supports `format: 'utf-8'` only.

## Network

From the [network guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.md):

- Every domain must be registered in the MP console, under 开发, 开发设置, 服务器域名, separately for request, socket,
  upload and download.
- Only `https` and `wss` are allowed. Domains must have ICP filing, and IP addresses and localhost are rejected.
- A port is part of the match: a domain registered without a port rejects URLs that include one, even `:443`.
- `api.weixin.qq.com` cannot be called from the client. Call it from your server, which is the only place AppSecret may
  live.
- [`wx.request`](https://developers.weixin.qq.com/minigame/dev/api/network/request/wx.request.md) succeeds on any HTTP
  status, so check `statusCode` in `success`.
- `referer` is fixed by the platform and cannot be set.
- Domain checks can be switched off in DevTools with `urlCheck: false`, but that only affects the simulator. A game that
  works only with it off will fail for players.
- [微信云托管](https://cloud.weixin.qq.com/cloudrun) lets a game call its backend without registering domains.

For network features, bound retries with backoff and cancel owned tasks on scene disposal. Retry reads safely; retry
mutations only with server idempotency keys. Treat background interruption and reconnect as explicit states, and surface
terminal failures rather than retrying forever.

### WebSockets

```js
/** @param {string} url */
function openGameSocket(url) {
  const socketTask = wx.connectSocket({ url, fail: error => console.error('socket call failed', error) });
  // Register listeners in the same tick, or the open event can be missed.
  socketTask.onOpen(() => socketTask.send({ data: JSON.stringify({ type: 'hello' }) }));
  socketTask.onMessage(result => handleServerMessage(result.data));
  socketTask.onError(error => console.error('socket error', error));
  socketTask.onClose(result => scheduleReconnect(result.code));
  return socketTask;
}
```

From the [network tuning guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-network.md):

- Keep the [`SocketTask`](https://developers.weixin.qq.com/minigame/dev/api/network/websocket/SocketTask.md) returned by
  [`wx.connectSocket`](https://developers.weixin.qq.com/minigame/dev/api/network/websocket/wx.connectSocket.md) and use only
  its methods. Apart from `wx.connectSocket` itself, the guide says not to use the global socket functions
  (`wx.sendSocketMessage`, `wx.onSocketOpen` and the rest), which predate multiple connections.
- `success` and `fail` on `wx.connectSocket` only report whether the call was accepted. Connection state arrives through
  the task events. For `wx.request`, `wx.downloadFile` and `wx.uploadFile` the callbacks are the final network result.
- `wss` belongs on port 443. `perMessageDeflate` (2.8.0) turns on compression and `timeout` (2.10.0) is in milliseconds.
- Close the task when leaving the scene and on `wx.onHide` if the game cannot use it in the background; reconnect with
  backoff on return rather than in a tight loop.

### HTTP options and failures

- [`wx.request`](https://developers.weixin.qq.com/minigame/dev/api/network/request/wx.request.md) and `wx.downloadFile`
  accept `enableHttp2`, `enableQuic` and `enableCache` (Android WeChat 7.0.12, iOS 8.0.3). HTTP/2 header names must be
  lowercase, so check server and client code before enabling it.
- `not in domain url` has four documented causes: the URL is not registered, a **redirect target** is not registered,
  a WebSocket port is not registered, or (rarely) a new domain setting has not taken effect yet.
- An incomplete certificate chain fails on Android phones that lack the intermediate's root. Serve the full chain.
- On iOS 14 and later, `network is down` can mean the system local-network switch is off. No API detects it, so tell
  the player what to enable.
- Use [`wx.onNetworkStatusChange`](https://developers.weixin.qq.com/minigame/dev/api/device/network/wx.onNetworkStatusChange.md)
  to tell "offline" apart from a slow server.
- In [platform performance ratings](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-audit/perf-system-rating-rule.md),
  HTTP `400–599` responses on `wx.request` and `wx.downloadFile` count directly toward `Request失败率` and
  `Download失败率` (weight `6` each). Avoid using `404` or `409` responses for routine cache or state probes.

### Weak network, offline mode and encrypted channels

- Detect weak networks with [`wx.onNetworkWeakChange`](https://developers.weixin.qq.com/minigame/dev/api/device/network/wx.onNetworkWeakChange.md)
  (base library 2.21.0, `{ weakNet, networkType }`; remove with `wx.offNetworkWeakChange`) to pause non-essential polling
  or warn the player. The client flags a weak network when, among the last eight requests, three or more connections
  time out, three have `rtt` above 400, or three or more lose packets; it notifies at once on a change and at most
  every 30 seconds otherwise. Do **not** call `wx.createCacheManager` from the shared
  [weak-network guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/weak-network.md): it is a mini
  program API absent from the mini game API index.
- **Offline mode** (base library 3.16.0): [`wx.onOfflineModeStateChange`](https://developers.weixin.qq.com/minigame/dev/api/offline-mode/wx.onOfflineModeStateChange.md)
  (paired with `wx.offOfflineModeStateChange`) notifies when platform offline mode toggles, and callback-only
  [`wx.enableOfflineModeDebug`](https://developers.weixin.qq.com/minigame/dev/api/offline-mode/wx.enableOfflineModeDebug.md)
  simulates offline mode in development and trial builds unless server-configured.
- [HTTPDNS](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/HTTPDNS.md) (2.19.2, purchased in WeChat
  Service Market) avoids carrier Local DNS hijacking via `wx.request({ url, enableHttpDNS: true, httpDNSServiceId })`.
  Check [`wx.getNetworkType`](https://developers.weixin.qq.com/minigame/dev/api/device/network/wx.getNetworkType.md)
  (`res.hasSystemProxy`, WeChat 8.0.17+) and disable `enableHttpDNS` when a system proxy is active to avoid
  `ERR_PROXY_CONNECTION_FAILED` (`errno: 600001`) on older runtimes. When quota reaches zero (`errno: 602103`), WeChat
  falls back to Local DNS.
- **HTTPS encrypted channel** ([guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/user-encryptkey.md),
  base library 2.17.3): [`wx.getUserCryptoManager`](https://developers.weixin.qq.com/minigame/dev/api/base/crypto/wx.getUserCryptoManager.md)
  (`getLatestUserKey` returning `{ encryptKey, iv, version, expireTime }`, plus `getRandomValues`) pairs with server
  `getUserEncryptKey` (returns the player's last three versioned keys) so sensitive `wx.request` payloads can be AES
  encrypted and HMAC-signed against replay or tampering; bring your own AES implementation on client and server.
