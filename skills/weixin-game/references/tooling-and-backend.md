# Agent tooling and backend choices

Last verified against the official docs: 2026-11-13.

## DevTools verification

The [official DevTools Skills](https://developers.weixin.qq.com/miniprogram/dev/devtools/Skills.md) require Nightly
2.02.2607032 or newer. When `wechatide` is available, run it to discover the installed skill path, read that entrypoint
and the relevant compiler/debugger/automator references. Read tool schemas and the installed skill version rather than
inventing commands or copying a version number from this document.

The published workflow is for **mini programs**. Test its capabilities on the actual `compileType: "game"` project
before relying on it. A canvas has no WXML page elements; page-selector automation does not prove game input or rendering.
After relevant changes, compile using a supported tool, inspect console errors and take a simulator screenshot if the
installed tooling supports it. Report each result separately; refreshing a simulator is not proof of successful compilation.

- Check login status and honor interactive authorization. MCP requires its own token from Settings → Security,
  distinct from the optional CLI access token. Keep both out of source and logs.
- `project.config.json` must contain a valid real or test AppID. The shipped `touristappid` is an import placeholder,
  not an automation credential. Obtain an authorized AppID before opening through the tool; never invent one.
- Keep `compileType: "game"`; do not copy the official mini program example's compile type into a game.
- If tooling is unavailable or unsupported for games, use the classic CLI/simulator workflow in the skill and explain
  which checks remain manual. Do not claim that an untested third-party canvas MCP server solves the gap.
- Preview/upload, including the official skill's equivalents, send the package to WeChat. Ask before those operations;
  honor tool confirmation gates. Installing this skill does not authorize publishing or cloud-resource mutations.
- Do not confuse DevTools automation (`devtools/Skills.md`) with [`wxcloud/Skills`](https://developers.weixin.qq.com/minigame/dev/wxcloud/Skills.md)
  (`微信对话开放能力`, base library 3.16.1+, `app.json` `agent.skills` and `mcp.json`): the latter exposes WXML mini-program
  pages to in-WeChat AI assistants and does not run Canvas mini games or drive DevTools.

## Command line and CI

- The [DevTools CLI](https://developers.weixin.qq.com/minigame/dev/devtools/cli.md) needs the service port enabled
  (设置, 安全设置). Beyond `open`, it offers `login`, `preview`, `auto-preview`, `upload`, `close`, `quit`,
  `reset-fileutils` and `cache --clean`; `--port` selects the HTTP port, and a running instance on another port must quit
  first. `preview --info-output <file>` writes package sizes.
- [`miniprogram-ci`](https://developers.weixin.qq.com/minigame/dev/devtools/ci.md) uploads and previews without DevTools.
  Create the project with `type: 'miniGame'` (the default is `miniProgram`), a code-upload key downloaded from the MP
  console (管理, 开发管理, 开发设置, 小程序代码上传) and an IP whitelist; without a whitelisted IP, preview and upload are
  refused. `robot` selects one of 30 CI slots. It can also fetch the source map of the last upload and upload JSServer code.
  Keep compilation flags in [`project.config.json`](https://developers.weixin.qq.com/minigame/dev/devtools/projectconfig.md);
  `project.private.config.json` is gitignored IDE state and its build settings do not affect compiled output.
- The upload key can publish builds. Keep it in CI secrets, never in the repository, and reset it in the console if it
  leaks. CI preview and upload send the package to WeChat exactly like the CLI, so the same ask-first rule applies.
- `cli auto` enables the mini program automation port. As with the official skills above, test it on a
  `compileType: "game"` project before relying on it.
- For device-side evidence, see [profiling and testing on phones](performance.md#profiling-and-testing-on-phones).

## Backend work

Preserve an existing backend. For a team needing one, [CloudBase's native mini game quick start](https://docs.cloudbase.net/quick-start/frameworks/wechat-minigame-native)
and [official CloudBase skills](https://github.com/TencentCloudBase/cloudbase-skills) provide an optional path. Use the
relevant installed skill when available; otherwise read the official docs. Installation, when wanted:

```bash
bunx skills add tencentcloudbase/cloudbase-skills
```

The [Skill/MCP guide](https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/development-assistant.md) describes
connecting an environment and inspecting functions/logs. Route login/session exchange, payment signing, authenticated
callbacks and idempotent delivery to server functions. Choose and verify the environment explicitly; do not provision
or deploy cloud resources merely because this reference mentions them.

Platform events (payment delivery, gift packs, activity conditions, customer messages) all arrive at the single
[message push](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/message-push.md) URL configured in the
MP console (管理, 开发管理, 消息推送配置). Choose the encrypted mode, verify the signature on every request, and route by
`MsgType` and `Event` before handling, because unrelated features share that endpoint.

For outbound `api.weixin.qq.com` calls, prefer [`getStableAccessToken`](https://developers.weixin.qq.com/minigame/dev/api-backend/access-token/api_getstableaccesstoken.md)
(`POST https://api.weixin.qq.com/cgi-bin/stable_token`) over `getAccessToken`: normal mode (`force_refresh: false`,
10,000/min, 500,000/day) is isolated from `getAccessToken` and refreshes within the final 5 minutes without invalidating
tokens held by other servers (`force_refresh: true` allows at most 20 calls/day at `>= 30s` intervals; store `>= 512`
characters). Per the [backend API guide](https://developers.weixin.qq.com/minigame/dev/guide/base-ability/backend-api.md),
successful responses sometimes omit `errcode` and `errmsg`, so treat `errcode === undefined || errcode === 0` as success.

Mini program virtual-payment skills can help with server tooling but do not establish mini game payment APIs, contracts
or event schemas. Use [monetization.md](monetization.md) and the mini game sources for those. Server-only keys remain
server-side regardless of host. A native offline prototype needs neither CloudBase nor a payment backend.
