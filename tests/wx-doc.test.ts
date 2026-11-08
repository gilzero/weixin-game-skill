import { expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skillRoot } from './helpers/mock-wx';

test('doc search indexes Chinese titles and aliases and preserves readable paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'wx-doc-search-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const curl = join(bin, 'curl');
    writeFileSync(
      curl,
      `#!/bin/sh
cat <<'HTML'
<a class="nav" href="/minigame/dev/guide/open-ability/ranklist.html"><span>排行榜</span></a>
<a href="/minigame/dev/guide/open-ability/virtual-payment/guide.html">虚拟支付</a>
<a href="/minigame/dev/api/ui/menu/wx.getMenuButtonBoundingClientRect.html">wx.getMenuButtonBoundingClientRect</a>
<a href="/minigame/dev/api/base/system/wx.getWindowInfo.html">wx.getWindowInfo</a>
<a href="/minigame/dev/guide/base-ability/audio.html">音频</a>
<a href="/minigame/dev/guide/performance/power-saving-mode.html">温控模式</a>
<a href="/minigame/dev/api/render/gpu/wx.getGPU.html">undefined</a>
<a href="/minigame/dev/api/render/gpu/wx.getGPU.html">wx.getGPU</a>
HTML
`,
    );
    chmodSync(curl, 0o755);
    for (const [query, path] of [
      ['排行榜', 'guide/open-ability/ranklist'],
      ['虚拟支付', 'guide/open-ability/virtual-payment/guide'],
      ['胶囊', 'api/ui/menu/wx.getMenuButtonBoundingClientRect'],
      ['安全区域', 'api/base/system/wx.getWindowInfo'],
      ['音效', 'guide/base-ability/audio'],
      ['省电', 'guide/performance/power-saving-mode'],
      ['getGPU', 'api/render/gpu/wx.getGPU'],
    ]) {
      const run = Bun.spawnSync(['sh', join(skillRoot, 'scripts/wx-doc.sh'), 'find', query ?? ''], {
        env: { ...process.env, TMPDIR: root, PATH: `${bin}:${process.env.PATH}` },
      });
      expect(run.exitCode).toBe(0);
      expect(run.stdout.toString().split('\t')[0]).toBe(path);
      expect(run.stdout.toString()).not.toContain('undefined');
    }
    const missing = Bun.spawnSync(['sh', join(skillRoot, 'scripts/wx-doc.sh'), 'find', 'no-such-doc'], {
      env: { ...process.env, TMPDIR: root },
    });
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr.toString()).toContain('path or title');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reader rejects HTTP 200 error bodies and distinguishes transient failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'wx-doc-read-'));
  try {
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const curl = join(bin, 'curl');
    writeFileSync(
      curl,
      `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then shift; output=$1; fi
  shift
done
if [ "$DOC_MODE" = timeout ]; then exit 28; fi
if [ "$DOC_MODE" = valid ]; then printf '## A real page\\nDocument body\\n' > "$output"; else printf '<html>Site Unavailable</html>' > "$output"; fi
printf '%s' "$DOC_STATUS"
`,
    );
    chmodSync(curl, 0o755);
    for (const [mode, status, exit] of [
      ['valid', '200', 0],
      ['error', '200', 2],
      ['error', '429', 2],
      ['error', '503', 2],
      ['error', '404', 1],
      ['timeout', '200', 2],
    ] as const) {
      const result = Bun.spawnSync(['sh', join(skillRoot, 'scripts/wx-doc.sh'), 'read', 'api/test'], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DOC_MODE: mode, DOC_STATUS: status },
      });
      expect(result.exitCode).toBe(exit);
      if (exit !== 0) expect(result.stdout.toString()).toBe('');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
