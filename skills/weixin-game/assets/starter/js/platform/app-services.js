// @file: app-services.js
// @desc: errors memory sharing and update prompts
function watchErrors() {
  // The message already includes the stack trace.
  if (wx.onError) wx.onError(result => console.error('uncaught error', result.message));
  if (wx.onUnhandledRejection) wx.onUnhandledRejection(result => console.error('unhandled rejection', result.reason));
}

// iOS destroys a game after two memory warnings within 5 seconds, so free memory on the first.
function watchMemory(onMemoryWarning) {
  if (!wx.onMemoryWarning) return;
  wx.onMemoryWarning(() => {
    onMemoryWarning();
    wx.triggerGC();
  });
}

// The share entry in the menu stays disabled until showShareMenu is called.
function enableSharing(buildShareMessage) {
  wx.showShareMenu({ menus: ['shareAppMessage'] });
  wx.onShareAppMessage(buildShareMessage);
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

function installAppServices({ buildShareMessage, onMemoryWarning = () => {} }) {
  watchErrors();
  watchMemory(onMemoryWarning);
  enableSharing(buildShareMessage);
  promptForUpdates();
}

module.exports = { installAppServices };
