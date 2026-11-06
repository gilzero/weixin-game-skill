// @file: check-snippets.ts
// @desc: check documentation syntax and API types
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pino from 'pino';
import ts from 'typescript';

const log = pino({ base: null, timestamp: false });
const repoRoot = resolve(import.meta.dir, '..');
const skillRoot = join(repoRoot, 'skills/weixin-game');

export interface Snippet {
  source: string;
  code: string;
  language: string;
}

export function collectSnippets(root = skillRoot): Snippet[] {
  const files = [
    'SKILL.md',
    ...readdirSync(join(root, 'references'))
      .filter(name => name.endsWith('.md'))
      .map(name => `references/${name}`),
  ];
  return files.flatMap(name => {
    const markdown = readFileSync(join(root, name), 'utf8');
    return [...markdown.matchAll(/^```(js|javascript|ts|typescript)\s*\n([\s\S]*?)^```/gm)].map(match => ({
      source: `${name}:${markdown.slice(0, match.index).split('\n').length + 1}`,
      language: match[1] ?? 'js',
      code: match[2] ?? '',
    }));
  });
}

export function checkSnippets(
  snippets: Snippet[],
  optionsOverride: { typeRoots?: string[] } = {},
): { snippet: string; line: number; code: number; error: string }[] {
  if (snippets.length === 0) throw new Error('No documentation snippets found');
  const workDir = mkdtempSync(join(tmpdir(), 'wx-snippets-'));
  const sources = new Map<string, string>();
  try {
    mkdirSync(join(workDir, 'js/platform'), { recursive: true });
    copyFileSync(join(skillRoot, 'assets/starter/js/platform/loop.js'), join(workDir, 'js/platform/loop.js'));
    snippets.forEach((snippet, index) => {
      const file = join(workDir, `snippet-${index}.${/^(ts|typescript)$/.test(snippet.language) ? 'ts' : 'js'}`);
      sources.set(file, snippet.source);
      writeFileSync(file, snippet.code);
    });
    // The upstream Canvas.getContext return type is any; narrow 2D calls to the standard interface.
    const canvasTypes = join(workDir, 'canvas.d.ts');
    writeFileSync(
      canvasTypes,
      `
      declare namespace WechatMinigame {
        interface Canvas { getContext(type: '2d'): CanvasRenderingContext2D; }
      }
    `,
    );
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2020,
      lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
      types: ['minigame-api-typings'],
      typeRoots: optionsOverride.typeRoots ?? [join(repoRoot, 'node_modules')],
      allowJs: true,
      checkJs: true,
      noImplicitAny: false,
      noEmit: true,
      skipLibCheck: true,
      moduleDetection: ts.ModuleDetectionKind.Force,
    };
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile;
    host.readFile = path => {
      const source = readFile(path);
      // 3.8.21 contradicts live examples for the privacy resolver and signed payment string.
      return path.endsWith('/types/wx/lib.wx.api.d.ts')
        ? source
            ?.replace(
              /type OnNeedPrivacyAuthorizationCallback = \(\s*res: GeneralCallbackResult\s*\) => void/,
              "type OnNeedPrivacyAuthorizationCallback = (resolve: (choice: {event: 'exposureAuthorization' | 'agree' | 'disagree'}) => void) => void",
            )
            .replace('signData: SignData1', 'signData: string')
        : source;
    };
    const program = ts.createProgram(
      [...sources.keys(), canvasTypes, join(repoRoot, 'scripts/snippet-globals.d.ts')],
      options,
      host,
    );
    return ts.getPreEmitDiagnostics(program).map(diagnostic => ({
      snippet: diagnostic.file ? (sources.get(diagnostic.file.fileName) ?? diagnostic.file.fileName) : 'compiler',
      line:
        diagnostic.file && diagnostic.start !== undefined
          ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
          : 0,
      code: diagnostic.code,
      error: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const snippets = collectSnippets();
  const problems = checkSnippets(snippets);
  if (problems.length > 0) {
    log.error({ problems }, 'documentation snippets failed validation');
    process.exitCode = 1;
  } else log.info({ checked: snippets.length }, 'documentation snippets passed');
}
