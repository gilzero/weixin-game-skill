# WeChat Mini Game Skill

Teaches Claude Code and other agents how to build, debug and ship WeChat mini games (微信小游戏) correctly: verified
platform rules, a starter that runs with no build step, and a way to read the current official docs.

让 AI 编程助手正确开发微信小游戏：经过核对的平台规则、无需构建即可运行的起步项目，以及随时读取最新官方文档的方法。

## Install

**Claude Code (recommended).** One command, with updates through the plugin system:

```bash
claude plugin marketplace add gilzero/weixin-game-skill
claude plugin install weixin-game@weixin-game-skill
```

**Codex, Cursor and Antigravity**, using the open [skills CLI](https://github.com/vercel-labs/skills). Run it in your project
to install into `.agents/skills/`, which all three read:

```bash
bunx skills add gilzero/weixin-game-skill -a codex -y
bunx skills add gilzero/weixin-game-skill -a cursor -y
bunx skills add gilzero/weixin-game-skill -a antigravity -y
```

**Manual**, for a single project or to pin a version:

```bash
git clone https://github.com/gilzero/weixin-game-skill.git
mkdir -p your-game/.claude/skills
cp -R weixin-game-skill/skills/weixin-game your-game/.claude/skills/
```

Use `~/.claude/skills/` instead to enable it in every project. Start a new session afterwards.

**Getting updates.** Plugin updates are off by default for third-party marketplaces. Turn them on in `/plugin` under
Marketplaces, or run `claude plugin update weixin-game@weixin-game-skill`. With the skills CLI, run `bunx skills update`.

## Use

There is nothing to invoke. Describe what you want, and the skill loads when the task involves a mini game:

```text
帮我做一个微信小游戏：点击下落的方块得分
Add a friends leaderboard to my WeChat mini game
这个 canvas 在真机上很模糊，右上角按钮还挡住了分数
Our game is 6MB and won't upload. How do we split it?
```

For a new game it copies a starter project you can open straight away in
[WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html). Import the folder and choose
测试号 if you do not have an AppID yet. The placeholder `touristappid` only works through that import window, not the
DevTools CLI.

## What's included

```text
skills/weixin-game/
├── SKILL.md              Core rules and where to go next
├── references/           Loaded only when the topic comes up
│   ├── platform-facts.md          Limits, browser-to-WeChat table, commonly wrong APIs
│   ├── rendering-and-layout.md    Canvas, sharpness, game loop, menu button, safe area, porting
│   ├── input-audio-lifecycle.md   Touch, audio, background and foreground, errors
│   ├── assets-and-network.md      Subpackages, downloads, files, storage, network
│   ├── social-and-open-data.md    Leaderboards, sharing, user info
│   ├── monetization.md            Ads and virtual payment
│   ├── performance.md             Memory, Workers, startup
│   └── privacy-and-release.md     Login, privacy, updates, release checklist
├── assets/starter/       Runnable project with a small sample game
└── scripts/wx-doc.sh     Find and read live docs
```

The starter's `js/platform/` covers canvas scaling, the menu button and safe area, multi-touch, audio interruptions,
storage, sharing and update prompts. Replace `js/game/` with your game.

## Staying current

WeChat changes its limits and APIs regularly, so the skill does not rely on a frozen copy:

- **The live docs win.** Any official page is available as clean Markdown by changing `.html` to `.md`. The skill tells
  the agent to check them, and `scripts/wx-doc.sh` makes that one command.
- **Every reference is dated.** Each file states when it was last checked against the docs.
- **Drift is detected.** `bun run check:docs` compares key facts, every doc link and every `wx.*` API the skill mentions
  with the live site. A weekly GitHub Action runs it and opens an issue if something changed.

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
measured on how well they follow it. Nothing has run on a phone yet, and DevTools is only a simulator, so check real iOS and Android phones before you ship. The docs also
leave some things open, such as `ctx.roundRect` support and `#rrggbbaa` colours. The skill says so and uses feature
detection instead of guessing.

## Contributing

```bash
bun install
bun qc              # format, lint, type check, test
bun run check:docs  # compare with the live docs (needs network)
```

See [AGENTS.md](AGENTS.md) for how the repo is organised and how to update a fact.

## Credits and license

Based on [wukaikailive/weixin-game-skill](https://github.com/wukaikailive/weixin-game-skill). [MIT](LICENSE).

WeChat and 微信 are trademarks of Tencent. This is an independent project and is not affiliated with Tencent.
