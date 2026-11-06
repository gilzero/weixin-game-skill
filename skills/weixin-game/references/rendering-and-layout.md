# Rendering and layout

Last verified against the official docs: 2026-11-06.

The starter implements this in `assets/starter/js/platform/screen.js` and `loop.js`. Use those files unless the project
has its own engine.

## Canvas

- The [first `wx.createCanvas()`](https://developers.weixin.qq.com/minigame/dev/api/render/canvas/wx.createCanvas.md) is
  the on-screen canvas and every later call is offscreen. A library that calls it first takes the screen.
- [`getContext`](https://developers.weixin.qq.com/minigame/dev/api/render/canvas/Canvas.getContext.md) accepts `2d`,
  `webgl`, and `webgl2` from base library 2.24.0.
- Use extra canvases to cache layers that rarely change, then draw them with `drawImage`. Each one holds a native
  texture until it is garbage collected, so keep only what you need.
- Enabling an open data context limits what the main canvas can do. See
  [the restrictions](social-and-open-data.md#restrictions-once-it-is-enabled).

## Sharpness

Touch coordinates and the menu button rect are in logical pixels, so draw in logical pixels too and keep one coordinate
system:

```js
const info = wx.getWindowInfo();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
canvas.width = Math.round(info.windowWidth * info.pixelRatio);
canvas.height = Math.round(info.windowHeight * info.pixelRatio);
ctx.setTransform(info.pixelRatio, 0, 0, info.pixelRatio, 0, 0);
```

Setting `canvas.width` resets context state, so reapply the transform after every resize. For a fixed design resolution,
add one uniform scale and offset on top, and convert touches with the same numbers. Recompute these values on resize:

```js
const info = wx.getWindowInfo();
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const designWidth = 390;
const designHeight = 844;
const dpr = info.pixelRatio;
const scale = Math.min(info.windowWidth / designWidth, info.windowHeight / designHeight);
const offsetX = (info.windowWidth - designWidth * scale) / 2;
const offsetY = (info.windowHeight - designHeight * scale) / 2;
canvas.width = Math.round(info.windowWidth * dpr);
canvas.height = Math.round(info.windowHeight * dpr);
ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offsetX * dpr, offsetY * dpr);
wx.onTouchEnd(event => {
  for (const touch of event.changedTouches) {
    const x = (touch.clientX - offsetX) / scale;
    const y = (touch.clientY - offsetY) / scale;
    if (x >= 0 && x <= designWidth && y >= 0 && y <= designHeight) handleDesignTouch(x, y);
  }
});
```

Touches are already logical pixels: do not multiply or divide them by DPR. Letterbox taps are ignored. Convert safe-area
and capsule rectangles through the same inverse transform before placing design-space controls.

## Game loop

```js
const { startLoop } = require('./js/platform/loop');
const stopLoop = startLoop((simulationSeconds, elapsedSeconds) => {
  update(simulationSeconds, elapsedSeconds);
  draw();
});
```

- The [docs](https://developers.weixin.qq.com/minigame/dev/api/render/frame/requestAnimationFrame.md) promise no
  timestamp argument on the callback, so read the clock yourself.
- The starter clamps simulation steps to 0.1 seconds but passes unclamped foreground elapsed time separately.
  Use elapsed time for timed challenges: a 20-second round still ends after 20 foreground seconds at five FPS.
  Background time is excluded. It rejects negative wall-clock deltas without counting a recovered interval twice.
  Call `stopLoop()` when disposing the scene. The wall clock cannot distinguish a forward clock change from a stall;
  for stricter timing, verify a monotonic clock and its units on the selected runtime before replacing it.
- Lower the rate with
  [`wx.setPreferredFramesPerSecond`](https://developers.weixin.qq.com/minigame/dev/api/render/frame/wx.setPreferredFramesPerSecond.md)
  on slow devices or calm scenes.

## Menu button and safe area

For a portrait layout:

```js
const menuButton = wx.getMenuButtonBoundingClientRect();
const { safeArea, windowWidth, windowHeight, statusBarHeight } = wx.getWindowInfo();
const safeTop = safeArea ? safeArea.top : statusBarHeight;
const safeBottom = safeArea ? safeArea.bottom : windowHeight;
const contentTop = Math.max(safeTop, menuButton.bottom + 8);
const topBarRight = menuButton.left - 8;
```

- [`wx.getMenuButtonBoundingClientRect`](https://developers.weixin.qq.com/minigame/dev/api/ui/menu/wx.getMenuButtonBoundingClientRect.md)
  (base library 2.1.0) reports position from the top-left of the screen, in logical pixels.
- Put HUD text on a row level with the button that ends before `menuButton.left`, or place everything below
  `menuButton.bottom`. `safeArea.top` alone leaves content under the button.
- [`safeArea`](https://developers.weixin.qq.com/minigame/dev/api/base/system/wx.getWindowInfo.md) is defined in portrait
  and is absent on some devices. The starter preserves landscape-shaped reports. For portrait-shaped reports in a wide
  window it reserves both possible notch edges conservatively; a portrait bottom inset becomes horizontal, never a
  landscape bottom inset. This cannot infer the landscape home-indicator inset or notch side. Confirm on a notched phone.
- In landscape the starter reserves a right rail for the capsule and HUD, leaving the playfield full height. In portrait
  it places gameplay below the capsule. Subscribe with `screen.onResize(listener)` to receive the updated layout and
  transform; call the returned unsubscribe function or `screen.destroy()` when replacing the screen.
- Do not sniff device models to find notches. `safeArea` already answers that.

## Orientation and large screens

Set `deviceOrientation` in
[`game.json`](https://developers.weixin.qq.com/minigame/dev/reference/configuration/app.md) to `portrait`, `landscape`,
`landscapeLeft` or `landscapeRight`. For PC and tablet, `desktopDeviceOrientation` and `resizable` apply, and
[`wx.onWindowResize`](https://developers.weixin.qq.com/minigame/dev/api/ui/window/wx.onWindowResize.md) reports changes.
See the [PC adaptation guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/pc-adapter.md).

## What the docs leave open

The docs say the 2D context implements the
[HTML Canvas 2D standard](https://developers.weixin.qq.com/minigame/dev/api/render/canvas/RenderingContext.md) but publish
no method list, and the client decides in the end. So:

- Feature-detect newer methods such as `ctx.roundRect` and keep a fallback path. Do not state that they are unsupported
  or supported without testing on a phone.
- Prefer `rgba()` and `#rrggbb` colours, because they are the safest choice. Whether `#rrggbbaa` and `hsl()` work on every
  client is undocumented.

## Images and fonts

- Create images with [`wx.createImage`](https://developers.weixin.qq.com/minigame/dev/api/render/image/wx.createImage.md)
  and wait for `onload` before drawing.
- [Code package paths](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/file-system.md) start from the
  project root. `a/b.png` and `/a/b.png` are valid, `./a/b.png` is not.
- [`wx.loadFont`](https://developers.weixin.qq.com/minigame/dev/api/render/font/wx.loadFont.md) loads custom fonts.
- Compressed textures are [available from 2.5.0](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/render.md):
  `pvr` on iOS and `etc1` on Android.

## Porting

- Browser code fails on `document` and `window` because neither exists. Either rewrite against `wx` using the
  [mapping table](platform-facts.md#browser-to-wechat) or add an adapter.
- The official [weapp-adapter](https://developers.weixin.qq.com/minigame/dev/guide/runtime/adapter.md) simulates enough
  of the browser for game engines. The docs stress it is incomplete and not part of the base library, so treat it as a
  third-party file you add and may need to extend.
- Remove `eval` and `new Function`, which are
  [not supported](https://developers.weixin.qq.com/minigame/dev/guide/runtime/js-support.md). Some template engines and
  older libraries rely on them.
- Modules use `require` and `module.exports`, with paths
  [relative to the current file](https://developers.weixin.qq.com/minigame/dev/reference/api/require.md). `node_modules`
  [is not loaded directly](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/module.md), so bundle
  dependencies or copy them in.
- For engines (Cocos, Laya, Unity), follow the engine's export flow and its
  [adaptation docs](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/engine-overview.md) rather than this
  file. Their audio and input components are usually already adapted.

## Larger projects

Write TypeScript in `src/`, type `wx` with the official `minigame-api-typings` package, and bundle to one `game.js`.
`miniprogramRoot` in `project.config.json` lets the game files live in a subfolder. Keep every `wx` call behind one
platform module so game rules stay testable.
