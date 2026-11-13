---
name: weixin-game
description: >-
  Build, debug and ship WeChat mini games (微信小游戏) using current, verified platform rules, a runnable starter and
  live docs lookup. Use this whenever the user mentions 微信小游戏, 小游戏开发 or WeChat mini game, or works in a project
  with game.json, game.js or wx.createCanvas, even if they only ask about one piece: canvas rendering or blurry
  graphics, touch or PC keyboard/mouse/pointer-lock input, audio that stops or won't play, video, the top-right menu
  button (胶囊按钮), official floating components or safe area, subpackages (分包), WebSocket, weak/offline network,
  encrypted channels or pre-fetch, friend leaderboards (开放数据域 排行榜), RankManager score storage or tournaments
  (存档 擂台赛), Chat Tool mode (聊天工具), sharing or posters (转发 海报), subscription messages (订阅消息), launch
  scenes (场景值), rewarded or native template ads (激励视频 原生模板广告 CustomAd), virtual payment or Recharge Center
  (虚拟支付 充值中心), privacy compliance, content security or code hardening, HarmonyOS (鸿蒙 ohos), PC mini games,
  WXWebAssembly, WebGPU, iOS High Performance or High Performance+, device benchmark tiers, scene telemetry, CLI or
  miniprogram-ci upload, or porting a browser, H5, Canvas, Three.js or PixiJS game to WeChat. Not for ordinary WeChat
  mini programs (小程序) or wxcloud/Skills WXML pages, Douyin/抖音 games using tt APIs, or web games not targeting
  WeChat. Includes Cocos, LayaAir and Unity/Tuanjie (WXAssetBundle) exports targeting WeChat; preserve their engine workflow.
license: MIT
metadata:
  version: '2.3.0'
  docs-verified: '2026-11-13'
---

# WeChat mini games

The native JavaScript path starts at `game.js` and draws on a canvas, with no DOM, CSS or `window`. Engine exports
can use other rendering and runtime modes. DevTools is a simulator; target clients have the final say.
Live docs lookup needs network access. Running a game needs WeChat DevTools and a real or test AppID.

## Choose a starting point

Inspect the project first: engine/version, source and generated directories, build commands, exporter/SDK version,
renderer, runtime/performance mode, target platforms and minimum base library. A `game.js` alone does not mean native JS.

| Situation                          | What to do                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| New lightweight native JS game     | Copy `assets/starter/` into the project, then replace `js/game/` with the game                    |
| Existing native JS game            | Read the reference for the topic below before changing code                                       |
| Engine project or generated export | Read [engines.md](references/engines.md); change source/build settings, preserve engine ownership |
| Porting a browser game             | Read [rendering and layout](references/rendering-and-layout.md), section Porting                  |
| API or limit not listed            | Look it up with the live docs commands below                                                      |

The starter runs with no build step. Its `js/platform/` files provide tested baseline patterns; preserve their supported behavior and
check the documented limitations before extending them. `js/game/` holds a small sample game that is meant to be replaced. Keep game rules in
plain modules that never touch `wx`, because that is what makes them testable without WeChat.

| Topic                                                                                     | Read                                                            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Limits, sizes, renamed, callback-only or missing APIs                                     | [platform-facts.md](references/platform-facts.md)               |
| Canvas, sharpness, loop, capsule, official overlays, safe area, PC layout, video, porting | [rendering-and-layout.md](references/rendering-and-layout.md)   |
| Touch, tap-gated APIs, PC keyboard/mouse/pointer-lock, audio, lifecycle, launch scenes    | [input-audio-lifecycle.md](references/input-audio-lifecycle.md) |
| Package size, subpackages, pre-fetch, plugins, storage, WebSocket, weak/offline/encrypted | [assets-and-network.md](references/assets-and-network.md)       |
| Leaderboards, RankManager/tournaments, Chat Tool, sharing, posters, friends, gifts, phone | [social-and-open-data.md](references/social-and-open-data.md)   |
| Rewarded ads + SSV, native template ads (CustomAd), virtual payment, Recharge Center      | [monetization.md](references/monetization.md)                   |
| Memory, iOS High Performance/+, WXWebAssembly, Workers, AI/VisionKit, profiling, ratings  | [performance.md](references/performance.md)                     |
| Login, privacy, UGC security, anti-cheat/hardening, HarmonyOS (`ohos`), release checks    | [privacy-and-release.md](references/privacy-and-release.md)     |
| DevTools agent tooling, CLI and CI, `getStableAccessToken`, CloudBase, message push       | [tooling-and-backend.md](references/tooling-and-backend.md)     |
| Every other capability: social, operations, platform, diagnostics                         | [capability-map.md](references/capability-map.md)               |

## Rules that prevent most bugs

For engine projects, verify these behaviors through the engine adapters; do not install a second native platform layer.

1. **The first `wx.createCanvas()` is the screen.** Every later call makes an offscreen canvas, so create the screen
   canvas before any library can. `wx.createOffscreenCanvas` is not in the mini game API docs.
