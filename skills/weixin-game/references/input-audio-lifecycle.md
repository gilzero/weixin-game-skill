# Input, audio and lifecycle

Last verified against the official docs: 2026-11-06.

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

Also release all tracked touches on `wx.onHide`, because the matching end event can be lost. On Windows and Mac these
events are translated from the mouse. For text entry use
[`wx.showKeyboard`](https://developers.weixin.qq.com/minigame/dev/api/device/keyboard/wx.showKeyboard.md), since there are
no input elements.

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
  `obeyMuteSwitch` (iOS) and `mixWithOther` globally. The `obeyMuteSwitch` property on the instance has had no effect
  since 2.3.0.
- `useWebAudioImplement` is not supported in iOS high performance mode, and WebAudio there needs extra handling after a
  return from the background on iOS 17.5 and later. The guide has the code.
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

On teardown, call `audio.destroy()`, `input.destroy()`, `screen.destroy()` and the disposer returned by `startLoop()`.
They remove their own global listeners using the matching `off` APIs, clear timers or pending frames, destroy audio
voices and [close WebAudio](https://developers.weixin.qq.com/minigame/dev/api/media/audio/WebAudioContext.close.md).
App services are installed once for the lifetime of the game.

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

## Errors

Register [`wx.onError`](https://developers.weixin.qq.com/minigame/dev/api/base/app/app-event/wx.onError.md) and
[`wx.onUnhandledRejection`](https://developers.weixin.qq.com/minigame/dev/api/base/app/app-event/wx.onUnhandledRejection.md)
early, or failures on players' phones leave no trace. On a phone, console output shows in
[vConsole](https://developers.weixin.qq.com/minigame/dev/guide/runtime/debug/vConsole.md), which cannot print `undefined`,
functions, `ArrayBuffer` or objects with circular references.

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
