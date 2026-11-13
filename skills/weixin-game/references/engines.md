# Engine projects and runtime profiles

Last verified against the official docs: 2026-11-13.

## Detect before editing

Inspect manifests, project settings, source files and build scripts together. Record engine/version, exporter/SDK
version, renderer, runtime mode, target platforms, minimum base library and tested client versions. `game.js` and
`game.json` also appear in generated exports. If only build output is available, locate the source project before making
persistent fixes; label any diagnostic output patch temporary and reproduce it in a build template or source setting.

| Project evidence                                                         | Durable change location                                                       |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Native JavaScript with maintained `game.js`                              | Existing modules; starter only for a new lightweight native game              |
| Cocos Creator metadata/settings, scenes and scripts                      | Creator source, build settings, Asset Bundles and adapter                     |
| LayaAir project and engine libraries                                     | Source and version-specific IDE export settings; verify the installed version |
| Unity/Tuanjie `Assets/`, `ProjectSettings/`, packages and conversion SDK | C# source, SDK/build settings and asset pipeline                              |
| WASM + WebGL browser export                                              | Evaluate the official general conversion workflow before hand-porting         |

Preserve the engine's ownership of canvas, frame loop, input, audio, resource loading and cache. Do not copy the native
starter into an engine export or add another screen canvas/loop. Rebuild from source to verify the change survives export.
For a browser port, audit DOM/browser dependencies and choose the adaptation path before replacing APIs.

## Official routes

- [Cocos Creator 3.8 WeChat export](https://docs.cocos.com/creator/3.8/manual/en/editor/publish/publish-wechatgame.html):
  use the manual matching the installed version. Configure remote resources, MD5 cache versions and subpackages through
  Creator's asset/build pipeline; generated settings are evidence of the build, not the source of truth. Creator's
  `assetManager.cacheManager` stores downloaded bundles under `wx.env.USER_DATA_PATH` with LRU eviction (`clearCache` /
  `removeCache`), `Separate Engine` requires a real AppID (`touristappid` cannot load engine plugins), and 3D WASM
  physics (`PhysX` / `Bullet`) offers `wasm`, `js` or `fallback` modes that must be memory-tested on phones.
- [Unity/Tuanjie conversion](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/unity-webgl-transform.md):
  inspect SDK version and MP eligibility; use its C# bindings for platform integration. Both the converter repository
  ([`minigame-unity-webgl-transform`](https://github.com/wechat-miniprogram/minigame-unity-webgl-transform)) and the
  [Tuanjie SDK manual](https://docs.unity.cn/cn/tuanjiemanual/1.8/Manual/WechatSDK.html) document ecosystem build rules:
  - Keep only a lightweight bootstrap scene in `Scenes in Build` and empty `Resources/` so `webgl.data` stays small; load
    gameplay content via `WXAssetBundle` built with `BuildAssetBundleOptions.AppendHashToAssetBundle` (or `DataFileSubpackage`
    / Tuanjie `AutoStreaming`).
  - Uncheck texture `Read/Write Enabled` (avoids duplicate CPU + GPU copies), disable Mipmaps on UI/2D sprites (~33%
    extra memory), and raise `Managed Stripping Level` with `link.xml` rules for reflection-bound types.
  - Target WebGL 2.0 explicitly instead of `Auto Graphics API` to avoid shipping both WebGL 1 and WebGL 2 shader
    variants; replace synchronous `ShaderVariantCollection.WarmUp()` stalls with progressive/async warmup
    (`KHR_parallel_shader_compile`) and GPU skinning, and stream long BGM via `WXInnerAudioContext` rather than decoding
    full clips into the WASM heap.
  - For release builds that need tamper resistance, use the official
    [Unity security hardening tool](https://developers.weixin.qq.com/minigame/dev/devtools/security_hardening_tool.md)
    (`global-metadata.dat` encryption via `WXDataPlugin` plus `[WasmObfuscate]` on sensitive C# methods) and
    [memory protection](https://developers.weixin.qq.com/minigame/dev/devtools/memoryprotect.md). Do not upgrade the
    engine or SDK solely to match an example.
- [General adaptation](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/common-adaptation.md): for
  engines exporting WASM + WebGL H5 packages. Read its SDK integration and compatibility docs before choosing it.
- [WASM code splitting](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/WasmSplitV2_1.md): match the
  splitting plugin to `plugins` in `game.json`. General adaptation (`WXGameKit`) must pair with `Wasm代码分包V2`
  (`wasmsplit-v2-ci`), whereas the Unity-specific exporter (`UnityPlugin`) uses its own `wasmCodeSplit` (`wasmsplit-ci`)
  line matched to the UnityWasm SDK version; never mix the two plugin lines.
- LayaAir: find the WeChat export guide for the detected version through the [official manual](https://layaair.com/).
  Configure subpackages, MD5 version hashes, `USER_DATA_PATH` resource caching and ASTC + PNG/JPG fallback texture
  compression inside LayaAir IDE's WeChat publish panel rather than patching exported `libs/` bundles; do not infer Cocos
  settings or Unity SDK behavior for LayaAir.
- [Game engine plugins](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/game-engine-plugin.md): Creator
  and LayaAir exporters can separate shared engine libraries into a cached WeChat client plugin (`plugins` in `game.json`
  plus `plugin.json`/`signature.json` and `requirePlugin`), supported for whole-package games and the main package of
  subpackaged games. Re-export from the IDE rather than hand-editing plugin files, which invalidates `signature.json` MD5s.
  Engine builds should also emit source maps so [production errors](privacy-and-release.md#updates) map back to source.
- [Playable trials](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/playable/dev.md) (`小游戏试玩`): an
  independent lightweight project and AppID (iOS/Android WeChat 8.0.50+, base library 3.5.4+; no PC or Mac) with its own
  `wx` subset and release flow. Custom engine adapters may require stubs for missing `wx` APIs, and on-phone vConsole is
  toggled via `wx.setEnableDebug` rather than the top-right menu.

## Textures and devices

[Cocos texture guidance](https://docs.cocos.com/creator/3.8/manual/zh/asset/compress-texture.html) and the
[platform texture compression guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-texture-compression.md)
list ASTC, PVRTC and ETC1 (High Performance mode only) on iOS, ASTC, ETC1 and ETC2 on Android, and DXT1/3/5 plus BC4/5/7
on Windows, Mac and DevTools, with PNG/JPG fallbacks. However, the
[iOS High Performance guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-high-performance.md)
explicitly states that iOS High Performance mode **does not support `ETC` or `PVRTC`**, leaving only `ASTC` and `ETC1` —
so never ship `PVRTC`-only bundles for iOS High Performance builds. DevTools cannot establish ASTC rendering on a phone,
and shipping ASTC-only packages to PC/Mac forces expensive CPU software decoding; see [PC performance](performance.md#runtime-modes).
Use the engine's selection mechanism and measure both download size and decoded/GPU memory. Other engines need their own
format profile.

For PC targets, include keyboard/mouse, focus transitions, window resize and real WeChat desktop-client checks. The
[PC guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/pc-game.md) covers eligibility and incentives;
verify the current campaign terms instead of promising a blanket credit. A mobile-only prototype need not add desktop UI.

Use [performance.md](performance.md) for High Performance+, Metal, EmscriptenGLX and Worker V2. Original Worker restrictions are not
rules for engine-specific threading. Keep `libVersion: "latest"` only for exploration; record the actual tested version
and select a minimum-supported version in the project/MP settings for reproducible acceptance testing.
