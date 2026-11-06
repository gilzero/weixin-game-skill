// @file: check-snippets.ts
// @desc: type check snippets against wx typings
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import pino from 'pino';

const log = pino({ base: null, timestamp: false });
const repoRoot = resolve(import.meta.dir, '..');
const referencesDir = join(repoRoot, 'skills/weixin-game/references');

// Snippets call helpers they do not define, so only API misuse counts as a failure here.
const API_MISUSE_CODES = new Set(['TS2339', 'TS2345', 'TS2353', 'TS2551', 'TS2554', 'TS2561', 'TS2322']);
const WX_ERROR_HINT = /WechatMinigame|\bWx\b|Option\b|Options\b|known properties|typeof wx/;

class SnippetCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnippetCheckError';
  }
}

interface Snippet {
  source: string;
  code: string;
}

function collectSnippets(): Snippet[] {
  return readdirSync(referencesDir)
    .filter(name => name.endsWith('.md'))
    .flatMap(name => {
      const markdown = readFileSync(join(referencesDir, name), 'utf8');
      return [...markdown.matchAll(/```js\n([\s\S]*?)```/g)].map((match, index) => ({
        source: `${name}#${index + 1}`,
        code: match[1] ?? '',
      }));
    });
}

function main(): void {
  const snippets = collectSnippets();
  if (snippets.length === 0) throw new SnippetCheckError(`No js snippets found in ${referencesDir}`);

  const workDir = mkdtempSync(join(tmpdir(), 'wx-snippets-'));
  const sourceByFile = new Map<string, string>();
  try {
    snippets.forEach((snippet, index) => {
      const fileName = `snippet-${index}.js`;
      sourceByFile.set(fileName, snippet.source);
      writeFileSync(join(workDir, fileName), snippet.code);
    });
    writeFileSync(
      join(workDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2017',
          lib: ['ES2020'],
          types: ['minigame-api-typings'],
          typeRoots: [join(repoRoot, 'node_modules')],
          allowJs: true,
          checkJs: true,
          noEmit: true,
          skipLibCheck: true,
          moduleDetection: 'force',
        },
        include: ['*.js'],
      }),
    );

    const tscPath = join(repoRoot, 'node_modules/.bin/tsc');
    const result = Bun.spawnSync([tscPath, '--pretty', 'false', '-p', workDir], { cwd: repoRoot });
    const output = result.stdout.toString();
    const problems = output
      .split('\n')
      .map(line => /(snippet-\d+\.js)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .filter(match => API_MISUSE_CODES.has(match[3] ?? '') && WX_ERROR_HINT.test(match[4] ?? ''))
      .map(match => ({ snippet: sourceByFile.get(match[1] ?? ''), line: Number(match[2]), error: match[4] }));

    if (problems.length > 0) {
      log.error({ problems }, 'snippets misuse the wx API');
      process.exit(1);
    }
    log.info({ checked: snippets.length, root: relative(repoRoot, referencesDir) }, 'snippets match the wx typings');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main();
