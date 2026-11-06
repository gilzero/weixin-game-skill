# Ads and virtual payment

Last verified against the official docs: 2026-11-06. These rules change often, so
[re-read the live pages](../SKILL.md#keep-this-current) before giving a definite answer.

## Ads

[Eligibility](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/ad.md) for 流量主 requires one of: over
500 unique visitors with no serious violations; an active built-in game club plus 5 official posts; or a qualifying mini
program under the same company. Open it in the MP console under 功能, 流量主, where you also get the ad unit IDs.

### Rewarded video

[`wx.createRewardedVideoAd`](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/rewarded-video-ad.md)
returns a global singleton that loads automatically, so create it early and keep the reference:

```js
const rewardedAd = wx.createRewardedVideoAd({ adUnitId: 'your-ad-unit-id' });

rewardedAd.onError(error => console.error('rewarded ad failed', error));

rewardedAd.onClose(result => {
  // result is undefined below base library 2.1.0, where the close button only appeared at the end.
  if ((result && result.isEnded) || result === undefined) grantReward();
});

function showRewardedAd() {
  rewardedAd.show().catch(() =>
    rewardedAd
      .load()
      .then(() => rewardedAd.show())
      .catch(error => showAdUnavailableMessage(error)),
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

| Model                   | API                              | Who delivers                                                     |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Game currency (游戏币)  | `wx.requestMidasPayment`         | The platform credits a hosted balance, and your server spends it |
| Direct items (道具直购) | `wx.requestMidasPaymentGameItem` | The platform pushes a delivery event to your server              |

### Buying game currency

```js
wx.requestMidasPayment({
  mode: 'game',
  env: 0,
  offerId: 'payment-app-id-from-mp-console',
  currencyType: 'CNY',
  platform: 'android',
  buyQuantity: 10,
  zoneId: '1',
  outTradeNo: orderIdFromYourServer,
  success: () => refreshBalanceFromServer(),
  fail: error => handlePaymentFailure(error),
});
```

From [the API page](https://developers.weixin.qq.com/minigame/dev/api/midas-payment/wx.requestMidasPayment.md):

- `offerId` is the payment application ID from the MP console (虚拟支付 2.0, 基础配置), not a product ID.
- `buyQuantity` times the currency unit price must equal a fixed price tier: 1, 3, 6, 8, 12, 18, 25, 30, 40, 45, 50, 60,
  68, 73, 78, 88, 98, 108, 118, 128, 148, 168, 188, 198, 328, 648, 998, 1998 or 2998 yuan.
- `outTradeNo` must be unique per order, up to 32 characters of letters, digits and `_-|*`, and must not start with `_`.
- `env: 1` is the sandbox. The released game can only use production, and the sandbox fails there with -15010.

### Buying direct items

[`wx.requestMidasPaymentGameItem`](https://developers.weixin.qq.com/minigame/dev/api/midas-payment/wx.requestMidasPaymentGameItem.md)
takes `signData` (a JSON string), `paySig` and `signature`. Generate all three on your server:

- `paySig` is `hmac_sha256(appKey, 'requestMidasPaymentGameItem&' + signData)`. The AppKey must stay on the server.
- `signature` is the [user session signature](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/signature.md),
  which needs `session_key`, also server only.

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

### Platform differences

[`wx.checkIsSupportMidasPayment`](https://developers.weixin.qq.com/minigame/dev/api/midas-payment/wx.checkIsSupportMidasPayment.md)
(3.10.3) tells you whether the current device can pay, so ask it instead of hiding the store by platform:

```js
function checkPaymentSupport(onResult) {
  // The docs say that without this API, iOS definitely cannot pay.
  if (!wx.checkIsSupportMidasPayment) {
    onResult(wx.getDeviceInfo().platform !== 'ios');
    return;
  }
  wx.checkIsSupportMidasPayment({
    success: result => onResult(result.data.allow_pay),
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
- The payment pages only list `android` for `platform`. Read the live API page before writing iOS-specific parameters.
- Cancelled payments report errors such as `1`, `-2` or `7`. Treat them as a normal outcome, not a failure to log loudly.
- Error `-15009` means a health-system limit stopped the payment, and WeChat shows its own dialog.
