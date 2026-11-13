# Platform capability map

Last verified against the official docs: 2026-11-13.

These routes were selected from the official docs. They indicate where to research a requested feature, not
that every account/client can use it. Read the page before implementation and verify eligibility, rollout and versions.
Paths below are relative to `https://developers.weixin.qq.com/minigame/dev/`; pass them to `wx-doc.sh read`.
The reviewed sidebar baseline lives in repository tooling; new/removed guide paths cause documentation drift for review.

## Social and community

| Capability                | Guide path                                                 | Integration caution                                                  |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| Tournament / 擂台赛       | `guide/open-ability/tournament`                            | 3.14.2+; `wx.login` first, 4 gift packs, 1 challenge per `update`    |
| WeChat gifts              | `guide/open-ability/WeChatGift`                            | `wx.createStoreGift` + server `present_receiver` (<= 500/order)      |
| Send items to friends     | `guide/open-ability/share-gift`                            | 48h expiry, 1–10/day; `createPageManager` or 3.11.2+ open-data APIs  |
| Interactive friend data   | `guide/open-ability/interactive-data`                      | Verify writes through JSServer `checkInteractiveData.js`             |
| Interactive friends list  | `guide/open-ability/game_Interaction_Information`          | 3.16.0+; at most 20 OpenIDs, decrypted on your server                |
| Online status and invites | `guide/open-ability/user-status`                           | `GameServerManager` login first (not on iOS High Perf); <= 256 bytes |
| Chat tool                 | `guide/open-ability/chat-tool`                             | 3.7.12+; binds `opengid` or `open_single_roomid` + `group_openid`    |
| Targeted sharing          | `guide/open-ability/share-to-specific-friend`              | Do not infer a generic share-success reward callback                 |
| Private share messages    | `guide/open-ability/share/private-message`                 | Decrypt `encryptedData` on server; never trust `res.valid` alone     |
| Updatable messages        | `guide/open-ability/share/updatable-message`               | Verify server credentials and message lifecycle                      |
| Poster / image sharing    | `guide/open-ability/share/share-image`                     | Local or temporary `path`; `style` deprecated since 3.8.2            |
| Timeline sharing          | `guide/open-ability/share-timeline_game`                   | Beta, Android, menu only; viewers start in scene `1155` preview      |
| Recommend component       | `guide/open-ability/game-evaluate`                         | `wx.createPageManager` plus the published openlink; no item rewards  |
| Game-circle recommend     | `guide/open-ability/game-recommend`                        | 3.7.6+; configuration lives in a community post, so read it first    |
| Subscription messages     | `guide/open-ability/subscribe-message`                     | Consent must come from the appropriate user action                   |
| System subscriptions      | `guide/open-ability/subscribe-system-message`              | Interaction, rank and update types; at most three per tap            |
| Update reminders          | `guide/open-ability/subscribe-update-notification-message` | Phrases chosen at submission; sent after the full release            |
| Game club                 | `guide/open-ability/game-club`                             | A button alone does not establish ad eligibility                     |
| Channels live             | `guide/open-ability/channels-live`                         | Direct tap for `wx.openChannelsLive` / `startGameLive`; check entity |
| Channels profile / event  | `guide/open-ability/channels-profile`                      | Same or associated entity only; tap-gated openers                    |
| Game recorder / 回放      | `guide/open-ability/game-recorder`                         | Check `recorder.isFrameSupported()` before recording; high CPU cost  |
| Lockstep                  | `guide/open-ability/lock-step`                             | Define reconnection and authoritative simulation                     |
| Rooms                     | `guide/open-ability/roomservice`                           | Handle leaving, disconnects and stale room state                     |
| Matchmaking               | `guide/open-ability/gamematch`                             | Cancel pending matchmaking when a player leaves                      |
| Voice chat                | `guide/open-ability/voip-chat`                             | Microphone permission and privacy apply                              |
| Save/score storage        | `guide/open-ability/storage-server/storage-score`          | 3.14.2+ `wx.getRankManager`; `scoreKey` type immutable once active   |

## Monetization and operations

