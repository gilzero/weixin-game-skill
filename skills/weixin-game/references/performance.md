# Performance

Last verified against the official docs: 2026-11-08.

## Memory

Memory is the [biggest stability risk](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-overview.md).
Process ownership and limits depend on the runtime mode; profile the actual engine and device combination.

- iOS [destroys the game after two memory warnings within 5 seconds](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-management.md).
  So on the first [`wx.onMemoryWarning`](https://developers.weixin.qq.com/minigame/dev/api/device/memory/wx.onMemoryWarning.md),
  drop caches and call `wx.triggerGC()`.
- `res.level` exists only on Android, with values 5, 10 and 15. Do not branch on it for iOS.
- [Every `Canvas` and `Image` holds a native texture](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-memory-gc.md)
  until JavaScript drops its reference and collection runs. Clear references when leaving a scene.
- `wx.triggerGC()` only speeds up collection, with no guarantee of timing. Call it at round starts and ends and on scene
  changes.
- Use engine-specific texture selection with device-supported formats and PNG/JPG fallbacks; see [engines](engines.md).
  Budget decoded/GPU memory independently from download bytes. Do not choose a format solely from the OS name.
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
- Lower the frame rate with `wx.setPreferredFramesPerSecond` when a scene does not need 60. Use
  [`wx.getDeviceBenchmarkInfo`](https://developers.weixin.qq.com/minigame/dev/api/base/system/wx.getDeviceBenchmarkInfo.md)
  (3.4.5) and the [benchmark distribution guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-benchmarkLevel.md)
  to scale quality or frame rate by `benchmarkLevel` (1–50, higher is faster; `-1` means unknown or a new unindexed
  model, not a low-end phone). Do not use `wx.getDeviceInfo().benchmarkLevel`, which is Android-only and unmaintained
  since 3.4.5.
- WebGL scenes that mix in 2D UI can avoid repeated `texImage2D` calls with
  [`wxBindCanvasTexture`](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-render-bind.md), which
  is iOS only. Keep the fallback.
- `iOSHighPerformance` in `game.json` needs approval in the MP console first, and changes how audio behaves. Check the
  [config reference](https://developers.weixin.qq.com/minigame/dev/reference/configuration/app.md) before enabling it.

## Runtime modes

[High Performance+](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-high-performance-plus.md)
requires High Performance mode first, then `iOSHighPerformance+` in `game.json`. The stated baseline is iOS 14 and
WeChat 8.0.45, but the FAQ narrows iOS 14 to WeChat 8.0.49; earlier clients fall back and may lack WebGL2.
Check the MP rollout settings and runtime mode on the target phone. Performance gains are workload dependent.

[iOS Metal](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-ios-metal.md) is an engine/WASM rendering
path requiring High Performance+, base library 3.10.0 and WeChat 8.0.63. Follow the exporter-specific integration;
other modes fall back. Do not enable it as a generic Canvas 2D optimization.

[WebGPU](https://developers.weixin.qq.com/minigame/dev/guide/performance/WebGPU.md) is currently Android-only (Android 10+,
WeChat 8.0.79+, base library 3.17.3+; iOS and HarmonyOS in progress). Call [`wx.getGPU()`](https://developers.weixin.qq.com/minigame/dev/api/render/gpu/wx.getGPU.md)
and fall back to WebGL when it returns `undefined`. Call `context.configure({ device, format: gpu.getPreferredCanvasFormat() })`
before creating GPU resources, never combine `webgpu` and `webgl` contexts on the same canvas, and note that shaders are
WGSL-only without MRT or async pipeline creation (`createRenderPipelineAsync` / `createComputePipelineAsync`).

[iOS thermal mode](https://developers.weixin.qq.com/minigame/dev/guide/performance/power-saving-mode.md) (`温控模式`,
iPhone XR and newer via the official `MiniGameCommon` plugin's `getPowerModeManager`) reduces compute to roughly 60% to
cut power by about 10–20% on high-end devices. Mode changes take effect on the next launch (`setLocalMode` plus
`wx.restartMiniProgram`).

## Workers

The example and restrictions below apply to the **original Worker**, not Worker V2 or engine SDK threading.

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
worker.onMessage(result => applyPhysics(result.message.bodies));
const bodies = getPhysicsBodies();
worker.postMessage({ bodies });
```

`workers/physics/index.js`:

```js
worker.onMessage(message => {
  worker.postMessage({ bodies: stepPhysics(message.message.bodies) });
});
```

- Without `workers` in `game.json`, `wx.createWorker` has nothing to load.
- The [message callback](https://developers.weixin.qq.com/minigame/dev/api/worker/Worker.onMessage.md) documents the
  payload under `result.message`; match that envelope in both directions.
- Only one Worker can run at a time. Call `worker.terminate()` before creating another.
- `wx` APIs are not available inside a Worker, and neither is rendering. It can only `require` files inside its directory,
  which may contain only JS.
- On iOS, [JIT is off in Workers by default](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-cpu-worker.md).
  For heavy work pass `{ useExperimentalWorker: true }` (2.13.0) and recreate the Worker from
  [`worker.onProcessKilled`](https://developers.weixin.qq.com/minigame/dev/api/worker/wx.createWorker.md), because the
  system may reclaim it.
- Worker code counts toward the 4MB main package. From 2.27.3, `{ "workers": { "path": "workers", "isSubpackage": true } }`
  moves it out, and then you must call `wx.preDownloadSubpackage({ packageType: 'workers' })` before `wx.createWorker`.

### Worker V2 and engine threading

[Worker V2](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/new-worker.md) is a gated Android rollout:
WeChat 8.0.74+, base library 3.17.0+, and enabled rollout access. iOS support is still in progress and DevTools does not
support it. Check `wx.env.isSupportStandardWorker`; retain the original Worker or main-thread fallback.
It supports multiple workers, transferred OffscreenCanvas, SharedArrayBuffer and selected audio/network methods through
`worker`, not a general `wx` global. Its sample message shapes differ from the original API envelope; use the guide
for the chosen runtime. A transferred canvas must no longer be drawn by the main thread. Engine SDK multithreading is
another path: confirm engine/exporter versions and use [engine documentation](engines.md) before mixing facilities.

## Startup

Measure cold-start time, first playable frame, frame-time percentiles and memory growth on a named device matrix.
Use the [startup guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-start.md):

- Draw something on the very first frame, and show progress during any wait.
- Keep the main package small and load the rest from subpackages or a CDN.
- Avoid heavy synchronous work in `game.js` before that first frame.
