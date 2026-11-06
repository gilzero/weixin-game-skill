// @file: render.js
// @desc: draws sample game in logical pixels
const BACKGROUND_COLOR = '#101828';
const TEXT_COLOR = '#f2f4f7';
const MUTED_TEXT_COLOR = 'rgba(242, 244, 247, 0.7)';
const ACCENT_COLOR = '#32d583';
const BUTTON_TEXT_COLOR = '#101828';
const TOP_BAR_PADDING = 16;
const START_BUTTON_WIDTH = 200;
const START_BUTTON_HEIGHT = 56;
const START_BUTTON_BOTTOM_MARGIN = 48;

function startButtonRect(screen) {
  const { left, right, bottom } = screen.content;
  const width = Math.min(START_BUTTON_WIDTH, right - left);
  return {
    left: (left + right - width) / 2,
    top: bottom - START_BUTTON_BOTTOM_MARGIN - START_BUTTON_HEIGHT,
    width,
    height: START_BUTTON_HEIGHT,
  };
}

function isInsideRect(rect, x, y) {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function fillRoundedRect(ctx, rect, radius) {
  ctx.beginPath();
  // Support varies by client, so the arc path is the fallback rather than an assumption either way.
  if (ctx.roundRect) {
    ctx.roundRect(rect.left, rect.top, rect.width, rect.height, radius);
  } else {
    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    ctx.moveTo(rect.left + radius, rect.top);
    ctx.arcTo(right, rect.top, right, bottom, radius);
    ctx.arcTo(right, bottom, rect.left, bottom, radius);
    ctx.arcTo(rect.left, bottom, rect.left, rect.top, radius);
    ctx.arcTo(rect.left, rect.top, right, rect.top, radius);
    ctx.closePath();
  }
  ctx.fill();
}

function drawText(ctx, text, x, y, { size, color, align = 'left' }) {
  ctx.font = `${size}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function drawTopBar(ctx, screen, game) {
  const { left, right, top, bottom } = screen.topBar;
  const centerY = (top + bottom) / 2;
  drawText(ctx, `得分 ${game.score}`, left + TOP_BAR_PADDING, centerY, { size: 18, color: TEXT_COLOR });
  if (game.phase === 'playing') {
    drawText(ctx, `${Math.ceil(game.secondsLeft)} 秒`, right, centerY, {
      size: 18,
      color: MUTED_TEXT_COLOR,
      align: 'right',
    });
  }
}

function drawTarget(ctx, target) {
  ctx.fillStyle = ACCENT_COLOR;
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawMenu(ctx, screen, game) {
  const { left, right, top, bottom } = screen.content;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const title = game.phase === 'over' ? `本局 ${game.score} 分` : '点得快';
  drawText(ctx, title, centerX, centerY - 40, { size: 36, color: TEXT_COLOR, align: 'center' });
  drawText(ctx, `最高分 ${game.bestScore}`, centerX, centerY + 8, {
    size: 18,
    color: MUTED_TEXT_COLOR,
    align: 'center',
  });

  const button = startButtonRect(screen);
  ctx.fillStyle = ACCENT_COLOR;
  fillRoundedRect(ctx, button, 12);
  const label = game.phase === 'over' ? '再来一局' : '开始';
  drawText(ctx, label, button.left + button.width / 2, button.top + button.height / 2, {
    size: 20,
    color: BUTTON_TEXT_COLOR,
    align: 'center',
  });
}

function drawGame(ctx, screen, game) {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, screen.width, screen.height);
  drawTopBar(ctx, screen, game);
  if (game.phase === 'playing') drawTarget(ctx, game.target);
  else drawMenu(ctx, screen, game);
}

module.exports = { drawGame, isInsideRect, startButtonRect };
