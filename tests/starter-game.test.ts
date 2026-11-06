import { afterEach, describe, expect, test } from 'bun:test';
import type { Device, MockCanvas, MockWx, RecordingContext, RunningFrames } from './helpers/mock-wx';
import { devices, installMockWx, loadStarter } from './helpers/mock-wx';

interface Round {
  phase: string;
  score: number;
  bestScore: number;
  secondsLeft: number;
  target: { x: number; y: number } | null;
  start(): void;
  update(deltaSeconds: number): void;
  tap(x: number, y: number): boolean;
  setBounds(bounds: Bounds): void;
}
interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
interface RulesModule {
  HIT_SCORE: number;
  ROUND_SECONDS: number;
  TARGET_RADIUS: number;
  createTapRush(options: { bounds: Bounds; bestScore?: number; random?: () => number }): Round;
}

const realDateNow = Date.now;
const realRandom = Math.random;
afterEach(() => {
  Date.now = realDateNow;
  Math.random = realRandom;
});

describe('sample game rules', () => {
  const bounds = { left: 0, top: 100, right: 300, bottom: 700 };
  const rules = () => loadStarter<RulesModule>('js/game/tap-rush.js');

  test('a hit scores and moves the target, a miss does neither', () => {
    const { createTapRush, HIT_SCORE } = rules();
    const round = createTapRush({ bounds, random: () => 0.5 });
    round.start();
    const target = round.target as { x: number; y: number };
    expect(round.tap(target.x + 500, target.y)).toBe(false);
    expect(round.score).toBe(0);
    expect(round.tap(target.x, target.y)).toBe(true);
    expect(round.score).toBe(HIT_SCORE);
  });

  test('targets always spawn fully inside the bounds', () => {
    const { createTapRush, TARGET_RADIUS } = rules();
    for (const value of [0, 0.5, 0.999]) {
      const round = createTapRush({ bounds, random: () => value });
      round.start();
      const target = round.target as { x: number; y: number };
      expect(target.x - TARGET_RADIUS).toBeGreaterThanOrEqual(bounds.left);
      expect(target.x + TARGET_RADIUS).toBeLessThanOrEqual(bounds.right);
      expect(target.y - TARGET_RADIUS).toBeGreaterThanOrEqual(bounds.top);
      expect(target.y + TARGET_RADIUS).toBeLessThanOrEqual(bounds.bottom);
    }
  });

  test('the round ends on time and keeps the best score', () => {
    const { createTapRush, ROUND_SECONDS } = rules();
    const round = createTapRush({ bounds, bestScore: 5, random: () => 0.5 });
    round.start();
    const target = round.target as { x: number; y: number };
    round.tap(target.x, target.y);
    round.update(ROUND_SECONDS + 1);
    expect(round.phase).toBe('over');
    expect(round.target).toBeNull();
    expect(round.bestScore).toBe(10);
  });

  test('taps do nothing outside a round', () => {
    const round = rules().createTapRush({ bounds });
    expect(round.tap(10, 10)).toBe(false);
    expect(round.score).toBe(0);
  });
});

function bootGame(device: Device, existing?: { wx: MockWx; frames: RunningFrames }) {
  const { wx, frames } = existing ?? installMockWx(device);
  loadStarter<unknown>('game.js');
  const canvas = wx.canvases[0] as MockCanvas;
  const ctx = canvas.getContext('2d');
  return { wx, frames, ctx };
}

function renderFrame(frames: RunningFrames, ctx: RecordingContext, seconds = 0.016) {
  ctx.clearFrame();
  frames.advance(seconds);
}

function tapAt(wx: MockWx, x: number, y: number) {
  const point = { identifier: 1, clientX: x, clientY: y };
  wx.touch('start', [point], [point]);
  wx.touch('end', [point], []);
}

function labelPosition(ctx: RecordingContext, text: string) {
  const label = ctx.texts.find(drawn => drawn.text === text);
  if (!label) throw new Error(`"${text}" is not on screen. Drawn: ${ctx.texts.map(drawn => drawn.text).join(', ')}`);
  return label;
}

const estimatedWidth = (text: string, font: string) => Number.parseInt(font, 10) * [...text].length;

