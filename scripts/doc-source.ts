// @file: doc-source.ts
// @desc: validate retrieved documentation evidence
export class DocFetchError extends Error {
  constructor(
    readonly url: string,
    readonly detail: string,
    readonly status?: number,
  ) {
    super(`Could not verify ${url}: ${detail}`);
    this.name = 'DocFetchError';
  }
}

export function validateDocument(url: string, body: string): string {
  if (!body.trim() || /site unavailable|service unavailable|access denied|captcha|访问过于频繁/i.test(body)) {
    throw new DocFetchError(url, 'empty or unavailable document body');
  }
  // Some official pages, such as the scene list, title themselves with a Setext underline instead of #.
  const hasHeading = /^#{1,6}\s+\S/m.test(body) || /^\S.*\n={3,}\s*$/m.test(body);
  if (new URL(url).pathname.endsWith('.md') && (!hasHeading || /<!doctype html|<html[\s>]/i.test(body))) {
    throw new DocFetchError(url, 'expected Markdown documentation');
  }
  return body;
}

export async function fetchDocument(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new DocFetchError(url, `HTTP ${response.status}`, response.status);
    return validateDocument(url, await response.text());
  } catch (error) {
    if (error instanceof DocFetchError) throw error;
    throw new DocFetchError(url, error instanceof Error ? error.message : String(error));
  }
}

export function communityContent(url: string, body: string): string {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new DocFetchError(url, 'invalid community response');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('success' in value) ||
    value.success !== true ||
    !('data' in value) ||
    !value.data ||
    typeof value.data !== 'object' ||
    !('Content' in value.data) ||
    typeof value.data.Content !== 'string' ||
    !('Title' in value.data) ||
    typeof value.data.Title !== 'string' ||
    !value.data.Content.trim()
  ) {
    throw new DocFetchError(url, 'community article unavailable');
  }
  return `${value.data.Title}\n${value.data.Content.replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')}`;
}

export function guideIndex(html: string, minimum = 50): string[] {
  const paths = [
    ...new Set([...html.matchAll(/href="\/minigame\/dev\/(guide\/[^"#]+)\.html"/g)].map(match => match[1] as string)),
  ].sort();
  if (paths.length < minimum) throw new DocFetchError('guide sidebar', `only ${paths.length} guide paths`);
  return paths;
}

export function changedPaths(previous: string[], current: string[]): { added: string[]; removed: string[] } {
  return {
    added: current.filter(path => !previous.includes(path)),
    removed: previous.filter(path => !current.includes(path)),
  };
}

export function sectionText(body: string, heading: string): string {
  const lines = body.split('\n');
  const start = lines.findIndex(line => line.trim() === heading);
  if (start < 0) return '';
  const depth = heading.match(/^#+/)?.[0].length ?? 0;
  const end = lines.findIndex((line, index) => index > start && new RegExp(`^#{1,${depth}} `).test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}
