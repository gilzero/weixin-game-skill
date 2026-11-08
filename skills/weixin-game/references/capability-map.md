# Platform capability map

Last verified against the official docs: 2026-11-08.

These routes were selected from the official guide sidebar. They indicate where to research a requested feature, not
that every account/client can use it. Read the page before implementation and verify eligibility, rollout and versions.
Paths below are relative to `https://developers.weixin.qq.com/minigame/dev/`; pass them to `wx-doc.sh read`.
The reviewed sidebar baseline lives in repository tooling; new/removed guide paths cause documentation drift for review.

| Capability                | Guide path                                           | Integration caution                                         |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Tournament / 擂台赛       | `guide/open-ability/tournament`                      | Check component access before designing around it           |
| WeChat gifts              | `guide/open-ability/WeChatGift`                      | Verify account eligibility and fulfilment rules             |
| Send items to friends     | `guide/open-ability/share-gift`                      | Keep item ownership and delivery server-authoritative       |
| Interactive friend data   | `guide/open-ability/interactive-data`                | Verify writes through JSServer `checkInteractiveData.js`    |
| Chat tool                 | `guide/open-ability/chat-tool`                       | Check content security and user-data handling               |
| Targeted sharing          | `guide/open-ability/share-to-specific-friend`        | Do not infer a generic share-success reward callback        |
| Updatable messages        | `guide/open-ability/share/updatable-message`         | Verify server credentials and message lifecycle             |
| Acquisition red packets   | `guide/open-ability/redbag/Introduction_config`      | Campaign eligibility is not universal access                |
| Lockstep                  | `guide/open-ability/lock-step`                       | Define reconnection and authoritative simulation            |
| Rooms                     | `guide/open-ability/roomservice`                     | Handle leaving, disconnects and stale room state            |
| Matchmaking               | `guide/open-ability/gamematch`                       | Cancel pending matchmaking when a player leaves             |
| Voice chat                | `guide/open-ability/voip-chat`                       | Microphone permission and privacy apply                     |
| Save/score storage        | `guide/open-ability/storage-server/storage-score`    | Validate scores; local saves are not authority              |
| Subscription messages     | `guide/open-ability/subscribe-message`               | Consent must come from the appropriate user action          |
| Game club                 | `guide/open-ability/game-club`                       | A button alone does not establish ad eligibility            |
| Native template ads       | `guide/open-ability/ad/custom-ad`                    | Check placement policy and lifecycle                        |
| Playable trials           | `guide/open-ability/playable/guide`                  | Trial runtime and resource constraints need separate checks |
| PC games                  | `guide/open-ability/pc-game`                         | Verify desktop input, resize and real-client behavior       |
| Subpackage pre-download   | `guide/performance/predownload-of-minigame-packages` | Test `preloadPackages` rules against target client/query    |
| WebGPU                    | `guide/performance/WebGPU`                           | Android 10+ / 8.0.79+ / 3.17.3+; keep WebGL fallback        |
| Device benchmark tiers    | `guide/performance/perf-benchmarkLevel`              | Treat `benchmarkLevel: -1` as unknown, never low-end        |
| Thermal power-saving mode | `guide/performance/power-saving-mode`                | iOS-only plugin; mode switches apply on next launch         |
| WASM code splitting V2    | `guide/game-engine/WasmSplitV2_1`                    | Match `WXGameKit` vs `UnityPlugin`; never mix plugin lines  |
| Realtime logs             | `guide/runtime/debug/realtimelog/index`              | Redact secrets and player content before transmission       |
| Game log analysis         | `guide/runtime/debug/gamelogmanager`                 | Keep build/source-map association for diagnosis             |
| Content security          | `guide/security/security`                            | Check user-generated content before public display          |
| Payment events            | `guide/open-ability/virtual-payment/event`           | Authenticate, deduplicate and separate mock events          |

For new capabilities absent here, search the live sidebar. Do not create a backend, telemetry stack or multiplayer
architecture unless the requested feature needs it. Social components with gated rollout require a fallback design.