describe('whole game in the mock runtime', () => {
  test('plays a full round: start, hit, finish, save, reload', () => {
    const { wx, frames, ctx } = bootGame(devices.notchedIphone);
    renderFrame(frames, ctx);
    const startButton = labelPosition(ctx, '开始');
    tapAt(wx, startButton.x, startButton.y);

    renderFrame(frames, ctx);
    const target = ctx.circles[0] as { x: number; y: number };
    tapAt(wx, target.x, target.y);
    renderFrame(frames, ctx);
    labelPosition(ctx, '得分 10');
    expect(wx.vibrations).toEqual([{ type: 'light' }]);

    for (let elapsed = 0; elapsed < 21; elapsed += 0.1) renderFrame(frames, ctx, 0.1);
    labelPosition(ctx, '本局 10 分');
    labelPosition(ctx, '再来一局');
    expect(wx.storage.get('tap-rush:bestScore')).toBe(10);

    const reloaded = installMockWx(devices.notchedIphone);
    reloaded.wx.storage.set('tap-rush:bestScore', 10);
    const second = bootGame(devices.notchedIphone, reloaded);
    renderFrame(second.frames, second.ctx);
    labelPosition(second.ctx, '最高分 10');
  });

  test('time spent in the background does not use up the round', () => {
    const { wx, frames, ctx } = bootGame(devices.notchedIphone);
    renderFrame(frames, ctx);
    const startButton = labelPosition(ctx, '开始');
    tapAt(wx, startButton.x, startButton.y);
    renderFrame(frames, ctx);
    wx.fire('hide');
    frames.advance(600);
    wx.fire('show');
    renderFrame(frames, ctx);
    labelPosition(ctx, '20 秒');
  });

  test('sharing offers a custom message once the menu is enabled', () => {
    const { wx } = bootGame(devices.notchedIphone);
    expect(wx.shareMenu).toHaveLength(1);
    expect(wx.shareListener?.()).toMatchObject({ query: 'from=share' });
  });

  for (const [name, device] of Object.entries(devices) as [string, Device][]) {
    test(`${name}: text estimates and target viewport bounds clear the menu`, () => {
      Math.random = () => 0;
      const { wx, frames, ctx } = bootGame(device);
      const menu = device.menuButton ?? { left: device.windowWidth - 106, bottom: device.statusBarHeight + 38 };

      const assertClear = () => {
        for (const drawn of ctx.texts) {
          const width = estimatedWidth(drawn.text, drawn.font);
          const rightEdge =
            drawn.align === 'right' ? drawn.x : drawn.align === 'center' ? drawn.x + width / 2 : drawn.x + width;
          const clearOfMenu = rightEdge <= menu.left || drawn.y >= menu.bottom;
          expect(clearOfMenu, `"${drawn.text}" reaches x=${rightEdge} at y=${drawn.y}`).toBe(true);
          expect(drawn.y).toBeLessThan(device.windowHeight);
        }
      };

      renderFrame(frames, ctx);
      assertClear();
      const startButton = labelPosition(ctx, '开始');
      expect(startButton.y).toBeGreaterThan(menu.bottom);
      tapAt(wx, startButton.x, startButton.y);
      renderFrame(frames, ctx);
      assertClear();
      for (const circle of ctx.circles) {
        expect(circle.x + circle.radius <= menu.left || circle.y - circle.radius >= menu.bottom).toBe(true);
        expect(circle.x - circle.radius).toBeGreaterThanOrEqual(0);
        expect(circle.y - circle.radius).toBeGreaterThanOrEqual(0);
        expect(circle.x + circle.radius).toBeLessThanOrEqual(device.windowWidth);
        expect(circle.y + circle.radius).toBeLessThanOrEqual(device.windowHeight);
      }
    });
  }
});

test('the real game loop finishes a timed round at five frames per second and after a stall', () => {
  for (const steps of [Array<number>(100).fill(0.2), [20]]) {
    const { wx, frames, ctx } = bootGame(devices.notchedIphone);
    renderFrame(frames, ctx);
    const start = labelPosition(ctx, '开始');
    tapAt(wx, start.x, start.y);
    for (const step of steps) renderFrame(frames, ctx, step);
    labelPosition(ctx, '再来一局');
  }
});

test('backward clock jumps do not add time or count the same interval twice', () => {
  const { wx, frames, ctx } = bootGame(devices.notchedIphone);
  renderFrame(frames, ctx);
  const start = labelPosition(ctx, '开始');
  tapAt(wx, start.x, start.y);
  renderFrame(frames, ctx, 5);
  labelPosition(ctx, '15 秒');
  renderFrame(frames, ctx, -3);
  labelPosition(ctx, '15 秒');
  renderFrame(frames, ctx, 3);
  labelPosition(ctx, '15 秒');
});