| Capability                | Guide path                                         | Integration caution                                                  |
| ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Native template ads       | `guide/open-ability/ad/custom-ad`                  | Replaces unmaintained `createBannerAd`; keep clear of `safeArea`     |
| Rewarded ad SSV           | `guide/security/antiadcheat`                       | 3.10.3+; respond within 1s and deduplicate `transaction_id`          |
| Ad revenue data API       | `guide/open-ability/ad/ad-data-interface`          | Server API; pages of at most 90 rows, store results yourself         |
| IAA value prediction      | `guide/open-ability/ad/iaa`                        | Official plugin; report 30s after an ad ends; live builds only       |
| Payment events            | `guide/open-ability/virtual-payment/event`         | Authenticate, deduplicate and separate mock events                   |
| Currency flow             | `guide/open-ability/virtual-payment/coins`         | Query balance before charging; `90012` means already processed       |
| Gift packs                | `guide/open-ability/game-gift`                     | Delivered through message push; deliver idempotently                 |
| Custom activity tasks     | `guide/open-ability/custom-task`                   | Platform calls your server to check each condition                   |
| Lapsed-player recall      | `guide/open-ability/commercialization/recall-user` | Campaign with eligibility rules, not a general API                   |
| Social incentive packs    | `guide/open-ability/RewardSend`                    | Tied to dated campaigns; tournament route needs 3.16.1+              |
| CPS recommend component   | `guide/open-ability/cps-recommend`                 | 3.8.6+; needs a service-provider account and settlement setup        |
| Acquisition red packets   | `guide/open-ability/redbag/Introduction_config`    | Campaign eligibility is not universal access                         |
| Playable trials           | `guide/open-ability/playable/guide`                | Separate AppID/runtime (iOS/Android 8.0.50+, 3.5.4+); own `wx` APIs  |
| Phone number              | `guide/open-ability/getPhoneNumber`                | Non-individual; `0.03` yuan (`0.04` realtime); 1000 trial; tap-gated |
| Risk control & anti-cheat | `guide/open-ability/security`                      | Risk rank 0–4 + `getCheatData` (`1–7` days); decide on server        |
| Content security          | `guide/security/security`                          | `gameMsgSecCheck` / `gamesecurity.mediaCheck` before public display  |
| URL Link / Scheme         | `guide/open-ability/url-link`                      | Server-generated; a URL Link lasts at most 30 days                   |
| Mini-program QR codes     | `guide/open-ability/qr-code`                       | Prefer `getUnlimitedQRCode`; `getQRCode`+`createQRCode` cap at 100k  |
| Message push              | `guide/base-ability/message-push`                  | One endpoint for every event; verify signature, route by type        |
| Analytics data API        | `guide/open-ability/data-analysis`                 | Server API; daily data is computed late, poll about every 6 hours    |

## Platform and runtime

| Capability                | Guide path                                           | Integration caution                                                 |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| Launch scenes             | `guide/base-ability/scene`                           | Read the scene list; Android keeps the old scene after Home         |
| Add to desktop            | `guide/open-ability/add-desktop`                     | Automatic, release only, no event; launches report scene `1023`     |
| HarmonyOS (`ohos`)        | `guide/open-ability/ohos`                            | 3.7.0+; guard unsupported native modules and check API headers      |
| PC adaptation & perf      | `guide/open-ability/pc-adapter`                      | No black bars in pad/desktop landscape; avoid ASTC software decode  |
| Video                     | `guide/base-ability/video`                           | Native layer above the canvas; decoder untestable in DevTools       |
| Official plugins          | `guide/base-ability/plugins`                         | Official plugins only; add in the MP console before declaring       |
| Cold-start data pre-fetch | `guide/base-ability/pre-fetch`                       | Max 256KB string; rollout ratio cannot be lowered once raised       |
| Periodic data update      | `guide/base-ability/background-fetch`                | About every 12 hours for players active within 7 days               |
| HTTPDNS                   | `guide/base-ability/HTTPDNS`                         | Disable when `hasSystemProxy` is true; Service Market quota         |
| Encrypted HTTPS channel   | `guide/open-ability/user-encryptkey`                 | 2.17.3+; `getLatestUserKey` + server `getUserEncryptKey` (last 3)   |
| Bluetooth / BLE           | `guide/device/ble`                                   | Central + peripheral; declare privacy and use tap-gated settings    |
| Network tuning            | `guide/performance/perf-network`                     | `SocketTask` only; HTTP/2 headers lowercase; redirect domains       |
| Storage expansion (1GB)   | `guide/performance/diskspace`                        | Evicted per whole game on low disk; keep authoritative state remote |
| Subpackage pre-download   | `guide/performance/predownload-of-minigame-packages` | Test `preloadPackages` rules against target client/query            |
| Staged release            | `guide/base-ability/code-beta`                       | Whitelist of at most 100; cannot be withdrawn                       |
| Tap-gated APIs            | `guide/base-ability/touch-limit`                     | Only inside `wx.onTouchEnd`, `wx.showModal`, `wx.showActionSheet`   |
| API rate limits           | `guide/performance/api-frequency`                    | `wx.login` and `wx.getSetting` at most twice daily PV               |
| Errno codes               | `guide/runtime/debug/PublicErrno`                    | Prefer `errno` over `errCode` when both are present                 |

