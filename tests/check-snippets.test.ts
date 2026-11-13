import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkSnippets, collectSnippets } from '../scripts/check-snippets';

test('checks syntax, callbacks, instances and undefined names with typed application contracts', () => {
  const snippets = [
    'wx.getWindowInfo(',
    'const manager = wx.getUpdateManager(); manager.onUpdateReaddy(() => {});',
    'const ad = wx.createRewardedVideoAd({adUnitId: "x"}); ad.onClose(42);',
    'const worker = wx.createWorker("workers/main.js"); worker.onProcessKiled(() => {});',
    'const ctx = wx.createCanvas().getContext("2d"); ctx.setTransform("bad", 0, 0, 1, 0, 0);',
    'const values = [1]; values.push("bad");',
    'wx.createRewardedVideoAd({adUnitId: "x"}).onClose(result => console.log(result.isEndded));',
    'renderAppSpecificScene();',
    'grantReward();',
  ].map((code, index) => ({ source: String(index), code, language: 'js' }));
  const errors = checkSnippets(snippets);
  for (let index = 0; index < 8; index += 1) expect(errors.some(error => error.snippet === String(index))).toBe(true);
  expect(errors.some(error => error.snippet === '8')).toBe(false);
});

test('missing platform typings cannot report success', () => {
  const errors = checkSnippets([{ source: 'missing', code: 'wx.getWindowInfo();', language: 'js' }], {
    typeRoots: ['/nonexistent-wechat-types'],
  });
  expect(errors.some(error => error.code === 2688)).toBe(true);
});

test('collects entrypoint and reference snippets in all supported code fences', () => {
  const root = mkdtempSync(join(tmpdir(), 'wx-snippet-test-'));
  try {
    mkdirSync(join(root, 'references'));
    writeFileSync(join(root, 'SKILL.md'), '```javascript\nwx.getWindowInfo();\n```\n');
    writeFileSync(
      join(root, 'references/api.md'),
      '```ts\nconst x: number = 1;\n```\n```js\nwx.getDeviceInfo();\n```\n',
    );
    const snippets = collectSnippets(root);
    expect(snippets).toHaveLength(3);
    expect(snippets[0]?.source).toBe('SKILL.md:2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('signed payment strings are checked using the documented wire contract', () => {
  const snippets = [
    "wx.requestMidasPaymentGameItem({signData: '{}', paySig: 'signed', signature: 'session'});",
    "wx.requestMidasPaymentGameItem({signData: 42, paySig: 'signed', signature: 'session'});",
  ].map((code, index) => ({ code, language: 'js', source: String(index) }));
  const errors = checkSnippets(snippets);
  expect(errors.some(error => error.snippet === '0')).toBe(false);
  expect(errors.some(error => error.snippet === '1')).toBe(true);
});

test('RankManager.getScore scores map and wx.isChatTool boolean return match live docs', () => {
  const snippets = [
    "wx.getRankManager().getScore({scoreKeys: ['s1'], periodType: 4, success: res => console.log(res.scores.s1?.score)});",
    'const active = wx.isChatTool(); if (active) wx.exitChatTool({});',
  ].map((code, index) => ({ code, language: 'js', source: String(index) }));
  expect(checkSnippets(snippets)).toEqual([]);
});
