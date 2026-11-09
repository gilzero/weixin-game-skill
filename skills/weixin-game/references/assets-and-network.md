# Assets and network

Last verified against the official docs: 2026-11-09.

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

## Local storage

```js
wx.setStorageSync('save', { level: 5 });
const save = wx.getStorageSync('save') || { level: 1 };
```

- [1MB per key and 10MB in total](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.setStorage.md), isolated
  per user and per game. Writes can throw when full, so catch and log them.
- Local storage is cleared with the code package, so keep anything valuable on a server.

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

### Weak network and HTTPDNS

- Detect weak networks with [`wx.onNetworkWeakChange`](https://developers.weixin.qq.com/minigame/dev/api/device/network/wx.onNetworkWeakChange.md)
  (base library 2.21.0, `{ weakNet, networkType }`; remove with `wx.offNetworkWeakChange`) to pause non-essential polling
  or warn the player. Do **not** call `wx.createCacheManager` from the shared
  [weak-network guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/weak-network.md): it is a mini
  program API absent from the mini game API index.
- [HTTPDNS](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/HTTPDNS.md) (2.19.2, purchased in WeChat
  Service Market) avoids carrier Local DNS hijacking via `wx.request({ url, enableHttpDNS: true, httpDNSServiceId })`.
  Check [`wx.getNetworkType`](https://developers.weixin.qq.com/minigame/dev/api/device/network/wx.getNetworkType.md)
  (`res.hasSystemProxy`, WeChat 8.0.17+) and disable `enableHttpDNS` when a system proxy is active to avoid
  `ERR_PROXY_CONNECTION_FAILED` (`errno: 600001`) on older runtimes. When quota reaches zero (`errno: 602103`), WeChat
  falls back to Local DNS.
