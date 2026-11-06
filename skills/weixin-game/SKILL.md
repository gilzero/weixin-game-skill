---
name: weixin-game
description: >-
  Build, debug and ship WeChat mini games (微信小游戏) using current, verified platform rules, a runnable starter and
  live docs lookup. Use this whenever the user mentions 微信小游戏, 小游戏开发 or WeChat mini game, or works in a project
  with game.json, game.js or wx.createCanvas, even if they only ask about one piece: canvas rendering or blurry
  graphics, touch input, audio that stops or won't play, the top-right menu button (胶囊按钮) or safe area, subpackages
  (分包) and package size, friend leaderboards (开放数据域 排行榜), sharing (转发), rewarded ads (激励视频), virtual
  payment (虚拟支付), privacy compliance, or porting a browser, H5 or Canvas game to WeChat. Not for ordinary WeChat
  mini programs (小程序) built from WXML pages, Douyin/抖音 games using tt APIs, or web games not targeting WeChat.
  Includes Cocos, LayaAir and Unity/Tuanjie exports targeting WeChat; preserve their engine workflow.
license: MIT
metadata:
  version: '2.0.0'
  docs-verified: '2026-11-06'
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

| Topic                                                         | Read                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| Limits, sizes, renamed or missing APIs                        | [platform-facts.md](references/platform-facts.md)               |
| Canvas, sharpness, game loop, menu button, safe area, porting | [rendering-and-layout.md](references/rendering-and-layout.md)   |
| Touch, audio, foreground and background, errors               | [input-audio-lifecycle.md](references/input-audio-lifecycle.md) |
| Package size, subpackages, downloads, files, storage, network | [assets-and-network.md](references/assets-and-network.md)       |
| Leaderboards, sharing, user info, game club, subscriptions    | [social-and-open-data.md](references/social-and-open-data.md)   |
| Rewarded, banner and interstitial ads, virtual payment        | [monetization.md](references/monetization.md)                   |
| Memory, Workers, startup time                                 | [performance.md](references/performance.md)                     |
| Login, privacy compliance, updates, release checks            | [privacy-and-release.md](references/privacy-and-release.md)     |
| DevTools agent tooling, backend choices                       | [tooling-and-backend.md](references/tooling-and-backend.md)     |
| Social components, game services, operations, desktop         | [capability-map.md](references/capability-map.md)               |

## Rules that prevent most bugs

For engine projects, verify these behaviors through the engine adapters; do not install a second native platform layer.

1. **The first `wx.createCanvas()` is the screen.** Every later call makes an offscreen canvas, so create the screen
   canvas before any library can. `wx.createOffscreenCanvas` is not in the mini game API docs.
2. **Size the canvas in device pixels and draw in logical pixels.** Set `canvas.width` to `windowWidth * pixelRatio` and
   apply one transform. Skipping this makes graphics blurry, while skipping the transform draws everything too small.
3. **Ask for the menu button position.** Use `wx.getMenuButtonBoundingClientRect()`. Its size varies by device, so
   hardcoded numbers end up with buttons under it. `safeArea.top` alone is not enough, because the button sits below it.
4. **Treat `safeArea` as optional.** Some devices omit it, and the docs define it in portrait even for landscape games.
5. **Read `changedTouches` in touch handlers.** `touches` lists every finger still down, so it is empty when the last
   finger lifts. A touch cancel means the system took over, so never count it as a tap.
6. **Handle leaving and returning.** Pause on `wx.onHide`, resume on `wx.onShow`, and treat
   `wx.onAudioInterruptionBegin` and `wx.onAudioInterruptionEnd` the same way, because audio stays stopped otherwise.
7. **Use the replacements for retired APIs.** `wx.getSystemInfoSync` has been unmaintained since base library 2.20.1,
   so use `wx.getWindowInfo`, `wx.getDeviceInfo` and `wx.getAppBaseInfo`. The shared global is `GameGlobal`.
8. **Never trust the client with money or secrets.** Payment callbacks can be lost and clients can be tampered with, so
   grant purchases from your server. AppSecret, AppKey and `session_key` must never reach the client.
9. **Never build rewards on a share completing.** `wx.shareAppMessage` documents no `success` callback.
10. **Check every API against the docs before using it.** WeChat has many similar-looking APIs, and mini program APIs
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
