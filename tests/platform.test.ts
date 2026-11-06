import { afterEach, describe, expect, test } from 'bun:test';
import type { Device, Rect } from './helpers/mock-wx';
import { devices, installMockWx, loadStarter, sleep } from './helpers/mock-wx';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface Layout {
  width: number;
  height: number;
  pixelRatio: number;
  safe: Box;
  menuButton: Rect;
  topBar: Box;
  content: Box;
}
interface ScreenModule {
  computeLayout(info: Device): Layout;
  createScreen(): Layout & {
    canvas: { width: number; height: number };
    ctx: { transform: number[] };
  };
}
interface Point {
  id: number;
  x: number;
  y: number;
}
interface InputModule {
  createInput(): {
    on(type: string, listener: (point: Point) => void): () => void;
    activeTouchCount(): number;
  };
}
interface AudioModule {
  createAudio(): {
    playMusic(src: string): void;
    pauseMusic(): void;
    stopMusic(): void;
    loadSound(name: string, src: string, voices?: number): void;
    playSound(name: string): void;
    beep(): void;
    setMuted(muted: boolean): void;
  };
}
interface StorageModule {
  createStorage(prefix: string): {
    load<Value>(key: string, fallback: Value): Value;
    save(key: string, value: unknown): boolean;
  };
}
interface LoopModule {
  startLoop(onFrame: (deltaSeconds: number) => void): void;
}
interface AppServicesModule {
  installAppServices(options: { buildShareMessage: () => unknown; onMemoryWarning?: () => void }): void;
}

const realDateNow = Date.now;
afterEach(() => {
  Date.now = realDateNow;
});

const finger = (identifier: number, clientX = 10, clientY = 10) => ({ identifier, clientX, clientY });

describe('screen', () => {
  for (const [name, device] of Object.entries(devices) as [string, Device][]) {
    test(`${name}: the top bar and content never touch the menu button`, () => {
      installMockWx(device);
      const { menuButton, topBar, content } = loadStarter<ScreenModule>('js/platform/screen.js').computeLayout(device);
      expect(topBar.right).toBeLessThan(menuButton.left);
      expect(content.top).toBeGreaterThan(menuButton.bottom);
    });

    test(`${name}: content stays inside the window and has usable height`, () => {
      installMockWx(device);
      const { content } = loadStarter<ScreenModule>('js/platform/screen.js').computeLayout(device);
      expect(content.left).toBeGreaterThanOrEqual(0);
      expect(content.right).toBeLessThanOrEqual(device.windowWidth);
      expect(content.bottom).toBeLessThanOrEqual(device.windowHeight);
      expect(content.bottom - content.top).toBeGreaterThan(200);
    });
  }

  test('a missing safeArea does not throw and falls back to the status bar', () => {
    installMockWx(devices.androidNoSafeArea);
    const { safe } = loadStarter<ScreenModule>('js/platform/screen.js').computeLayout(devices.androidNoSafeArea);
    expect(safe).toEqual({ left: 0, top: 28, right: 360, bottom: 780 });
  });

  test('landscape gets the same insets whichever way the client reports safeArea', () => {
    const { computeLayout } = loadStarter<ScreenModule>('js/platform/screen.js');
    installMockWx(devices.landscapeRotatedArea);
    const rotated = computeLayout(devices.landscapeRotatedArea).safe;
    installMockWx(devices.landscapePortraitArea);
    const portrait = computeLayout(devices.landscapePortraitArea).safe;
    expect(rotated.left).toBe(47);
    expect(portrait.left).toBe(47);
    expect(portrait.right).toBe(797);
    expect(portrait.bottom).toBeLessThanOrEqual(390);
  });

  test('the canvas uses device pixels and the context draws in logical pixels', () => {
    installMockWx(devices.notchedIphone);
    const screen = loadStarter<ScreenModule>('js/platform/screen.js').createScreen();
    expect(screen.canvas.width).toBe(1170);
    expect(screen.canvas.height).toBe(2532);
    expect(screen.ctx.transform).toEqual([3, 0, 0, 3, 0, 0]);
  });

  test('only one canvas is created, because the first call is the on-screen one', () => {
    const { wx } = installMockWx(devices.notchedIphone);
    loadStarter<ScreenModule>('js/platform/screen.js').createScreen();
    expect(wx.canvases).toHaveLength(1);
  });

  test('a resize updates the layout and restores the transform', () => {
    const device: Device = { ...devices.notchedIphone };
    const { wx } = installMockWx(device);
    const screen = loadStarter<ScreenModule>('js/platform/screen.js').createScreen();
    device.windowWidth = 500;
    screen.ctx.transform = [1, 0, 0, 1, 0, 0];
    wx.fire('resize', { size: { windowWidth: 500, windowHeight: 844 } });
    expect(screen.width).toBe(500);
    expect(screen.canvas.width).toBe(1500);
    expect(screen.ctx.transform).toEqual([3, 0, 0, 3, 0, 0]);
  });
});

