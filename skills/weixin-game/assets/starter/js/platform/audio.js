// @file: audio.js
// @desc: music effects and interruption handling
const SOUND_VOICES = 3;

/** @param {{useWebAudioImplement?: boolean, obeyMuteSwitch?: boolean}} options */
function createAudio({ useWebAudioImplement = false, obeyMuteSwitch } = {}) {
  const isIOSHighPerformance = typeof GameGlobal !== 'undefined' && Boolean(GameGlobal.isIOSHighPerformanceMode);
  const webAudioImplement = Boolean(useWebAudioImplement) && !isIOSHighPerformance;
  if (typeof obeyMuteSwitch === 'boolean' && wx.setInnerAudioOption) {
    wx.setInnerAudioOption({
      obeyMuteSwitch,
      fail: error => console.error('inner audio option failed', error),
    });
  }
  /** @type {Map<string, {voices: WechatMinigame.InnerAudioContext[], nextVoice: number}>} */
  const soundPools = new Map();
  /** @type {WechatMinigame.InnerAudioContext | null} */
  let music = null;
  /** @type {string | null} */
  let musicSrc = null;
  let wantsMusic = false;
  let muted = false;
  let interrupted = false;
  let hidden = false;
  let destroyed = false;
  /** @type {WechatMinigame.WebAudioContext | null} */
  let webAudio = null;

  function assertAlive() {
    if (destroyed) throw new Error('Audio has been destroyed');
  }
  function canPlay() {
    return !destroyed && !hidden && !interrupted && !muted;
  }
  function resumeOutput() {
    if (!canPlay()) return;
    if (music && wantsMusic) music.play();
    if (webAudio) webAudio.resume().catch(error => console.error('audio resume failed', error));
  }
  function suspendOutput() {
    if (music) music.pause();
    soundPools.forEach(pool => pool.voices.forEach(voice => voice.stop()));
    if (webAudio) webAudio.suspend().catch(error => console.error('audio suspend failed', error));
  }
  function handleHide() {
    hidden = true;
    suspendOutput();
  }
  function handleShow() {
    hidden = false;
    resumeOutput();
  }
  function handleInterruptionBegin() {
    interrupted = true;
    suspendOutput();
  }
  function handleInterruptionEnd() {
    interrupted = false;
    resumeOutput();
  }
  wx.onHide(handleHide);
  wx.onShow(handleShow);
  if (wx.onAudioInterruptionBegin) wx.onAudioInterruptionBegin(handleInterruptionBegin);
  if (wx.onAudioInterruptionEnd) wx.onAudioInterruptionEnd(handleInterruptionEnd);

  function destroyMusic() {
    if (music) music.destroy();
    music = null;
    musicSrc = null;
  }

  return {
    // InnerAudio streams long tracks without decoding the whole file into memory.
    /** @param {string} src */
    playMusic(src, volume = 1) {
      assertAlive();
      wantsMusic = true;
      if (musicSrc !== src || !music) {
        destroyMusic();
        music = wx.createInnerAudioContext();
        music.src = src;
        music.loop = true;
        music.onError(error => console.error('music failed', src, error));
        musicSrc = src;
      }
      music.volume = volume;
      if (canPlay()) music.play();
    },
    pauseMusic() {
      wantsMusic = false;
      if (music) music.pause();
    },
    stopMusic() {
      wantsMusic = false;
      destroyMusic();
    },
    /** @param {string} name @param {string} src */
    loadSound(name, src, voiceCount = SOUND_VOICES) {
      assertAlive();
      if (!Number.isInteger(voiceCount) || voiceCount < 1)
        throw new RangeError('voiceCount must be a positive integer');
      const previous = soundPools.get(name);
      if (previous) previous.voices.forEach(voice => voice.destroy());
      const voices = [];
      for (let index = 0; index < voiceCount; index += 1) {
        // GameGlobal.isIOSHighPerformanceMode disables useWebAudioImplement automatically on iPhone high-perf runtimes.
        const voice = wx.createInnerAudioContext({ useWebAudioImplement: webAudioImplement });
        voice.src = src;
        voice.onError(error => console.error('sound failed', name, error));
        voices.push(voice);
      }
      soundPools.set(name, { voices, nextVoice: 0 });
    },
    /** @param {string} name */
    playSound(name, volume = 1) {
      assertAlive();
      const pool = soundPools.get(name);
      if (!pool) throw new Error(`Sound not loaded: ${name}`);
      if (!canPlay()) return;
      const voice = pool.voices[pool.nextVoice];
      if (!voice) throw new Error(`Sound pool is empty: ${name}`);
      pool.nextVoice = (pool.nextVoice + 1) % pool.voices.length;
      voice.volume = volume;
      voice.stop();
      voice.play();
    },
    beep(frequency = 660, durationSeconds = 0.08, volume = 0.1) {
      assertAlive();
      if (!canPlay() || !wx.createWebAudioContext) return;
      if (!webAudio) webAudio = wx.createWebAudioContext();
      const startAt = webAudio.currentTime;
      const oscillator = webAudio.createOscillator();
      const gain = webAudio.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(webAudio.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationSeconds);
    },
    /** @param {boolean} nextMuted */
    setMuted(nextMuted) {
      assertAlive();
      muted = nextMuted;
      if (muted) suspendOutput();
      else resumeOutput();
    },
    isMuted: () => muted,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      wx.offHide(handleHide);
      wx.offShow(handleShow);
      if (wx.offAudioInterruptionBegin) wx.offAudioInterruptionBegin(handleInterruptionBegin);
      if (wx.offAudioInterruptionEnd) wx.offAudioInterruptionEnd(handleInterruptionEnd);
      destroyMusic();
      soundPools.forEach(pool => pool.voices.forEach(voice => voice.destroy()));
      soundPools.clear();
      if (webAudio) {
        webAudio.close().catch(error => console.error('audio close failed', error));
        webAudio = null;
      }
    },
  };
}

module.exports = { createAudio };
