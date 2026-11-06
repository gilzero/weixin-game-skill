import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResponse, requestJson, validateArtifacts, validateGrades } from '../scripts/run-evals';
import { repoRoot } from './helpers/mock-wx';

function response(value: unknown) {
  return {
    status: 'completed',
    model: 'test-model',
    usage: { total_tokens: 10 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  };
}

test('evaluations reject incomplete responses and refusals', () => {
  expect(() => parseResponse({ ...response({}), status: 'incomplete' })).toThrow('incomplete');
  expect(() =>
    parseResponse({
      status: 'completed',
      model: 'test',
      output: [{ type: 'message', content: [{ type: 'refusal' }] }],
    }),
  ).toThrow('refused');
  expect(parseResponse(response({ passed: true })).value).toEqual({ passed: true });
});

test('artifact output stays inside outputs and never overwrites duplicate paths', () => {
  for (const path of [
    '../escape.js',
    'outputs/../../escape.js',
    '/tmp/escape.js',
    'outputs/./x.js',
    'outputs//x.js',
    'outputs/x\\y.js',
  ]) {
    expect(() => validateArtifacts({ files: [{ path, content: '' }], notes: '' })).toThrow('path');
  }
  const file = { path: 'outputs/open-data/index.js', content: 'hello' };
  expect(validateArtifacts({ files: [file], notes: '' }).files).toEqual([file]);
  expect(() => validateArtifacts({ files: [file, file], notes: '' })).toThrow('duplicate');
});

test('grading requires each expectation exactly once with evidence', () => {
  const grade = { index: 0, passed: true, evidence: 'audio.js removes the same hide listener' };
  expect(validateGrades({ grades: [grade] }, 1)).toEqual([grade]);
  expect(() => validateGrades({ grades: [] }, 1)).toThrow('Incomplete');
  expect(() => validateGrades({ grades: [grade, grade] }, 2)).toThrow('Invalid');
  expect(() => validateGrades({ grades: [{ ...grade, evidence: '' }] }, 1)).toThrow('evidence');
});

test('API adapter sends strict JSON schema and fails on HTTP errors without leaking response bodies', async () => {
  const transport = Object.assign(
    async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.store).toBe(false);
      expect(body.text.format.strict).toBe(true);
      expect(body.model).toBe('test-model');
      return Response.json(response({ files: [{ path: 'outputs/game.js', content: '// test' }], notes: '' }));
    },
    { preconnect: fetch.preconnect },
  );
  const result = await requestJson('test-model', 'instructions', 'prompt', {}, 'test-key', transport);
  expect(validateArtifacts(result.value).files).toHaveLength(1);
  const failure = Object.assign(async () => new Response('secret response content', { status: 401 }), {
    preconnect: fetch.preconnect,
  });
  await expect(requestJson('test', '', '', {}, 'test', failure)).rejects.toThrow('HTTP 401');
});

test('runner compares both task variants and records trigger results without executing artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'wx-eval-run-'));
  try {
    const preload = join(root, 'mock-api.js');
    writeFileSync(
      preload,
      `
      globalThis.fetch = async (_url, init) => {
        const request = JSON.parse(init.body);
        const properties = request.text.format.schema.properties;
        let value;
        if (properties.files) value = { files: [{path: 'outputs/hud.js', content: 'throw new Error("must not execute");'}], notes: '' };
        else if (properties.grades) value = { grades: JSON.parse(request.input).expectations.map((_, index) => ({index, passed: true, evidence: 'fixture evidence'})) };
        else value = {should_trigger: true, reason: 'fixture reason'};
        return Response.json({status: 'completed', model: 'test-model', output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(value)}]}]});
      };
    `,
    );
    const out = join(root, 'results');
    const run = Bun.spawnSync(
      ['bun', '--preload', preload, join(repoRoot, 'scripts/run-evals.ts'), '--run', '--limit', '1', '--out', out],
      {
        cwd: repoRoot,
        env: { ...process.env, OPENAI_API_KEY: 'test-only', EVAL_MODEL: 'test-model' },
      },
    );
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const runDir = join(out, readdirSync(out)[0] ?? 'missing');
    const report = JSON.parse(readFileSync(join(runDir, 'report.json'), 'utf8'));
    expect(report.cases).toHaveLength(3);
    expect(report.cases.map((item: Record<string, unknown>) => item.passed)).toEqual([true, true, true]);
    expect(readFileSync(join(runDir, '1-skill/outputs/hud.js'), 'utf8')).toContain('must not execute');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated syntax failures cannot be hidden by passing model grades', async () => {
  const { checkArtifactSyntax } = await import('../scripts/check-artifacts');
  expect(checkArtifactSyntax([{ path: 'outputs/game.js', content: 'function broken(' }]).length).toBeGreaterThan(0);
  expect(checkArtifactSyntax([{ path: 'outputs/game.json', content: '{broken' }]).length).toBeGreaterThan(0);
  expect(checkArtifactSyntax([{ path: 'outputs/game.js', content: 'throw new Error("never executed")' }])).toEqual([]);
});

test('evaluation fixtures are explicit and cannot escape their directory', async () => {
  const { readFixtures } = await import('../scripts/run-evals');
  expect(readFixtures(['fixtures/engine-project.json'])).toContain('3.8.7');
  expect(() => readFixtures(['../package.json'])).toThrow('Invalid fixture');
});
