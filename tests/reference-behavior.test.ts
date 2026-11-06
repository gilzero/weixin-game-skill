import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { collectSnippets } from '../scripts/check-snippets';

function example<T>(reference: string, marker: string, names: string, wx: object, errors: unknown[] = []): T {
  const snippet = collectSnippets().find(
    item => item.source.startsWith(`references/${reference}:`) && item.code.includes(marker),
  );
  if (!snippet) throw new Error(`Missing example ${reference}: ${marker}`);
  return runInNewContext(`${snippet.code}\n;({${names}})`, {
    wx,
    Promise,
    Map,
    console: { error: (...args: unknown[]) => errors.push(args) },
  }) as T;
}

interface ResultCallbacks {
  success(): void;
  fail(error: unknown): void;
}
interface Download {
  url: string;
  success(result: { statusCode: number; tempFilePath: string }): void;
  fail(error: unknown): void;
}
function cacheExample() {
  const files = new Set<string>();
  const downloads: Download[] = [];
  let decode = true;
  const wx = {
    env: { USER_DATA_PATH: '/cache' },
    getFileSystemManager: () => ({
      access: ({ path, success, fail }: ResultCallbacks & { path: string }) =>
        files.has(path) ? success() : fail(new Error('missing')),
      unlink: ({ filePath, success }: ResultCallbacks & { filePath: string }) => {
        files.delete(filePath);
        success();
      },
      rename: ({ oldPath, newPath, success }: ResultCallbacks & { oldPath: string; newPath: string }) => {
        files.delete(oldPath);
        files.add(newPath);
        success();
      },
    }),
    downloadFile: (options: Download) => downloads.push(options),
    createImage: () => ({
      onload: () => {},
      onerror: () => {},
      set src(_value: string) {
        if (decode) this.onload();
        else this.onerror();
      },
    }),
  };
  const api = example<{ loadCachedImage(url: string, key: string): Promise<string> }>(
    'assets-and-network.md',
    'pendingImages',
    'loadCachedImage',
    wx,
  );
  function finish(statusCode: number) {
    const download = downloads.at(-1);
    if (!download) throw new Error('No download');
    files.add('/tmp/image');
    download.success({ statusCode, tempFilePath: '/tmp/image' });
  }
  return {
    ...api,
    files,
    downloads,
    finish,
    invalidImage: () => {
      decode = false;
    },
  };
}

test('failed responses never become cache hits and retry downloads again', async () => {
  const cache = cacheExample();
  const failed = cache.loadCachedImage('https://cdn/level.png', 'level-v1.png');
  cache.finish(404);
  await expect(failed).rejects.toThrow('HTTP 404');
  expect([...cache.files]).toEqual([]);
  const retry = cache.loadCachedImage('https://cdn/level.png', 'level-v1.png');
  expect(cache.downloads).toHaveLength(2);
  cache.finish(200);
  expect(await retry).toBe('/cache/level-v1.png');
  expect(await cache.loadCachedImage('https://cdn/level.png', 'level-v1.png')).toBe('/cache/level-v1.png');
  expect(cache.downloads).toHaveLength(2);
});

test('cache deduplicates in-flight loads, rejects key collisions and invalid images', async () => {
  const cache = cacheExample();
  const first = cache.loadCachedImage('https://cdn/a.png', 'a-v1.png');
  expect(cache.loadCachedImage('https://cdn/a.png', 'a-v1.png')).toBe(first);
  await expect(cache.loadCachedImage('https://cdn/b.png', 'a-v1.png')).rejects.toThrow('reused');
  cache.invalidImage();
  cache.finish(200);
  await expect(first).rejects.toThrow('decoded');
  expect([...cache.files]).toEqual([]);
});

test('leaderboard reads only after a confirmed write and tolerates corrupt scores', () => {
  const trace: string[] = [];
  let receive: (message: { type: string; score?: number }) => void = () => {};
  let write: (ResultCallbacks & { complete(): void }) | undefined;
  const errors: unknown[] = [];
  const { readScore } = example<{ readScore(player: object): number }>(
    'social-and-open-data.md',
    'function readScore',
    'readScore',
    {
      getSharedCanvas: () => ({ getContext: () => ({ clearRect() {}, fillText() {} }) }),
      onMessage: (listener: typeof receive) => {
        receive = listener;
      },
      setUserCloudStorage: (options: typeof write) => {
        trace.push('write');
        write = options;
      },
      getFriendCloudStorage: () => trace.push('read'),
    },
    errors,
  );
  receive({ type: 'submitScoreAndShowRanking', score: 12 });
  receive({ type: 'showRanking' });
  expect(trace).toEqual(['write']);
  write?.success();
  write?.complete();
  expect(trace).toEqual(['write', 'read']);
  for (const value of ['bad json', 'null', '{"score":"12"}', '{"score":1e400}'])
    expect(readScore({ KVDataList: [{ key: 'score', value }] })).toBe(0);
  expect(readScore({})).toBe(0);
  expect(readScore({ KVDataList: [{ key: 'score', value: '{"score":12}' }] })).toBe(12);
  expect(errors.length).toBeGreaterThan(0);
});

test('payment fallback requires documented platform and the selected payment API', () => {
  for (const platform of ['ios', 'mac', 'devtools', 'unknown', 'android', 'windows', 'ohos']) {
    for (const available of [false, true]) {
      let supported: boolean | undefined;
      const { checkPaymentSupport } = example<{ checkPaymentSupport(callback: (value: boolean) => void): void }>(
        'monetization.md',
        'function checkPaymentSupport',
        'checkPaymentSupport',
        {
          getDeviceInfo: () => ({ platform }),
          requestMidasPaymentGameItem: available ? () => {} : undefined,
        },
      );
      checkPaymentSupport(value => {
        supported = value;
      });
      expect(supported).toBe(available && ['android', 'windows', 'ohos'].includes(platform));
    }
  }
});
