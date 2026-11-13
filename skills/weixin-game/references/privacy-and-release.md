# Login, privacy and release

Last verified against the official docs: 2026-11-13. Compliance rules change, so
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

- `wx.login`, [`wx.checkSession`](https://developers.weixin.qq.com/minigame/dev/api/open-api/login/wx.checkSession.md),
  `wx.getSetting` and `wx.getUserInfo` are [rate-limited](https://developers.weixin.qq.com/minigame/dev/guide/performance/api-frequency.md):
  each may total at most twice the game's daily PV, and games over the limit receive a platform notice. Call them once at launch and
  cache the result; never call them from a timer, the frame loop or every `wx.onShow`.
- `wx.checkSession` only checks the `session_key` behind the **most recent** code. Anything that fetches a code,
  including [data pre-fetch](assets-and-network.md#cold-start-data-pre-fetch), can replace it, so validate a specific
  key on the server when it matters.
- `unionid` comes back from `code2Session` without extra authorization once the game is bound to a WeChat Open Platform
  account ([UnionID](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/union-id.md)); do not ask the
  player for profile permission just to identify them across your apps.

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
/** @type {Set<(choice: {event: 'exposureAuthorization' | 'agree' | 'disagree'}) => void>} */
const pendingPrivacyResolvers = new Set();

/** @param {'agree' | 'disagree'} event */
function settlePrivacy(event) {
  const resolvers = [...pendingPrivacyResolvers];
  pendingPrivacyResolvers.clear();
  resolvers.forEach(resolve => resolve({ event }));
}

wx.onNeedPrivacyAuthorization(resolve => {
  const wasEmpty = pendingPrivacyResolvers.size === 0;
  pendingPrivacyResolvers.add(resolve);
  if (!wasEmpty) return;
  // Report the popup as soon as it is on screen, then report the choice from a real tap.
  showPrivacyDialog({
    onShown: () => pendingPrivacyResolvers.forEach(pending => pending({ event: 'exposureAuthorization' })),
    onAgree: () => settlePrivacy('agree'),
    onDisagree: () => settlePrivacy('disagree'),
    onOpenPolicy: () => wx.openPrivacyContract({ fail: error => console.error('policy failed', error) }),
  });
});

wx.requirePrivacyAuthorize({
  success: () => startFeatureThatUsesPersonalData(),
  fail: () => continueWithoutPersonalData(),
});
```

- [`wx.onNeedPrivacyAuthorization`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.onNeedPrivacyAuthorization.md),
  [`wx.requirePrivacyAuthorize`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.md)
  and callback-only [`wx.getPrivacySetting`](https://developers.weixin.qq.com/minigame/dev/api/open-api/privacy/wx.getPrivacySetting.md)
  need base library 2.32.3. `wx.onNeedPrivacyAuthorization` is an overwrite listener (a second registration replaces the
  first), so register it once centrally and coalesce concurrent `resolve` callbacks as shown above.
- To render the exact contract name (`privacyContractName`) or check whether consent is needed (`needAuthorization`,
  including after adding new data categories in MP) before opening a custom prompt, query `wx.getPrivacySetting` with
  callbacks:

```js
function checkPrivacyBeforePrompt() {
  if (!wx.getPrivacySetting) {
    startFeatureThatUsesPersonalData();
    return;
  }
  // Callback-only API: omitting callbacks returns undefined rather than a Promise.
  wx.getPrivacySetting({
    success: result => {
      setPrivacyContractTitle(result.privacyContractName);
      if (!result.needAuthorization) {
        startFeatureThatUsesPersonalData();
        return;
      }
      wx.requirePrivacyAuthorize({
        success: () => startFeatureThatUsesPersonalData(),
        fail: () => continueWithoutPersonalData(),
      });
    },
    fail: error => {
      console.error('privacy setting query failed', error);
      continueWithoutPersonalData();
    },
  });
}
```

- A policy link must open through `wx.openPrivacyContract`.
- `agree` and `disagree` must follow a real tap.
- If you register the listener, you must call `resolve`, or the waiting API never finishes.
- Refusal makes those APIs fail with `API:fail privacy permission is not authorized`. Keep the game playable when a player
  refuses.
- **Static bundle scan (`代码静态扫描`) trap:** upload and review inspect bundled JS statically — including third-party
  analytics/ad SDKs and unstripped engine adapters — for privacy-gated calls (`wx.getClipboardData`, `wx.getFuzzyLocation`,
  `wx.getLocation`, `wx.chooseImage`, `wx.chooseMedia`, `wx.getRecorderManager`, `wx.startAccelerometer`, `wx.getUserInfo`).
  Dead references that never run at runtime still trigger `未声明隐私接口` review rejections unless stripped from the
  build or declared in `用户隐私保护指引` and gated behind `wx.requirePrivacyAuthorize`.
- Other permissions, such as `scope.userFuzzyLocation`, follow the
  [authorization guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/authorize.md).

Use one active authorization UI for concurrent requests, resolve every waiting request after the player's decision,
and recheck requirements when the policy changes. Refusal must not leave pending promises or block unrelated play.

## User content, anti-cheat and code hardening

- **UGC moderation:** the [security guide](https://developers.weixin.qq.com/minigame/dev/guide/security/security.md)
  requires checking user text, images and audio/video before public display. Use the mini-game server endpoints —
  [`gameMsgSecCheck`](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamemsgseccheck.md)
  (`POST /wxa/game/content_spam/msg_sec_check`, `version: 2`, `scene` `1–5`, `<= 2500` UTF-8 chars), synchronous image
  [`gamesecurity.mediaCheck`](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_gamesecurity.mediacheck.md)
  (`POST /wxa/game/content_spam/media_check_sync`, `version: 2`, `media_type: 2`) or async audio/image
  [`mediaCheckAsync`](https://developers.weixin.qq.com/minigame/dev/api-backend/wxa-sec-check/api_mediacheckasync.md)
  (`<= 10MB`, 2,000/min, 200,000/day) — and hold content in a pending/rejected state until cleared. Privacy consent does
  not substitute for content moderation; a fixed set of built-in names and avatars avoids UGC altogether in a prototype.
- **Anti-cheat signals:** your server can query platform-detected cheat records via
  [`getCheatData`](https://developers.weixin.qq.com/minigame/dev/api-backend/safety-control-capability/api_getcheatdata.md)
  (`GET /wxa/game/content_spam/get_cheat_data`, `duration_days` `1–7`, `limit <= 1000`) alongside user risk rank (`0–4`).
- **JS and memory hardening:** DevTools 1.06.2401020+ and CI offer [`游戏深度保护`](https://developers.weixin.qq.com/minigame/dev/devtools/codeprotect.md)
  for JS files (forbids `eval`, `with`, TDZ reads before `let`/`const`, `const` reassignment, and branching on
  `fn.name`/`fn.toString`; emits `.map` files for WE分析 symbolication) and
  [memory protection](https://developers.weixin.qq.com/minigame/dev/devtools/memoryprotect.md) for sensitive JS or Unity
  variables.

## HarmonyOS (`ohos`)

From the [HarmonyOS adaptation guide](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ohos.md):

- Supported from base library **3.7.0** (JS runs on V8). Detect `wx.getDeviceInfo().platform === 'ohos'` (or `'ohos_pc'`);
  in DevTools simulation `platform` remains `'devtools'` while `wx.getDeviceInfo().system === 'HarmonyOS'`.
- Guard native modules that the HarmonyOS guide lists as unsupported: memory warnings (`wx.onMemoryWarning`), motion
  sensors (accelerometer, compass, gyroscope, device motion), camera, microphone recording, video decoder, gamepad,
  customer service (`wx.openCustomerServiceConversation`), Channels (`视频号`), GameRecorder and device network events.
- Individual API headers may update ahead of the overview table (for example, `wx.createCustomAd` marks HarmonyOS
  supported from WeChat 3.16.3 while the overview still marks `广告` unsupported). Always use runtime capability and
  rejection guards rather than OS-only assumptions, and test on a HarmonyOS Next phone.

## Updates

[Published versions reach players within about 24 hours](https://developers.weixin.qq.com/minigame/dev/guide/runtime/update-mechanism.md),
and a cold start can still run the old cached version while the new one downloads. To apply it sooner, use
[`wx.getUpdateManager`](https://developers.weixin.qq.com/minigame/dev/api/base/update/wx.getUpdateManager.md) and prompt
from `onUpdateReady`, as the starter does. For a required update, raise the minimum available version in the MP console.

- **Staged release:** after review, 提交发布 can release [to a percentage or to a whitelist](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-beta.md)
  of at most 100 WeChat IDs. A staged release cannot be withdrawn, so treat it as shipping. For features hidden from
  most players, the guide recommends a separate test server keyed by OpenID instead.
- **Source maps:** keep each `.map` file beside its source (`game.js.map` next to `game.js`). DevTools uploads them for
  the error analysis under WE分析, 性能质量, JS分析;
  [they do not count toward package size](https://developers.weixin.qq.com/minigame/dev/guide/runtime/debug/SourceMap.md)
  and are not shipped in trial or released packages. Engine builds must
  [enable source map output](https://developers.weixin.qq.com/minigame/dev/guide/performance/monitor.md) in the exporter.
- **Update reminders:** subscribers are told about a new version only when update phrases were chosen at submission.
  See [subscription messages](social-and-open-data.md#subscription-messages).

## Before release

**Project**

- [ ] `project.config.json` has the real AppID, not `touristappid` or a test one.
- [ ] `urlCheck` is on, and every domain is registered in the MP console.
- [ ] `minified` is on, and the main package is under 4MB. `cli preview --info-output info.json` reports sizes. Keep
      build-affecting flags in [`project.config.json`](https://developers.weixin.qq.com/minigame/dev/devtools/projectconfig.md)
      (never `project.private.config.json`), and note that [`uglifyFileName`](https://developers.weixin.qq.com/minigame/dev/devtools/codecompile.md)
      breaks JS files `> 500KB` that call `require` or use dynamic `require` paths.
- [ ] Every asset extension is on the upload whitelist.
- [ ] Minimum base library is set in the MP console to match the APIs used.

**Behaviour on real phones, iOS and Android**

- [ ] Nothing sits under the menu button or home indicator, on both a notched phone and a small older one.
- [ ] Locking the phone, taking a call and returning all resume play and audio correctly.
- [ ] A weak or failed network shows a message and a retry rather than hanging.
- [ ] A long session on a low-end iPhone survives without a memory crash.
- [ ] Audio obeys the mute switch as intended.
- [ ] Every visible interactive button responds (no dead or placeholder "under construction" buttons), and native template
      ads stay clear of `safeArea` insets.

**Platform and compliance**

- [ ] [Version review](https://developers.weixin.qq.com/minigame/introduction/guide/bbsh.md) and
      [mini program filing](https://developers.weixin.qq.com/minigame/introduction/guide/index.md) (小程序备案) are
      complete, with exact entity and game-name parity across MP, filing and software copyright (`软著`). Company
      entities must complete WeChat certification before filing, configure the MP age-rating badge
      ([`适龄提示`](https://developers.weixin.qq.com/minigame/introduction/guide/slts.md) `8+` / `12+` / `16+`, required
      even if drawn in-game), and supply the `苹果开发者账号` review field (email format accepted). Expedited review
      (`加急审核`) applies only to post-launch updates with `> 5,000` cumulative users (2 quotas per quarter).
- [ ] Plan for the guide's estimated 13–37 working days for IAA or 9–22 for IAP; these are estimates, not release SLAs.
- [ ] For server-generated [mini-program codes](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/qr-code.md),
      use `getUnlimitedQRCode` (`scene <= 32` chars, 5,000/min, released builds only) rather than `getQRCode` or
      `createQRCode`, which share a 100,000 lifetime cap.
- [ ] IAP stores clearly display virtual-currency exchange ratios; for iOS payment, the MP agreement, signed orders,
      reconciliation and refund handling are verified.
- [ ] Any public user content passes the applicable security checks.

- [ ] The privacy policy is filled in, accessible via `wx.openPrivacyContract`, matches what the game collects, and
      third-party SDK bundles have been audited or stripped of unused privacy-gated `wx` calls.
- [ ] `wx.onError` and `wx.onUnhandledRejection` are registered, and optional async `wx` calls handle `fail`/`.catch`.
- [ ] Subscription, navigation and settings prompts fire from `wx.onTouchEnd`, and no `wx.login` or `wx.getSetting`
      call repeats on a timer.
- [ ] Payments deliver from the server, and the store follows `wx.checkIsSupportMidasPayment` on every platform.
- [ ] HarmonyOS (`ohos`) is [checked](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ohos.md) against
      unsupported native modules and runtime guards.
- [ ] Category and licence requirements are confirmed in the MP console. They depend on the game and change over time, so
      this skill does not list them.

Ask the user before running `cli upload`, which sends a version to WeChat.
