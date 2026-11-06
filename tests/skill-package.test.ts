import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { repoRoot, skillRoot, starterRoot } from './helpers/mock-wx';

const DESCRIPTION_LIMIT = 1536;
const SKILL_LINE_LIMIT = 500;
const DOC_LINE_LIMIT = 150;
const ALLOWED_FRONTMATTER = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
const CODE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.sh']);

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    if (['node_modules', '.git', 'eval-results'].includes(entry)) return [];
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function parseFrontmatter(markdown: string): Record<string, unknown> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match?.[1]) throw new Error('SKILL.md has no frontmatter');
  return Bun.YAML.parse(match[1]) as Record<string, unknown>;
}

const skillText = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
const frontmatter = parseFrontmatter(skillText);
const allFiles = listFiles(repoRoot);
const skillMarkdown = listFiles(skillRoot).filter(path => path.endsWith('.md'));
const referenceFiles = skillMarkdown.filter(path => path.includes('/references/'));

describe('skill layout', () => {
  test('uses the directory layout Claude Code discovers', () => {
    expect(basename(skillRoot)).toBe('weixin-game');
    expect(existsSync(join(skillRoot, 'SKILL.md'))).toBe(true);
    expect(frontmatter.name).toBe('weixin-game');
  });

  test('frontmatter only uses fields that also upload to claude.ai', () => {
    expect(Object.keys(frontmatter).filter(key => !ALLOWED_FRONTMATTER.includes(key))).toEqual([]);
  });

  test('the description carries the triggers and fits the listing limit', () => {
    const description = String(frontmatter.description);
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    for (const trigger of [
      '微信小游戏',
      'WeChat mini game',
      'game.json',
      'wx.createCanvas',
      '胶囊按钮',
      '开放数据域',
    ]) {
      expect(description).toContain(trigger);
    }
  });

  test('SKILL.md stays well under the recommended length', () => {
    expect(skillText.split('\n').length).toBeLessThan(SKILL_LINE_LIMIT);
  });

  test('every reference file is linked from SKILL.md and carries a verification date', () => {
    expect(referenceFiles.length).toBeGreaterThan(0);
    for (const path of referenceFiles) {
      expect(skillText).toContain(`references/${basename(path)}`);
      expect(readFileSync(path, 'utf8')).toMatch(/Last verified against the official docs: \d{4}-\d{2}-\d{2}/);
    }
  });

  test('plugin and marketplace names agree', () => {
    const plugin = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin/plugin.json'), 'utf8'));
    const marketplace = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin/marketplace.json'), 'utf8'));
    expect(marketplace.plugins[0].name).toBe(plugin.name);
    expect(plugin.name).toBe(frontmatter.name);
    expect((frontmatter.metadata as { version: string }).version).toBe(plugin.version);
    expect(JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version).toBe(plugin.version);
  });

  test('docs verified is the oldest reference verification date', () => {
    const dates = referenceFiles
      .map(path => {
        const date = /Last verified against the official docs: (\d{4}-\d{2}-\d{2})/.exec(
          readFileSync(path, 'utf8'),
        )?.[1];
        if (!date || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${path}`);
        return date;
      })
      .sort();
    expect((frontmatter.metadata as Record<string, unknown>)['docs-verified']).toBe(dates[0]);
  });
});

describe('documentation', () => {
  test('relative links and anchors resolve', () => {
    const slug = (heading: string) =>
      heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-');
    for (const path of [...skillMarkdown, join(repoRoot, 'README.md'), join(repoRoot, 'AGENTS.md')]) {
      const markdown = readFileSync(path, 'utf8');
      for (const [, target] of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
        if (!target || /^https?:/.test(target)) continue;
        const [file, anchor] = target.split('#') as [string, string | undefined];
        const resolved = file ? join(dirname(path), file) : path;
        expect(existsSync(resolved), `${relative(repoRoot, path)} links to ${target}`).toBe(true);
        if (anchor) {
          const headings = [...readFileSync(resolved, 'utf8').matchAll(/^#+ (.+)$/gm)].map(match =>
            slug(match[1] ?? ''),
          );
          expect(headings, `${relative(repoRoot, path)} links to #${anchor}`).toContain(anchor);
        }
      }
    }
  });

  test('README and AGENTS stay short', () => {
    for (const name of ['README.md', 'AGENTS.md']) {
      expect(readFileSync(join(repoRoot, name), 'utf8').split('\n').length).toBeLessThanOrEqual(DOC_LINE_LIMIT);
    }
  });
});

describe('starter', () => {
  const starterFiles = listFiles(starterRoot);
  const starterCode = starterFiles.filter(path => path.endsWith('.js'));

  test('has what WeChat DevTools needs at the project root', () => {
    for (const name of ['game.js', 'game.json', 'project.config.json']) {
      expect(existsSync(join(starterRoot, name))).toBe(true);
    }
    expect(JSON.parse(readFileSync(join(starterRoot, 'project.config.json'), 'utf8')).compileType).toBe('game');
  });

  test('avoids browser globals, retired APIs and dynamic code', () => {
    const banned =
      /\b(window|document|localStorage|navigator|globalThis|fetch|XMLHttpRequest|eval)\b\s*[.(]|new Function|wx\.createOffscreenCanvas|wx\.getUserProfile/;
    for (const path of starterCode) {
      expect(readFileSync(path, 'utf8'), relative(starterRoot, path)).not.toMatch(banned);
    }
  });

  test('every wx call lives in the platform layer or the entry point', () => {
    const rulesAndDrawing = starterCode.filter(path => path.includes('/js/game/'));
    expect(rulesAndDrawing.length).toBeGreaterThan(0);
    for (const path of rulesAndDrawing) {
      expect(readFileSync(path, 'utf8'), relative(starterRoot, path)).not.toMatch(/\bwx\./);
    }
  });
});

describe('metaheaders', () => {
  const isTest = (path: string) => relative(repoRoot, path).startsWith('tests/');
  const codeFiles = allFiles.filter(path => CODE_EXTENSIONS.has(extname(path)) && !isTest(path));

  test('every code file has a valid two-line header', () => {
    expect(codeFiles.length).toBeGreaterThan(0);
    for (const path of codeFiles) {
      const lines = readFileSync(path, 'utf8').split('\n');
      const body = lines[0]?.startsWith('#!') ? lines.slice(1) : lines;
      const prefix = extname(path) === '.sh' ? '#' : '//';
      const label = relative(repoRoot, path);
      expect(body[0], label).toBe(`${prefix} @file: ${basename(path)}`);
      const description = body[1]?.replace(`${prefix} @desc: `, '') ?? '';
      expect(body[1]?.startsWith(`${prefix} @desc: `), label).toBe(true);
      expect(description.split(/\s+/).length, `${label}: "${description}"`).toBeLessThanOrEqual(6);
      expect(description, label).not.toMatch(/[.,;:!?]/);
    }
  });
});