2. **Size the canvas in device pixels and draw in logical pixels.** Set `canvas.width` to `windowWidth * pixelRatio` and
   apply one transform. Skipping this makes graphics blurry, while skipping the transform draws everything too small.
3. **Ask for capsule and official overlay rects.** Use `wx.getMenuButtonBoundingClientRect()` (and
   `wx.getOfficialComponentsInfo()` from 3.7.12+ for platform banners/gift badges, checking `isVisible`). `safeArea.top`
   alone is not enough, because the capsule sits below it.
4. **Treat `safeArea` as optional.** Some devices omit it, and the docs define it in portrait even for landscape games.
5. **Read `changedTouches` in touch handlers.** `touches` lists every finger still down, so it is empty when the last
   finger lifts. A touch cancel means the system took over, so never count it as a tap.
6. **Call tap-gated APIs from `wx.onTouchEnd`.** Subscription requests, `wx.navigateToMiniProgram`, `wx.openSetting` and
   the Channels openers only work in that callback or a `wx.showModal` / `wx.showActionSheet` one, never from
   `wx.onTouchStart`, a timer or a network callback.
7. **Handle leaving, returning and callback-only `wx` APIs.** Pause on `wx.onHide`, resume on `wx.onShow`, and treat
   `wx.onAudioInterruptionBegin` and `wx.onAudioInterruptionEnd` the same way, because audio stays stopped otherwise.
   Most async `wx` calls without callbacks return a `Promise` (2.10.2+; pass `fail` or `.catch` on optional calls like
   `wx.vibrateShort`), whereas callback-only APIs (`wx.getPrivacySetting`, `wx.getPhoneNumber`, `wx.setDeviceOrientation`,
   `RankManager.getScore`) return `undefined` without `success`/`fail`.
8. **Use the replacements for retired or browser-only APIs.** `wx.getSystemInfoSync` (2.20.1), `wx.setWindowSize` (2.11.0),
   `wx.getDeviceInfo().benchmarkLevel` (3.4.5) and `wx.createBannerAd` (3.5.5) are unmaintained: use `wx.getWindowInfo` /
   `wx.getDeviceInfo` / `wx.getAppBaseInfo`, `game.json` `resizable`, `wx.getDeviceBenchmarkInfo` and `wx.createCustomAd`.
   Use `GameGlobal` and `WXWebAssembly`, not `window` or `WebAssembly`.
9. **Never trust the client with money, UGC or secrets.** Payment callbacks can be lost and clients can be tampered with,
   so grant purchases, moderate UGC (`gameMsgSecCheck`) and fetch `getStableAccessToken` on your server. AppSecret, AppKey
   and `session_key` must never reach the client.
10. **Never build rewards on a share completing.** `wx.shareAppMessage` documents no `success` callback.
11. **Check every API against the docs before using it.** WeChat has many similar-looking APIs, and mini program APIs
    often do not exist in mini games. If a reference names an API without showing its fields, read its page first, because
    names are not guessable: `wx.checkIsSupportMidasPayment` answers in `res.data.allow_pay`.

## Keep this current

The official docs outrank this skill and anything remembered. If they disagree, follow the docs and tell the user. Any
doc page is available as clean Markdown by changing `.html` to `.md`, which avoids the very long sidebar:

```text
https://developers.weixin.qq.com/minigame/dev/api/render/canvas/wx.createCanvas.md
```

`scripts/wx-doc.sh` wraps this. Resolve `SKILL_ROOT` to the absolute directory containing this loaded `SKILL.md`
(using the host-provided skill location), not the game project or current working directory:

```bash
sh "$SKILL_ROOT/scripts/wx-doc.sh" find 胶囊        # matches paths, titles and the capsule alias
sh "$SKILL_ROOT/scripts/wx-doc.sh" read api/ui/menu/wx.getMenuButtonBoundingClientRect
```

Look it up when using an API these references do not show, when quoting a limit in a user-facing decision, and whenever
behaviour contradicts these notes. Payment, ads and privacy rules change most often, so always check those before
giving a definite answer. If retrieval fails or returns an error page, mark the decision unverified, keep supported
work moving, and do not invent updated limits. The `docs-verified` date is the oldest verification date across references; individual files may be newer.

## Verify the work

Say which of these actually ran. A pass in one does not imply the others.

1. **Headless tests:** run game rules directly, and platform code against a stubbed `wx`.
2. **DevTools:** first read [tooling](references/tooling-and-backend.md). If `wechatide` exists, load its exported skill,
   verify game-project support, then compile, inspect console errors and capture the simulator after relevant changes.
   Refresh success alone is not compilation evidence. Otherwise the classic CLI needs the service port enabled in Settings, then Security. On macOS:
   `/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project <path>`. On Windows it is `cli.bat` in the
   install folder. The project needs a real or test AppID. The CLI rejects the placeholder `touristappid`, so a project
   using it has to be imported through the DevTools window, where you can choose 测试号.
3. **A real phone:** required before release for audio, touch, memory and payment behaviour. Turn on 打开调试 from the
   top-right menu to get the vConsole log panel.

Ask the user before running `cli preview` or `cli upload`, because both send the package to WeChat's servers.
