# Login, privacy and release

Last verified against the official docs: 2026-11-06. Compliance rules change, so
[re-read the live pages](../SKILL.md#keep-this-current) before relying on them.

## Login

From the [login guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/login.md):

```js
wx.login({
  success: result => sendCodeToYourServer(result.code),
  fail: error => console.error('login failed', error),
});
```

1. [`wx.login`](https://developers.weixin.qq.com/minigame/dev/api/open-api/login/wx.login.md) returns a one-time `code`.
2. Your server exchanges it through `auth.code2Session` for `openid`, `unionid` where available, and `session_key`.
3. Your server issues its own session token to the client.

`session_key` and AppSecret stay on the server. Avoid calling `wx.login` on every launch, because it is rate limited and
can replace `session_key`.

Reuse your application session until it expires; coalesce concurrent refresh attempts and refresh WeChat login only when
needed. Keep application-token expiry separate from the WeChat session key. For teams without a backend, see
[backend choices](tooling-and-backend.md#backend-work).

## Privacy

From the [privacy guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/privacy.md):

1. **Check what you touch.** Names and avatars, location, friends data (`wx.getFriendCloudStorage` and related), photos,
   microphone, camera, Bluetooth, motion sensors and the clipboard all count, as does any data you collect through your
   own forms.
2. **Declare it.** If you handle none, confirm that in the MP console (设置, 服务内容声明, 用户隐私保护指引). Otherwise
   fill in the privacy policy there, including anything collected outside the standard APIs.
3. **Ask the player.** Either turn on the built-in popup in the MP console (基本设置, 隐私授权弹窗), or draw your own and
   report the results:

```js
wx.onNeedPrivacyAuthorization(resolve => {
  // Report the popup as soon as it is on screen, then report the choice from a real tap.
  showPrivacyDialog({
    onShown: () => resolve({ event: 'exposureAuthorization' }),
    onAgree: () => resolve({ event: 'agree' }),
    onDisagree: () => resolve({ event: 'disagree' }),
    onOpenPolicy: () => wx.openPrivacyContract({ fail: error => console.error('policy failed', error) }),
  });
});

wx.requirePrivacyAuthorize({
  success: () => startFeatureThatUsesPersonalData(),
  fail: () => continueWithoutPersonalData(),
});
```

- [`wx.onNeedPrivacyAuthorization`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.onNeedPrivacyAuthorization.md)
  and [`wx.requirePrivacyAuthorize`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.md)
  need base library 2.32.3.
- A policy link must open through `wx.openPrivacyContract`.
- `agree` and `disagree` must follow a real tap.
- If you register the listener, you must call `resolve`, or the waiting API never finishes.
- Refusal makes those APIs fail with `API:fail privacy permission is not authorized`. Keep the game playable when a player
  refuses.
- Other permissions, such as `scope.userFuzzyLocation`, follow the
  [authorization guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/authorize.md).

Use one active authorization UI for concurrent requests, resolve every waiting request after the player's decision,
and recheck requirements when the policy changes. Refusal must not leave pending promises or block unrelated play.

## User content

The [security guide](https://developers.weixin.qq.com/minigame/dev/guide/security/security.md) requires checking user
text, images and audio/video before public display. Custom names, chat and uploaded avatars need server-side content
checks and a pending/rejected state. Read the linked backend API docs for the selected media; keep credentials on the
server. Privacy consent does not substitute for content moderation. Provide review/report handling where the feature
needs it; a fixed set of built-in names and avatars avoids accepting arbitrary content in a simple prototype.

## Updates

[Published versions reach players within about 24 hours](https://developers.weixin.qq.com/minigame/dev/guide/runtime/update-mechanism.md),
and a cold start can still run the old cached version while the new one downloads. To apply it sooner, use
[`wx.getUpdateManager`](https://developers.weixin.qq.com/minigame/dev/api/base/update/wx.getUpdateManager.md) and prompt
from `onUpdateReady`, as the starter does. For a required update, raise the minimum available version in the MP console.

## Before release

**Project**

- [ ] `project.config.json` has the real AppID, not `touristappid` or a test one.
- [ ] `urlCheck` is on, and every domain is registered in the MP console.
- [ ] `minified` is on, and the main package is under 4MB. `cli preview --info-output info.json` reports sizes.
- [ ] Every asset extension is on the upload whitelist.
- [ ] Minimum base library is set in the MP console to match the APIs used.

**Behaviour on real phones, iOS and Android**

- [ ] Nothing sits under the menu button or home indicator, on both a notched phone and a small older one.
- [ ] Locking the phone, taking a call and returning all resume play and audio correctly.
- [ ] A weak or failed network shows a message and a retry rather than hanging.
- [ ] A long session on a low-end iPhone survives without a memory crash.
- [ ] Audio obeys the mute switch as intended.

**Platform and compliance**

- [ ] [Version review and mini program filing](https://developers.weixin.qq.com/minigame/introduction/guide/index.md)
      (小程序备案) are complete. Company entities must complete WeChat certification before filing.
- [ ] Plan for the guide's estimated 13–37 working days for IAA or 9–22 for IAP; these are estimates, not release SLAs.
- [ ] For iOS payment, the MP agreement, signed orders, reconciliation and refund handling are verified.
- [ ] Any public user content passes the applicable security checks.

- [ ] The privacy policy is filled in and matches what the game collects.
- [ ] `wx.onError` and `wx.onUnhandledRejection` are registered.
- [ ] Payments deliver from the server, and the store follows `wx.checkIsSupportMidasPayment` on every platform.
- [ ] HarmonyOS (`ohos`) is [checked](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ohos.md) if you
      use native features it may not support yet.
- [ ] Category and licence requirements are confirmed in the MP console. They depend on the game and change over time, so
      this skill does not list them.

Ask the user before running `cli upload`, which sends a version to WeChat.
