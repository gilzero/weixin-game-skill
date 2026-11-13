# Input, audio and lifecycle

Last verified against the official docs: 2026-11-13.

The starter implements this in `assets/starter/js/platform/input.js`, `audio.js` and `app-services.js`.

## Touch

Touch listeners are global, not attached to the canvas. [Each event](https://developers.weixin.qq.com/minigame/dev/api/device/touch-event/wx.onTouchEnd.md)
has `touches` (every finger currently down) and `changedTouches` (the fingers that caused this event).

```js
wx.onTouchStart(event =>
  event.changedTouches.forEach(touch => beginTouch(touch.identifier, touch.clientX, touch.clientY)),
);
wx.onTouchMove(event =>
  event.changedTouches.forEach(touch => moveTouch(touch.identifier, touch.clientX, touch.clientY)),
);
wx.onTouchEnd(event => event.changedTouches.forEach(touch => endTouch(touch.identifier)));
wx.onTouchCancel(event => event.changedTouches.forEach(touch => cancelTouch(touch.identifier)));
```

Three bugs come from getting this wrong:

- Reading `touches` on end misses the last finger, because the list is already empty.
- Reading `touches` on start re-reports fingers already down, which resets their state and leaves timers running.
- Sending cancel through the end path counts a system interruption as a tap.

Also release all tracked touches on `wx.onHide`, because the matching end event can be lost. On Windows and Mac primary
clicks are translated to touch events, while desktop-specific controls use dedicated listeners:

```js
function bindDesktopInput() {
  /** @type {Set<string>} */
  const keysDown = new Set();
  /** @type {WechatMinigame.OnKeyDownCallback} */
  const onKeyDown = event => {
    keysDown.add(event.code);
  };
  /** @type {WechatMinigame.OnKeyUpCallback} */
  const onKeyUp = event => {
    keysDown.delete(event.code);
  };
  /** @type {WechatMinigame.OnMouseDownCallback} */
  const onMouseDown = event => {
    if (event.button === 2) handleRightClick(event.x, event.y);
  };
  /** @type {WechatMinigame.OnWheelCallback} */
  const onWheel = event => zoomCamera(event.deltaY, event.x, event.y);
  const clearKeys = () => keysDown.clear();
  if (wx.onKeyDown) wx.onKeyDown(onKeyDown);
  if (wx.onKeyUp) wx.onKeyUp(onKeyUp);
  if (wx.onMouseDown) wx.onMouseDown(onMouseDown);
  if (wx.onWheel) wx.onWheel(onWheel);
  wx.onHide(clearKeys);
  return {
    keysDown,
    destroy() {
      if (wx.offKeyDown) wx.offKeyDown(onKeyDown);
      if (wx.offKeyUp) wx.offKeyUp(onKeyUp);
      if (wx.offMouseDown) wx.offMouseDown(onMouseDown);
      if (wx.offWheel) wx.offWheel(onWheel);
      wx.offHide(clearKeys);
      clearKeys();
    },
  };
}
```

- [`wx.onKeyDown`](https://developers.weixin.qq.com/minigame/dev/api/device/keyboard/wx.onKeyDown.md) and
  [`wx.onKeyUp`](https://developers.weixin.qq.com/minigame/dev/api/device/keyboard/wx.onKeyUp.md) (base library 3.6.0, PC
  only) only fire while the window is in the foreground and after at least one user interaction such as a click. System
  shortcuts take precedence. Clear held keys on `wx.onHide`.
- [`wx.onMouseDown`](https://developers.weixin.qq.com/minigame/dev/api/device/mouse-event/wx.onMouseDown.md) (`button`: `0`
  left, `1` middle, `2` right) and [`wx.onWheel`](https://developers.weixin.qq.com/minigame/dev/api/device/wheel-event/wx.onWheel.md)
  (`deltaX`, `deltaY`, `deltaZ`) report logical window coordinates.
- For 3D or FPS camera look on Windows and Mac, [`wx.requestPointerLock`](https://developers.weixin.qq.com/minigame/dev/api/render/cursor/wx.requestPointerLock.md)
  (base library 3.2.0, paired with `wx.exitPointerLock` and `wx.isPointerLocked`) locks and hides the cursor when called
  from a user gesture; mouse movement arrives via `wx.onTouchMove`.
- For text entry use
  [`wx.showKeyboard`](https://developers.weixin.qq.com/minigame/dev/api/device/keyboard/wx.showKeyboard.md), since there
  are no input elements.

## Tap-gated APIs

Some APIs only work [in response to a tap](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/touch-limit.md):
`wx.navigateToMiniProgram`, `wx.requestSubscribeMessage`, `wx.requestSubscribeSystemMessage`, `wx.openSetting`,
`wx.openCustomerServiceChat`, `wx.getPhoneNumber`, `wx.operateGameRecorderVideo`, `wx.startHandoff`,
`wx.openAppAuthorizeSetting`, `wx.openSystemBluetoothSetting` and the Channels openers (`wx.openChannelsLive`,
`wx.openChannelsEvent`, `wx.openChannelsActivity`, `wx.openChannelsUserProfile`, `wx.reserveChannelsLive`).

- "A tap" means the callback of `wx.onTouchEnd`, `wx.showModal` or `wx.showActionSheet`. A call from `wx.onTouchStart`,
  a timer, a network callback or the frame loop fails with `can only be invoked by user TAP gesture` or
  `require user interaction (only in touchend event)`.
- Make the call directly in that callback. The docs do not promise that the gesture survives a later async step, so
  fetch template IDs, configuration or login state before showing the button.
- The starter emits its `tap` event from `wx.onTouchEnd`, so `tap` handlers qualify. `down` and `longPress` handlers do not.
- Individual API pages can add the same limit (for example `wx.exitMiniProgram`), so check the `限制` line in the header.

## Choosing an audio API

| Use                              | For                        | Why                                                    |
| -------------------------------- | -------------------------- | ------------------------------------------------------ |
| `wx.createInnerAudioContext()`   | Music and long tracks      | Streams, simple, lower memory                          |
| `{ useWebAudioImplement: true }` | Short, frequent effects    | Better performance, some extra memory (2.19.0)         |
| `wx.createWebAudioContext()`     | Synthesis and audio graphs | Standard Web Audio API, highest memory (2.19.0 and up) |

Rules from the [audio guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/audio.md):

- Reuse instances for the same sound and call `destroy()` on ones you no longer need.
- Android plays at most 10 sounds at once and quietly degrades the rest.
- [`wx.setInnerAudioOption`](https://developers.weixin.qq.com/minigame/dev/api/media/audio/wx.setInnerAudioOption.md) sets
  `obeyMuteSwitch` (iOS, default `true`), `mixWithOther` and `speakerOn` globally; the instance `obeyMuteSwitch` property
  has had no effect since 2.3.0. On iPhones with the physical Ring/Silent switch muted, `InnerAudioContext` stays silent
  unless you call `wx.setInnerAudioOption({ obeyMuteSwitch: false, fail })` (or `createAudio({ obeyMuteSwitch: false })`
  in the starter). Per the API caveats, `wx.setInnerAudioOption` does **not** apply to `wx.createWebAudioContext()` or
  `wx.createInnerAudioContext({ useWebAudioImplement: true })`, and `speakerOn: true` forces audio exclusivity by
  ignoring `mixWithOther`.
- `useWebAudioImplement` is not supported in [iOS High Performance mode](https://developers.weixin.qq.com/minigame/dev/guide/performance/perf-high-performance.md)
  (`Boolean(GameGlobal.isIOSHighPerformanceMode)`), and WebAudio there needs extra handling after a return from the
  background on iOS 17.5 and later. The starter checks `GameGlobal.isIOSHighPerformanceMode` and degrades
  `useWebAudioImplement` to `false` automatically.
- Check [supported formats per platform](https://developers.weixin.qq.com/minigame/dev/api/media/audio/InnerAudioContext.md)
  before choosing a file type.

## Audio that stops

After [`wx.onAudioInterruptionBegin`](https://developers.weixin.qq.com/minigame/dev/api/base/app/app-event/wx.onAudioInterruptionBegin.md)
all audio is paused, and
[playback only succeeds again](https://developers.weixin.qq.com/minigame/dev/api/base/app/app-event/wx.onAudioInterruptionEnd.md)
after `wx.onAudioInterruptionEnd`. So:

```js
wx.onHide(() => music.pause());
wx.onShow(() => {
  if (!interrupted && wantsMusic && !muted) music.play();
});
wx.onAudioInterruptionBegin(() => {
  interrupted = true;
  music.pause();
});
wx.onAudioInterruptionEnd(() => {
  interrupted = false;
  if (wantsMusic && !muted) music.play();
});
```

Track `wantsMusic` separately from `muted`. Otherwise unmuting restarts music that the player or the game paused on
purpose. Track whether the game is hidden independently: interruption end must not resume music until the game is
visible again. The starter enforces this for music, effects and synthesized tones.

The starter defaults to `createAudio({ useWebAudioImplement: false })`. Opt in only for a supported runtime mode.
Pooled effects restart with [`stop()`](https://developers.weixin.qq.com/minigame/dev/api/media/audio/InnerAudioContext.stop.md)
then `play()`, whose documented behavior restarts from the beginning; client-specific timing still needs phone testing.

On teardown, call `audio.destroy()`, `input.destroy()`, `screen.destroy()`, the disposer returned by `startLoop()` and,
when tearing down the whole app, the disposer returned by `installAppServices()`.
They remove their own global listeners using the matching `off` APIs, clear timers or pending frames, destroy audio
voices and [close WebAudio](https://developers.weixin.qq.com/minigame/dev/api/media/audio/WebAudioContext.close.md).

A common belief is that WeChat requires a user gesture before audio can play. The audio docs state no such rule, and
their own sample uses `autoplay`. If audio is silent, look first at the mute switch setting, the file format, the
`onError` callback and interruption handling, and test on a phone.

## Foreground and background

- [`wx.onHide`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.onHide.md) fires on screen lock,
  going home, and similar. [`wx.onShow`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.onShow.md)
  fires on return, and carries `query` and `scene`.
- Save progress on hide. The game [may be destroyed](https://developers.weixin.qq.com/minigame/dev/guide/runtime/operating-mechanism.md)
  after a while in the background or under memory pressure, and no event warns you.
- Read launch parameters, such as a share `query`, with
  [`wx.getLaunchOptionsSync`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.getLaunchOptionsSync.md)
  on a cold start, and from `wx.onShow` on a warm one.
- [Requests still running 5 seconds after hiding fail](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/network.md)
  with `fail interrupted`, so retry them on return.

## Launch scenes

[`wx.getLaunchOptionsSync`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.getLaunchOptionsSync.md)
(cold start) and `wx.onShow` (every return) carry `scene`, `query`, `shareTicket`, `referrerInfo` and `chatType`.
[`wx.getEnterOptionsSync`](https://developers.weixin.qq.com/minigame/dev/api/base/app/life-cycle/wx.getEnterOptionsSync.md)
(2.9.4) returns the most recent foreground entry. The [scene value](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/scene.md)
says how the player arrived. Read the [full list](https://developers.weixin.qq.com/minigame/dev/reference/scene-list.md)
before branching on a number; these are the ones games use most:

| Scene              | Entry                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| 1001 / 1089        | Recently used list: Discover page / pull-down on the chat list                |
| 1103 / 1104        | "My mini programs" list: Discover page / chat pull-down (from 2.29.1)         |
| 1007 / 1008 / 1044 | Share card in a direct chat / in a group chat / carrying a `shareTicket`      |
| 1023               | Desktop icon. The add-to-desktop guide says every desktop launch reports this |
| 1037 / 1038        | Opened from / returned from another mini program, with `referrerInfo.appId`   |
| 1079               | WeChat Game Center                                                            |
| 1131 / 1187        | Floating window                                                               |
| 1155               | Timeline single-page preview. See [sharing](social-and-open-data.md#sharing)  |
| 1194 / 1065        | Server-generated URL Link / URL Scheme                                        |

- On Android, pressing Home and reopening from the system desktop keeps the previous scene value.
- [Add to desktop](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/add-desktop.md) needs no integration,
  works only for the released version and cannot be listened for. The only observable signal is a later launch with
  scene `1023`; test that path in DevTools with a custom compile condition. By contrast, "My mini programs" (scenes
  `1103` / `1104`) can be queried directly via [`wx.checkIsAddedToMyMiniProgram`](https://developers.weixin.qq.com/minigame/dev/api/open-api/my-miniprogram/wx.checkIsAddedToMyMiniProgram.md)
  (2.29.1+, callback-only, `res.added`).
- Treat `query` and `scene` as untrusted input. Validate invite or reward parameters on the server.

## Errors and Promise-style `wx` calls

Register [`wx.onError`](https://developers.weixin.qq.com/minigame/dev/api/base/app/app-event/wx.onError.md) and
[`wx.onUnhandledRejection`](https://developers.weixin.qq.com/minigame/dev/api/base/app/app-event/wx.onUnhandledRejection.md)
early, or failures on players' phones leave no trace. On a phone, console output shows in
[vConsole](https://developers.weixin.qq.com/minigame/dev/guide/runtime/debug/vConsole.md), which cannot print `undefined`,
functions, `ArrayBuffer` or objects with circular references.

From base library 2.10.2, [most async `wx` APIs return a `Promise`](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/api.md)
whenever the options object omits `success`, `fail` and `complete`. Two traps catch developers out:

- **Unhandled rejections on fire-and-forget calls:** calling optional capabilities such as
  `wx.vibrateShort({ type: 'light' })` or `wx.showShareMenu(...)` with no `fail` callback or `.catch()` triggers
  `Uncaught (in promise)` and `wx.onUnhandledRejection` on PC, Mac or devices without haptics. Always pass `fail` (or
  handle `.catch`) on optional calls, as the starter does.
- **Callback-only APIs (`以 Promise 风格调用：不支持`):** beyond task-returning APIs (`request`, `downloadFile`,
  `uploadFile`, `connectSocket`), several async APIs explicitly omit Promise returns and yield `undefined` without
  callbacks — including [`wx.getPrivacySetting`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.getPrivacySetting.md),
  [`wx.getPhoneNumber`](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/wx.getPhoneNumber.md),
  `wx.checkIsAddedToMyMiniProgram`, `wx.setDeviceOrientation`, `wx.enableOfflineModeDebug`, `wx.startHandoff`,
  `wx.checkHandoffEnabled`, `Canvas.toTempFilePath` and `RankManager.getScore`. Pass `success`/`fail` callbacks on these,
  and check the API page header before `await`-ing an unfamiliar `wx` or instance method.

## Compatibility

Check for a newer API with a guard such as `if (wx.getWindowInfo)`, or compare `wx.getAppBaseInfo().SDKVersion` using the function in the
[compatibility guide](https://developers.weixin.qq.com/minigame/dev/guide/runtime/client-lib/compatibility.md). Each API's
doc page lists its minimum base library version. Set the minimum for the whole game in the MP console.

## Player diagnostics

The starter keeps detailed errors in the local console and sends only fixed error-category breadcrumbs through
[realtime logs](https://developers.weixin.qq.com/minigame/dev/guide/runtime/debug/realtimelog/index.md) when available.
The guide gives 2.14.4 for mini games while the API header says 2.7.1; retain capability detection. To diagnose production
failures, add a reviewed serializer for a build identifier, runtime/base-library version, error grouping and sanitized
stack locations. Do not transmit arbitrary rejection objects, login codes, tokens, payment signatures or player content.
Keep source maps matched to each released build and use the
[game log analysis guide](https://developers.weixin.qq.com/minigame/dev/guide/runtime/debug/gamelogmanager.md).
Remote breadcrumbs are not a substitute for testing collection and retrieval on a phone.