## Performance and diagnostics

| Capability                | Guide path                                                     | Integration caution                                               |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| WXWebAssembly             | `guide/performance/perf-webassembly`                           | Package path (`.wasm`/`.wasm.br`) only; keep outside `workers/`   |
| iOS High Performance      | `guide/performance/perf-high-performance`                      | 1GB/1.5GB RAM cap; JS strict mode; ASTC/ETC1 only (drops PVRTC)   |
| WebGPU                    | `guide/performance/WebGPU`                                     | Android 10+ / 8.0.79+ / 3.17.3+; keep WebGL fallback              |
| EmscriptenGLX             | `guide/performance/perf-emscriptenglx`                         | WASM engines; 3.8.12+; Android and iOS High Performance+ only     |
| Device benchmark tiers    | `guide/performance/perf-benchmarkLevel`                        | Treat `benchmarkLevel: -1` as unknown, never low-end              |
| Thermal power-saving mode | `guide/performance/power-saving-mode`                          | iOS-only plugin; mode switches apply on next launch               |
| Startup scene telemetry   | `guide/performance/perf-action-start-reportScene`              | Startup `<= 60s` only; `sceneId: 7` marks first interactive frame |
| Cover-image plugin        | `guide/performance/perf-action-start-loading-plugin`           | Game code must move to a subpackage                               |
| Runtime scene performance | `guide/performance/perf-action-runtime-reportPerformanceScene` | 3.11.0+; max 5 `setData` calls per 30s; overwrites `sceneData`    |
| Performance rating        | `guide/performance/perf-audit/perf-system-overview`            | Category-based scores (`< 90` surfaces remediation advice)        |
| Evaluation standard       | `guide/performance/perf-mesure`                                | Per category and device tier; read the current table              |
| Phone profiling tools     | `guide/performance/perf-action-device-monitor`                 | Android development and trial builds only                         |
| Cloud testing             | `guide/performance/perf-tools-cloudtest`                       | Free real-device runs; record in DevTools, replay in the cloud    |
| Engine plugins            | `guide/base-ability/game-engine-plugin`                        | Whole/main package only; never hand-edit signed plugin files      |
| WASM code splitting V2    | `guide/game-engine/WasmSplitV2_1`                              | Match `WXGameKit` vs `UnityPlugin`; never mix plugin lines        |
| Realtime logs             | `guide/runtime/debug/realtimelog/index`                        | Redact secrets and player content before transmission             |
| Game log analysis         | `guide/runtime/debug/gamelogmanager`                           | Keep build/source-map association for diagnosis                   |
| Source maps               | `guide/runtime/debug/SourceMap`                                | Beside each source file; excluded from released packages          |
| Code & memory hardening   | `devtools/codeprotect`                                         | JS `游戏深度保护` (no `eval`/TDZ/`fn.toString`) + `memoryprotect` |

For new capabilities absent here, search the live sidebar. Do not create a backend, telemetry stack or multiplayer
architecture unless the requested feature needs it. Social components with gated rollout require a fallback design.
