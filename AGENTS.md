# Agent notes

This repo is a Claude Code plugin containing one skill, `skills/weixin-game`, for building WeChat mini games. `README.md`
covers what it is and how to install it.

## Installing for an AI coding agent

- Follow [README installation guidance](README.md#install) for Codex, Claude Code, Antigravity and Cursor.
- Work from the target game project, not this skill-source repository, unless installation here was requested.
- Claude Code plugin route: `claude plugin marketplace add gilzero/weixin-game-skill`, then
  `claude plugin install weixin-game@weixin-game-skill --scope project`; use `--scope user` only for a user-wide request.
- Skill-only route: `bunx skills add gilzero/weixin-game-skill --skill weixin-game -a <agent> -y`, with
  `<agent>` set to `codex`, `claude-code`, `antigravity` or `cursor`. Add `-g` only for user-wide scope.
- Use one route per agent. Do not duplicate an installed plugin with a manual copy of the same skill.
- Preserve the complete skill directory. Codex, Antigravity and Cursor use project `.agents/skills/`;
  Claude Code uses `.claude/skills/` for standalone skills. Let the installer resolve global paths.
- Verify with `bunx skills list` (`-g` for global scope) or Claude Code's `/plugin`, then check actual host discovery.
  In Codex CLI/IDE, use `/skills` or `$weixin-game`. Report the resolved skill path and restart if discovery is stale.
- Installing this skill does not install WeChat DevTools, select an AppID, provision a backend or authorize uploads.

## Commands

- `bun qc`: prettier, eslint, both type checks, doc snippet check, then all tests. Run this before calling work done.
- `bun run check:docs`: compare the skill with the live docs. Needs network. Exit code 1 means drift, 2 means the check
  could not finish, so never read 2 as drift.
- `sh skills/weixin-game/scripts/wx-doc.sh find <text>` and `read <page>`: look up current docs.
- `claude plugin validate .`: validate the plugin and marketplace manifests.
- `bun run eval`: dry run; `--run --suite tasks|triggers|all --limit 1` executes API evaluations with `OPENAI_API_KEY`
  and explicit `EVAL_MODEL`. Optional `EVAL_JUDGE_MODEL` selects the grader; `--mode skill|baseline|both` selects task
  variants. Results go to gitignored `eval-results/`. Exit 1 means failed expectations; 2 means execution failed.

Use `bun`, never npm, pnpm or yarn.

## Layout

- `skills/weixin-game/SKILL.md`: loaded when the skill triggers, so keep it short and route to references. Trigger terms
  belong in the `description`, because the body is not read until after activation.
- `skills/weixin-game/references/`: one topic per file, each with a `Last verified` date.
- `skills/weixin-game/assets/starter/`: runnable project copied into users' games. `js/platform/` is the only layer that
  calls `wx`, apart from `game.js`. `js/game/` is pure rules plus drawing.
- `scripts/`: repo tooling, not shipped to skill users' projects.
- `tests/`: `bun test` against a mocked `wx`. `tests/helpers/mock-wx.ts` follows the documented event shapes.
- `evals/evals.json`: task prompts and assertions for comparing the skill with a baseline.
- `evals/trigger-queries.json`: should-trigger and should-not-trigger prompts for testing the `description`.

## Boundaries

- The starter must run in DevTools with no build step and no dependencies, so it uses CommonJS and plain JS.
- Nothing in `skills/` may depend on `node_modules`.
- `SKILL.md` and the references must stay agent-neutral, because Codex, Cursor and Antigravity load the same files.
- pino is for `scripts/` only. The starter uses local `console.error` plus fixed-category realtime breadcrumbs; never
  transmit raw error payloads without a reviewed redaction policy.
- Starter JS uses strict parameter types via JSDoc. DOM types describe Canvas 2D only, never authorize browser globals.
- Snippets reject syntax, missing names and resolved-type errors. Omitted application helpers have explicit contracts
  in `scripts/snippet-globals.d.ts`; never restore blanket diagnostic suppression. The checker narrowly corrects the
  upstream 3.8.21 privacy resolver and signed-payment string types from live docs.
- API evals supply resources and fixtures as context, check generated syntax and save files without executing them. They do not prove
  host activation, progressive disclosure, starter copying or device behavior; model grades need review.
- Do not run `cli preview` or `cli upload` without asking, because both send the package to WeChat.
- `compileType` is `"game"` to match official sample projects, even though the docs table says `minigame`.

## Changing a fact

1. Read the live page with `wx-doc.sh read`. Never write a limit or API name from memory.
2. Update the reference and its `Last verified` date. `docs-verified` in `SKILL.md` equals the oldest reference date,
   representing the shared verification baseline; the package test enforces this.
3. Add or adjust the entry in `facts` in `scripts/check-docs.ts`, so future drift gets caught.
4. Run `bun qc` and `bun run check:docs`.

The fact registry can record review date, runtime scope, source section and conflicting evidence. HTTP failures, invalid
Markdown and empty community articles are unavailable evidence (exit 2), never drift. Sidebar changes require reviewing
`capability-map.md` before updating `scripts/docs-sidebar.json`; do not automatically accept new paths.

To cite an API as absent from the docs, add it to `API_NAMES_NOT_IN_INDEX`. The check then warns if it ever appears.

## Releasing

Bump `version` in `.claude-plugin/plugin.json`, `metadata.version` in `SKILL.md` and `package.json` together. A test keeps
all three in step. Claude Code only offers an update when the plugin version changes.

## Known gaps

- Official DevTools Skills document mini programs; this repo has not verified their game automation support.
- Engine routing and new evaluation fixtures have not been validated with a real engine export or live model comparison.
- SkillHub is a possible distribution channel; this plugin has not been submitted or listed there.
- Codex, Cursor and Antigravity were only checked for discovering the skill from `.agents/skills/`. Evals ran on Claude only.
- `scripts/wx-doc.sh` needs `sh`. Without it, agents can use the `.md` doc URLs described in `SKILL.md`.
- The starter has run in the DevTools simulator with a test AppID (one round on iPhone 12/13 size), but not on a phone.
- Mocked runs cannot prove real WeChat behaviour. Landscape safe area handling covers both shapes the client might
  report, but portrait coordinates cannot reveal the landscape home-indicator inset or notch side. The fallback reserves
  both possible notch edges conservatively; it has not been confirmed on a notched phone.
- GitHub disables scheduled workflows in a public repo after 60 days with no repository activity, and the drift check then
  stops silently. Re-enable it with `gh workflow enable docs-drift.yml`.
