import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { collectSnippets } from '../scripts/check-snippets';

function example<T>(
  reference: string,
  marker: string,
  names: string,
  wx: object,
  errors: unknown[] = [],
  extraGlobals: Record<string, unknown> = {},
): T {
  const snippet = collectSnippets().find(
    item => item.source.startsWith(`references/${reference}:`) && item.code.includes(marker),
  );
  if (!snippet) throw new Error(`Missing example ${reference}: ${marker}`);
  return runInNewContext(`${snippet.code}\n;({${names}})`, {
    wx,
    Promise,
    Map,
    Set,
    console: { error: (...args: unknown[]) => errors.push(args) },
    ...extraGlobals,
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

test('leaderboard reads only after a confirmed write, coalesces queued scores and tolerates corrupt scores', () => {
  const trace: string[] = [];
  let receive: (message: { type: string; score?: number }) => void = () => {};
  let write: (ResultCallbacks & { complete(): void; KVDataList: { key: string; value: string }[] }) | undefined;
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
      setUserCloudStorage: (options: NonNullable<typeof write>) => {
        trace.push(`write:${options.KVDataList[0]?.value}`);
        write = options;
      },
      getFriendCloudStorage: () => trace.push('read'),
    },
    errors,
  );
  receive({ type: 'submitScoreAndShowRanking', score: 12 });
  receive({ type: 'submitScoreAndShowRanking', score: 25 });
  receive({ type: 'submitScoreAndShowRanking', score: 18 });
  receive({ type: 'showRanking' });
  expect(trace).toEqual(['write:{"score":12}']);
  write?.success();
  write?.complete();
  expect(trace).toEqual(['write:{"score":12}', 'write:{"score":25}']);
  write?.success();
  write?.complete();
  expect(trace).toEqual(['write:{"score":12}', 'write:{"score":25}', 'read']);
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

test('rewarded video deduplicates taps, consumes the reward once on completion and resets after failure', async () => {
  let closeListener: ((result?: { isEnded: boolean }) => void) | undefined;
  let showCalls = 0;
  let loadCalls = 0;
  let failShow = false;
  let failReload = false;
  let rewards = 0;
  const unavailable: unknown[] = [];
  const { showRewardedAd } = example<{ showRewardedAd(onReward?: () => void): void }>(
    'monetization.md',
    'function showRewardedAd',
    'showRewardedAd',
    {
      createRewardedVideoAd: () => ({
        onError() {},
        onClose(listener: (result?: { isEnded: boolean }) => void) {
          closeListener = listener;
        },
        show() {
          showCalls += 1;
          if (failShow) return Promise.reject(new Error('not ready'));
          return Promise.resolve();
        },
        load() {
          loadCalls += 1;
          if (failReload) return Promise.reject(new Error('no fill'));
          failShow = false;
          return Promise.resolve();
        },
      }),
    },
    [],
    {
      grantReward: () => {
        rewards += 1;
      },
      showAdUnavailableMessage: (error: unknown) => unavailable.push(error),
    },
  );
  showRewardedAd();
  showRewardedAd();
  expect(showCalls).toBe(1);
  closeListener?.({ isEnded: false });
  closeListener?.({ isEnded: true });
  expect(rewards).toBe(0);

  failShow = true;
  showRewardedAd();
  await Promise.resolve();
  await Promise.resolve();
  expect(loadCalls).toBe(1);
  expect(showCalls).toBe(3);
  closeListener?.({ isEnded: true });
  closeListener?.({ isEnded: true });
  expect(rewards).toBe(1);

  failShow = true;
  failReload = true;
  showRewardedAd();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(unavailable).toHaveLength(1);
  failShow = false;
  failReload = false;
  showRewardedAd();
  expect(showCalls).toBe(5);
});

test('privacy authorization opens one dialog for concurrent requests and resolves all waiting callers', () => {
  let listener: ((resolve: (choice: { event: string }) => void) => void) | undefined;
  let dialogActions: { onShown(): void; onAgree(): void; onDisagree(): void; onOpenPolicy(): void } | undefined;
  let dialogsOpened = 0;
  example<Record<string, never>>(
    'privacy-and-release.md',
    'pendingPrivacyResolvers',
    '',
    {
      onNeedPrivacyAuthorization(callback: (resolve: (choice: { event: string }) => void) => void) {
        listener = callback;
      },
      requirePrivacyAuthorize() {},
      openPrivacyContract() {},
    },
    [],
    {
      showPrivacyDialog(actions: NonNullable<typeof dialogActions>) {
        dialogsOpened += 1;
        dialogActions = actions;
      },
      startFeatureThatUsesPersonalData() {},
      continueWithoutPersonalData() {},
    },
  );
  const firstEvents: string[] = [];
  const secondEvents: string[] = [];
  listener?.(choice => firstEvents.push(choice.event));
  listener?.(choice => secondEvents.push(choice.event));
  expect(dialogsOpened).toBe(1);
  dialogActions?.onShown();
  dialogActions?.onAgree();
  expect(firstEvents).toEqual(['exposureAuthorization', 'agree']);
  expect(secondEvents).toEqual(['exposureAuthorization', 'agree']);
});

test('custom ad placement clears safeArea bottom without mutating width on resize and destroys cleanly', async () => {
  let resizeListener: ((size: { width: number; height: number }) => void) | undefined;
  let offResizeCount = 0;
  let destroyed = 0;
  let createdOptions:
    { adIntervals: number; style: { left: number; top: number; width: number; fixed: boolean } } | undefined;
  const errors: unknown[] = [];
  const { mountBottomCustomAd } = example<{ mountBottomCustomAd(adUnitId: string): () => void }>(
    'monetization.md',
    'function mountBottomCustomAd',
    'mountBottomCustomAd',
    {
      getWindowInfo: () => ({
        windowWidth: 390,
        windowHeight: 844,
        safeArea: { left: 0, top: 47, right: 390, bottom: 810, width: 390, height: 763 },
      }),
      createCustomAd(options: NonNullable<typeof createdOptions>) {
        createdOptions = options;
        return {
          style: { ...options.style },
          onResize(listener: NonNullable<typeof resizeListener>) {
            resizeListener = listener;
          },
          offResize() {
            offResizeCount += 1;
          },
          onError() {},
          show: () => Promise.reject(new Error('no fill')),
          destroy() {
            destroyed += 1;
          },
        };
      },
    },
    errors,
    { Math },
  );
  const unmount = mountBottomCustomAd('adunit-test');
  expect(createdOptions?.adIntervals).toBeGreaterThanOrEqual(30);
  expect(createdOptions?.style).toEqual({ left: 15, top: 710, width: 360, fixed: false });
  resizeListener?.({ width: 320, height: 92 });
  await Promise.resolve();
  expect(errors).toHaveLength(1);
  unmount();
  expect(offResizeCount).toBe(1);
  expect(destroyed).toBe(1);
});

test('desktop input tracks held keys, clears them on hide and detaches listeners on destroy', () => {
  const listeners = new Map<string, (payload: unknown) => void>();
  const rightClicks: [number, number][] = [];
  const wheels: [number, number, number][] = [];
  const { bindDesktopInput } = example<{ bindDesktopInput(): { keysDown: Set<string>; destroy(): void } }>(
    'input-audio-lifecycle.md',
    'function bindDesktopInput',
    'bindDesktopInput',
    {
      onKeyDown: (cb: (e: unknown) => void) => listeners.set('keyDown', cb),
      offKeyDown: (cb: (e: unknown) => void) => listeners.get('keyDown') === cb && listeners.delete('keyDown'),
      onKeyUp: (cb: (e: unknown) => void) => listeners.set('keyUp', cb),
      offKeyUp: (cb: (e: unknown) => void) => listeners.get('keyUp') === cb && listeners.delete('keyUp'),
      onMouseDown: (cb: (e: unknown) => void) => listeners.set('mouseDown', cb),
      offMouseDown: (cb: (e: unknown) => void) => listeners.get('mouseDown') === cb && listeners.delete('mouseDown'),
      onWheel: (cb: (e: unknown) => void) => listeners.set('wheel', cb),
      offWheel: (cb: (e: unknown) => void) => listeners.get('wheel') === cb && listeners.delete('wheel'),
      onHide: (cb: (e: unknown) => void) => listeners.set('hide', cb),
      offHide: (cb: (e: unknown) => void) => listeners.get('hide') === cb && listeners.delete('hide'),
    },
    [],
    {
      handleRightClick: (x: number, y: number) => rightClicks.push([x, y]),
      zoomCamera: (dy: number, x: number, y: number) => wheels.push([dy, x, y]),
    },
  );
  const desktop = bindDesktopInput();
  listeners.get('keyDown')?.({ code: 'KeyW' });
  expect([...desktop.keysDown]).toEqual(['KeyW']);
  listeners.get('hide')?.({});
  expect([...desktop.keysDown]).toEqual([]);
  listeners.get('mouseDown')?.({ button: 0, x: 10, y: 20 });
  listeners.get('mouseDown')?.({ button: 2, x: 30, y: 40 });
  listeners.get('wheel')?.({ deltaY: -120, x: 50, y: 60 });
  expect(rightClicks).toEqual([[30, 40]]);
  expect(wheels).toEqual([[-120, 50, 60]]);
  desktop.destroy();
  expect(listeners.size).toBe(0);
});

test('socket example registers every listener before the connection can open and reports close codes', () => {
  const registered: string[] = [];
  const sent: string[] = [];
  const messages: unknown[] = [];
  const closeCodes: number[] = [];
  const handlers: Record<string, (payload?: unknown) => void> = {};
  const errors: unknown[] = [];
  const { openGameSocket } = example<{ openGameSocket(url: string): unknown }>(
    'assets-and-network.md',
    'function openGameSocket',
    'openGameSocket',
    {
      connectSocket: () => {
        const listen = (name: string) => (callback: (payload?: unknown) => void) => {
          registered.push(name);
          handlers[name] = callback;
        };
        return {
          onOpen: listen('open'),
          onMessage: listen('message'),
          onError: listen('error'),
          onClose: listen('close'),
          send: ({ data }: { data: string }) => sent.push(data),
        };
      },
    },
    errors,
    {
      JSON,
      handleServerMessage: (data: unknown) => messages.push(data),
      scheduleReconnect: (code: number) => closeCodes.push(code),
    },
  );
  openGameSocket('wss://example.invalid/game');
  expect(registered).toEqual(['open', 'message', 'error', 'close']);
  expect(sent).toEqual([]);
  handlers.open?.();
  expect(sent).toEqual(['{"type":"hello"}']);
  handlers.message?.({ data: 'state' });
  handlers.error?.({ errMsg: 'TLS handshake failed' });
  handlers.close?.({ code: 1006 });
  expect(messages).toEqual(['state']);
  expect(errors).toHaveLength(1);
  expect(closeCodes).toEqual([1006]);
});

test('poster example shares only an exported local file and reports export failures', () => {
  const shared: string[] = [];
  const errors: unknown[] = [];
  const { sharePoster } = example<{
    sharePoster(canvas: { toTempFilePath(options: Record<string, (result: unknown) => void>): void }): void;
  }>(
    'social-and-open-data.md',
    'function sharePoster',
    'sharePoster',
    { showShareImageMenu: (options: { path: string; style?: string }) => shared.push(options.path) },
    errors,
  );
  sharePoster({ toTempFilePath: options => options.success?.({ tempFilePath: 'wxfile://tmp/poster.png' }) });
  expect(shared).toEqual(['wxfile://tmp/poster.png']);
  sharePoster({ toTempFilePath: options => options.fail?.(new Error('export failed')) });
  expect(shared).toHaveLength(1);
  expect(errors).toHaveLength(1);
});

test('recommend example tolerates old clients, shows only after loading and surfaces load failures', async () => {
  interface RecommendEntry {
    show(): Promise<unknown>;
    destroy(): void;
  }
  const errors: unknown[] = [];
  const calls: string[] = [];
  let failLoad = false;
  const modern = {
    createPageManager: () => ({
      load: ({ openlink }: { openlink: string }) => {
        calls.push(`load:${openlink}`);
        return failLoad ? Promise.reject(new Error('-8')) : Promise.resolve({});
      },
      show: () => {
        calls.push('show');
        return Promise.resolve({});
      },
      destroy: () => calls.push('destroy'),
    }),
  };
  const load = (wx: object) =>
    example<{ createRecommendEntry(openlink: string): RecommendEntry | null }>(
      'social-and-open-data.md',
      'function createRecommendEntry',
      'createRecommendEntry',
      wx,
      errors,
    ).createRecommendEntry;

  expect(load({})('link')).toBeNull();
  const entry = load(modern)('link');
  await entry?.show();
  entry?.destroy();
  expect(calls).toEqual(['load:link', 'show', 'destroy']);

  failLoad = true;
  calls.length = 0;
  await load(modern)('stale-link')?.show();
  expect(calls).toEqual(['load:stale-link']);
  expect(errors.length).toBeGreaterThanOrEqual(1);
});
