import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

export const repoRoot = resolve(import.meta.dir, '../..');
export const skillRoot = join(repoRoot, 'skills/weixin-game');
export const starterRoot = join(skillRoot, 'assets/starter');

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Device {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
  statusBarHeight: number;
  safeArea?: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  menuButton: Rect | null;
}

function menuRect(left: number, top: number, width = 87, height = 32): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

// Menu button rects are typical values, not measurements, so tests also cover a range of shapes.
export const devices = {
  notchedIphone: {
    windowWidth: 390,
    windowHeight: 844,
    pixelRatio: 3,
    statusBarHeight: 47,
    safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 },
    menuButton: menuRect(296, 51),
  },
  smallIphone: {
    windowWidth: 320,
    windowHeight: 568,
    pixelRatio: 2,
    statusBarHeight: 20,
    safeArea: { top: 20, bottom: 568, left: 0, right: 320, width: 320, height: 548 },
    menuButton: menuRect(223, 24),
  },
  androidNoSafeArea: {
    windowWidth: 360,
    windowHeight: 780,
    pixelRatio: 3,
    statusBarHeight: 28,
    menuButton: menuRect(278, 32, 74),
  },
  noMenuButtonApi: {
    windowWidth: 414,
    windowHeight: 896,
    pixelRatio: 2,
    statusBarHeight: 44,
    safeArea: { top: 44, bottom: 862, left: 0, right: 414, width: 414, height: 818 },
    menuButton: null,
  },
  landscapeRotatedArea: {
    windowWidth: 844,
    windowHeight: 390,
    pixelRatio: 3,
    statusBarHeight: 0,
    safeArea: { top: 0, bottom: 369, left: 47, right: 797, width: 750, height: 369 },
    menuButton: menuRect(750, 8),
  },
  landscapePortraitArea: {
    windowWidth: 844,
    windowHeight: 390,
    pixelRatio: 3,
    statusBarHeight: 0,
    safeArea: { top: 47, bottom: 810, left: 0, right: 390, width: 390, height: 763 },
    menuButton: menuRect(750, 8),
  },
} satisfies Record<string, Device>;

export interface DrawnText {
  text: string;
  x: number;
  y: number;
  align: string;
  font: string;
}

export interface RecordingContext {
  font: string;
  fillStyle: string;
  textAlign: string;
  textBaseline: string;
  transform: number[];
  texts: DrawnText[];
  circles: { x: number; y: number; radius: number }[];
  setTransform(...values: number[]): void;
  fillRect(): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  arc(x: number, y: number, radius: number): void;
  arcTo(): void;
  moveTo(): void;
  closePath(): void;
  fill(): void;
  clearFrame(): void;
}

function createRecordingContext(): RecordingContext {
  return {
    font: '',
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    transform: [1, 0, 0, 1, 0, 0],
    texts: [],
    circles: [],
    setTransform(...values) {
      this.transform = values;
    },
    fillRect() {},
    fillText(text, x, y) {
      this.texts.push({ text, x, y, align: this.textAlign, font: this.font });
    },
    beginPath() {},
    arc(x, y, radius) {
      this.circles.push({ x, y, radius });
    },
    arcTo() {},
    moveTo() {},
    closePath() {},
    fill() {},
    clearFrame() {
      this.texts = [];
      this.circles = [];
    },
  };
}

export interface MockCanvas {
  width: number;
  height: number;
  getContext(type: string): RecordingContext;
}

