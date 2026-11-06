# Assets and network

Last verified against the official docs: 2026-11-06.

## Package strategy

Keep only what the first screen needs in the 4MB main package. Put levels in subpackages, and download large or
frequently changing assets from a CDN after launch. [All packages together are capped at 30MB](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.md).

Only [whitelisted file extensions](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.md)
upload. Others load fine in DevTools and then go missing from the uploaded package, which is an easy way to ship a broken
build. `webp` is not on the list, so check the page when adding a new asset type.

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
- [Independent subpackages](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/independent-sub-packages.md)
  (2.12.1, 4MB) start without downloading the main package, so a share card can open a leaderboard quickly. Pass their
  path as `path` when sharing.
- The open data context directory cannot be a subpackage or sit inside one.
- Worker code counts toward the main package unless [configured as a subpackage](performance.md#workers).

## Downloading and caching

```js
const cachedPath = `${wx.env.USER_DATA_PATH}/level-2.png`;
const fileSystem = wx.getFileSystemManager();

function loadCachedImage(url, onReady, onFailure) {
  fileSystem.access({
    path: cachedPath,
    success: () => onReady(cachedPath),
    fail: () => {
      wx.downloadFile({
        url,
        filePath: cachedPath,
        success: result => (result.statusCode === 200 ? onReady(cachedPath) : onFailure(result)),
        fail: onFailure,
      });
    },
  });
}
```

From the [file system guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.md):

- Temporary files only last for the current run, so never store a temporary path for next time.
- `wx.env.USER_DATA_PATH` is the only directory you can freely write to. Cached and user files share a 200MB limit.
- Do not hardcode local file protocols. They differ between phones (`wxfile://`) and DevTools (`http://`).
- Package files cannot be changed at runtime, and paths must not start with `./` or `../`.
- Version your cached file names, or players keep stale assets after an update.

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
