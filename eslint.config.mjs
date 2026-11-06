// @file: eslint.config.mjs
// @desc: lint rules for scripts and starter
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const wechatGlobals = {
  wx: 'readonly',
  GameGlobal: 'readonly',
  requestAnimationFrame: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  require: 'readonly',
  module: 'writable',
};

export default defineConfig([
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['skills/weixin-game/assets/starter/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: wechatGlobals },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
