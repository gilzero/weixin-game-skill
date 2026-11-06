// @file: loop.js
// @desc: frame loop that pauses in background
// A stall or debugger pause must not teleport game state forward.
const MAX_FRAME_SECONDS = 0.1;

function startLoop(onFrame) {
  let running = true;
  let frameRequested = false;
  let lastFrameTime = Date.now();

  function scheduleFrame() {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(runFrame);
  }

  // The docs promise no timestamp argument on this callback, so time comes from Date.now.
  function runFrame() {
    frameRequested = false;
    if (!running) return;
    const now = Date.now();
    const deltaSeconds = Math.min(MAX_FRAME_SECONDS, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    onFrame(deltaSeconds);
    scheduleFrame();
  }

  wx.onHide(() => {
    running = false;
  });
  wx.onShow(() => {
    if (running) return;
    running = true;
    lastFrameTime = Date.now();
    scheduleFrame();
  });

  scheduleFrame();
}

module.exports = { startLoop };
