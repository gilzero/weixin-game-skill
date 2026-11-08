// @file: storage.js
// @desc: safe wrapper around wx storage
/** @param {string} keyPrefix */
function createStorage(keyPrefix) {
  /** @param {string} key */
  const fullKey = key => `${keyPrefix}:${key}`;

  return {
    /** @template Value @param {string} key @param {Value} fallback @returns {Value} */
    load(key, fallback) {
      try {
        const stored = wx.getStorageSync(fullKey(key));
        // A missing key comes back as an empty string rather than undefined.
        return stored === '' || stored === undefined ? fallback : stored;
      } catch (error) {
        console.error('storage load failed', key, error);
        return fallback;
      }
    },

    // Returns false when full, because a key holds 1MB and a game holds 10MB per user.
    /** @param {string} key @param {unknown} value */
    save(key, value) {
      try {
        wx.setStorageSync(fullKey(key), value);
        return true;
      } catch (error) {
        console.error('storage save failed', key, error);
        return false;
      }
    },

    /** @param {string} key */
    remove(key) {
      try {
        wx.removeStorageSync(fullKey(key));
        return true;
      } catch (error) {
        console.error('storage remove failed', key, error);
        return false;
      }
    },
  };
}

module.exports = { createStorage };
