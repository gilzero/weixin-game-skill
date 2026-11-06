# Platform facts

Last verified against the official docs: 2026-11-06. Re-check anything here with `scripts/wx-doc.sh` before quoting it
in a decision that matters.

## Limits

| Area            | Limit                                                                                         | Source                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Package         | Main plus subpackages 30MB, main 4MB, normal subpackage no limit, independent subpackage 4MB  | [Subpackages](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/subPackage/useSubPackage.md)         |
| Upload          | Only whitelisted file extensions upload, and `webp` is not on the list                        | [Code package](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.md)                    |
| Storage         | 1MB per key, 10MB per user per game                                                           | [wx.setStorage](https://developers.weixin.qq.com/minigame/dev/api/storage/wx.setStorage.md)                         |
| Local files     | 200MB for cached and user files together, and a qualifying game can apply for 1GB             | [File system](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.md)                      |
| Single download | 200MB                                                                                         | [wx.downloadFile](https://developers.weixin.qq.com/minigame/dev/api/network/download/wx.downloadFile.md)            |
| Concurrency     | 10 for request, upload and download together; 5 for sockets                                   | [Network](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.md)                              |
| Timeout         | 60 seconds by default, and requests fail 5 seconds after entering the background              | [Network](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.md)                              |
| Worker          | One at a time, no `wx` APIs inside, messages are copied, JS files only                        | [Workers](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/workers.md)                              |
| Cloud storage   | 128 key-value pairs per user, 1024 bytes per key plus value, 128 bytes per key                | [wx.setUserCloudStorage](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.setUserCloudStorage.md) |
| Audio           | Android plays at most 10 at once                                                              | [Audio](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/audio.md)                                  |
| Frame rate      | 1 to 60, default 60                                                                           | [Frame rate](https://developers.weixin.qq.com/minigame/dev/api/render/frame/wx.setPreferredFramesPerSecond.md)      |
| Memory warnings | iOS destroys the game after 2 warnings within 5 seconds; `level` is Android only, 5, 10 or 15 | [Memory](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-management.md)          |
| Banner ads      | Width clamps between 300 and the screen width                                                 | [Banner ads](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/banner-ad.md)                      |
| JavaScript      | No `eval` or `new Function`; on iOS 15 and below, Promises run as ordinary tasks              | [JS support](https://developers.weixin.qq.com/minigame/dev/guide/runtime/js-support.md)                             |

`wx.getDeviceInfo().platform` can be `ios`, `android`, `ohos`, `ohos_pc`, `windows`, `mac` or `devtools`. Simulated
HarmonyOS in DevTools still reports `devtools`, so check `system` there.

## Browser to WeChat

| Browser                             | WeChat mini game                                               |
| ----------------------------------- | -------------------------------------------------------------- |
| `window`                            | `GameGlobal`                                                   |
| `document.createElement('canvas')`  | `wx.createCanvas()`                                            |
| `new Image()`                       | `wx.createImage()`                                             |
| `new Audio()`                       | `wx.createInnerAudioContext()` or `wx.createWebAudioContext()` |
| `localStorage`                      | `wx.setStorageSync()` and `wx.getStorageSync()`                |
| `fetch`, `XMLHttpRequest`           | `wx.request()`                                                 |
| `WebSocket`                         | `wx.connectSocket()`                                           |
| `canvas.addEventListener('touch…')` | `wx.onTouchStart()` and related global listeners               |
| `navigator.vibrate()`               | `wx.vibrateShort({ type })` and `wx.vibrateLong()`             |
| `<input>`                           | `wx.showKeyboard()`, because there are no form elements        |

`requestAnimationFrame`, `setTimeout` and `setInterval` exist as globals.

## Commonly wrong APIs

| Wrong or outdated                                | Use instead                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `wx.getSystemInfoSync` for new code              | `wx.getWindowInfo`, `wx.getDeviceInfo`, `wx.getAppBaseInfo`, `wx.getSystemSetting` |
| `wx.createOffscreenCanvas`                       | Not in the mini game API docs. Call `wx.createCanvas()` again                      |
| `wx.getUserProfile`                              | Not in the mini game API docs. Use `wx.createUserInfoButton`                       |
| `ctx.toDataURL()`                                | The method is `canvas.toDataURL()`, and open data contexts restrict it             |
| `gc()`                                           | `wx.triggerGC()`, which speeds up collection without guaranteeing it               |
| `wx.getPerformance().getEntriesByType('memory')` | No such entry type. Use the DevTools memory tools and 小游戏数据助手               |
| `wx.shareAppMessage({ toGroup, success })`       | Neither is a documented parameter. See [sharing](social-and-open-data.md#sharing)  |
| `wx.createCanvas()` to draw a leaderboard        | `wx.getSharedCanvas()` inside the open data context                                |
| `compileType: "minigame"` from the docs table    | Official sample projects use `"game"`, and so does the starter                     |
