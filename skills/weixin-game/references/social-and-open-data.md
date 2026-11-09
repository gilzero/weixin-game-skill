# Social features and open data

Last verified against the official docs: 2026-11-09.

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
openDataContext.postMessage({ type: 'submitScoreAndShowRanking', score: 120 });

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
  const entry = Array.isArray(player.KVDataList) && player.KVDataList.find(item => item.key === 'score');
  if (!entry) return 0;
  try {
    const stored = JSON.parse(entry.value);
    return stored && typeof stored.score === 'number' && Number.isFinite(stored.score) ? stored.score : 0;
  } catch (error) {
    console.error('invalid stored score', error);
    return 0;
  }
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

function showRanking() {
  wx.getFriendCloudStorage({
    keyList: ['score'],
    success: result => drawRanking(result.data),
    fail: error => console.error('ranking failed', error),
  });
}

let pendingWrite = false;
/** @type {number | null} */
let queuedScore = null;

/** @param {number} score */
function writeScore(score) {
  pendingWrite = true;
  wx.setUserCloudStorage({
    KVDataList: [{ key: 'score', value: JSON.stringify({ score }) }],
    success: () => {
      if (queuedScore === null) showRanking();
    },
    fail: error => console.error('score upload failed', error),
    complete: () => {
      pendingWrite = false;
      if (queuedScore !== null) {
        const nextScore = queuedScore;
        queuedScore = null;
        writeScore(nextScore);
      }
    },
  });
}

wx.onMessage(message => {
  if (message.type === 'submitScoreAndShowRanking' && Number.isFinite(message.score)) {
    if (pendingWrite) {
      queuedScore = queuedScore === null ? message.score : Math.max(queuedScore, message.score);
      return;
    }
    writeScore(message.score);
  }
  if (message.type === 'showRanking' && !pendingWrite) showRanking();
});
```

Submission and refresh are one operation: the read begins only after the write succeeds, and scores submitted while a
write is in flight coalesce to the highest pending value. Do not infer completion ordering from message ordering. For
anti-cheat protection, set `"disableSetUserStorageFromMiniProgram": true` in
[`game.json`](https://developers.weixin.qq.com/minigame/dev/reference/configuration/app.md) and write scores from your
server instead.

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
- For group rankings inside the open data context, [`wx.getGroupCloudStorage`](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.getGroupCloudStorage.md)
  accepts either `shareTicket` or (from 3.8.8, preferred) `groupid` obtained in the main game via `wx.getGroupEnterInfo`.

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
  and no `success` or `fail` callback, so the game cannot know whether a share happened. Do not design rewards around it;
  for verified friend gifting or interaction incentives, use [interactive friend data](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/interactive-data.md)
  (`wx.modifyFriendInteractiveStorage`, `wx.getUserInteractiveStorage` and JSServer verification).
- `shareTimeline` is [marked beta and Android only](https://developers.weixin.qq.com/minigame/dev/api/share/wx.showShareMenu.md),
  and requires `shareAppMessage` to be shown as well.
- Images use a 5:4 ratio. With no image, WeChat uses a screenshot of the game.
- `query` must be `key1=val1&key2=val2`. Read it back from `wx.getLaunchOptionsSync()` or `wx.onShow()`.
- The menu listener can return a `promise` (2.12.0). WeChat waits up to 3 seconds before using the other fields.
- To verify whether a visitor opened a specific direct or group share card without allowing secondary re-forwarding, use
  [private messages](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/private-message.md): create an
  `activityId` on the server (`createActivityId`, shareable for 7 days, verifiable for 120 days), declare
  `wx.updateShareMenu({ withShareTicket: true, isPrivateMessage: true, activityId })`, and after `wx.login` call
  [`wx.authPrivateMessage`](https://developers.weixin.qq.com/minigame/dev/api/share/wx.authPrivateMessage.md) with the
  launch `shareTicket`. Always decrypt `encryptedData` + `iv` on the server to match `activityId`; do not trust client
  `res.valid` alone.

## User profile

From the [user info guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/user-info.md):

- `wx.authorize({ scope: 'scope.userInfo' })` shows no dialog. The first request has to come through a native button made
  with [`wx.createUserInfoButton`](https://developers.weixin.qq.com/minigame/dev/api/open-api/user-info/wx.createUserInfoButton.md).
- Check `wx.getSetting` first. If `scope.userInfo` is already granted, call `wx.getUserInfo`.
- For display only, the open data context can show the player's name and avatar with no authorization.
- This counts as personal data, so [privacy setup](privacy-and-release.md#privacy) comes first.

## Game club button

[`wx.createGameClubButton`](https://developers.weixin.qq.com/minigame/dev/api/open-api/game-club/wx.createGameClubButton.md)
creates a native button above the canvas. Position it in logical screen coordinates, outside the capsule and your controls:

```js
const gameScreen = createScreen();
const club = wx.createGameClubButton({
  type: 'image',
  icon: 'green',
  style: {
    left: gameScreen.content.left + 16,
    top: gameScreen.content.bottom - 56,
    width: 96,
    height: 40,
    backgroundColor: '#ffffff',
  },
});
const unsubscribe = gameScreen.onResize(layout => {
  club.style.left = layout.content.left + 16;
  club.style.top = layout.content.bottom - 56;
});
function leaveClubScreen() {
  unsubscribe();
  club.destroy();
}
```

Use `club.hide()` / `club.show()` while switching overlays. Creating a button alone does not establish
[ad eligibility](monetization.md#ads).

## Subscription messages

Call [`wx.requestSubscribeMessage`](https://developers.weixin.qq.com/minigame/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.md)
from an explicit reminder-button tap. Obtain template IDs in the MP console and inspect each ID's result; API success does
not mean acceptance. Do not mix one-time and permanent template IDs. Your server sends the accepted template notification.

```js
function onReminderTap() {
  const templateId = 'template-id-from-mp-console';
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    success: result => saveSubscriptionChoice(templateId, result[templateId] === 'accept'),
    fail: error => console.error('subscription request failed', error),
  });
}
function onRankReminderTap() {
  wx.requestSubscribeSystemMessage({
    msgTypeList: ['SYS_MSG_TYPE_RANK'],
    success: result => {
      if ('SYS_MSG_TYPE_RANK' in result) showRankSubscriptionState(result.SYS_MSG_TYPE_RANK);
    },
    fail: error => console.error('system subscription failed', error),
  });
}
```

[`wx.requestSubscribeSystemMessage`](https://developers.weixin.qq.com/minigame/dev/api/open-api/subscribe-message/wx.requestSubscribeSystemMessage.md)
is also tap-only and uses predefined system message types, not template IDs. Check availability on older clients. Do not
request either subscription automatically at startup, after a timer, or after an unrelated async operation. Let players
continue if they decline.
