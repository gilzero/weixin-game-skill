# Platform facts

Last verified against the official docs: 2026-11-13. Re-check anything here with `scripts/wx-doc.sh` before quoting it
in a decision that matters.

## Limits

| Area              | Limit                                                                                                                       | Source                                                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package           | Main plus subpackages 30MB, main 4MB, normal subpackage no limit, independent subpackage 4MB                                | [Subpackages](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.md)                                                                                         |
| Upload            | Only whitelisted extensions upload (`wasm`, `br` allowed; `webp` is not); `*.js`/`game.json` compile                        | [Code package](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.md)                                                                                                    |
| Storage           | 1MB per key, 10MB per user per game                                                                                         | [wx.setStorage](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.setStorage.md)                                                                                                         |
| Local files       | 200MB shared; 1GB via MP `空间提升`, evicted at whole-game granularity under low device disk space                          | [File system](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.md), [Disk space](https://developers.weixin.qq.com/minigame/dev/guide/performance/diskspace.md)          |
| Pre-fetch         | 256KB max string response, cached at cold start or by the 12-hour periodic update                                           | [Pre-fetch](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/pre-fetch.md), [periodic update](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/background-fetch.md) |
| Single download   | 200MB                                                                                                                       | [wx.downloadFile](https://developers.weixin.qq.com/minigame/dev/api/network/download/wx.downloadFile.md)                                                                                            |
| Concurrency       | 10 for request, upload and download together; 5 for sockets                                                                 | [Network](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.md)                                                                                                              |
| Timeout           | 60 seconds by default, and requests fail 5 seconds after entering the background                                            | [Network](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.md)                                                                                                              |
| Rate-limited APIs | `wx.login`, `wx.checkSession`, `wx.getSetting`, `wx.getUserInfo`: daily calls at most twice the game's PV, so cache results | [API frequency](https://developers.weixin.qq.com/minigame/dev/guide/performance/api-frequency.md)                                                                                                   |
| Original Worker   | One at a time, no `wx` APIs inside, messages are copied, JS files only (keep `.wasm` outside)                               | [Workers](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/workers.md)                                                                                                              |
| Cloud storage     | 128 key-value pairs per user, 1024 bytes per key plus value, 128 bytes per key                                              | [wx.setUserCloudStorage](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.setUserCloudStorage.md)                                                                                 |
| Audio             | Android plays at most 10 at once                                                                                            | [Audio](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/audio.md)                                                                                                                  |
| Frame rate        | 1 to 60, default 60                                                                                                         | [Frame rate](https://developers.weixin.qq.com/minigame/dev/api/render/frame/wx.setPreferredFramesPerSecond.md)                                                                                      |
| Memory warnings   | iOS destroys the game after 2 warnings within 5 seconds; `level` is Android only, 5, 10 or 15                               | [Memory](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-management.md)                                                                                          |
| Scene telemetry   | Startup `wx.reportScene` tracks `<= 60s`; runtime `setData` allows at most 5 calls per 30s (`<= 1KB`)                       | [Runtime scene perf](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-runtime-reportPerformanceScene.md)                                                                 |
| Legacy banners    | Width clamps between 300 and screen width; unmaintained since 3.5.5 (use `wx.createCustomAd`)                               | [wx.createBannerAd](https://developers.weixin.qq.com/minigame/dev/api/ad/wx.createBannerAd.md)                                                                                                      |
| iOS High Perf     | 1GB RAM cap on 2GB iPhones, 1.5GB on 3GB+ (keep `<= 1.3GB`); JS strict mode; ASTC/ETC1 only (no PVRTC); `wx.encode` UTF-8   | [High performance](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-high-performance.md)                                                                                        |
| JavaScript        | No `eval` or `new Function`; `Proxy` cannot be polyfilled; `WXWeakRef` (2.23.0+); iOS `<= 15` runs Promises as tasks        | [JS support](https://developers.weixin.qq.com/minigame/dev/guide/runtime/js-support.md), [WXWeakRef](https://developers.weixin.qq.com/minigame/dev/reference/api/WXWeakRef.md)                      |

`wx.getDeviceInfo().platform` can be `ios`, `android`, `ohos`, `ohos_pc`, `windows`, `mac` or `devtools`. Simulated
HarmonyOS in DevTools still reports `devtools`, so check `system === 'HarmonyOS'` there.

## Browser to WeChat

| Browser                                   | WeChat mini game                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `window`                                  | `GameGlobal`                                                                          |
| `document.createElement('canvas')`        | `wx.createCanvas()`                                                                   |
| `new Image()`                             | `wx.createImage()`                                                                    |
| `new Audio()`                             | `wx.createInnerAudioContext()` or `wx.createWebAudioContext()`                        |
| `WebAssembly.instantiate(bytes, imports)` | `WXWebAssembly.instantiate('/path/mod.wasm', imports)` (or `.wasm.br`)                |
| `localStorage`                            | `wx.setStorageSync()` and `wx.getStorageSync()`                                       |
| `fetch`, `XMLHttpRequest`                 | `wx.request()`                                                                        |
| `WebSocket`                               | `wx.connectSocket()`, then only the returned `SocketTask`                             |
| `<video>`                                 | `wx.createVideo()` (native layer) or `wx.createVideoDecoder()` (frames for a texture) |
| `canvas.addEventListener('touch…')`       | `wx.onTouchStart()` and related global listeners                                      |
| `window.addEventListener('keydown'/…)`    | `wx.onKeyDown()`, `wx.onKeyUp()`, `wx.onMouseDown()`, `wx.onWheel()` (PC)             |
| `navigator.vibrate()`                     | `wx.vibrateShort({ type, fail })` and `wx.vibrateLong({ fail })`                      |
| `TextEncoder` / `TextDecoder`             | `wx.encode({ data, format })` and `wx.decode({ data, format })`                       |
| `URL.createObjectURL(blob)`               | `wx.createBufferURL(buffer)` and `wx.revokeBufferURL(url)` (2.14.0+)                  |
| `WeakRef`                                 | `WXWeakRef` (2.23.0+; native `WeakRef` needs iOS 14.5+ / Android WeChat 8.0.25+)      |
| `<input>`                                 | `wx.showKeyboard()`, because there are no form elements                               |

`requestAnimationFrame`, `setTimeout` and `setInterval` exist as globals.

## Commonly wrong APIs

| Wrong or outdated                                                            | Use instead                                                                                                                                  |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `wx.getSystemInfoSync` for new code                                          | `wx.getWindowInfo`, `wx.getDeviceInfo`, `wx.getAppBaseInfo`, `wx.getSystemSetting`                                                           |
| `wx.getDeviceInfo().benchmarkLevel`                                          | Android only and unmaintained since 3.4.5. Use `wx.getDeviceBenchmarkInfo`                                                                   |
| `wx.createBannerAd` for new code                                             | Unmaintained since 3.5.5. Use `wx.createCustomAd` (native template ads)                                                                      |
| `wx.createOffscreenCanvas`                                                   | Not in the mini game API docs. Call `wx.createCanvas()` again                                                                                |
| `wx.getUserProfile`                                                          | Not in the mini game API docs. Use `wx.createUserInfoButton`                                                                                 |
| `wx.createCacheManager` from weak-network guide                              | Not in the mini game API docs. Use `wx.onNetworkWeakChange` plus file/storage cache                                                          |
| `WebAssembly.instantiate(buffer, imports)`                                   | Global `WebAssembly` is absent; pass a package path to `WXWebAssembly.instantiate`                                                           |
| `ctx.toDataURL()`                                                            | The method is `canvas.toDataURL()`, and open data contexts restrict it                                                                       |
| `gc()`                                                                       | `wx.triggerGC()`, which speeds up collection without guaranteeing it                                                                         |
| `wx.getPerformance().getEntriesByType('memory')`                             | No such entry type. Use the DevTools memory tools and 小游戏数据助手                                                                         |
| `wx.shareAppMessage({ toGroup, success })`                                   | Neither is a documented parameter. See [sharing](social-and-open-data.md#sharing)                                                            |
| `wx.showShareImageMenu({ style })`                                           | `style` is deprecated since 3.8.2; pass a local or temporary `path` only                                                                     |
| `wx.sendSocketMessage`, `wx.onSocketOpen` and other global socket calls      | Use the `SocketTask` from `wx.connectSocket` and register `onOpen` at once                                                                   |
| Subscription or `wx.navigateToMiniProgram` from `wx.onTouchStart` or a timer | [Tap-gated APIs](input-audio-lifecycle.md#tap-gated-apis) only work inside `wx.onTouchEnd`, `wx.showModal` or `wx.showActionSheet` callbacks |
| `video.requestFullScreen()`                                                  | Resize the `wx.createVideo` instance to the window instead                                                                                   |
| Listening for "added to desktop"                                             | No such event. A later launch reports scene `1023`                                                                                           |
| `wx.vibrateShort({ type: 'light' })` bare call                               | Async `wx` calls without callbacks return a `Promise` (2.10.2+) and reject unsupported                                                       |
| `await wx.getPrivacySetting()` or `await wx.getPhoneNumber()`                | Callback-only APIs (`以 Promise 风格调用：不支持`) return `undefined`; pass `success`/`fail`                                                 |
| `wx.setWindowSize` for PC window sizing                                      | Unmaintained since 2.11.0; use `game.json` `resizable`/`displayMode` and `wx.onWindowResize`                                                 |
| `wx.startHandoff` or `wx.checkHandoffEnabled` in `game.js`                   | Open-data-context only; set `wx.setHandoffQuery` in the main game and trigger handoff in `open-data`                                         |
| `wx.getOfficialComponentsInfo().notificationComponentInfo.isShow`            | Official sample typo; the schema and typings field is `isVisible`                                                                            |
| `wx.createCanvas()` to draw a leaderboard                                    | `wx.getSharedCanvas()` inside the open data context                                                                                          |
| `compileType: "minigame"` from the docs table                                | Official sample projects use `"game"`, and so does the starter                                                                               |
