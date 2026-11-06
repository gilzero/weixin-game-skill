# WeChat Mini Game Skill

Teaches Claude Code and other agents how to build, debug and ship WeChat mini games (微信小游戏) correctly: verified
platform rules, a starter that runs with no build step, and a way to read the current official docs.

让 AI 编程助手正确开发微信小游戏：经过核对的平台规则、无需构建即可运行的起步项目，以及随时读取最新官方文档的方法。

## Install

Install the skill into the game project you want the agent to work on. The CLI examples require Git and Bun.

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

Use `--scope user` instead for all projects. For a skill-only installation without the plugin, use the Claude Code row below.

**Codex, Antigravity, Cursor, or Claude Code without plugins:** run the matching
[skills CLI](https://github.com/vercel-labs/skills/blob/main/docs/commands.md) command from your game project's root:

| AI coding agent | Project installation command                                                      |
| --------------- | --------------------------------------------------------------------------------- |
| Codex           | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a codex -y`       |
| Claude Code     | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a claude-code -y` |
| Antigravity     | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a antigravity -y` |
| Cursor          | `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a cursor -y`      |

Choose one route per agent to avoid duplicate discovery. Add `-g` for a user-wide skills CLI installation; let the CLI
choose the agent's global path. Project installs use `.agents/skills/` for Codex, Antigravity and Cursor, and
`.claude/skills/` for Claude Code, as listed in the [agent directory table](https://github.com/vercel-labs/skills/blob/main/docs/agents.md).

**Manual/offline:** obtain this repository, then copy the whole `skills/weixin-game/` directory into
`your-game/.agents/skills/` for Codex, Cursor or Antigravity, or `your-game/.claude/skills/` for Claude Code.
Keep `SKILL.md`, `references/`, `scripts/` and `assets/` together; copying only `SKILL.md` breaks the skill.

**Verify:** use `bunx skills list` (add `-g` for global installs), or Claude Code's `/plugin` for its plugin route.
Then open the game project in your agent and ask it to use `weixin-game` and identify the loaded `SKILL.md` path.
[Codex CLI/IDE](https://developers.openai.com/codex/skills) also supports `/skills` and explicit `$weixin-game` invocation.
If discovery is stale, start a new session or restart the agent. Discovery alone does not verify game behavior.

**Update:** run `bunx skills update` for CLI installs. For the Claude plugin, run
`claude plugin update weixin-game@weixin-game-skill`, or enable auto-update for its marketplace in `/plugin`.
Manual copies must be replaced with the complete updated skill folder.

## Use

Describe a WeChat mini game task; the agent can select the skill automatically or you can request it explicitly:

```text
帮我做一个微信小游戏：点击下落的方块得分
Add a friends leaderboard to my WeChat mini game
这个 canvas 在真机上很模糊，右上角按钮还挡住了分数
Our game is 6MB and won't upload. How do we split it?
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
├── references/           Platform, rendering, audio, assets, social, payment, performance and release
│   ├── engines.md                 Source/build routing, runtime profiles, desktop and textures
│   ├── tooling-and-backend.md     Official agent tooling and optional CloudBase route
│   └── capability-map.md          Social, multiplayer, operations and diagnostics lookup
├── assets/starter/       Runnable project with a small sample game
└── scripts/wx-doc.sh     Find and read live docs
```

The starter's `js/platform/` covers canvas scaling, the menu button and safe area, multi-touch, audio interruptions,
storage, sharing, error breadcrumbs and update prompts. Timed rounds use foreground elapsed time separately from simulation steps. Replace `js/game/` with your game.
Platform services expose cleanup hooks, resize notifications run after layout updates, and landscape uses a side HUD.

## Staying current

- **The live docs win.** Any official page is available as clean Markdown by changing `.html` to `.md`. The skill tells
  the agent to check them, and `scripts/wx-doc.sh` makes that one command.
- **Every reference is dated.** Each file states when it was last checked against the docs.
- **Selected assertions detect drift.** `bun run check:docs` checks registered facts, official Markdown links, API names
  and guide-sidebar additions/removals. Payment checks include the newer community article and its API-table conflict.
  Exit 1 means changed assertions; exit 2 means evidence unavailable, including HTTP-200 error pages. The weekly action
  distinguishes these outcomes. Review dates record a baseline, not proof that every statement is checked automatically.
- **Examples are checked.** Typed application contracts replace blanket missing-name suppression. Behavioral tests
  exercise cache failures, leaderboard ordering, payment fallback and slow-frame countdowns.

## What's been tested

| Check                                                            | How                           |
| ---------------------------------------------------------------- | ----------------------------- |
| Starter logic and platform code against a mocked `wx`            | Automated, `bun qc`           |
| Doc snippets against the official `wx` type definitions          | Automated, `bun qc`           |
| Facts, links and API names against the live docs                 | Automated, weekly             |
| All three install routes                                         | Run by hand                   |
| Codex, Cursor and Antigravity CLIs find the skill                | Run by hand                   |
| A real round in headless Chromium on four screen shapes          | Run by hand, with a stub `wx` |
| A real round in the WeChat DevTools simulator, with a test AppID | Run by hand                   |
| Real phones                                                      | **Not yet run**               |

Trigger tests and coding-task comparisons ran on Claude only, so the other tools are confirmed to find the skill but not
measured on how well they follow it. Nothing has run on a phone yet, and DevTools is only a simulator, so check real iOS and Android phones before you ship. Undocumented rendering behavior uses feature detection.

## Contributing

```bash
bun install
bun qc              # format, lint, type check, test
bun run check:docs  # compare with the live docs (needs network)
bun run eval        # dry run: shows case and API call counts
```

To run API evaluations, set `OPENAI_API_KEY`, `EVAL_MODEL` and optionally `EVAL_JUDGE_MODEL`, then run
`bun run eval --run --suite tasks --limit 1`. Use `--suite triggers` for description relevance, or omit `--suite` for both.
`--mode skill|baseline|both` controls task comparisons. Each task variant makes two API calls; each trigger makes one.
The runner uses [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), saves
artifacts and evidence under gitignored `eval-results/`, and exits 1 for failed expectations/syntax or 2
for incomplete execution. It supplies skill resources as context and never executes generated code, so it measures
answer quality, not actual file copying, progressive loading, host activation or phone behavior. Review model grades.
Fixtures cover existing native and engine projects. Reports include skill/suite/fixture hashes, model versions and run
count; generated JS/TS/JSON receives syntax checks without execution. Offline tests pass; no live scores for these new cases.

See [AGENTS.md](AGENTS.md) for how the repo is organised and how to update a fact.

## Credits and license

Based on [wukaikailive/weixin-game-skill](https://github.com/wukaikailive/weixin-game-skill). [MIT](LICENSE).

WeChat and 微信 are trademarks of Tencent. This is an independent project and is not affiliated with Tencent.

update_20261106_142702_HKT_cat_blackhole_🐱🕳️
