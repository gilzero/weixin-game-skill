// @file: tap-rush.js
// @desc: pure rules for the sample game
// This file never touches wx or the canvas, so its rules can be tested anywhere.
const ROUND_SECONDS = 20;
const TARGET_RADIUS = 36;
const TARGET_LIFETIME_SECONDS = 1.2;
const HIT_SCORE = 10;

function createTapRush({ bounds, bestScore = 0, random = Math.random }) {
  const game = {
    phase: 'ready',
    score: 0,
    bestScore,
    secondsLeft: ROUND_SECONDS,
    /** @type {{ x: number, y: number, radius: number, age: number } | null} */
    target: null,
    bounds,

    start() {
      game.phase = 'playing';
      game.score = 0;
      game.secondsLeft = ROUND_SECONDS;
      spawnTarget();
    },

    update(deltaSeconds) {
      if (game.phase !== 'playing') return;
      game.secondsLeft = Math.max(0, game.secondsLeft - deltaSeconds);
      if (game.secondsLeft === 0) {
        finishRound();
        return;
      }
      const { target } = game;
      if (!target) return;
      target.age += deltaSeconds;
      if (target.age >= TARGET_LIFETIME_SECONDS) spawnTarget();
    },

    // Returns whether the tap hit, so the caller can decide on sound and vibration.
    tap(x, y) {
      const { target } = game;
      if (game.phase !== 'playing' || !target) return false;
      const isHit = Math.hypot(x - target.x, y - target.y) <= TARGET_RADIUS;
      if (isHit) {
        game.score += HIT_SCORE;
        spawnTarget();
      }
      return isHit;
    },

    setBounds(nextBounds) {
      game.bounds = nextBounds;
      if (game.phase === 'playing') spawnTarget();
    },
  };

  function spawnTarget() {
    const { left, top, right, bottom } = game.bounds;
    game.target = {
      x: left + TARGET_RADIUS + random() * Math.max(0, right - left - TARGET_RADIUS * 2),
      y: top + TARGET_RADIUS + random() * Math.max(0, bottom - top - TARGET_RADIUS * 2),
      radius: TARGET_RADIUS,
      age: 0,
    };
  }

  function finishRound() {
    game.phase = 'over';
    game.target = null;
    game.bestScore = Math.max(game.bestScore, game.score);
  }

  return game;
}

module.exports = { HIT_SCORE, ROUND_SECONDS, TARGET_RADIUS, createTapRush };
