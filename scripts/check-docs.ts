// @file: check-docs.ts
// @desc: detect drift against live WeChat docs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import pino from 'pino';
import { DocFetchError, fetchDocument, communityContent, guideIndex, changedPaths, sectionText } from './doc-source';
import sidebar from './docs-sidebar.json';
import { checkSnippets, collectSnippets } from './check-snippets';

const log = pino({ base: null, timestamp: false });
const repoRoot = resolve(import.meta.dir, '..');
const skillRoot = join(repoRoot, 'skills/weixin-game');
const DOCS_BASE = 'https://developers.weixin.qq.com/minigame/dev';
const INDEX_PAGE = 'api/render/canvas/wx.createCanvas.html';
const MAX_CONCURRENT_REQUESTS = 8;

// Names the skill mentions only to warn that they are absent, plus documented non-function members.
const API_NAMES_NOT_IN_INDEX = new Set(['wx.getUserProfile', 'wx.createOffscreenCanvas', 'wx.env']);

interface Fact {
  claim: string;
  page: string;
  mustContain: string[];
  reference: string;
  mustNotMatch?: string;
  section?: string;
  reviewed?: string;
  scope?: string;
  status?: 'confirmed' | 'conflicting';
}

export const facts: Fact[] = [
  {
    claim: 'Official DevTools skills require Nightly and valid AppID',
    page: 'https://developers.weixin.qq.com/miniprogram/dev/devtools/Skills.md',
    mustContain: ['2.02.2607032', 'wechatide', 'touristappid', 'MCP Token'],
    reference: 'tooling-and-backend.md',
    scope: 'Mini program tooling; game support must be tested',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Signed currency and deprecated platform field',
    page: 'https://developers.weixin.qq.com/community/ngi/doc/detail/000c64ee1b4ea0cead742304663408',
    mustContain: ['coins', 'platform字段废弃', '不支持签名', 'iOS资金概况', '不支持Mac支付'],
    reference: 'monetization.md',
    scope: 'Mini game currency and iOS payment',
    status: 'conflicting',
    reviewed: '2026-11-06',
  },
  {
    claim: 'GameItem reference still only enumerates goods and android',
    page: 'api/midas-payment/wx.requestMidasPaymentGameItem',
    mustContain: ['"合法值": "goods"', '"合法值": "android"', 'requestMidasPaymentGameItem'],
    mustNotMatch: '"合法值":\\s*"(coins|ios)"',
    reference: 'monetization.md',
    scope: 'API table conflicts with newer iOS guide',
    status: 'conflicting',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Payment event handlers distinguish mock delivery and refunds',
    page: 'guide/open-ability/virtual-payment/event',
    mustContain: ['IsMock', 'minigame_coin_deliver_completed', 'minigame_pay_refund_succ_notify', 'pay_event_sig'],
    reference: 'monetization.md',
    scope: 'Server payment event handling',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'High Performance Plus has an iOS 14 client exception',
    page: 'guide/performance/perf-high-performance-plus',
    mustContain: ['iOSHighPerformance+', '8.0.45', '>= 14', '8.0.49'],
    reference: 'performance.md',
    scope: 'iOS High Performance Plus',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Metal requires High Performance Plus',
    page: 'guide/performance/perf-ios-metal',
    mustContain: ['高性能+', '8.0.63', '3.10.0'],
    reference: 'performance.md',
    scope: 'WASM engine rendering on iOS',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Worker V2 is Android rollout without simulator support',
    page: 'guide/base-ability/new-worker',
    mustContain: ['8.0.74', '3.17.0', 'iOS：** 能力支持中', '开发者工具暂不支持', 'isSupportStandardWorker'],
    reference: 'performance.md',
    scope: 'Worker V2 only',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'UGC must pass content review before public display',
    page: 'guide/security/security',
    mustContain: ['UGC不可信原则', '内容安全审查', '文本', '音视频'],
    reference: 'privacy-and-release.md',
    scope: 'Games accepting user content',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Release requires review and filing',
    page: 'https://developers.weixin.qq.com/minigame/introduction/guide/index.md',
    mustContain: ['13 - 37', '9 - 22', '企业主体必须进行', '版本审核', '备案流程'],
    reference: 'privacy-and-release.md',
    scope: 'Release planning estimates not guarantees',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Privacy listener JavaScript requirement remains 2.32.3',
    page: 'api/open-api/privacy/wx.onNeedPrivacyAuthorization',
    mustContain: ['2.32.3'],
    reference: 'privacy-and-release.md',
    scope: 'JavaScript API not engine SDK binding',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Realtime guide distinguishes mini game availability from mini programs',
    page: 'guide/runtime/debug/realtimelog/index',
    mustContain: ['2.14.4', '小游戏端'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Mini game guide differs from API header',
    status: 'conflicting',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Realtime logger reports player errors',
    page: 'api/base/debug/wx.getRealtimeLogManager',
    mustContain: ['2.7.1', 'logger.error'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Native starter with capability guard',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'General engine conversion uses WASM and WebGL',
    page: 'guide/game-engine/common-adaptation',
    mustContain: ['WebAssembly', 'WebGL'],
    reference: 'engines.md',
    scope: 'Engine exports',
    status: 'confirmed',
    reviewed: '2026-11-06',
  },
  {
    claim: 'Stopping InnerAudio resets the next playback to the beginning',
    page: 'api/media/audio/InnerAudioContext.stop',
    mustContain: ['停止后的音频再播放会从头开始播放'],
    reference: 'input-audio-lifecycle.md',
  },
  {
    claim: 'iOS high performance mode does not support the InnerAudio WebAudio backend',
    page: 'guide/base-ability/audio',
    mustContain: ['ios高性能模式不支持useWebAudioImplement'],
    reference: 'input-audio-lifecycle.md',
  },
  {
    claim: 'Closing WebAudio releases its resources',
    page: 'api/media/audio/WebAudioContext.close',
    mustContain: ['close后会立即释放当前上下文的资源'],
    reference: 'input-audio-lifecycle.md',
  },
  {
    claim: 'Window resize listeners can be removed by callback identity',
    page: 'api/ui/window/wx.offWindowResize',
    mustContain: ['onWindowResize 传入的监听函数'],
    reference: 'rendering-and-layout.md',
  },
  {
    claim: 'Customer service requires a preceding touch and supports conversation cards',
    page: 'api/open-api/customer-message/wx.openCustomerServiceConversation',
    mustContain: ['至少一次 touch', 'showMessageCard', 'sessionFrom'],
    reference: 'monetization.md',
  },
  {
    claim: 'Game club buttons support style and icon positioning',
    page: 'api/open-api/game-club/wx.createGameClubButton',
    mustContain: ['"style"', '"left"', '"top"', '"green"'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'Template subscriptions require clicks and report per-template acceptance',
    page: 'api/open-api/subscribe-message/wx.requestSubscribeMessage',
    mustContain: ['仅在点击行为时调用', 'tmplIds', 'accept', '不可同时使用'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'System subscriptions require clicks and predefined rank message type',
    page: 'api/open-api/subscribe-message/wx.requestSubscribeSystemMessage',
    mustContain: ['仅在[点击行为]', 'msgTypeList', 'SYS_MSG_TYPE_RANK'],
    reference: 'social-and-open-data.md',
  },
  {
    claim: 'Worker message API documents a message envelope',
    page: 'api/worker/Worker.onMessage',
    mustContain: ['message  | Object'],
    reference: 'performance.md',
  },
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
    mustContain: ['| webgl2 | webgl2 绘图上下文 | [2.24.0]'],
    section: '## 参数',
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
    section: '## 参数',
    mustNotMatch: '"属性":\\s*"(success|fail|complete|toGroup)"',
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
    claim: 'Original Workers: game.json config, one at a time, no wx APIs',
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
    mustContain: ['白名单', '1. png', '1. wasm'],
    section: '## 文件类型',
    mustNotMatch: '^\\s*\\d+\\.\\s*webp\\s*$',
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

const fetchText = fetchDocument;

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
  kind: 'fact-changed' | 'broken-link' | 'unknown-api' | 'snippet-error' | 'sidebar-changed';
  detail: string;
  fix: string;
}

async function checkFacts(): Promise<Problem[]> {
  const results = await mapWithLimit(facts, MAX_CONCURRENT_REQUESTS, async (fact): Promise<Problem[]> => {
    const url = fact.page.startsWith('https://') ? fact.page : `${DOCS_BASE}/${fact.page}.md`;
    const body = await fetchText(url);
    const content = url.includes('/community/ngi/doc/detail/') ? communityContent(url, body) : body;
    const page = fact.section ? sectionText(content, fact.section) : content;
    const missing = fact.mustContain.filter(phrase => !page.includes(phrase));
    const forbidden = fact.mustNotMatch && new RegExp(fact.mustNotMatch.replace('(?im)', ''), 'im').test(page);
    if (missing.length === 0 && !forbidden) return [];
    return [
      {
        kind: 'fact-changed',
        detail: `"${fact.claim}": ${url} missing ${JSON.stringify(missing)}; forbidden content: ${Boolean(forbidden)}`,
        fix: `Re-read the page and update references/${fact.reference}`,
      },
    ];
  });
  return results.flat();
}

async function checkLinks(markdownFiles: string[]): Promise<Problem[]> {
  const pattern = /https:\/\/developers\.weixin\.qq\.com\/(?:minigame|miniprogram)\/[^\s)#"`]+\.md/g;
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
        if (error instanceof DocFetchError && [404, 410].includes(error.status ?? 0)) {
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
  const changes = changedPaths(sidebar.paths, guideIndex(indexHtml));
  const problems: Problem[] =
    changes.added.length || changes.removed.length
      ? [
          {
            kind: 'sidebar-changed',
            detail: JSON.stringify(changes),
            fix: 'Review capability-map.md and the new or removed guides before updating scripts/docs-sidebar.json',
          },
        ]
      : [];
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
    ...checkSnippets(collectSnippets()).map(problem => ({
      kind: 'snippet-error' as const,
      detail: `${problem.snippet}:${problem.line} TS${problem.code}: ${problem.error}`,
      fix: 'Check the instance method or argument against the typings and live docs',
    })),
    ...(await checkFacts()),
    ...(await checkLinks(markdownFiles)),
    ...(await checkApiNames(skillFiles)),
  ];
  log.info({ factsChecked: facts.length }, 'facts checked');
  if (problems.length > 0) {
    log.error({ problems }, 'the skill has drifted from the official docs');
    process.exit(1);
  }
  log.info('selected documentation assertions passed; this is not full platform verification');
}

if (import.meta.main)
  main().catch((error: unknown) => {
    log.error({ error: error instanceof Error ? error.message : String(error) }, 'could not complete the docs check');
    process.exit(2);
  });
