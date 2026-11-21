# WeChat Mini Game Skill

Teaches Claude Code and other agents how to build, debug and ship WeChat mini games (微信小游戏) correctly: verified
platform rules, a starter that runs with no build step, and a way to read the current official docs.

让 AI 编程助手正确开发微信小游戏：经过核对的平台规则、无需构建即可运行的起步项目，以及随时读取最新官方文档的方法。

## Install

From your game project's root, run one command. If prompted, choose your coding agent.

```bash
npx skills add gilzero/weixin-game-skill
```

With Bun, use `bunx skills add gilzero/weixin-game-skill`. Add `-g` to install for all your projects.

**Ask your AI coding agent to install it:**

```text
Install the weixin-game skill from:
https://github.com/gilzero/weixin-game-skill

Install it for this project and the coding agent you are running in.
Follow the README’s matching installation instructions.
Preserve the complete skill folder, including references, scripts, and assets.
Verify that you can discover and load the skill, and report its installed path.
```

**Claude Code:** use its [plugin installer](https://code.claude.com/docs/en/discover-plugins):

```bash
claude plugin marketplace add gilzero/weixin-game-skill
claude plugin install weixin-game@weixin-game-skill --scope project
```

Use `--scope user` instead for all projects. Choose this route if you want Claude Code to manage the skill as a plugin.

**Install without prompts:** run the matching command from your game project's root. Use `npx` in place of `bunx`
if you use Node.js. See the [skills CLI reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md).

| AI coding agent | Project installation command                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| Codex           | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a codex -y`       |
| Claude Code     | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a claude-code -y` |
| Antigravity     | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a antigravity -y` |
| Cursor          | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a cursor -y`      |

Choose one route per agent to avoid duplicate discovery. See the [agent directory table](https://github.com/vercel-labs/skills/blob/main/docs/agents.md) for install locations.

**Manual/offline:** copy the whole `skills/weixin-game/` directory, including its references, scripts and assets, into
`your-game/.agents/skills/` for Codex, Cursor or Antigravity, or `your-game/.claude/skills/` for Claude Code.

**Verify:** run `npx skills list` or `bunx skills list` from the game project and look for `weixin-game`. Add `-g` for
global installs. For the Claude Code plugin, use `/plugin`. Then ask your agent to load `weixin-game` and show its `SKILL.md` path.
[Codex CLI/IDE](https://developers.openai.com/codex/skills) also supports `/skills` and explicit `$weixin-game` invocation.
If discovery is stale, start a new session or restart the agent. Discovery alone does not verify game behavior.

**Update:** run `npx skills update` or `bunx skills update`. For the Claude plugin, run
`claude plugin update weixin-game@weixin-game-skill` or enable marketplace auto-update in `/plugin`. Replace manual copies with the complete updated skill folder.

## Use

Describe a WeChat mini game task; the agent can select the skill automatically or you can request it explicitly:

```text
帮我做一个微信小游戏：点击下落的方块得分
Add a friends leaderboard to my WeChat mini game
这个 canvas 在真机上很模糊，右上角按钮还挡住了分数
Our game is 6MB and won't upload. How do we split it?
订阅按钮一点就报 can only be invoked by user TAP gesture
```

For a new native JavaScript game it copies a starter project you can open straight away in
[WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html). Import the folder and choose
测试号 if you do not have an AppID yet. The placeholder `touristappid` only works through that import window, not the
DevTools CLI. Engine projects are routed to their source/build workflow; generated exports are not durable edit targets.
The optional official `wechatide` skill can assist verification, but its game support must be tested first.

## What's included

```text
skills/weixin-game/
├── SKILL.md              Core rules and where to go next
├── references/           Platform, rendering, input, assets and network, social, payment, performance, release
│   ├── engines.md                 Source/build routing, runtime profiles, desktop and textures
│   ├── tooling-and-backend.md     Official agent tooling, CLI and CI, optional CloudBase route
│   └── capability-map.md          Grouped lookup: social, operations, platform, diagnostics
├── assets/starter/       Runnable project with a small sample game
└── scripts/wx-doc.sh     Find and read live docs
```

The starter's `js/platform/` covers canvas scaling, the menu button and safe area, multi-touch with taps fired inside `wx.onTouchEnd` (as tap-gated APIs require), audio interruptions (with automatic `GameGlobal.isIOSHighPerformanceMode` fallback and optional `obeyMuteSwitch` setup), storage, sharing, error breadcrumbs, update prompts and guarded optional `wx` callbacks. Timed rounds track foreground elapsed time separately from simulation steps; platform services expose cleanup hooks, and landscape uses a side HUD. Replace `js/game/` with your game.

## Changelog

- **2.3.1 (2026-11-21):** Added a one-line install with `npx` or Bun, plus steps to verify and update the skill.
- **2.3.0 (2026-11-13):** Added callback-only async API rules (`wx.getPrivacySetting`, `wx.getPhoneNumber`, `wx.setDeviceOrientation`, `Canvas.toTempFilePath`, `RankManager.getScore`), `RankManager` score storage and tournaments (3.14.2+), Chat Tool mode and updatable cards (3.7.12+), official floating components (`wx.getOfficialComponentsInfo` `isVisible` vs sample `isShow` conflict), iOS High Performance mode rules and `PVRTC` texture conflict, starter `isIOSHighPerformanceMode` fallback and `obeyMuteSwitch` option (`wx.setInnerAudioOption` WebAudio caveat), offline mode (3.16.0+), HTTPS encrypted channels (`user-encryptkey`), Recharge Center (`PayChannel: 1`), `getStableAccessToken`, mini-game UGC/anti-cheat APIs, JS/Unity code hardening, `WXWeakRef`, on-device AI/VisionKit, `wx-doc.sh` aliases, and ecosystem guidance for Unity/Tuanjie (`WXAssetBundle`, texture/shader/BGM tuning), Cocos 3.8 (`cacheManager`, `Separate Engine`, WASM physics), LayaAir 3, `three-platformize`/WebGL `preserveDrawingBuffer` capture, `Layout.updateViewPort`, and MP static privacy-scan pitfalls (171 facts).
- **2.2.0 (2026-11-10):** Added tap-gated APIs (`wx.onTouchEnd`), launch scenes and add-to-desktop (`1023`), poster sharing (`wx.showShareImageMenu`), `wx.getRelationFriendList`, system subscriptions, `wx.createPageManager`, video, official plugins, periodic update, `SocketTask`/HTTP/2, API rate limits, EmscriptenGLX, phone profiling/cloud test, staged release, source maps, `miniprogram-ci`, four-table capability map, Setext doc parsing, and 3.8.22 typings (130 facts).
- **2.1.0 (2026-11-09):** Replaced retired `wx.createBannerAd` with `wx.createCustomAd` (+ `ohos` conflict); added rewarded-ad SSV, `WXWebAssembly`, HarmonyOS (`ohos`), PC desktop rules, weak-network, HTTPDNS, pre-fetch, 1GB storage, scene telemetry, private shares, and Promise-rejection guards.
- **2.0.0:** Rebuilt as an installable multi-agent skill and Claude plugin with starter platform modules, snippet type-checking and live documentation drift detection.

## Staying current

- **The live docs win.** Any official page is available as clean Markdown by changing `.html` to `.md`. The skill tells the agent to check them, and `scripts/wx-doc.sh` makes that one command, including pages the sidebar omits.
- **Every reference is dated.** Each file states when it was last checked against the docs.
- **Selected assertions detect drift.** `bun run check:docs` checks registered facts, official Markdown links, API names and guide-sidebar changes, including payment, iOS texture, floating-component and HarmonyOS conflicts. Exit 1 means drift; exit 2 means unavailable evidence (including HTTP-200 error or rate-limit pages), which the weekly workflow separates.
- **Examples are checked.** Typed application contracts replace blanket missing-name suppression. Behavioral tests exercise cache failures, leaderboard ordering, `RankManager` scores, Chat Tool cards, official overlays, privacy prechecks, `CustomAd` placement, desktop input, sockets, poster sharing, payment fallback and slow-frame countdowns.

## What's been tested

| Check                                                            | How                            |
| ---------------------------------------------------------------- | ------------------------------ |
| Starter logic and platform code against a mocked `wx`            | Automated, `bun qc`            |
| Doc snippets against the official `wx` type definitions          | Automated, `bun qc`            |
| Facts, links and API names against the live docs                 | Automated, weekly              |
| All three install routes                                         | Run by hand                    |
| GitHub shorthand via Bun installs the complete skill for Codex   | Checked in a temporary project |
| Codex, Cursor and Antigravity CLIs find the skill                | Run by hand                    |
| A real round in headless Chromium on four screen shapes          | Run by hand, with a stub `wx`  |
| A real round in the WeChat DevTools simulator, with a test AppID | Run by hand                    |
| Real phones                                                      | **Not yet run**                |

Trigger tests and coding-task comparisons ran on Claude only, so the other tools are confirmed to find the skill but not measured on how well they follow it. The 2.2.0 and 2.3.0 examples (sockets, posters, recommend sheet, `RankManager`, Chat Tool, official overlays, `getPrivacySetting`) are checked against the docs and mocks only. Nothing has run on a phone yet, and DevTools is only a simulator, so check real iOS and Android phones before you ship. Undocumented rendering behavior uses feature detection.

## Contributing

```bash
bun install
bun qc              # format, lint, type check, test
bun run check:docs  # compare with the live docs (needs network)
bun run eval        # dry run: shows case and API call counts
```

To run API evaluations, set `OPENAI_API_KEY`, `EVAL_MODEL` and optionally `EVAL_JUDGE_MODEL`, then run
`bun run eval --run --suite tasks --limit 1` (`--suite triggers` tests description relevance; `--mode skill|baseline|both`
selects task variants; two API calls per task variant, one per trigger). The runner uses
[Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), writes artifacts under
gitignored `eval-results/`, syntax-checks generated JS/TS/JSON without executing it, and exits 1 on failed expectations
or 2 on incomplete execution. Review model grades; offline tests pass without live scores for newer cases.

See [AGENTS.md](AGENTS.md) for how the repo is organised and how to update a fact.

## Credits and license

Based on [wukaikailive/weixin-game-skill](https://github.com/wukaikailive/weixin-game-skill). [MIT](LICENSE).
WeChat and 微信 are trademarks of Tencent; this independent project is not affiliated with Tencent.

update_20261113_090228_HKT_shark_cluster_🦈✨
