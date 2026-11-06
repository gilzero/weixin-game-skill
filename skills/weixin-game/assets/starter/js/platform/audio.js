// @file: audio.js
// @desc: music sound effects and interruption handling
const SOUND_VOICES = 3;

function createAudio() {
  const soundPools = new Map();
  let music = null;
  let musicSrc = null;
  let wantsMusic = false;
  let muted = false;
  let interrupted = false;
  let webAudio = null;

  function resumeOutput() {
    if (interrupted) return;
    if (music && wantsMusic && !muted) music.play();
    if (webAudio) webAudio.resume();
  }

  function suspendOutput() {
    if (music) music.pause();
    if (webAudio) webAudio.suspend();
  }

  wx.onHide(suspendOutput);
  wx.onShow(resumeOutput);
  // Playback fails until the interruption (such as a phone call) has ended.
  if (wx.onAudioInterruptionBegin) {
    wx.onAudioInterruptionBegin(() => {
      interrupted = true;
      suspendOutput();
    });
  }
  if (wx.onAudioInterruptionEnd) {
    wx.onAudioInterruptionEnd(() => {
      interrupted = false;
      resumeOutput();
    });
  }

  function destroyMusic() {
    if (music) music.destroy();
    music = null;
    musicSrc = null;
  }

  return {
    // InnerAudioContext streams, which suits long tracks better than decoding into memory.
    playMusic(src, volume = 1) {
      wantsMusic = true;
      if (musicSrc !== src) {
        destroyMusic();
        music = wx.createInnerAudioContext();
        music.src = src;
        music.loop = true;
        music.volume = volume;
        music.onError(error => console.error('music failed', src, error));
        musicSrc = src;
      }
      if (!muted && !interrupted) music.play();
    },

    pauseMusic() {
      wantsMusic = false;
      if (music) music.pause();
    },

    stopMusic() {
      wantsMusic = false;
      destroyMusic();
    },

    // Several voices let the same effect overlap, and the docs ask to reuse instances rather than recreate them.
    loadSound(name, src, voiceCount = SOUND_VOICES) {
      const voices = [];
      for (let index = 0; index < voiceCount; index += 1) {
        const voice = wx.createInnerAudioContext({ useWebAudioImplement: true });
        voice.src = src;
        voice.onError(error => console.error('sound failed', name, error));
        voices.push(voice);
      }
      soundPools.set(name, { voices, nextVoice: 0 });
    },

    playSound(name, volume = 1) {
      const pool = soundPools.get(name);
      if (!pool) throw new Error(`Sound not loaded: ${name}`);
      if (muted || interrupted) return;
      const voice = pool.voices[pool.nextVoice];
      pool.nextVoice = (pool.nextVoice + 1) % pool.voices.length;
      voice.volume = volume;
      voice.seek(0);
      voice.play();
    },

    // Synthesised tones need no asset files, which keeps the main package small.
    beep(frequency = 660, durationSeconds = 0.08, volume = 0.1) {
      if (muted || interrupted || !wx.createWebAudioContext) return;
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

    setMuted(nextMuted) {
      muted = nextMuted;
      if (!music) return;
      if (muted) music.pause();
      else if (wantsMusic && !interrupted) music.play();
    },

    isMuted: () => muted,

    destroy() {
      destroyMusic();
      soundPools.forEach(pool => pool.voices.forEach(voice => voice.destroy()));
      soundPools.clear();
    },
  };
}

module.exports = { createAudio };
