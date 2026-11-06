// @file: input.js
// @desc: touch tracking tap and long press
const TAP_SLOP_PX = 10;
const LONG_PRESS_MS = 500;

function createInput() {
  const activeTouches = new Map();
  const listeners = { down: [], move: [], up: [], cancel: [], tap: [], longPress: [] };

  function emit(type, touchState) {
    const point = { id: touchState.id, x: touchState.x, y: touchState.y };
    listeners[type].slice().forEach(listener => listener(point));
  }

  function forget(touchState) {
    clearTimeout(touchState.longPressTimer);
    activeTouches.delete(touchState.id);
  }

  // Every handler reads changedTouches: touches lists all fingers down, and is empty when the last one lifts.
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
    on(type, listener) {
      if (!listeners[type]) throw new TypeError(`Unknown input event: ${type}`);
      listeners[type].push(listener);
      return () => {
        listeners[type] = listeners[type].filter(existing => existing !== listener);
      };
    },
    activeTouchCount: () => activeTouches.size,
  };
}

module.exports = { createInput };
