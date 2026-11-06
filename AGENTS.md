# Agent notes

This repo is a Claude Code plugin containing one skill, `skills/weixin-game`, for building WeChat mini games. `README.md`
covers what it is and how to install it.

## Commands

- `bun qc`: prettier, eslint, both type checks, doc snippet check, then all tests. Run this before calling work done.
- `bun run check:docs`: compare the skill with the live docs. Needs network. Exit code 1 means drift, 2 means the check
  could not finish, so never read 2 as drift.
- `sh skills/weixin-game/scripts/wx-doc.sh find <text>` and `read <page>`: look up current docs.
- `claude plugin validate .`: validate the plugin and marketplace manifests.

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
- pino is for `scripts/` only. The WeChat runtime cannot load it, so the starter logs with `console.error` on purpose.
- Do not run `cli preview` or `cli upload` without asking, because both send the package to WeChat.
- `compileType` is `"game"` to match official sample projects, even though the docs table says `minigame`.

## Changing a fact

1. Read the live page with `wx-doc.sh read`. Never write a limit or API name from memory.
2. Update the reference and its `Last verified` date, and bump `docs-verified` in `SKILL.md` if you re-verified everything.
3. Add or adjust the entry in `facts` in `scripts/check-docs.ts`, so future drift gets caught.
4. Run `bun qc` and `bun run check:docs`.

To cite something as absent from the docs, add it to `API_NAMES_NOT_IN_INDEX`. The check then warns if it ever appears.

## Releasing

Bump `version` in `.claude-plugin/plugin.json`, `metadata.version` in `SKILL.md` and `package.json` together. A test keeps
the first two in step. Claude Code only offers an update when the plugin version changes.

## Known gaps

- The starter has not run in WeChat DevTools or on a phone, because the CLI rejects the `touristappid` placeholder and needs a
  real or test AppID.
- Mocked runs cannot prove real WeChat behaviour. Landscape safe area handling covers both shapes the client might
  report, but has not been confirmed on a notched phone.
- `docs-drift.yml` only runs once this is pushed to GitHub, and whether WeChat's site answers GitHub's runners is
  untested. If it cannot, the job exits with code 2 and opens an issue saying so.
