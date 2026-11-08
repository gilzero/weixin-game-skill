# Engine projects and runtime profiles

Last verified against the official docs: 2026-11-08.

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
  use the manual matching the installed version. Configure remote resources, cache versions and subpackages through
  Creator's asset/build pipeline. Generated settings are evidence of the build, not the source of truth.
- [Unity/Tuanjie conversion](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/unity-webgl-transform.md):
  inspect SDK version and MP eligibility; use its C# bindings for platform integration. The
  [Tuanjie SDK manual](https://docs.unity.cn/cn/tuanjiemanual/1.8/Manual/WechatSDK.html) documents version-specific
  compatibility caveats. Do not upgrade the engine or SDK solely to match an example.
- [General adaptation](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/common-adaptation.md): for
  engines exporting WASM + WebGL H5 packages. Read its SDK integration and compatibility docs before choosing it.
- [WASM code splitting](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/WasmSplitV2_1.md): match the
  splitting plugin to `plugins` in `game.json`. General adaptation (`WXGameKit`) must pair with `Wasm代码分包V2`
  (`wasmsplit-v2-ci`), whereas the Unity-specific exporter (`UnityPlugin`) uses its own `wasmCodeSplit` (`wasmsplit-ci`)
  line matched to the UnityWasm SDK version; never mix the two plugin lines.
- LayaAir: find the WeChat export guide for the detected version through the [official manual](https://layaair.com/).
  Do not infer Cocos settings or Unity SDK behavior for LayaAir.

## Textures and devices

[Cocos texture guidance](https://docs.cocos.com/creator/3.8/manual/zh/asset/compress-texture.html) and the
[platform texture compression guide](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-action-texture-compression.md)
cover ASTC, PVRTC and ETC1 (High Performance mode only) on iOS, ASTC, ETC1 and ETC2 on Android, and DXT1/3/5 plus BC4/5/7
on Windows, Mac and DevTools, with PNG/JPG fallbacks. DevTools cannot establish ASTC rendering on a phone. Use the engine's
selection mechanism and measure both download size and decoded/GPU memory. Other engines need their own format profile.

For PC targets, include keyboard/mouse, focus transitions, window resize and real WeChat desktop-client checks. The
[PC guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/pc-game.md) covers eligibility and incentives;
verify the current campaign terms instead of promising a blanket credit. A mobile-only prototype need not add desktop UI.

Use [performance.md](performance.md) for High Performance+, Metal and Worker V2. Original Worker restrictions are not
rules for engine-specific threading. Keep `libVersion: "latest"` only for exploration; record the actual tested version
and select a minimum-supported version in the project/MP settings for reproducible acceptance testing.
