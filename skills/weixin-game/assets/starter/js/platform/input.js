// @file: input.js
// @desc: touch tracking tap and long press
const TAP_SLOP_PX = 10;
const LONG_PRESS_MS = 500;

/** @typedef {{id: number, x: number, y: number}} Point */
/** @typedef {Point & {startX: number, startY: number, moved: boolean, longPressed: boolean, longPressTimer: ReturnType<typeof setTimeout>}} TouchState */
/** @typedef {'down' | 'move' | 'up' | 'cancel' | 'tap' | 'longPress'} InputEvent */
function createInput() {
  /** @type {Map<number, TouchState>} */
  const activeTouches = new Map();
  /** @type {Record<InputEvent, ((point: Point) => void)[]>} */
  const listeners = { down: [], move: [], up: [], cancel: [], tap: [], longPress: [] };

  /** @param {InputEvent} type @param {TouchState} touchState */
  function emit(type, touchState) {
    const point = { id: touchState.id, x: touchState.x, y: touchState.y };
    listeners[type].slice().forEach(listener => listener(point));
  }

  /** @param {TouchState} touchState */
  function forget(touchState) {
    clearTimeout(touchState.longPressTimer);
    activeTouches.delete(touchState.id);
  }

  // Every handler reads changedTouches: touches lists all fingers down, and is empty when the last one lifts.
  /** @param {{changedTouches: WechatMinigame.Touch[]}} event */
  function handleStart(event) {
    event.changedTouches.forEach(touch => {
      const touchState = {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        x: touch.clientX,
        y: touch.clientY,
        moved: false,
        longPressed: false,
        longPressTimer: setTimeout(() => {
          touchState.longPressed = true;
          emit('longPress', touchState);
        }, LONG_PRESS_MS),
      };
      activeTouches.set(touchState.id, touchState);
      emit('down', touchState);
    });
  }

  /** @param {{changedTouches: WechatMinigame.Touch[]}} event */
  function handleMove(event) {
    event.changedTouches.forEach(touch => {
      const touchState = activeTouches.get(touch.identifier);
      if (!touchState) return;
      touchState.x = touch.clientX;
      touchState.y = touch.clientY;
      if (Math.hypot(touchState.x - touchState.startX, touchState.y - touchState.startY) > TAP_SLOP_PX) {
        touchState.moved = true;
        clearTimeout(touchState.longPressTimer);
      }
      emit('move', touchState);
    });
  }

  /** @param {{changedTouches: WechatMinigame.Touch[]}} event */
  function handleEnd(event) {
    event.changedTouches.forEach(touch => {
      const touchState = activeTouches.get(touch.identifier);
      if (!touchState) return;
      touchState.x = touch.clientX;
      touchState.y = touch.clientY;
      forget(touchState);
      emit('up', touchState);
      if (!touchState.moved && !touchState.longPressed) emit('tap', touchState);
    });
  }

  // A cancel means the system took the touch away, so it must never count as a tap.
  /** @param {{changedTouches: WechatMinigame.Touch[]}} event */
  function handleCancel(event) {
    event.changedTouches.forEach(touch => {
      const touchState = activeTouches.get(touch.identifier);
      if (!touchState) return;
      forget(touchState);
      emit('cancel', touchState);
    });
  }

  // Touch end events can be lost while the game is in the background.
  function releaseAll() {
    activeTouches.forEach(touchState => {
      forget(touchState);
      emit('cancel', touchState);
    });
  }

  wx.onTouchStart(handleStart);
  wx.onTouchMove(handleMove);
  wx.onTouchEnd(handleEnd);
  wx.onTouchCancel(handleCancel);
  wx.onHide(releaseAll);

  return {
    /** @param {InputEvent} type @param {(point: Point) => void} listener */
    on(type, listener) {
      if (!listeners[type]) throw new TypeError(`Unknown input event: ${type}`);
      listeners[type].push(listener);
      return () => {
        listeners[type] = listeners[type].filter(existing => existing !== listener);
      };
    },
    destroy() {
      wx.offTouchStart(handleStart);
      wx.offTouchMove(handleMove);
      wx.offTouchEnd(handleEnd);
      wx.offTouchCancel(handleCancel);
      wx.offHide(releaseAll);
      releaseAll();
      Object.values(listeners).forEach(list => {
        list.length = 0;
      });
    },
    activeTouchCount: () => activeTouches.size,
  };
}

module.exports = { createInput };
