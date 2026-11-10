import { expect, test } from 'bun:test';
import {
  changedPaths,
  communityContent,
  DocFetchError,
  fetchDocument,
  guideIndex,
  sectionText,
  validateDocument,
} from '../scripts/doc-source';
import { facts } from '../scripts/check-docs';

const url = 'https://developers.weixin.qq.com/minigame/dev/test.md';
function transport(response: Response | Error): typeof fetch {
  return Object.assign(
    async () => {
      if (response instanceof Error) throw response;
      return response;
    },
    { preconnect: fetch.preconnect },
  );
}

test('HTTP 200 unavailable pages and non-documents are unverifiable', async () => {
  for (const body of [
    '<!doctype html><html>Site Unavailable</html>',
    '<html>Sign in</html>',
    '',
    'not documentation',
  ]) {
    await expect(fetchDocument(url, transport(new Response(body)))).rejects.toThrow(DocFetchError);
  }
  expect(validateDocument(url, '## Actual documentation\nbody')).toContain('Actual');
  expect(validateDocument(url, '场景值列表\n===================\n\n| 1023 | 桌面 |')).toContain('1023');
  expect(() => validateDocument(url, '===\nno title above the underline')).toThrow(DocFetchError);
});

test('missing pages retain their status while network failures remain unavailable', async () => {
  for (const status of [404, 410, 429, 500, 503]) {
    try {
      await fetchDocument(url, transport(new Response('', { status })));
      throw new Error('unexpected success');
    } catch (error) {
      expect(error).toBeInstanceOf(DocFetchError);
      expect((error as DocFetchError).status).toBe(status);
    }
  }
  await expect(fetchDocument(url, transport(new Error('timeout')))).rejects.toThrow('timeout');
});

test('community responses require article content rather than an app shell', () => {
  expect(
    communityContent(url, JSON.stringify({ success: true, data: { Title: 'Guide', Content: '<p>mode coins</p>' } })),
  ).toBe('Guide\nmode coins');
  for (const body of [
    '<div id="app"></div>',
    '{}',
    '{"success":false}',
    '{"success":true,"data":{"Title":"Guide","Content":""}}',
  ]) {
    expect(() => communityContent(url, body)).toThrow(DocFetchError);
  }
});

test('sidebar parser detects added and removed capabilities and rejects malformed indexes', () => {
  expect(() => guideIndex('<html>unavailable</html>')).toThrow(DocFetchError);
  const paths = guideIndex(
    '<a href="/minigame/dev/guide/open-ability/new.html">new</a><a href="/minigame/dev/guide/open-ability/new.html">duplicate</a>',
    1,
  );
  expect(changedPaths(['guide/open-ability/old'], paths)).toEqual({
    added: ['guide/open-ability/new'],
    removed: ['guide/open-ability/old'],
  });
});

test('important negative assertions fail when an API field or upload extension appears', () => {
  const share = facts.find(fact => fact.page === 'api/share/wx.shareAppMessage');
  const files = facts.find(fact => fact.page === 'guide/base-ability/code-package');
  expect(share?.mustNotMatch).toBeDefined();
  expect(files?.mustNotMatch).toBeDefined();
  expect(new RegExp(share?.mustNotMatch ?? '', 'im').test('"属性": "success"')).toBe(true);
  expect(new RegExp(files?.mustNotMatch ?? '', 'im').test('1. webp')).toBe(true);
  expect(sectionText('## 参数\nfield\n### Child\nvalue\n## 示例\nsuccess', '## 参数')).not.toContain('success');
});