export interface MockAudio {
  src: string;
  loop: boolean;
  volume: number;
  options: unknown;
  calls: string[];
  onError(listener: (error: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  seek(position: number): void;
  destroy(): void;
}

export interface MockWx {
  canvases: MockCanvas[];
  audios: MockAudio[];
  innerAudioOptions: unknown[];
  webAudioCalls: string[];
  storage: Map<string, unknown>;
  shareMenu: unknown[];
  shareListener: (() => unknown) | null;
  gcCount: number;
  vibrations: unknown[];
  listenerCount(): number;
  fire(event: string, payload?: unknown): void;
  touch(event: 'start' | 'move' | 'end' | 'cancel', changed: TouchPoint[], stillDown?: TouchPoint[]): void;
  [api: string]: unknown;
}

export interface TouchPoint {
  identifier: number;
  clientX: number;
  clientY: number;
}

export interface RunningFrames {
  pendingCount(): number;
  advance(seconds: number): void;
}

/** Installs a fresh `wx` and frame queue on the global scope, following the documented touch event shape. */
export function installMockWx(device: Device): { wx: MockWx; frames: RunningFrames } {
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  const addListener = (event: string) => (listener: (payload: unknown) => void) => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
  };

  const removeListener = (event: string) => (listener: (payload: unknown) => void) => {
    listeners.set(
      event,
      (listeners.get(event) ?? []).filter(existing => existing !== listener),
    );
  };
  let nowMs = Date.now();
  Date.now = () => nowMs;
  const wx: MockWx = {
    canvases: [],
    audios: [],
    innerAudioOptions: [],
    webAudioCalls: [],
    storage: new Map(),
    shareMenu: [],
    shareListener: null,
    gcCount: 0,
    vibrations: [],
    listenerCount: () => [...listeners.values()].reduce((sum, list) => sum + list.length, 0),
    fire(event, payload) {
      (listeners.get(event) ?? []).forEach(listener => listener(payload));
    },
    touch(event, changed, stillDown = []) {
      const names = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' };
      this.fire(names[event], { touches: stillDown, changedTouches: changed, timeStamp: 0 });
    },
    createCanvas() {
      const context = createRecordingContext();
      const canvas: MockCanvas = {
        width: device.windowWidth,
        height: device.windowHeight,
        getContext: () => context,
      };
      wx.canvases.push(canvas);
      return canvas;
    },
    getWindowInfo: () => ({ ...device }),
    getMenuButtonBoundingClientRect: () => device.menuButton,
    onTouchStart: addListener('touchStart'),
    offTouchStart: removeListener('touchStart'),
    onTouchMove: addListener('touchMove'),
    offTouchMove: removeListener('touchMove'),
    onTouchEnd: addListener('touchEnd'),
    offTouchEnd: removeListener('touchEnd'),
    onTouchCancel: addListener('touchCancel'),
    offTouchCancel: removeListener('touchCancel'),
    onHide: addListener('hide'),
    offHide: removeListener('hide'),
    onShow: addListener('show'),
    offShow: removeListener('show'),
    onAudioInterruptionBegin: addListener('interruptionBegin'),
    offAudioInterruptionBegin: removeListener('interruptionBegin'),
    onAudioInterruptionEnd: addListener('interruptionEnd'),
    offAudioInterruptionEnd: removeListener('interruptionEnd'),
    onError: addListener('error'),
    offError: removeListener('error'),
    onUnhandledRejection: addListener('rejection'),
    offUnhandledRejection: removeListener('rejection'),
    onMemoryWarning: addListener('memoryWarning'),
    offMemoryWarning: removeListener('memoryWarning'),
    onWindowResize: addListener('resize'),
    offWindowResize: removeListener('resize'),
    triggerGC() {
      wx.gcCount += 1;
    },
    showShareMenu(options: unknown) {
      wx.shareMenu.push(options);
    },
    onShareAppMessage(listener: () => unknown) {
      wx.shareListener = listener;
    },
    offShareAppMessage(listener?: () => unknown) {
      if (!listener || wx.shareListener === listener) wx.shareListener = null;
    },
    vibrateShort(options: unknown) {
      wx.vibrations.push(options);
    },
    getUpdateManager: () => ({ onUpdateReady() {}, onUpdateFailed() {}, applyUpdate() {} }),
    showModal() {},
    getStorageSync: (key: string) => (wx.storage.has(key) ? wx.storage.get(key) : ''),
    setStorageSync(key: string, value: unknown) {
      wx.storage.set(key, value);
    },
    removeStorageSync(key: string) {
      wx.storage.delete(key);
    },
    setInnerAudioOption(options: unknown) {
      wx.innerAudioOptions.push(options);
    },
    createInnerAudioContext(options: unknown) {
      const audio: MockAudio = {
        src: '',
        loop: false,
        volume: 1,
        options,
        calls: [],
        onError() {},
        play() {
          this.calls.push('play');
        },
        pause() {
          this.calls.push('pause');
        },
        stop() {
          this.calls.push('stop');
        },
        seek() {
          this.calls.push('seek');
        },
        destroy() {
          this.calls.push('destroy');
        },
      };
      wx.audios.push(audio);
      return audio;
    },
    createWebAudioContext() {
      const node = { connect() {}, start() {}, stop() {}, frequency: { value: 0 }, gain: { value: 0 } };
      return {
        currentTime: 0,
        destination: {},
        createOscillator: () => node,
        createGain: () => node,
        resume: async () => {
          wx.webAudioCalls.push('resume');
        },
        suspend: async () => {
          wx.webAudioCalls.push('suspend');
        },
        close: async () => {
          wx.webAudioCalls.push('close');
        },
      };
    },
  };

  const pendingFrames = new Map<number, () => void>();
  let nextFrameId = 1;
  const frames: RunningFrames = {
    pendingCount: () => pendingFrames.size,
    advance(seconds) {
      nowMs += seconds * 1000;
      const dueFrames = [...pendingFrames.values()];
      pendingFrames.clear();
      dueFrames.forEach(frame => frame());
    },
  };

  Object.assign(globalThis, {
    wx,
    cancelAnimationFrame(id: number) {
      pendingFrames.delete(id);
    },
    requestAnimationFrame(callback: () => void) {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      return id;
    },
  });
  if (device.menuButton === null) wx.getMenuButtonBoundingClientRect = undefined;
  return { wx, frames };
}

const starterRequire = createRequire(join(starterRoot, 'game.js'));

/** Loads a starter module fresh, so module state never leaks between tests. */
export function loadStarter<ModuleShape>(relativePath: string): ModuleShape {
  Object.keys(starterRequire.cache)
    .filter(path => path.startsWith(starterRoot))
    .forEach(path => delete starterRequire.cache[path]);
  return starterRequire(join(starterRoot, relativePath)) as ModuleShape;
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));
}
