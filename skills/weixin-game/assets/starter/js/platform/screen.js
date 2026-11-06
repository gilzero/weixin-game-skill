// @file: screen.js
// @desc: canvas sizing safe area menu button
const MAX_PIXEL_RATIO = 3;
const MENU_BUTTON_GAP = 8;
const HUD_RAIL_WIDTH = 112;
// Only used when the client cannot report the real menu button position.
const FALLBACK_MENU_WIDTH = 100;
const FALLBACK_MENU_HEIGHT = 32;
const FALLBACK_MENU_OFFSET = 6;

function readWindowInfo() {
  return wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
}

/** @typedef {{left: number, top: number, right: number, bottom: number}} Bounds */
/** @typedef {Pick<ReturnType<typeof wx.getWindowInfo>, 'windowWidth' | 'windowHeight' | 'pixelRatio' | 'statusBarHeight'> & {safeArea?: WechatMinigame.SafeArea}} WindowInfo */

/** @param {WindowInfo} info */
function readInsets(info) {
  const { windowWidth, windowHeight, safeArea } = info;
  const statusBarHeight = info.statusBarHeight || 0;
  // Some devices omit safeArea entirely, which leaves the status bar as the only known inset.
  if (!safeArea) return { top: statusBarHeight, bottom: 0, left: 0, right: 0 };

  // The docs define safeArea in portrait, so a tall area in a wide window has to be rotated.
  const isLandscape = windowWidth > windowHeight;
  if (isLandscape && safeArea.height > safeArea.width) {
    // Orientation is unknown: reserve both possible notch edges without moving a horizontal inset to bottom.
    const horizontal = Math.max(safeArea.top, windowWidth - safeArea.bottom, 0);
    const vertical = Math.max(safeArea.left, windowHeight - safeArea.right, 0);
    return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
  }
  return {
    top: safeArea.top,
    bottom: Math.max(0, windowHeight - safeArea.bottom),
    left: safeArea.left,
    right: Math.max(0, windowWidth - safeArea.right),
  };
}

/** @param {WindowInfo} info */
function readMenuButton(info) {
  const rect = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  if (rect && rect.width > 0 && rect.height > 0) {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }
  const top = (info.statusBarHeight || 0) + FALLBACK_MENU_OFFSET;
  const right = info.windowWidth - FALLBACK_MENU_OFFSET;
  return {
    left: right - FALLBACK_MENU_WIDTH,
    top,
    right,
    bottom: top + FALLBACK_MENU_HEIGHT,
    width: FALLBACK_MENU_WIDTH,
    height: FALLBACK_MENU_HEIGHT,
  };
}

/** @param {WindowInfo} info */
function computeLayout(info) {
  const insets = readInsets(info);
  const menuButton = readMenuButton(info);
  const safe = {
    left: insets.left,
    top: insets.top,
    right: info.windowWidth - insets.right,
    bottom: info.windowHeight - insets.bottom,
  };
  const landscape = info.windowWidth > info.windowHeight;
  const railLeft = Math.min(menuButton.left - MENU_BUTTON_GAP, safe.right - HUD_RAIL_WIDTH);
  return {
    width: info.windowWidth,
    height: info.windowHeight,
    pixelRatio: Math.min(MAX_PIXEL_RATIO, info.pixelRatio || 1),
    safe,
    menuButton,
    // Portrait uses a row beside the capsule; landscape uses the rail below it.
    topBar: landscape
      ? {
          left: railLeft + MENU_BUTTON_GAP,
          top: Math.max(safe.top, menuButton.bottom + MENU_BUTTON_GAP),
          right: safe.right,
          bottom: safe.bottom,
        }
      : {
          left: safe.left,
          top: menuButton.top,
          right: menuButton.left - MENU_BUTTON_GAP,
          bottom: menuButton.bottom,
        },
    // Landscape reserves a right rail for the capsule and HUD instead of losing a full row.
    content: {
      left: safe.left,
      top: landscape ? safe.top : Math.max(safe.top, menuButton.bottom + MENU_BUTTON_GAP),
      right: landscape ? railLeft : safe.right,
      bottom: safe.bottom,
    },
  };
}

function createScreen() {
  // The first wx.createCanvas call is the on-screen canvas, so nothing may create one before this.
  const canvas = wx.createCanvas();
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext('2d');
  /** @type {Set<(layout: ReturnType<typeof computeLayout>) => void>} */
  const listeners = new Set();
  const screen = {
    canvas,
    ctx,
    ...computeLayout(readWindowInfo()),
    /** @param {(layout: ReturnType<typeof computeLayout>) => void} listener */
    onResize(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      if (wx.offWindowResize) wx.offWindowResize(handleResize);
      listeners.clear();
    },
  };

  function applyCanvasSize() {
    canvas.width = Math.round(screen.width * screen.pixelRatio);
    canvas.height = Math.round(screen.height * screen.pixelRatio);
    // Touches and the menu button rect use logical pixels, so drawing in them keeps one coordinate system.
    ctx.setTransform(screen.pixelRatio, 0, 0, screen.pixelRatio, 0, 0);
  }

  applyCanvasSize();
  function handleResize() {
    Object.assign(screen, computeLayout(readWindowInfo()));
    applyCanvasSize();
    listeners.forEach(listener => listener(screen));
  }
  if (wx.onWindowResize) wx.onWindowResize(handleResize);
  return screen;
}

module.exports = { computeLayout, createScreen };
