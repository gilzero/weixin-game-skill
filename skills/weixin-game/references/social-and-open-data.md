# Social features and open data

Last verified against the official docs: 2026-11-06.

## Friend leaderboards

Friend data can only be read inside the
[open data context](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/opendata/basic.md), a separate
sandbox that can draw but cannot send anything back. The main game shows its output by drawing the shared canvas.

`game.json`:

```json
{
  "openDataContext": "open-data"
}
```

Main game:

```js
const openDataContext = wx.getOpenDataContext();
const sharedCanvas = openDataContext.canvas;

// Only the main game may size the shared canvas, and resizing clears it.
sharedCanvas.width = boardWidth * pixelRatio;
sharedCanvas.height = boardHeight * pixelRatio;
openDataContext.postMessage({ type: 'submitScore', score: 120 });
openDataContext.postMessage({ type: 'showRanking' });

// Inside the frame loop. The ranking arrives asynchronously, so drawing once would capture an empty canvas.
function drawLeaderboard(ctx) {
  ctx.drawImage(sharedCanvas, boardX, boardY, boardWidth, boardHeight);
}
```

`open-data/index.js`:

```js
const sharedCanvas = wx.getSharedCanvas();
const ctx = sharedCanvas.getContext('2d');

function readScore(player) {
  const entry = player.KVDataList.find(item => item.key === 'score');
  return entry ? JSON.parse(entry.value).score : 0;
}

function drawRanking(players) {
  ctx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '36px sans-serif';
  players
    .slice()
    .sort((first, second) => readScore(second) - readScore(first))
    .forEach((player, index) => {
      ctx.fillText(`${index + 1}. ${player.nickname}  ${readScore(player)}`, 24, 60 + index * 64);
    });
}

wx.onMessage(message => {
  if (message.type === 'submitScore') {
    wx.setUserCloudStorage({
      KVDataList: [{ key: 'score', value: JSON.stringify({ score: message.score }) }],
      fail: error => console.error('score upload failed', error),
    });
  }
  if (message.type === 'showRanking') {
    wx.getFriendCloudStorage({
      keyList: ['score'],
      success: result => drawRanking(result.data),
      fail: error => console.error('ranking failed', error),
    });
  }
});
```

Things that catch people out:

- Draw on `wx.getSharedCanvas()`. `wx.createCanvas()` in this context makes a separate canvas nobody sees.
- A friend may have no value for your key, so guard before reading `KVDataList`.
- [`wx.getFriendCloudStorage`](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.getFriendCloudStorage.md)
  needs the user's `scope.WxFriendInteraction` permission, may miss friends added in the last 2 hours, and counts as
  personal data for [privacy compliance](privacy-and-release.md#privacy).
- Messages only go from main to open data. The context cannot reply, so all output must be drawn.
- Neither side can `require` the other's files, and the directory cannot be a subpackage.
- It has its own touch listeners. To scroll a list, handle touches inside the context, and convert coordinates yourself.
- Images must be local or on WeChat's CDN. For your own server's images, download them in the main game and post the file
  path across.
- Layout helpers: the official [minigame-canvas-engine](https://github.com/wechat-miniprogram/minigame-canvas-engine) is
  recommended in the [leaderboard guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ranklist.md).

### Restrictions once it is enabled

Adding `openDataContext` changes the main canvas in the default mode:

- `toDataURL`, `getImageData` and `readPixels` on the main canvas stop working.
- The main canvas cannot be drawn to any offscreen canvas.
- `toTempFilePath` returns a pseudo path that only works with APIs such as `wx.shareAppMessage`.
- `sharedCanvas` can only be drawn to the main canvas, and the main game cannot call `getContext` on it.
- The context itself is 2D only, and only allows
  [a short list of APIs](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/opendata/basic.md).

Base library 3.6.6 adds an alternative: `wx.getOpenDataContext({ sharedCanvasMode: 'screenCanvas' })` makes the shared
canvas a separate on-screen layer above the main canvas, and lifts the main canvas restrictions. It needs no `drawImage`
loop. The mode is global and cannot be switched once chosen.

## Sharing

The share entry in the menu is [disabled by default](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/share.md),
so turn it on at startup:

```js
wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
wx.onShareAppMessage(() => ({ title: '来挑战我的高分', query: 'from=share&level=5' }));
wx.onShareTimeline(() => ({ title: '来挑战我的高分', query: 'from=timeline' }));
```

For a share button in the game, call [`wx.shareAppMessage`](https://developers.weixin.qq.com/minigame/dev/api/share/wx.shareAppMessage.md)
from a tap:

```js
wx.shareAppMessage({ title: '我通关了第 5 关', query: 'from=share&level=5' });
```

- Documented parameters are `title`, `imageUrl`, `query`, `imageUrlId`, `toCurrentGroup` and `path`. There is no `toGroup`
  and no `success` or `fail` callback, so the game cannot know whether a share happened. Do not design rewards around it.
- `shareTimeline` is [marked beta and Android only](https://developers.weixin.qq.com/minigame/dev/api/share/wx.showShareMenu.md),
  and requires `shareAppMessage` to be shown as well.
- Images use a 5:4 ratio. With no image, WeChat uses a screenshot of the game.
- `query` must be `key1=val1&key2=val2`. Read it back from `wx.getLaunchOptionsSync()` or `wx.onShow()`.
- The menu listener can return a `promise` (2.12.0). WeChat waits up to 3 seconds before using the other fields.

## User profile

From the [user info guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/user-info.md):

- `wx.authorize({ scope: 'scope.userInfo' })` shows no dialog. The first request has to come through a native button made
  with [`wx.createUserInfoButton`](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/wx.createUserInfoButton.md).
- Check `wx.getSetting` first. If `scope.userInfo` is already granted, call `wx.getUserInfo`.
- For display only, the open data context can show the player's name and avatar with no authorization.
- This counts as personal data, so [privacy setup](privacy-and-release.md#privacy) comes first.
