# Performance

Last verified against the official docs: 2026-11-06.

## Memory

Memory is the [biggest stability risk](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-overview.md).
On iOS the game shares a process with WeChat, and low-end iPhones are still around 10 to 15 percent of devices.

- iOS [destroys the game after two memory warnings within 5 seconds](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-management.md).
  So on the first [`wx.onMemoryWarning`](https://developers.weixin.qq.com/minigame/dev/api/device/memory/wx.onMemoryWarning.md),
  drop caches and call `wx.triggerGC()`.
- `res.level` exists only on Android, with values 5, 10 and 15. Do not branch on it for iOS.
- [Every `Canvas` and `Image` holds a native texture](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-gc.md)
  until JavaScript drops its reference and collection runs. Clear references when leaving a scene.
- `wx.triggerGC()` only speeds up collection, with no guarantee of timing. Call it at round starts and ends and on scene
  changes.
- Compressed textures reduce memory: `pvr` on iOS and `etc1` on Android, from base library 2.5.0.
- Destroy audio instances you no longer need, and avoid many large images in memory at once.

```js
wx.onMemoryWarning(() => {
  imageCache.clear();
  wx.triggerGC();
});
```

Track real numbers with the 小游戏数据助手 mini program (数据, 性能分析) and the
[DevTools memory tools](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-dev-profile.md).
`wx.getPerformance()` has no memory entry type.

## Frame time

- Reuse short-lived objects with a pool when garbage collection pauses show up in a profile. Don't add pools before then.
- Cache static layers on an extra canvas, then `drawImage` them.
- Redrawing the whole frame is simple and usually fine. Partial clears only help with a truly static background, and they
  must clear the object's previous position and redraw what was behind it.
- Lower the frame rate with `wx.setPreferredFramesPerSecond` when a scene does not need 60.
- WebGL scenes that mix in 2D UI can avoid repeated `texImage2D` calls with
  [`wxBindCanvasTexture`](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-render-bind.md), which
  is iOS only. Keep the fallback.
- `iOSHighPerformance` in `game.json` needs approval in the MP console first, and changes how audio behaves. Check the
  [config reference](https://developers.weixin.qq.com/minigame/dev/reference/configuration/app.md) before enabling it.

## Workers

Workers help with heavy calculations such as pathfinding or physics. Nothing else about them is free, because messages are
copied. From the [Worker guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/workers.md):

`game.json`:

```json
{
  "workers": "workers"
}
```

Main game:

```js
const worker = wx.createWorker('workers/physics/index.js');
worker.onMessage(result => applyPhysics(result.bodies));
worker.postMessage({ bodies });
```

`workers/physics/index.js`:

```js
worker.onMessage(message => {
  worker.postMessage({ bodies: stepPhysics(message.bodies) });
});
```

- Without `workers` in `game.json`, `wx.createWorker` has nothing to load.
- Only one Worker can run at a time. Call `worker.terminate()` before creating another.
- `wx` APIs are not available inside a Worker, and neither is rendering. It can only `require` files inside its directory,
  which may contain only JS.
- On iOS, [JIT is off in Workers by default](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-cpu-worker.md).
  For heavy work pass `{ useExperimentalWorker: true }` (2.13.0) and recreate the Worker from
  [`worker.onProcessKilled`](https://developers.weixin.qq.com/minigame/dev/api/worker/wx.createWorker.md), because the
  system may reclaim it.
- Worker code counts toward the 4MB main package. From 2.27.3, `{ "workers": { "path": "workers", "isSubpackage": true } }`
  moves it out, and then you must call `wx.preDownloadSubpackage({ packageType: 'workers' })` before `wx.createWorker`.

## Startup

[The docs estimate](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-start.md) that loading
everyone within 4 seconds would keep about 30 percent of the players otherwise lost. So:

- Draw something on the very first frame, and show progress during any wait.
- Keep the main package small and load the rest from subpackages or a CDN.
- Avoid heavy synchronous work in `game.js` before that first frame.
