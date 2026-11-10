# Social features and open data

Last verified against the official docs: 2026-11-10.

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
  and requires `shareAppMessage` to be shown as well. Per the [timeline guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share-timeline_game.md),
  it is reachable only from the menu (the game cannot start a timeline share itself), and a viewer first lands in a
  preview mode reporting scene `1155`, which shows just the shared screen or replay until they tap through.
- Forcing a share, rewarding a share on the spot or steering players to share with suggestive UI is penalised.
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

### Poster and screenshot sharing

[`wx.showShareImageMenu`](https://developers.weixin.qq.com/minigame/dev/api/share/wx.showShareImageMenu.md) (2.14.3)
opens a sheet that sends an image to a chat, the timeline, favourites or the album, for
[posters](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/share/share-image.md) such as a level-help
picture or a result card:

```js
/** @param {WechatMinigame.Canvas} posterCanvas */
function sharePoster(posterCanvas) {
  posterCanvas.toTempFilePath({
    success: result =>
      wx.showShareImageMenu({
        path: result.tempFilePath,
        fail: error => console.error('poster share failed', error),
      }),
    fail: error => console.error('poster export failed', error),
  });
}
```

- `path` must be a local or temporary file, never a remote URL. Draw the poster on an offscreen canvas you created;
  with an open data context the main canvas only exports [a pseudo path](#restrictions-once-it-is-enabled).
- From 3.8.2 the image carries a game entry by default (`needShowEntrance`, with `entrancePath` for where it opens), the
  sheet can post to the timeline, and timeline images may not contain QR codes (mini program codes are allowed).
- Documentation conflict, reviewed 2026-11-10: the poster guide still recommends `style: 'v2'` for landscape games, but
  the API page says `style` is deprecated since 3.8.2. Omit it.
- [`wx.onUserCaptureScreen`](https://developers.weixin.qq.com/minigame/dev/api/device/screen/wx.onUserCaptureScreen.md)
  fires on a system screenshot (one listener only, not simulated in DevTools). Its listener may return a `query` (3.3.0)
  for the entry on the screenshot, and may open the image sheet with a prepared poster.
- As with `wx.shareAppMessage`, a successful call does not prove anything was sent.

## Friends in the main context

Friend lists normally stay inside the open data context. Two documented exceptions return data to the main game:

- [Interactive game friends](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/game_Interaction_Information.md):
  enable 游戏互动信息 in the MP console (游戏能力地图, 社交能力), then call
  [`wx.getRelationFriendList`](https://developers.weixin.qq.com/minigame/dev/api/open-api/data/wx.getRelationFriendList.md)
  (3.16.0, `scope.interactedUserInfo`). It returns `encryptedData`, `iv` and `signature`; your server
  [decrypts](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/signature.md) them into at most 20 OpenIDs
  of friends who registered in this game and have interacted with the player. After a refusal the call fails with
  `auth deny` and shows no dialog again, so offer `wx.openSetting` from a tap.
- [Online status and invitations](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/user-status.md):
  `wx.getGameServerManager()`, then `login()` and `startStateService({ userState })` (at most 256 bytes) expose online
  friends and invitations. Read the guide for the open data side before designing a lobby around it.

Both count as personal data for [privacy compliance](privacy-and-release.md#privacy). Never treat a client-supplied
friend OpenID as proof of a relationship; verify on the server.

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
continue if they decline. Both are [tap-gated](input-audio-lifecycle.md#tap-gated-apis): call them from `wx.onTouchEnd`.

| System type                | Sent by the platform when                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| `SYS_MSG_TYPE_INTERACTIVE` | A friend's `wx.modifyFriendInteractiveStorage` call is confirmed, unless it set `quiet`    |
| `SYS_MSG_TYPE_RANK`        | A friend first overtakes the player that day on a leaderboard configured in the MP console |
| `SYS_MSG_TYPE_WHATS_NEW`   | A new version or operations activity is fully released (2.32.1; earlier libraries error)   |

- One call accepts at most three types, and each result is `accept`, `reject` or `ban`. System subscriptions stay valid
  after one acceptance ([comparison](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/subscribe-system-message.md)),
  whereas a one-time template buys a single message.
- Read the stored choice with `wx.getSetting({ withSubscriptions: true })` (`subscriptionsSetting.itemSettings`). It only
  lists choices the player marked as permanent, and `wx.getSetting` is [rate limited](platform-facts.md#limits).
- [Update reminders](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/subscribe-update-notification-message.md):
  pick up to three phrases from the fixed vocabulary when submitting a version for review. Messages go out within 24
  hours of the full release, at most one per game per player per day, to a platform-chosen share of subscribers. Joining
  the game club subscribes too (`wx.getGameClubData`).

## Recommendation component

The [rating and recommendation guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/game-evaluate.md)
opens WeChat's own recommend sheet through
[`wx.createPageManager`](https://developers.weixin.qq.com/minigame/dev/api/open-api/openlink/wx.createPageManager.md) (3.6.7):

```js
/** @param {string} recommendOpenlink copied from the official guide */
function createRecommendEntry(recommendOpenlink) {
  if (!wx.createPageManager) return null;
  const pageManager = wx.createPageManager();
  const ready = pageManager.load({ openlink: recommendOpenlink });
  ready.catch(error => console.error('recommend load failed', error));
  return {
    show: () => ready.then(() => pageManager.show({})).catch(error => console.error('recommend failed', error)),
    destroy: () => pageManager.destroy(),
  };
}
```

- The `openlink` is a constant published in each capability's guide. Copy it from the live page, never from memory.
- `load` and `show` reject with a code: `-7` means calls were too frequent, `-8` means the openlink does not match the
  running version (development, trial or release), and `-2`/`-3` mean the library or device is unsupported.
- From 3.8.6 `pageManager.on('destroy', result => ...)` reports `result.isRecommended`. The guide discourages item
  rewards for recommending, so thank the player rather than paying them.
- Other built-in activity and feature pages use the same manager with their own openlinks.
