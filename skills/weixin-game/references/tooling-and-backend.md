# Agent tooling and backend choices

Last verified against the official docs: 2026-11-09.

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

Mini program virtual-payment skills can help with server tooling but do not establish mini game payment APIs, contracts
or event schemas. Use [monetization.md](monetization.md) and the mini game sources for those. Server-only keys remain
server-side regardless of host. A native offline prototype needs neither CloudBase nor a payment backend.
