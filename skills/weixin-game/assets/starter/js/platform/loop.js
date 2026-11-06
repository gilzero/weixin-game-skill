// @file: loop.js
// @desc: disposable frame loop with background pause
const MAX_FRAME_SECONDS = 0.1;

/** @param {(deltaSeconds: number, elapsedSeconds: number) => void} onFrame */
function startLoop(onFrame) {
  let running = true;
  let destroyed = false;
  /** @type {number | null} */
  let frameId = null;
  let lastFrameTime = Date.now();

  function scheduleFrame() {
    if (frameId !== null || !running || destroyed) return;
    frameId = requestAnimationFrame(runFrame);
  }
  function runFrame() {
    frameId = null;
    if (!running || destroyed) return;
    const now = Date.now();
    const elapsedSeconds = Math.max(0, (now - lastFrameTime) / 1000);
    lastFrameTime = Math.max(lastFrameTime, now);
    onFrame(Math.min(MAX_FRAME_SECONDS, elapsedSeconds), elapsedSeconds);
    scheduleFrame();
  }
  function handleHide() {
    running = false;
  }
  function handleShow() {
    if (running || destroyed) return;
    running = true;
    lastFrameTime = Date.now();
    scheduleFrame();
  }
  wx.onHide(handleHide);
  wx.onShow(handleShow);
  scheduleFrame();
  return function destroy() {
    destroyed = true;
    running = false;
    wx.offHide(handleHide);
    wx.offShow(handleShow);
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  };
}

module.exports = { startLoop };