describe('input', () => {
  function setUp() {
    const { wx } = installMockWx(devices.notchedIphone);
    const input = loadStarter<InputModule>('js/platform/input.js').createInput();
    const counts: Record<string, number> = {};
    const seenIds: Record<string, number[]> = {};
    for (const type of ['down', 'move', 'up', 'cancel', 'tap', 'longPress']) {
      counts[type] = 0;
      seenIds[type] = [];
      input.on(type, point => {
        counts[type] = (counts[type] ?? 0) + 1;
        seenIds[type]?.push(point.id);
      });
    }
    return { wx, input, counts, seenIds };
  }

  test('lifting the last finger reports up and tap', () => {
    const { wx, counts } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    wx.touch('end', [finger(1)], []);
    expect(counts.up).toBe(1);
    expect(counts.tap).toBe(1);
  });

  test('a second finger does not re-report the first', () => {
    const { wx, seenIds } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    wx.touch('start', [finger(2)], [finger(1), finger(2)]);
    expect(seenIds.down).toEqual([1, 2]);
  });

  test('a system cancel is never a tap', () => {
    const { wx, counts } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    wx.touch('cancel', [finger(1)], []);
    expect(counts.tap).toBe(0);
    expect(counts.cancel).toBe(1);
  });

  test('two overlapping taps do not fire a long press afterwards', async () => {
    const { wx, counts } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    wx.touch('start', [finger(2, 50, 50)], [finger(1), finger(2, 50, 50)]);
    wx.touch('end', [finger(1)], [finger(2, 50, 50)]);
    wx.touch('end', [finger(2, 50, 50)], []);
    await sleep(560);
    expect(counts.longPress).toBe(0);
    expect(counts.tap).toBe(2);
  });

  test('holding fires one long press and then no tap', async () => {
    const { wx, counts } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    await sleep(560);
    wx.touch('end', [finger(1)], []);
    expect(counts.longPress).toBe(1);
    expect(counts.tap).toBe(0);
  });

  test('dragging past the slop is not a tap and cancels the long press', async () => {
    const { wx, counts } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    wx.touch('move', [finger(1, 60, 60)], [finger(1, 60, 60)]);
    await sleep(560);
    wx.touch('end', [finger(1, 60, 60)], []);
    expect(counts.tap).toBe(0);
    expect(counts.longPress).toBe(0);
  });

  test('hiding the game releases fingers whose end event was lost', async () => {
    const { wx, input, counts } = setUp();
    wx.touch('start', [finger(1)], [finger(1)]);
    wx.fire('hide');
    expect(input.activeTouchCount()).toBe(0);
    expect(counts.cancel).toBe(1);
    await sleep(560);
    expect(counts.longPress).toBe(0);
  });

  test('an unknown event name fails loudly', () => {
    const { input } = setUp();
    expect(() => input.on('tapp', () => {})).toThrow('Unknown input event');
  });
});

describe('audio', () => {
  function setUp() {
    const { wx } = installMockWx(devices.notchedIphone);
    return { wx, audio: loadStarter<AudioModule>('js/platform/audio.js').createAudio() };
  }
  const musicCalls = (wx: ReturnType<typeof setUp>['wx']) => wx.audios[0]?.calls.join(',');

  test('playing the same track after a pause resumes it', () => {
    const { wx, audio } = setUp();
    audio.playMusic('bgm.mp3');
    audio.pauseMusic();
    audio.playMusic('bgm.mp3');
    expect(musicCalls(wx)).toBe('play,pause,play');
    expect(wx.audios).toHaveLength(1);
  });

  test('unmuting does not restart music that was paused on purpose', () => {
    const { wx, audio } = setUp();
    audio.playMusic('bgm.mp3');
    audio.pauseMusic();
    audio.setMuted(true);
    audio.setMuted(false);
    expect(wx.audios[0]?.calls.filter(call => call === 'play')).toHaveLength(1);
  });

  test('music resumes after returning from the background', () => {
    const { wx, audio } = setUp();
    audio.playMusic('bgm.mp3');
    wx.fire('hide');
    wx.fire('show');
    expect(musicCalls(wx)).toBe('play,pause,play');
  });

  test('music waits for the interruption to end, even if the game returns first', () => {
    const { wx, audio } = setUp();
    audio.playMusic('bgm.mp3');
    wx.fire('interruptionBegin');
    wx.fire('show');
    expect(musicCalls(wx)).toBe('play,pause');
    wx.fire('interruptionEnd');
    expect(musicCalls(wx)).toBe('play,pause,play');
  });

  test('music stays silent after returning when muted', () => {
    const { wx, audio } = setUp();
    audio.playMusic('bgm.mp3');
    audio.setMuted(true);
    wx.fire('hide');
    wx.fire('show');
    expect(wx.audios[0]?.calls.filter(call => call === 'play')).toHaveLength(1);
  });

  test('the same effect can overlap across voices', () => {
    const { wx, audio } = setUp();
    audio.loadSound('hit', 'hit.mp3', 2);
    audio.playSound('hit');
    audio.playSound('hit');
    expect(wx.audios[0]?.calls).toEqual(['seek', 'play']);
    expect(wx.audios[1]?.calls).toEqual(['seek', 'play']);
  });

  test('effects use the WebAudio backend recommended for short sounds', () => {
    const { wx, audio } = setUp();
    audio.loadSound('hit', 'hit.mp3', 1);
    expect(wx.audios[0]?.options).toEqual({ useWebAudioImplement: true });
  });

  test('playing an effect that was never loaded fails loudly', () => {
    const { audio } = setUp();
    expect(() => audio.playSound('missing')).toThrow('Sound not loaded');
  });

  test('beeps are silent while muted and resume with the game', () => {
    const { wx, audio } = setUp();
    audio.setMuted(true);
    audio.beep();
    wx.fire('hide');
    expect(wx.webAudioCalls).toEqual([]);
    audio.setMuted(false);
    audio.beep();
    wx.fire('hide');
    wx.fire('show');
    expect(wx.webAudioCalls).toEqual(['suspend', 'resume']);
  });
});

