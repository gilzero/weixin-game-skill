// @file: game.js
// @desc: boots platform services and sample game
const { createScreen } = require('./js/platform/screen');
const { createInput } = require('./js/platform/input');
const { createAudio } = require('./js/platform/audio');
const { createStorage } = require('./js/platform/storage');
const { installAppServices } = require('./js/platform/app-services');
const { startLoop } = require('./js/platform/loop');
const { createTapRush } = require('./js/game/tap-rush');
const { drawGame, isInsideRect, startButtonRect } = require('./js/game/render');

const screen = createScreen();
const input = createInput();
const audio = createAudio();
const storage = createStorage('tap-rush');
const game = createTapRush({ bounds: screen.content, bestScore: storage.load('bestScore', 0) });

installAppServices({
  buildShareMessage: () => ({ title: `我在点得快拿了 ${game.bestScore} 分，来挑战`, query: 'from=share' }),
});

screen.onResize(layout => game.setBounds(layout.content));

input.on('tap', ({ x, y }) => {
  if (game.phase !== 'playing') {
    if (isInsideRect(startButtonRect(screen), x, y)) game.start();
    return;
  }
  if (game.tap(x, y)) {
    audio.beep();
    wx.vibrateShort({ type: 'light' });
  }
});

startLoop((deltaSeconds, elapsedSeconds) => {
  const previousPhase = game.phase;
  game.update(deltaSeconds, elapsedSeconds);
  if (previousPhase === 'playing' && game.phase === 'over') storage.save('bestScore', game.bestScore);
  drawGame(screen.ctx, screen, game);
});
