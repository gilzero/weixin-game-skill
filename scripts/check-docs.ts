// @file: check-docs.ts
// @desc: detect drift against live WeChat docs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import pino from 'pino';

const log = pino({ base: null, timestamp: false });
const repoRoot = resolve(import.meta.dir, '..');
const skillRoot = join(repoRoot, 'skills/weixin-game');
const DOCS_BASE = 'https://developers.weixin.qq.com/minigame/dev';
const INDEX_PAGE = 'api/render/canvas/wx.createCanvas.html';
const MAX_CONCURRENT_REQUESTS = 8;
const REQUEST_TIMEOUT_MS = 30_000;

// Names the skill mentions only to warn that they are absent, plus documented non-function members.
const API_NAMES_NOT_IN_INDEX = new Set(['wx.getUserProfile', 'wx.createOffscreenCanvas', 'wx.env']);

interface Fact {
  claim: string;
  page: string;
  mustContain: string[];
  reference: string;
}

const facts: Fact[] = [
  {
    claim: 'Package limits: 30MB total, 4MB main, 4MB independent',
    page: 'guide/base-ability/subPackage/useSubPackage',
    mustContain: ['不超过 30M', '主包不超过 4M', '单个普通分包不限制大小', '单个独立分包不超过 4M'],
    reference: 'platform-facts.md',
  },
  {
    claim: 'First wx.createCanvas call is on-screen',
    page: 'api/render/canvas/wx.createCanvas',
    mustContain: ['首次调用创建的是显示在屏幕上的画布'],
    reference: 'rendering-and-layout.md',
  },
  {
    claim: 'webgl2 is available from base library 2.24.0',
    page: 'api/render/canvas/Canvas.getContext',
    mustContain: ['webgl2', '2.24.0'],
    reference: 'rendering-and-layout.md',
  },
  {
    claim: 'wx.getSystemInfoSync is unmaintained from 2.20.1',
    page: 'api/base/system/wx.getSystemInfoSync',
    mustContain: ['2.20.1', '停止维护', 'wx.getWindowInfo'],
    reference: 'platform-facts.md',
  },
  {
    claim: 'safeArea is defined in portrait and may be absent',
    page: 'api/base/system/wx.getWindowInfo',
    mustContain: ['在竖屏正方向下的安全区域', '不会返回 safeArea'],
    reference: 'rendering-and-layout.md',
  },
  {
    claim: 'GameGlobal is the global object',
    page: 'guide/base-ability/module',
    mustContain: ['GameGlobal'],
    reference: 'platform-facts.md',
  },
  {
    claim: 'Share menu entry is off by default',
    page: 'guide/open-ability/share/share',
    mustContain: ['默认不可点击', 'wx.showShareMenu'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'shareAppMessage lists no callbacks or toGroup',
    page: 'api/share/wx.shareAppMessage',
    mustContain: ['imageUrlId', 'toCurrentGroup'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'Open data context draws on wx.getSharedCanvas and adds main canvas limits',
    page: 'guide/open-ability/opendata/basic',
    mustContain: ['wx.getSharedCanvas', 'screenCanvas', '开放数据域不能向主域发送消息'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'Friend data needs scope.WxFriendInteraction and the open data context',
    page: 'api/open-api/data/wx.getFriendCloudStorage',
    mustContain: ['scope.WxFriendInteraction', '只在开放数据域下可用'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'Workers: game.json config, one at a time, no wx APIs',
    page: 'guide/base-ability/workers',
    mustContain: ['"workers"', '最大并发数量限制为 1 个', '不支持 `wx` 系列的 API'],
    reference: 'performance.md',
  },
  {
    claim: 'Memory warning level values and Android only',
    page: 'api/device/memory/wx.onMemoryWarning',
    mustContain: ['只有 Android 才有', 'TRIM_MEMORY_RUNNING_CRITICAL'],
    reference: 'performance.md',
  },
  {
    claim: 'iOS destroys after two warnings within 5 seconds',
    page: 'guide/performance/perf-action-memory-management',
    mustContain: ['5 秒', '两次及以上系统内存告警'],
    reference: 'performance.md',
  },
  {
    claim: 'Audio: Android plays 10 at once, InnerAudio for long, WebAudio for short',
    page: 'guide/base-ability/audio',
    mustContain: ['最多同时播放 10 个音频', 'useWebAudioImplement'],
    reference: 'input-audio-lifecycle.md',
  },
  {
    claim: 'Audio only resumes after the interruption ends',
    page: 'api/base/app/app-event/wx.onAudioInterruptionEnd',
    mustContain: ['收到此事件之后才可再次播放成功'],
    reference: 'input-audio-lifecycle.md',
  },
  {
    claim: 'Storage: 1MB per key and 10MB total',
    page: 'api/storage/wx.setStorage',
    mustContain: ['最大数据长度为 1MB', '所有数据存储上限为 10MB'],
    reference: 'platform-facts.md',
  },
  {
    claim: 'Local files: 200MB shared limit',
    page: 'guide/base-ability/file-system',
    mustContain: ['最多可存储 200MB', 'wx.env.USER_DATA_PATH'],
    reference: 'assets-and-network.md',
  },
  {
    claim: 'Network: concurrency 10 and 5, fails 5 seconds into background',
    page: 'guide/base-ability/network',
    mustContain: ['最大并发限制是 **10**', '最大并发限制是 **5**', '**5s**', '不能被配置为服务器域名'],
    reference: 'assets-and-network.md',
  },
  {
    claim: 'Code package whitelist does not include webp',
    page: 'guide/base-ability/code-package',
    mustContain: ['白名单', '代码包总大小不能超过 30M'],
    reference: 'assets-and-network.md',
  },
  {
    claim: 'JS: no eval or new Function, iOS 15 Promise timing',
    page: 'guide/runtime/js-support',
    mustContain: ['不支持使用 `eval`', '不支持使用 `new Function`', 'iOS 15 及以下'],
    reference: 'platform-facts.md',
  },
  {
    claim: 'Rewarded ad: singleton, isEnded decides the reward',
    page: 'guide/open-ability/ad/rewarded-video-ad',
    mustContain: ['全局单例', 'isEnded'],
    reference: 'monetization.md',
  },
  {
    claim: 'Ad eligibility starts at 500 unique visitors',
    page: 'guide/open-ability/ad/ad',
    mustContain: ['> 500'],
    reference: 'monetization.md',
  },
  {
    claim: 'Payment: offerId, price tiers, outTradeNo, iOS block code',
    page: 'api/midas-payment/wx.requestMidasPayment',
    mustContain: ['在米大师侧申请的应用 id', '价格等级', 'outTradeNo', '701001'],
    reference: 'monetization.md',
  },
  {
    claim: 'Payment support check: res.data.allow_pay, and iOS needs 15, 3.10.3 and 8.0.68',
    page: 'api/midas-payment/wx.checkIsSupportMidasPayment',
    mustContain: ['allow_pay', 'iOS 15', '3.10.3', '8.0.68', '一定不支持虚拟支付'],
    reference: 'monetization.md',
  },
  {
    claim: 'Payment needs a business entity, real-name system and licence',
    page: 'guide/open-ability/virtual-payment/virtual-payment2',
    mustContain: ['个体工商户或企业', '实名认证', '版号'],
    reference: 'monetization.md',
  },
  {
    claim: 'Item delivery is pushed to the server and must be idempotent',
    page: 'guide/open-ability/virtual-payment/goods',
    mustContain: ['minigame_game_pay_goods_deliver_notify', '只发货一次'],
    reference: 'monetization.md',
  },
  {
    claim: 'Privacy APIs need base library 2.32.3',
    page: 'api/open-api/privacy/wx.requirePrivacyAuthorize',
    mustContain: ['2.32.3'],
    reference: 'privacy-and-release.md',
  },
  {
    claim: 'Privacy flow reports exposure, agree and disagree',
    page: 'guide/open-ability/privacy',
    mustContain: ['exposureAuthorization', 'wx.openPrivacyContract'],
    reference: 'privacy-and-release.md',
  },
  {
    claim: 'First user info request goes through the native button',
    page: 'guide/open-ability/user-info',
    mustContain: ['不会弹出授权窗口', 'wx.createUserInfoButton'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'Login code is one-time and session_key stays on the server',
    page: 'guide/open-ability/login',
    mustContain: ['只能使用一次', '不应该把会话密钥下发到小程序'],
    reference: 'privacy-and-release.md',
  },
];

class DocFetchError extends Error {
  constructor(
    readonly url: string,
    readonly detail: string,
  ) {
    super(`Could not fetch ${url}: ${detail}`);
    this.name = 'DocFetchError';
  }
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new DocFetchError(url, error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) throw new DocFetchError(url, `HTTP ${response.status}`);
  return response.text();
}

async function mapWithLimit<Input, Output>(
  items: Input[],
  limit: number,
  run: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results: Output[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await run(items[index] as Input);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function listSkillFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listSkillFiles(path) : [path];
  });
}

interface Problem {
  kind: 'fact-changed' | 'broken-link' | 'unknown-api';
  detail: string;
  fix: string;
}

async function checkFacts(): Promise<Problem[]> {
  const results = await mapWithLimit(facts, MAX_CONCURRENT_REQUESTS, async (fact): Promise<Problem[]> => {
    const url = `${DOCS_BASE}/${fact.page}.md`;
    const page = await fetchText(url);
    const missing = fact.mustContain.filter(phrase => !page.includes(phrase));
    if (missing.length === 0) return [];
    return [
      {
        kind: 'fact-changed',
        detail: `"${fact.claim}": ${url} no longer contains ${JSON.stringify(missing)}`,
        fix: `Re-read the page and update references/${fact.reference}`,
      },
    ];
  });
  return results.flat();
}

async function checkLinks(markdownFiles: string[]): Promise<Problem[]> {
  const pattern = /https:\/\/developers\.weixin\.qq\.com\/minigame\/dev\/[^\s)#"`]+\.md/g;
  const linkSources = new Map<string, string>();
  for (const path of markdownFiles) {
    for (const [url] of readFileSync(path, 'utf8').matchAll(pattern)) {
      if (!linkSources.has(url)) linkSources.set(url, relative(repoRoot, path));
    }
  }
  const results = await mapWithLimit(
    [...linkSources],
    MAX_CONCURRENT_REQUESTS,
    async ([url, source]): Promise<Problem[]> => {
      try {
        await fetchText(url);
        return [];
      } catch (error) {
        if (error instanceof DocFetchError && error.detail.startsWith('HTTP')) {
          return [{ kind: 'broken-link', detail: `${url} (${error.detail})`, fix: `Fix the link in ${source}` }];
        }
        throw error;
      }
    },
  );
  log.info({ linksChecked: linkSources.size }, 'links checked');
  return results.flat();
}

async function checkApiNames(skillFiles: string[]): Promise<Problem[]> {
  const indexHtml = await fetchText(`${DOCS_BASE}/${INDEX_PAGE}`);
  const documentedApis = new Set([...indexHtml.matchAll(/\/(wx\.[A-Za-z0-9]+)\.html/g)].map(match => match[1]));
  if (documentedApis.size < 100) {
    throw new DocFetchError(`${DOCS_BASE}/${INDEX_PAGE}`, `the site index only listed ${documentedApis.size} APIs`);
  }

  const apiSources = new Map<string, string>();
  for (const path of skillFiles.filter(file => /\.(md|js)$/.test(file))) {
    for (const [name] of readFileSync(path, 'utf8').matchAll(/\bwx\.[a-z][A-Za-z0-9]+/g)) {
      if (!apiSources.has(name)) apiSources.set(name, relative(repoRoot, path));
    }
  }
  const problems: Problem[] = [];
  for (const [name, source] of apiSources) {
    if (!documentedApis.has(name) && !API_NAMES_NOT_IN_INDEX.has(name)) {
      problems.push({
        kind: 'unknown-api',
        detail: `${name} is used in ${source} but is not in the mini game API index`,
        fix: 'Check the live docs. Remove it if it does not exist, or add it to the allow list if it is a warning',
      });
    }
  }
  for (const name of API_NAMES_NOT_IN_INDEX) {
    if (name !== 'wx.env' && documentedApis.has(name)) {
      problems.push({
        kind: 'fact-changed',
        detail: `${name} is now in the mini game API index, but the skill says it is absent`,
        fix: 'Re-read the page and update references/platform-facts.md',
      });
    }
  }
  log.info({ apisChecked: apiSources.size, apisDocumented: documentedApis.size }, 'API names checked');
  return problems;
}

async function main(): Promise<void> {
  const skillFiles = listSkillFiles(skillRoot);
  const markdownFiles = skillFiles.filter(path => path.endsWith('.md'));
  const problems = [
    ...(await checkFacts()),
    ...(await checkLinks(markdownFiles)),
    ...(await checkApiNames(skillFiles)),
  ];
  log.info({ factsChecked: facts.length }, 'facts checked');
  if (problems.length > 0) {
    log.error({ problems }, 'the skill has drifted from the official docs');
    process.exit(1);
  }
  log.info('the skill matches the live docs');
}

main().catch((error: unknown) => {
  log.error({ error: error instanceof Error ? error.message : String(error) }, 'could not complete the docs check');
  process.exit(2);
});