describe('storage', () => {
  test('a missing key returns the fallback', () => {
    installMockWx(devices.notchedIphone);
    const storage = loadStarter<StorageModule>('js/platform/storage.js').createStorage('game');
    expect(storage.load('best', 7)).toBe(7);
  });

  test('saved values round trip, including zero', () => {
    installMockWx(devices.notchedIphone);
    const storage = loadStarter<StorageModule>('js/platform/storage.js').createStorage('game');
    expect(storage.save('best', 0)).toBe(true);
    expect(storage.load('best', 7)).toBe(0);
  });

  test('a full store reports failure instead of throwing', () => {
    const { wx } = installMockWx(devices.notchedIphone);
    wx.setStorageSync = () => {
      throw new Error('storage full');
    };
    const consoleError = console.error;
    console.error = () => {};
    const storage = loadStarter<StorageModule>('js/platform/storage.js').createStorage('game');
    expect(storage.save('best', 1)).toBe(false);
    console.error = consoleError;
  });
});

describe('loop', () => {
  test('a long stall is clamped', () => {
    const { frames } = installMockWx(devices.notchedIphone);
    const deltas: number[] = [];
    loadStarter<LoopModule>('js/platform/loop.js').startLoop(delta => deltas.push(delta));
    frames.advance(5);
    expect(deltas).toEqual([0.1]);
  });

  test('frames stop in the background, and time away does not count', () => {
    const { wx, frames } = installMockWx(devices.notchedIphone);
    const deltas: number[] = [];
    loadStarter<LoopModule>('js/platform/loop.js').startLoop(delta => deltas.push(delta));
    frames.advance(0.016);
    wx.fire('hide');
    frames.advance(60);
    expect(frames.pendingCount()).toBe(0);
    wx.fire('show');
    frames.advance(0.016);
    expect(deltas).toHaveLength(2);
    expect(deltas[1]).toBeCloseTo(0.016, 3);
  });

  test('repeated show events do not start a second loop', () => {
    const { wx, frames } = installMockWx(devices.notchedIphone);
    loadStarter<LoopModule>('js/platform/loop.js').startLoop(() => {});
    wx.fire('show');
    wx.fire('show');
    expect(frames.pendingCount()).toBe(1);
  });
});

describe('app services', () => {
  test('sharing is enabled, because the menu entry is off by default', () => {
    const { wx } = installMockWx(devices.notchedIphone);
    const message = { title: 'hi' };
    loadStarter<AppServicesModule>('js/platform/app-services.js').installAppServices({
      buildShareMessage: () => message,
    });
    expect(wx.shareMenu).toHaveLength(1);
    expect(wx.shareListener?.()).toBe(message);
  });

  test('a memory warning frees caches and asks for collection', () => {
    const { wx } = installMockWx(devices.notchedIphone);
    let cachesCleared = 0;
    loadStarter<AppServicesModule>('js/platform/app-services.js').installAppServices({
      buildShareMessage: () => ({}),
      onMemoryWarning: () => {
        cachesCleared += 1;
      },
    });
    wx.fire('memoryWarning', {});
    expect(cachesCleared).toBe(1);
    expect(wx.gcCount).toBe(1);
  });
});
