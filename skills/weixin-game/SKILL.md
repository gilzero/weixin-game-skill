---
name: weixin-game
description: >-
  Build, debug and ship WeChat mini games (微信小游戏) using current, verified platform rules, a runnable starter and
  live docs lookup. Use this whenever the user mentions 微信小游戏, 小游戏开发 or WeChat mini game, or works in a project
  with game.json, game.js or wx.createCanvas, even if they only ask about one piece: canvas rendering or blurry
  graphics, touch input, audio that stops or won't play, the top-right menu button (胶囊按钮) or safe area, subpackages
  (分包) and package size, friend leaderboards (开放数据域 排行榜), sharing (转发), rewarded ads (激励视频), virtual
  payment (虚拟支付), privacy compliance, or porting a browser, H5 or Canvas game to WeChat. Not for ordinary WeChat
  mini programs (小程序) built from WXML pages, or web games that will not run inside WeChat.
license: MIT
compatibility: Live docs lookup needs network access. Running a game needs WeChat DevTools and a real or test AppID.
metadata:
  version: '2.0.0'
  docs-verified: '2026-11-06'
---

# WeChat mini games

A mini game is one full-screen canvas driven by `game.js`, with no DOM, CSS or `window`. JavaScript runs in
JavaScriptCore on iOS and V8 on Android, and DevTools is only a simulator, so the phone has the final say.

## Choose a starting point

| Situation               | What to do                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- |
| New game                | Copy `assets/starter/` into the project, then replace `js/game/` with the game   |
| Existing game           | Read the reference for the topic below before changing code                      |
| Porting a browser game  | Read [rendering and layout](references/rendering-and-layout.md), section Porting |
| API or limit not listed | Look it up with the live docs commands below                                     |

The starter runs with no build step. Its `js/platform/` files already handle the bugs listed in this skill, so build on
them rather than rewriting them. `js/game/` holds a small sample game that is meant to be replaced. Keep game rules in
plain modules that never touch `wx`, because that is what makes them testable without WeChat.

| Topic                                                         | Read                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| Limits, sizes, renamed or missing APIs                        | [platform-facts.md](references/platform-facts.md)               |
| Canvas, sharpness, game loop, menu button, safe area, porting | [rendering-and-layout.md](references/rendering-and-layout.md)   |
| Touch, audio, foreground and background, errors               | [input-audio-lifecycle.md](references/input-audio-lifecycle.md) |
| Package size, subpackages, downloads, files, storage, network | [assets-and-network.md](references/assets-and-network.md)       |
| Leaderboards, open data context, sharing, user info           | [social-and-open-data.md](references/social-and-open-data.md)   |
| Rewarded, banner and interstitial ads, virtual payment        | [monetization.md](references/monetization.md)                   |
| Memory, Workers, startup time                                 | [performance.md](references/performance.md)                     |
| Login, privacy compliance, updates, release checks            | [privacy-and-release.md](references/privacy-and-release.md)     |

## Rules that prevent most bugs

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

`scripts/wx-doc.sh` wraps this. Run it from this skill's directory:

```bash
sh scripts/wx-doc.sh find getMenuButton                        # find page paths by name
sh scripts/wx-doc.sh read api/ui/menu/wx.getMenuButtonBoundingClientRect
```

Look it up when using an API these references do not show, when quoting a limit in a user-facing decision, and whenever
behaviour contradicts these notes. Payment, ads and privacy rules change most often, so always check those before
giving a definite answer. The references were last verified on the `docs-verified` date above.

## Verify the work

Say which of these actually ran. A pass in one does not imply the others.

1. **Headless tests:** run game rules directly, and platform code against a stubbed `wx`.
2. **DevTools:** the CLI needs the service port enabled in Settings, then Security. On macOS:
   `/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project <path>`. On Windows it is `cli.bat` in the
   install folder. The project needs a real or test AppID. The CLI rejects the placeholder `touristappid`, so a project
   using it has to be imported through the DevTools window, where you can choose 测试号.
3. **A real phone:** required before release for audio, touch, memory and payment behaviour. Turn on 打开调试 from the
   top-right menu to get the vConsole log panel.

Ask the user before running `cli preview` or `cli upload`, because both send the package to WeChat's servers.
