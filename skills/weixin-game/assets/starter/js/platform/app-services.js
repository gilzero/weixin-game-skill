// @file: app-services.js
// @desc: errors memory sharing and update prompts
function watchErrors() {
  const realtimeLog = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
  /** @param {string} kind @param {unknown} detail */
  function report(kind, detail) {
    console.error(kind, detail);
    // Remote breadcrumbs omit arbitrary messages that may contain tokens or player content.
    if (realtimeLog) realtimeLog.error(kind);
  }
  // The message already includes the stack trace.
  /** @param {{message?: string, errMsg?: string}} result */
  const handleError = result => report('uncaught error', result.message || result.errMsg);
  /** @type {WechatMinigame.OnUnhandledRejectionCallback} */
  const handleRejection = result => report('unhandled rejection', result.reason);
  if (wx.onError) wx.onError(handleError);
  if (wx.onUnhandledRejection) wx.onUnhandledRejection(handleRejection);
  return () => {
    if (wx.offError) wx.offError(handleError);
    if (wx.offUnhandledRejection) wx.offUnhandledRejection(handleRejection);
  };
}

// iOS destroys a game after two memory warnings within 5 seconds, so free memory on the first.
/** @param {() => void} onMemoryWarning */
function watchMemory(onMemoryWarning) {
  if (!wx.onMemoryWarning) return () => {};
  const handleMemoryWarning = () => {
    onMemoryWarning();
    wx.triggerGC();
  };
  wx.onMemoryWarning(handleMemoryWarning);
  return () => {
    if (wx.offMemoryWarning) wx.offMemoryWarning(handleMemoryWarning);
  };
}

// The share entry in the menu stays disabled until showShareMenu is called.
/** @param {WechatMinigame.OnShareAppMessageCallback} buildShareMessage */
function enableSharing(buildShareMessage) {
  wx.showShareMenu({ menus: ['shareAppMessage'] });
  wx.onShareAppMessage(buildShareMessage);
  return () => {
    if (wx.offShareAppMessage) wx.offShareAppMessage(buildShareMessage);
  };
}

function promptForUpdates() {
  if (!wx.getUpdateManager) return;
  const updateManager = wx.getUpdateManager();
  updateManager.onUpdateReady(() => {
    wx.showModal({
      title: '发现新版本',
      content: '新版本已准备好，是否重启？',
      success(result) {
        if (result.confirm) updateManager.applyUpdate();
      },
    });
  });
  updateManager.onUpdateFailed(() => console.error('update download failed'));
}

/** @param {{buildShareMessage: WechatMinigame.OnShareAppMessageCallback, onMemoryWarning?: () => void}} options */
function installAppServices({ buildShareMessage, onMemoryWarning = () => {} }) {
  const stopErrors = watchErrors();
  const stopMemory = watchMemory(onMemoryWarning);
  const stopSharing = enableSharing(buildShareMessage);
  promptForUpdates();
  return function destroy() {
    stopErrors();
    stopMemory();
    stopSharing();
  };
}

module.exports = { installAppServices };
