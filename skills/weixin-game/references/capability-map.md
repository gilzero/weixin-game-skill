# Platform capability map

Last verified against the official docs: 2026-11-06.

These routes were selected from the official guide sidebar. They indicate where to research a requested feature, not
that every account/client can use it. Read the page before implementation and verify eligibility, rollout and versions.
Paths below are relative to `https://developers.weixin.qq.com/minigame/dev/`; pass them to `wx-doc.sh read`.
The reviewed sidebar baseline lives in repository tooling; new/removed guide paths cause documentation drift for review.

| Capability              | Guide path                                        | Integration caution                                         |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| Tournament / 擂台赛     | `guide/open-ability/tournament`                   | Check component access before designing around it           |
| WeChat gifts            | `guide/open-ability/WeChatGift`                   | Verify account eligibility and fulfilment rules             |
| Send items to friends   | `guide/open-ability/share-gift`                   | Keep item ownership and delivery server-authoritative       |
| Chat tool               | `guide/open-ability/chat-tool`                    | Check content security and user-data handling               |
| Targeted sharing        | `guide/open-ability/share-to-specific-friend`     | Do not infer a generic share-success reward callback        |
| Updatable messages      | `guide/open-ability/share/updatable-message`      | Verify server credentials and message lifecycle             |
| Acquisition red packets | `guide/open-ability/redbag/Introduction_config`   | Campaign eligibility is not universal access                |
| Lockstep                | `guide/open-ability/lock-step`                    | Define reconnection and authoritative simulation            |
| Rooms                   | `guide/open-ability/roomservice`                  | Handle leaving, disconnects and stale room state            |
| Matchmaking             | `guide/open-ability/gamematch`                    | Cancel pending matchmaking when a player leaves             |
| Voice chat              | `guide/open-ability/voip-chat`                    | Microphone permission and privacy apply                     |
| Save/score storage      | `guide/open-ability/storage-server/storage-score` | Validate scores; local saves are not authority              |
| Subscription messages   | `guide/open-ability/subscribe-message`            | Consent must come from the appropriate user action          |
| Game club               | `guide/open-ability/game-club`                    | A button alone does not establish ad eligibility            |
| Native template ads     | `guide/open-ability/ad/custom-ad`                 | Check placement policy and lifecycle                        |
| Playable trials         | `guide/open-ability/playable/guide`               | Trial runtime and resource constraints need separate checks |
| PC games                | `guide/open-ability/pc-game`                      | Verify desktop input, resize and real-client behavior       |
| Realtime logs           | `guide/runtime/debug/realtimelog/index`           | Redact secrets and player content before transmission       |
| Game log analysis       | `guide/runtime/debug/gamelogmanager`              | Keep build/source-map association for diagnosis             |
| Content security        | `guide/security/security`                         | Check user-generated content before public display          |
| Payment events          | `guide/open-ability/virtual-payment/event`        | Authenticate, deduplicate and separate mock events          |

For new capabilities absent here, search the live sidebar. Do not create a backend, telemetry stack or multiplayer
architecture unless the requested feature needs it. Social components with gated rollout require a fallback design.
