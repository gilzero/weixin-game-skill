# Ads and virtual payment

Last verified against the official docs: 2026-11-08. These rules change often, so
[re-read the live pages](../SKILL.md#keep-this-current) before giving a definite answer.

## Ads

[Eligibility](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/ad.md) for 流量主 requires one of: over
500 unique visitors with no serious violations; an active built-in game club plus 5 official posts; or a qualifying mini
program under the same company. Open it in the MP console under 功能, 流量主, where you also get the ad unit IDs.

### Rewarded video

[`wx.createRewardedVideoAd`](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/rewarded-video-ad.md)
returns a global singleton that loads automatically, so create it early, keep one reference, and tie each show attempt to
a single consumable reward callback:

```js
const rewardedAd = wx.createRewardedVideoAd({ adUnitId: 'your-ad-unit-id' });
/** @type {(() => void) | null} */
let pendingReward = null;
let showingAd = false;

rewardedAd.onError(error => console.error('rewarded ad failed', error));

rewardedAd.onClose(result => {
  const reward = pendingReward;
  pendingReward = null;
  showingAd = false;
  // result is undefined below base library 2.1.0, where the close button only appeared at the end.
  if (reward && ((result && result.isEnded) || result === undefined)) reward();
});

function showRewardedAd(onReward = grantReward) {
  if (showingAd) return;
  showingAd = true;
  pendingReward = onReward;
  rewardedAd.show().catch(() =>
    rewardedAd
      .load()
      .then(() => rewardedAd.show())
      .catch(error => {
        pendingReward = null;
        showingAd = false;
        showAdUnavailableMessage(error);
      }),
  );
}
```

- Grant only when `isEnded` is true, because the close button is always visible and players can quit early.
- Viewing is limited per user per day. Handle failure kindly and keep the game playable, rather than showing a button
  that does nothing.
- The ad draws above the canvas. Pause the game and audio while it shows.
- For rewards worth protecting, add the server check described in the guide (激励广告反作弊).
- From 3.7.7, error 1004 can show a fallback share page instead of an ad. A launch `query` containing
  `wxad_fallback_share=1` identifies these visits.

For reusable integrations, keep one active show attempt tied to a specific gameplay action. Ignore repeated taps until
close/failure, consume that attempt before granting a reward, and ignore duplicate or late callbacks. Pause on show;
resume on close and terminal load/show failure only if the scene is still active. Register listeners once, remove owned
listeners on scene disposal, and invalidate its pending attempt. The short example above only demonstrates API calls;
it is not that complete interaction controller.

### Banner and interstitial

- [Banners](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/banner-ad.md) take `style.left`, `top` and
  `width`. Width clamps from 300 to the screen width and height follows, so place them from `onResize` using
  `style.realHeight`. Never set a different width inside `onResize`, which can loop forever.
- Keep banners clear of `safeArea.bottom` and of your own buttons. They sit above the canvas.
- [Interstitials](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/interstitialAd-ad.md) use
  `wx.createInterstitialAd`. `show()` rejects when loading fails or a frequency limit applies, so always handle rejection.

## Virtual payment

### Before writing code

[Requirements](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/virtual-payment/virtual-payment2.md): a
certified game owned by a business or sole proprietor, connected to the real-name authentication system, with a game
licence (版号) and supporting documents. Hobby projects cannot use this, so confirm eligibility before building a store.

Games opened after 2022-11-05 use [virtual payment 2.0](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/virtual-payment/guide.md).
It offers two models:

| Model                   | Signed API mode                           | Who delivers                               |
| ----------------------- | ----------------------------------------- | ------------------------------------------ |
| Game currency (游戏币)  | `wx.requestMidasPaymentGameItem`, `coins` | Platform balance; server confirms spending |
| Direct items (道具直购) | `wx.requestMidasPaymentGameItem`, `goods` | Server processes delivery events           |

### Signed purchases

The [iOS integration guide](https://developers.weixin.qq.com/community/minigame/doc/000c64ee1b4ea0cead742304663408)
recommends the signed API for currency too: the legacy `wx.requestMidasPayment` cannot sign its request and is vulnerable
to client tampering. The `platform` field is deprecated; omit it and let WeChat detect the payment channel.

- Documentation conflict, reviewed 2026-11-08: the [API table](https://developers.weixin.qq.com/minigame/dev/api/midas-payment/wx.requestMidasPaymentGameItem.md)
  still enumerates only `goods` and `android`. Follow the newer integration guide for `coins`, verify account eligibility
  and the target client before rollout, and retain this discrepancy in the handoff. Do not silence unrelated type errors.

Generate `signData`, `paySig` and `signature` on the server. Pass the exact signed string to the client unchanged:

```js
/** @param {{signData: string, paySig: string, signature: string}} orderFromServer */
function buySignedOrder(orderFromServer) {
  wx.requestMidasPaymentGameItem({
    signData: orderFromServer.signData,
    paySig: orderFromServer.paySig,
    signature: orderFromServer.signature,
    success: () => refreshBalanceFromServer(),
    fail: error => handlePaymentFailure(error),
  });
}
```

- `paySig` is `hmac_sha256(appKey, 'requestMidasPaymentGameItem&' + signData)`; AppKey stays on the server.
- `signature` uses the [user session signature](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/signature.md)
  and server-only `session_key`. Authorize the user and select price/quantity from a server catalogue before signing.
- For `coins`, set `goodsPrice` to the currency unit price in fen; omit product ID and `attach`. For `goods`, use
  the configured `productId` and item price. `offerId` is the payment application ID, never a product ID.
- Currency quantity times unit price must match a supported price tier; read the
  [currency payment page](https://developers.weixin.qq.com/minigame/dev/api/midas-payment/wx.requestMidasPayment.md)
  rather than hardcoding a remembered price list. Generate a unique `outTradeNo` on the server within its documented format.
- Apple payments require `env: 0`; no Apple sandbox. Never initiate a real purchase as an automatic test.
- Without an existing backend, use the optional [CloudBase route](tooling-and-backend.md#backend-work).

### Delivering what was bought

- [The client callback can be lost](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/virtual-payment/guide.md),
  for example when the player kills WeChat just after paying. Never grant anything from the `success` callback alone.
- **Currency:** check the balance with the server API `pay_v2.getBalance` before starting a purchase, because the coins
  from a lost callback may already be there. Spend with `pay_v2.pay`.
- **Items:** enable delivery push in the MP console and handle `minigame_game_pay_goods_deliver_notify` on your server.
  [Retries can repeat](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/virtual-payment/goods.md), so
  deliver once per `outTradeNo` and return the same success response each time.
- Keep `wx.login` calls rare, because they can replace `session_key` and the API is rate limited. Errors 90010 and 90016
  from payment APIs mean the session needs refreshing.

### Reconciliation and refunds

Persist order ownership, amount, payment channel and state on the server. Authenticate delivery notifications and make
fulfilment atomic and idempotent by order ID. Reconcile pending orders on login/resume and after lost callbacks; do not
create a second purchase merely because a callback timed out. A currency recharge event is not proof of a successful
currency debit for an item.

[Payment event subscriptions](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/virtual-payment/event.md)
include `minigame_coin_deliver_completed` and `minigame_pay_refund_succ_notify`. Validate signatures, route by
`MsgType`/`Event`, and validate but never fulfil `IsMock` events. Deduplicate refund IDs as well as order IDs.
The iOS guide adds payment-channel fields and omits WeChat payment identifiers for Apple orders; do not require those
identifiers for every channel. Follow its linked refund inquiry guide for Apple requests and reconcile entitlements
from confirmed refund outcomes. Never assume a client cancellation means a server order is unpaid.

### Platform differences

[`wx.checkIsSupportMidasPayment`](https://developers.weixin.qq.com/minigame/dev/api/midas-payment/wx.checkIsSupportMidasPayment.md)
(3.10.3) tells you whether the current device can pay, so ask it instead of hiding the store by platform:

```js
function checkPaymentSupport(onResult) {
  // The docs say that without this API, iOS definitely cannot pay.
  if (!wx.checkIsSupportMidasPayment) {
    const platform = wx.getDeviceInfo().platform;
    onResult(['android', 'windows', 'ohos'].includes(platform) && typeof wx.requestMidasPaymentGameItem === 'function');
    return;
  }
  wx.checkIsSupportMidasPayment({
    success: result => onResult(result.data.allow_pay && typeof wx.requestMidasPaymentGameItem === 'function'),
    fail: error => {
      console.error('payment support check failed', error);
      onResult(false);
    },
  });
}
```

- Android, Windows and HarmonyOS support payment by default.
- iOS may support it, with iOS 15 or later, base library 3.10.3 or later and WeChat 8.0.68 or later. Meeting these does not
  guarantee it, so always use the result of the check. Apple payment has no sandbox, only production.
- Error `701001` still means payment was blocked on iOS, so the purchase flow must handle it.
- Complete the agreement in MP → 虚拟支付 → iOS资金概况 before enabling iOS purchases. Read the game agreement
  for current fees; mini program fee schedules do not establish game rates.
- Unknown environments, DevTools and Mac do not qualify for the legacy fallback. A false fallback means unverified or
  unavailable purchasing, not proof that a platform can never support it. The iOS guide currently excludes Mac payment.
- Cancelled payments report errors such as `1`, `-2` or `7`. Treat them as a normal outcome, not a failure to log loudly.
- Error `-15009` means a health-system limit stopped the payment, and WeChat shows its own dialog.

### Customer support when payment is unavailable

When `allow_pay` is false, disable purchasing and offer a support button if useful.
[`wx.openCustomerServiceConversation`](https://developers.weixin.qq.com/minigame/dev/api/open-api/customer-message/wx.openCustomerServiceConversation.md)
opens a support session after at least one touch event. Configure customer-message service in the MP console:

```js
function onPaymentSupportTap() {
  wx.openCustomerServiceConversation({
    sessionFrom: 'payment-unavailable',
    showMessageCard: true,
    sendMessageTitle: '支付问题咨询',
    fail: error => console.error('customer service failed', error),
  });
}
```

The API documents conversation cards, not permission to bypass payment restrictions with external payment links. Verify
current platform policy and your game's eligibility before offering an alternative purchase route. Opening support never
confirms a purchase or grants currency.
