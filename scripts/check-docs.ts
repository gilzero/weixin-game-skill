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
const API_NAMES_NOT_IN_INDEX = new Set([
  'wx.getUserProfile',
  'wx.createOffscreenCanvas',
  'wx.createCacheManager',
  'wx.env',
]);

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
  {
    claim: 'WebGPU is Android-only with wx.getGPU and context.configure ordering',
    page: 'guide/performance/WebGPU',
    mustContain: ['8.0.79', '3.17.3', 'wx.getGPU()', 'context.configure', 'WGSL'],
    reference: 'performance.md',
    scope: 'Android WebGPU rollout',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'Device benchmark info replaces unmaintained getDeviceInfo.benchmarkLevel from 3.4.5',
    page: 'api/base/system/wx.getDeviceBenchmarkInfo',
    mustContain: ['3.4.5', 'benchmarkLevel', 'modelLevel', '-1（性能未知）'],
    reference: 'performance.md',
    scope: 'Device performance tiering',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'getDeviceInfo.benchmarkLevel is Android-only and unmaintained since 3.4.5',
    page: 'api/base/system/wx.getDeviceInfo',
    mustContain: ['仅 Android 支持', '3.4.5开始，本返回值停止维护', 'wx.getDeviceBenchmarkInfo'],
    reference: 'platform-facts.md',
    scope: 'Deprecated benchmark property',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'WASM code splitting V2 matches WXGameKit and cannot mix with UnityPlugin',
    page: 'guide/game-engine/WasmSplitV2_1',
    mustContain: ['WXGameKit', 'UnityPlugin', 'wasmsplit-v2-ci', '不可混用'],
    reference: 'engines.md',
    scope: 'Engine WASM code splitting',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'Parallel subpackage preloading is configured in game.json for released builds',
    page: 'guide/performance/perf-action-start-parallel-download',
    mustContain: ['parallelPreloadSubpackages', '正式版', 'wx.loadSubpackage'],
    reference: 'assets-and-network.md',
    scope: 'Cold-start subpackage download',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'Rule-based subpackage pre-download uses preloadPackages from WeChat 8.0.70',
    page: 'guide/performance/predownload-of-minigame-packages',
    mustContain: ['8.0.70', 'preloadPackages', 'staticRules', 'dynamicRules'],
    reference: 'assets-and-network.md',
    scope: 'Conditional subpackage pre-download',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'game.json supports displayMode and disabling client cloud storage writes',
    page: 'reference/configuration/app',
    mustContain: ['displayMode', 'disableSetUserStorageFromMiniProgram', 'parallelPreloadSubpackages'],
    reference: 'social-and-open-data.md',
    scope: 'Game configuration fields',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'Interactive friend data uses modifyFriendInteractiveStorage and JSServer verification',
    page: 'guide/open-ability/interactive-data',
    mustContain: ['wx.modifyFriendInteractiveStorage', 'wx.getUserInteractiveStorage', 'checkInteractiveData.js'],
    reference: 'social-and-open-data.md',
    scope: 'Friend interaction incentives',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'iOS thermal power-saving mode uses MiniGameCommon plugin and applies on next launch',
    page: 'guide/performance/power-saving-mode',
    mustContain: ['iPhone XR', 'getPowerModeManager', '下次启动时生效', 'wx.restartMiniProgram'],
    reference: 'performance.md',
    scope: 'iOS thermal power management',
    status: 'confirmed',
    reviewed: '2026-11-08',
  },
  {
    claim: 'Banner ads are unmaintained from 3.5.5 in favor of wx.createCustomAd',
    page: 'api/ad/wx.createBannerAd',
    mustContain: ['3.5.5', '停止维护', 'wx.createCustomAd'],
    reference: 'monetization.md',
    scope: 'Banner ad deprecation',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'CustomAd supports HarmonyOS from WeChat 3.16.3 and requires adIntervals >= 30',
    page: 'api/ad/wx.createCustomAd',
    mustContain: ['2.11.1', '3.16.3', '大于等于30', '全新的实例'],
    reference: 'monetization.md',
    scope: 'CustomAd API header conflicts with ohos overview table',
    status: 'conflicting',
    reviewed: '2026-11-09',
  },
  {
    claim: 'HarmonyOS overview starts at 3.7.0 and still lists ads and memory as unsupported',
    page: 'guide/open-ability/ohos',
    mustContain: [
      '3.7.0',
      'v8',
      'HarmonyOS',
      '| 广告                             | 不支持',
      '| 设备-内存                        | 不支持',
    ],
    reference: 'privacy-and-release.md',
    scope: 'HarmonyOS platform matrix',
    status: 'conflicting',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Rewarded ad server-side verification requires 3.10.3 and 1s callback response',
    page: 'guide/security/antiadcheat',
    mustContain: ['3.10.3', 'setServerSideVerificationData', 'transaction_id', '超时为1s', 'is_valid'],
    reference: 'monetization.md',
    scope: 'Rewarded ad server-side verification',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'WXWebAssembly uses package paths (.wasm/.wasm.br) outside workers directory',
    page: 'guide/performance/perf-webassembly',
    mustContain: ['v2.13.0', 'v2.15.0', '.wasm.br', 'worker 目录只会打包 .js 文件', 'iOS 平台暂不支持 Global'],
    reference: 'performance.md',
    scope: 'WXWebAssembly runtime rules',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'PC adaptation forbids black bars in pad, non-maximized desktop and maximized landscape desktop',
    page: 'guide/open-ability/pc-adapter',
    mustContain: ['2.26.1', '768x1024', '横屏游戏不可以出现黑边或者蒙层填充'],
    reference: 'rendering-and-layout.md',
    scope: 'PC displayMode layout rules',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'PC GPUs lack hardware ASTC decode and suffer CPU software-decode jank',
    page: 'guide/open-ability/pc-performance',
    mustContain: ['硬件层面不支持 ASTC 压缩纹理格式', 'ASTC 软解', '高频同步读写文件'],
    reference: 'performance.md',
    scope: 'PC performance optimization',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'PC keyboard events start at 3.6.0 and require foreground user interaction',
    page: 'api/device/keyboard/wx.onKeyDown',
    mustContain: ['3.6.0', '仅适用于 PC 平台', '曾有过用户操作'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Desktop keyboard listeners',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Weak network listener starts at 2.21.0 and reports weakNet',
    page: 'api/device/network/wx.onNetworkWeakChange',
    mustContain: ['2.21.0', 'weakNet', 'networkType'],
    reference: 'assets-and-network.md',
    scope: 'Weak network detection',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'HTTPDNS starts at 2.19.2 and checks hasSystemProxy to avoid proxy connection failures',
    page: 'guide/base-ability/HTTPDNS',
    mustContain: ['2.19.2', 'enableHttpDNS', 'hasSystemProxy', '602103'],
    reference: 'assets-and-network.md',
    scope: 'Mobile HTTPDNS configuration',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Cold-start data pre-fetch caches up to 256KB string payloads',
    page: 'guide/base-ability/pre-fetch',
    mustContain: ['256KB', '灰度比例不可回退', 'wx.getBackgroundFetchData'],
    reference: 'assets-and-network.md',
    scope: 'Cold-start data pre-fetch',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Local storage 1GB expansion evicts caches at whole-game granularity under low disk space',
    page: 'guide/performance/diskspace',
    mustContain: ['1G', '以游戏粒度进行清理', '空间提升'],
    reference: 'assets-and-network.md',
    scope: '1GB disk space expansion',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Startup scene reporting is capped at 60s and uses sceneId 7 for first interactive frame',
    page: 'guide/performance/perf-action-start-reportScene',
    mustContain: ['总运行耗时 <= 60s', '游戏可交互', '2.26.2'],
    reference: 'performance.md',
    scope: 'Startup funnel scene reporting',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Runtime scene performance manager requires 3.11.0 and limits setData to 5 calls per 30s',
    page: 'guide/performance/perf-action-runtime-reportPerformanceScene',
    mustContain: ['3.11.0', '30 秒内最多 5 次', '1024 字符', '完全覆盖'],
    reference: 'performance.md',
    scope: 'Runtime per-scene performance telemetry',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Private share verification uses isPrivateMessage, wx.authPrivateMessage and server decryption',
    page: 'guide/open-ability/share/private-message',
    mustContain: ['isPrivateMessage', 'wx.authPrivateMessage', 'encryptedData', '7天内分享有效', '120天内验证有效'],
    reference: 'social-and-open-data.md',
    scope: 'Private share card verification',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Async wx APIs without callbacks return Promises from 2.10.2 and reject unhandled',
    page: 'https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/api.md',
    mustContain: ['2.10.2', '不包含 success/fail/complete 时将默认返回 promise', 'Uncaught (in promise)'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Promise-style async wx calls',
    status: 'confirmed',
    reviewed: '2026-11-09',
  },
  {
    claim: 'Tap-gated APIs only work inside touchend, showModal or showActionSheet callbacks',
    page: 'guide/base-ability/touch-limit',
    mustContain: [
      'wx.onTouchEnd',
      'wx.showModal',
      'wx.showActionSheet',
      'can only be invoked by user TAP gesture',
      'wx.requestSubscribeMessage',
      'wx.navigateToMiniProgram',
    ],
    reference: 'input-audio-lifecycle.md',
    scope: 'Click-restricted API list',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Login, session and setting APIs are limited to twice the daily PV',
    page: 'guide/performance/api-frequency',
    mustContain: ['wx.login', 'wx.checkSession', 'wx.getSetting', '一天的调用总次数不多于该小程序pv的两倍'],
    reference: 'platform-facts.md',
    scope: 'Rate-limited client APIs',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Scene values come from launch and show options and Android keeps the previous scene after Home',
    page: 'guide/base-ability/scene',
    mustContain: ['wx.getLaunchOptionsSync', 'wx.onShow', '会保留上一次的场景值'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Launch scene retrieval',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Scene list still maps the entry points the skill names',
    page: 'reference/scene-list',
    mustContain: [
      '| 1023 ',
      '安卓系统桌面图标',
      '| 1155 ',
      '“单页模式”打开小程序',
      '| 1079 ',
      '微信游戏中心',
      '| 1044 ',
      '| 1104 ',
      '| 1194 ',
      '| 1065 ',
    ],
    reference: 'input-audio-lifecycle.md',
    scope: 'Selected scene values',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Add to desktop is automatic, release only, unobservable and launches with scene 1023',
    page: 'guide/open-ability/add-desktop',
    mustContain: ['添加到桌面仅支持正式版', '桌面打开场景值均为1023', '不支持监听'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Desktop entry',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Most recent foreground entry options start at 2.9.4',
    page: 'api/base/app/life-cycle/wx.getEnterOptionsSync',
    mustContain: ['2.9.4', '最近一次前台进入'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Enter options',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Timeline sharing is Android beta, menu only, and previews in scene 1155',
    page: 'guide/open-ability/share-timeline_game',
    mustContain: ['暂仅在Android平台支持', '1155', '不支持在小游戏内直接发起分享'],
    reference: 'social-and-open-data.md',
    scope: 'Timeline sharing',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Image share menu needs a local path and deprecated style in 3.8.2',
    page: 'api/share/wx.showShareImageMenu',
    mustContain: ['2.14.3', '必须为本地路径或临时路径', 'style 参数废弃', 'needShowEntrance', '不支持带有二维码'],
    reference: 'social-and-open-data.md',
    scope: 'Poster sharing API',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Poster guide still recommends the deprecated style parameter',
    page: 'guide/open-ability/share/share-image',
    mustContain: ['wx.showShareImageMenu', 'wx.onUserCaptureScreen', '选择 v2'],
    reference: 'social-and-open-data.md',
    scope: 'Guide conflicts with API deprecation',
    status: 'conflicting',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Screenshot listener is single and can return a query from 3.3.0',
    page: 'api/device/screen/wx.onUserCaptureScreen',
    mustContain: ['只能注册一个监听', '3.3.0', 'query'],
    reference: 'social-and-open-data.md',
    scope: 'Screenshot sharing',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Interactive friends list needs 3.16.0, its own scope and returns at most 20 OpenIDs',
    page: 'guide/open-ability/game_Interaction_Information',
    mustContain: [
      'wx.getRelationFriendList',
      '3.16.0',
      'scope.interactedUserInfo',
      '20 个互动游戏好友的OpenID',
      'auth deny',
    ],
    reference: 'social-and-open-data.md',
    scope: 'Main-context friend list',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Online status service needs game server login and a 256-byte state',
    page: 'guide/open-ability/user-status',
    mustContain: ['wx.getGameServerManager', 'startStateService', '256 字节'],
    reference: 'social-and-open-data.md',
    scope: 'Friend status and invites',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'System subscriptions accept three types per call and report accept, reject or ban',
    page: 'api/open-api/subscribe-message/wx.requestSubscribeSystemMessage',
    mustContain: ['SYS_MSG_TYPE_INTERACTIVE', 'SYS_MSG_TYPE_WHATS_NEW', '一次调用最多可订阅3种类型', "'ban'"],
    reference: 'social-and-open-data.md',
    scope: 'System subscription types',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Relationship reminders stay valid, skip quiet writes and fire on the first overtake of the day',
    page: 'guide/open-ability/subscribe-system-message',
    mustContain: ['quiet', '当天第一次被超越', '订阅一次，发多条'],
    reference: 'social-and-open-data.md',
    scope: 'Interaction and rank reminders',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Update reminders need 2.32.1, three phrases at most and one message per day',
    page: 'guide/open-ability/subscribe-update-notification-message',
    mustContain: [
      'SYS_MSG_TYPE_WHATS_NEW',
      '2.32.1',
      '每次最多选择3个',
      '每天累计最多只能收到1条',
      'wx.getGameClubData',
    ],
    reference: 'social-and-open-data.md',
    scope: 'Game update reminders',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Stored subscription choices need withSubscriptions and only list permanent ones',
    page: 'api/open-api/setting/wx.getSetting',
    mustContain: ['withSubscriptions', 'subscriptionsSetting', '总是保持以上选择'],
    reference: 'social-and-open-data.md',
    scope: 'Subscription state lookup',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Page manager starts at 3.6.7 and reports frequency and version mismatch codes',
    page: 'api/open-api/openlink/wx.createPageManager',
    mustContain: ['3.6.7', 'openlink异常', '频繁错误', '小游戏版本错误'],
    reference: 'social-and-open-data.md',
    scope: 'Open page manager',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Recommend component reports isRecommended from 3.8.6 and discourages item rewards',
    page: 'guide/open-ability/game-evaluate',
    mustContain: ['wx.createPageManager', 'isRecommended', '3.8.6', '官方不提倡使用道具奖励刺激用户推荐'],
    reference: 'social-and-open-data.md',
    scope: 'Recommendation component',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Video guide warns against full screen and DevTools lacks the decoder',
    page: 'guide/base-ability/video',
    mustContain: [
      'underGameView',
      '不推荐使用`requestFullScreen`',
      '开发者工具不支持`VideoDecoder`',
      'videoDataType: 2',
    ],
    reference: 'rendering-and-layout.md',
    scope: 'Video playback',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Video can render under a transparent canvas from 2.11.0',
    page: 'api/media/video/wx.createVideo',
    mustContain: ['underGameView', '2.11.0', 'alpha: true'],
    reference: 'rendering-and-layout.md',
    scope: 'Video layering',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Only official plugins exist and they load through requirePlugin',
    page: 'guide/base-ability/plugins',
    mustContain: ['只有官方提供的插件可使用', 'requirePlugin', 'isolatedContext', '"provider"'],
    reference: 'assets-and-network.md',
    scope: 'Plugin usage',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Cover-image plugin identity and package-size exemption',
    page: 'guide/performance/perf-action-start-loading-plugin',
    mustContain: ['wxbd990766293b9dc4', 'MinigameLoading', '不占游戏代码包体积'],
    reference: 'assets-and-network.md',
    scope: 'Startup cover plugin',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Periodic update runs every 12 hours for players active within 7 days',
    page: 'guide/base-ability/background-fetch',
    mustContain: ['2.8.0', '七天内使用过', '每隔 12 小时', '256KB', "fetchType: 'periodic'", '灰度比例不可回退'],
    reference: 'assets-and-network.md',
    scope: 'Periodic data update',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Network tuning requires SocketTask, synchronous onOpen and lowercase HTTP/2 headers',
    page: 'guide/performance/perf-network',
    mustContain: [
      'SocketTask.onOpen',
      '请立即同步监听',
      'enableHttp2',
      'header 是需要为全小写',
      '重定向后的 url 不在域名列表里',
      '出现三次 rtt 超过 400',
      'network is down',
    ],
    reference: 'assets-and-network.md',
    scope: 'Network tuning guide',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Sockets allow five connections with optional compression',
    page: 'api/network/websocket/wx.connectSocket',
    mustContain: ['最多可以同时存在 5 个 WebSocket 连接', 'perMessageDeflate', '2.8.0'],
    reference: 'assets-and-network.md',
    scope: 'WebSocket options',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Currency guide covers late arrival, duplicate orders, refunds and gifting',
    page: 'guide/open-ability/virtual-payment/coins',
    mustContain: ['pay_v2.cancelPay', 'pay_v2.present', '90012', '延迟到账', '小程序的正式版只能使用支付的正式环境'],
    reference: 'monetization.md',
    scope: 'Game currency server flow',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Ad data API pages hold at most 90 rows',
    page: 'guide/open-ability/ad/ad-data-interface',
    mustContain: ['每页最大获取量为90'],
    reference: 'monetization.md',
    scope: 'Ad reporting API',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'EmscriptenGLX needs 3.8.12 and runs on Android and iOS High Performance Plus',
    page: 'guide/performance/perf-emscriptenglx',
    mustContain: ['3.8.12', 'iOS高性能+模式', 'Android平台', '降低 10% ～ 20%'],
    reference: 'performance.md',
    scope: 'WASM GL glue mode',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Android development builds expose GC, heap snapshot and CPU profile tools',
    page: 'guide/performance/perf-action-device-monitor',
    mustContain: ['7.0.7', 'Request Force GC', 'Take Heap Snapshot', 'Start CPU Profile'],
    reference: 'performance.md',
    scope: 'Phone profiling tools',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Upgraded remote debugging version requirements',
    page: 'devtools/remote-debug-v2',
    mustContain: ['8.0.55', '3.7.4', '1.06.2412302', '8.0.61', '3.8.10', '16.4', '1.06.2506242'],
    reference: 'performance.md',
    scope: 'Remote debugging beta',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Cloud testing is free and supports record and replay',
    page: 'guide/performance/perf-tools-cloudtest',
    mustContain: ['云测试免费为所有小游戏开放', '录制回放', 'MiniGameTest'],
    reference: 'performance.md',
    scope: 'Cloud testing service',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Evaluation standard is per category and device tier',
    page: 'guide/performance/perf-mesure',
    mustContain: ['品类评测标准', '机型分档', '现网真实玩家上报的性能数据'],
    reference: 'performance.md',
    scope: 'Performance targets',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Startup best practice keeps first-screen assets in the main package',
    page: 'guide/performance/perf-action-start2',
    mustContain: ['尽量将资源置于首包内'],
    reference: 'performance.md',
    scope: 'Startup optimisation',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'checkSession validates only the latest code and pre-fetch can replace the key',
    page: 'api/open-api/login/wx.checkSession',
    mustContain: ['最后一次获取 code 操作对应的登录态 session_key', '数据预拉取'],
    reference: 'privacy-and-release.md',
    scope: 'Session validity',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'UnionID arrives through code2Session without authorization',
    page: 'guide/open-ability/union-id',
    mustContain: ['code2Session', '无须用户授权'],
    reference: 'privacy-and-release.md',
    scope: 'Cross-app identity',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Staged release whitelist holds 100 and cannot be withdrawn',
    page: 'guide/base-ability/code-beta',
    mustContain: ['上限100人', '灰度版无法取消发布'],
    reference: 'privacy-and-release.md',
    scope: 'Staged release',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Source maps sit beside sources and stay out of released packages',
    page: 'guide/runtime/debug/SourceMap',
    mustContain: ['不计入代码包大小计算', '也不会被包含在体验版/正式版代码包中', 'game.js.map'],
    reference: 'privacy-and-release.md',
    scope: 'Source map handling',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Engine builds must emit source maps for error analysis',
    page: 'guide/performance/monitor',
    mustContain: ['JS分析', '输出 source map'],
    reference: 'privacy-and-release.md',
    scope: 'Production error analysis',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'miniprogram-ci supports game projects with an upload key and IP whitelist',
    page: 'devtools/ci',
    mustContain: [
      'miniGame',
      'IP 白名单',
      '1 ~ 30',
      '上传小游戏jsserver代码',
      '将无法使用 miniprogram-ci 进行预览和上传',
    ],
    reference: 'tooling-and-backend.md',
    scope: 'CI upload tooling',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'DevTools CLI needs the service port and offers auto-preview and cache commands',
    page: 'devtools/cli',
    mustContain: ['开启服务端口', 'cli auto-preview', '--info-output', 'cli cache', 'cli reset-fileutils'],
    reference: 'tooling-and-backend.md',
    scope: 'DevTools CLI commands',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Message push recommends the encrypted mode',
    page: 'guide/base-ability/message-push',
    mustContain: ['安全模式', '消息推送配置', 'EncodingAESKey'],
    reference: 'tooling-and-backend.md',
    scope: 'Server event endpoint',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Gift delivery shares the single message push endpoint',
    page: 'guide/open-ability/game-gift',
    mustContain: ['MP 配置消息回调地址只有 1 个', 'minigame_deliver_goods'],
    reference: 'tooling-and-backend.md',
    scope: 'Gift pack delivery',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Capability map version gates for operations components',
    page: 'guide/open-ability/RewardSend',
    mustContain: ['3.16.1'],
    reference: 'capability-map.md',
    scope: 'Social incentive tournament route',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'CPS recommend component starts at 3.8.6',
    page: 'guide/open-ability/cps-recommend',
    mustContain: ['3.8.6', '服务商账号'],
    reference: 'capability-map.md',
    scope: 'CPS component',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Game-circle recommend starts at 3.7.6',
    page: 'guide/open-ability/game-recommend',
    mustContain: ['3.7.6'],
    reference: 'capability-map.md',
    scope: 'Game circle recommend',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Phone number component is paid and closed to individual accounts',
    page: 'guide/open-ability/getPhoneNumber',
    mustContain: ['非个人开发者', '0.03元'],
    reference: 'capability-map.md',
    scope: 'Phone number verification',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Risk control returns levels up to 4',
    page: 'guide/open-ability/security',
    mustContain: ['风险等级 4', '风险等级 0'],
    reference: 'capability-map.md',
    scope: 'Risk rank API',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Custom activity conditions are queried from the game server',
    page: 'guide/open-ability/custom-task',
    mustContain: ['minigame_act_event_query_condition', 'IsConditionSatisfied'],
    reference: 'capability-map.md',
    scope: 'Activity condition callback',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'URL Links last at most 30 days',
    page: 'guide/open-ability/url-link',
    mustContain: ['有效期最长 30 天', '1194'],
    reference: 'capability-map.md',
    scope: 'External entry links',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Analytics data should be collected about every 6 hours',
    page: 'guide/open-ability/data-analysis',
    mustContain: ['间隔6小时采集1次'],
    reference: 'capability-map.md',
    scope: 'Analytics API',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'IAA prediction reports 30 seconds after an ad and only works live',
    page: 'guide/open-ability/ad/iaa',
    mustContain: ['延迟30s', '体验版和测试版无法跑模型'],
    reference: 'capability-map.md',
    scope: 'IAA prediction plugin',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Channels profile needs a same or associated entity',
    page: 'guide/open-ability/channels-profile',
    mustContain: ['2.21.2', '关联主体', 'wx.openChannelsUserProfile'],
    reference: 'capability-map.md',
    scope: 'Channels openers',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'errno takes precedence over errCode',
    page: 'guide/runtime/debug/PublicErrno',
    mustContain: ['一般以 `errno` 错误码为准'],
    reference: 'capability-map.md',
    scope: 'Unified error codes',
    status: 'confirmed',
    reviewed: '2026-11-10',
  },
  {
    claim: 'Official components schema uses isVisible while its sample reads isShow',
    page: 'api/ui/menu/wx.getOfficialComponentsInfo',
    mustContain: [
      '3.7.12',
      'isVisible',
      'notificationComponentInfo.isShow',
      'canReceiveGiftCount',
      'canReceiveFriendGiftCount',
    ],
    reference: 'rendering-and-layout.md',
    scope: 'Official floating components',
    status: 'conflicting',
    reviewed: '2026-11-13',
  },
  {
    claim: 'setDeviceOrientation is callback-only from 2.26.0 and fails in PC fullscreen',
    page: 'api/device/orientation/wx.setDeviceOrientation',
    mustContain: ['2.26.0', '不支持', 'PC小程序处于全屏时，无法切换横竖屏'],
    reference: 'rendering-and-layout.md',
    scope: 'Dynamic orientation change',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'onWindowStateChange tracks PC window state from 3.8.8',
    page: 'api/ui/window/wx.onWindowStateChange',
    mustContain: ['3.8.8', 'minimize', 'normalize', 'maximize'],
    reference: 'rendering-and-layout.md',
    scope: 'PC window state events',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'setWindowSize is unmaintained since 2.11.0',
    page: 'api/ui/window/wx.setWindowSize',
    mustContain: ['2.11.0', '停止维护'],
    reference: 'rendering-and-layout.md',
    scope: 'Retired PC window sizing API',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'setCursor supports custom 32x32 desktop pointer from 2.10.1',
    page: 'api/render/cursor/wx.setCursor',
    mustContain: ['2.10.1', '32x32', 'default'],
    reference: 'rendering-and-layout.md',
    scope: 'Desktop cursor customization',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'requestPointerLock requires user interaction on desktop from 3.2.0',
    page: 'api/render/cursor/wx.requestPointerLock',
    mustContain: ['3.2.0', 'Windows、Mac', '必须在用户进行操作后才可调用'],
    reference: 'input-audio-lifecycle.md',
    scope: 'Desktop pointer lock',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'checkIsAddedToMyMiniProgram is callback-only from 2.29.1',
    page: 'api/open-api/my-miniprogram/wx.checkIsAddedToMyMiniProgram',
    mustContain: ['2.29.1', '不支持', 'added'],
    reference: 'input-audio-lifecycle.md',
    scope: 'My mini programs state check',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'createBufferURL exposes memory buffer URLs from 2.14.0',
    page: 'api/storage/wx.createBufferURL',
    mustContain: ['2.14.0', 'ArrayBuffer', '创建一个唯一的 URL 存在内存中'],
    reference: 'assets-and-network.md',
    scope: 'In-memory buffer URL',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'wx.encode supports utf-8 only in iOS High Performance modes',
    page: 'api/util/wx.encode',
    mustContain: ['iOS高性能模式和iOS高性能+模式下，仅支持utf-8格式'],
    reference: 'assets-and-network.md',
    scope: 'Text encoding in iOS High Performance',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Offline mode debug toggle starts at 3.16.0 and is callback-only',
    page: 'api/offline-mode/wx.enableOfflineModeDebug',
    mustContain: ['3.16.0', '不支持', '仅在开发版和体验版中可用'],
    reference: 'assets-and-network.md',
    scope: 'Offline mode debugging',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Encrypted HTTPS channel rotates last three user keys from 2.17.3',
    page: 'guide/open-ability/user-encryptkey',
    mustContain: ['2.17.3', 'getLatestUserKey', 'getUserEncryptKey', '最近三次'],
    reference: 'assets-and-network.md',
    scope: 'HTTPS encrypted network channel',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Score storage uses RankManager with subScoreKey partitioning',
    page: 'guide/open-ability/storage-server/storage-score',
    mustContain: ['RankManager', 'scoreKey', 'subScoreKey', 'periodType'],
    reference: 'social-and-open-data.md',
    scope: 'Score and progress storage',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'RankManager.getScore is callback-only from 3.14.2 and returns res.scores',
    page: 'api/open-api/game-component/RankManager.getScore',
    mustContain: ['3.14.2', '不支持', 'res.scores', '3.12.1'],
    reference: 'social-and-open-data.md',
    scope: 'RankManager score queries',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Tournaments require wx.login, four gift packs and createChallenge',
    page: 'guide/open-ability/tournament',
    mustContain: ['3.14.2', 'wx.login', '配置4个礼包', 'createChallenge'],
    reference: 'social-and-open-data.md',
    scope: 'Tournament component',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Chat tool mode binds opengid or open_single_roomid from 3.7.12',
    page: 'guide/open-ability/chat-tool',
    mustContain: ['3.7.12', '8.0.56', 'open_single_roomid', 'opengid', 'group_openid'],
    reference: 'social-and-open-data.md',
    scope: 'Chat Tool mode',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Updatable messages support Chat Tool cards with useForChatTool and setChatToolMsg',
    page: 'guide/open-ability/share/updatable-message',
    mustContain: ['3.7.12', 'useForChatTool', 'chooseType', 'setChatToolMsg'],
    reference: 'social-and-open-data.md',
    scope: 'Chat Tool updatable messages',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Friend item gifts expire in 48h and support 3.11.2 open-data APIs',
    page: 'guide/open-ability/share-gift',
    mustContain: ['v3.11.2', '48小时', '[1,10]', 'sendGiftToFriend'],
    reference: 'social-and-open-data.md',
    scope: 'Friend item gifting',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'WeChat Store gifts cap orders at 500 items via createStoreGift and present_receiver',
    page: 'guide/open-ability/WeChatGift',
    mustContain: ['500', 'wx.createStoreGift', 'present_receiver'],
    reference: 'social-and-open-data.md',
    scope: 'WeChat Store gifts',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Realtime phone number costs 0.04 yuan with 1000 trial calls and errno 1400001',
    page: 'guide/open-ability/getRealtimePhoneNumber',
    mustContain: ['0.04', '1000', '1400001', '5分钟'],
    reference: 'social-and-open-data.md',
    scope: 'Realtime phone number verification',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'startHandoff is tap-gated, callback-only and restricted to the open data context',
    page: 'api/share/wx.startHandoff',
    mustContain: ['2.14.4', '不支持', '开放数据域调用'],
    reference: 'social-and-open-data.md',
    scope: 'Phone-to-PC handoff',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'GameRecorder requires isFrameSupported check from 2.8.0',
    page: 'guide/open-ability/game-recorder',
    mustContain: ['2.8.0', 'isFrameSupported', 'createGameRecorderShareButton'],
    reference: 'social-and-open-data.md',
    scope: 'Gameplay replay recorder',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Channels live documents checkGameLiveEnabled, startGameLive and feedId',
    page: 'guide/open-ability/channels-live',
    mustContain: ['2.19.0', 'checkGameLiveEnabled', 'startGameLive', '2.19.2', 'feedId'],
    reference: 'social-and-open-data.md',
    scope: 'Channels live streaming',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Direct-item shipping standard ties refunds to idempotent delivery acknowledgement',
    page: 'https://developers.weixin.qq.com/minigame/introduction/commercialization/virtual-payment/send.md',
    mustContain: ['以平台接收到“发货成功”的回包为准', '幂等处理'],
    reference: 'monetization.md',
    scope: 'Virtual payment shipping compliance',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Recharge Center uses PayChannel 1 and _coin_ order prefix',
    page: 'https://developers.weixin.qq.com/minigame/introduction/commercialization/virtual-payment/recharge-center.md',
    mustContain: ['PayChannel', '1 充值中心', '_coin_', 'minigame_recharge_center_coin_deliver_completed'],
    reference: 'monetization.md',
    scope: 'Mini game Recharge Center',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'iOS High Performance mode enforces strict JS, RAM caps and drops PVRTC',
    page: 'guide/performance/perf-high-performance',
    mustContain: [
      'isIOSHighPerformanceMode',
      'use strict',
      '1.5G',
      '不支持ETC和PVRTC压缩纹理格式，只剩ASTC和ETC1',
      'GameServerManager',
    ],
    reference: 'performance.md',
    scope: 'iOS High Performance mode',
    status: 'conflicting',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Texture compression guide still lists PVRTC alongside ASTC on iOS',
    page: 'guide/performance/perf-action-texture-compression',
    mustContain: ['ASTC、PVRTC、ETC1(仅高性能模式)'],
    reference: 'engines.md',
    scope: 'Conflicts with iOS High Performance guide dropping PVRTC',
    status: 'conflicting',
    reviewed: '2026-11-13',
  },
  {
    claim: 'WXWeakRef starts at 2.23.0 while native WeakRef needs iOS 14.5 or Android 8.0.25',
    page: 'reference/api/WXWeakRef',
    mustContain: ['2.23.0', '14.5', '8.0.25'],
    reference: 'performance.md',
    scope: 'Weak reference runtime baseline',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Performance rating weights memory crash and first frame at 7 and HTTP 4xx-5xx at 6',
    page: 'guide/performance/perf-audit/perf-system-rating-rule',
    mustContain: ['内存异常退出率', '首帧耗时', '400~599', 'Request失败率', 'Download失败率'],
    reference: 'performance.md',
    scope: 'Platform performance rating rules',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'getPrivacySetting is callback-only from 2.32.3 and returns privacyContractName',
    page: 'api/open-api/privacy/wx.getPrivacySetting',
    mustContain: ['2.32.3', '不支持', 'needAuthorization', 'privacyContractName'],
    reference: 'privacy-and-release.md',
    scope: 'Privacy contract state check',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Mini-game content security gameMsgSecCheck checks up to 2500 UTF-8 chars',
    page: 'api-backend/wxa-sec-check/api_gamemsgseccheck',
    mustContain: ['msg_sec_check', '2500', 'version'],
    reference: 'privacy-and-release.md',
    scope: 'Mini-game text moderation API',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'getCheatData queries 1-7 days of anti-cheat records up to 1000 per call',
    page: 'api-backend/safety-control-capability/api_getcheatdata',
    mustContain: ['get_cheat_data', 'duration_days', '1000'],
    reference: 'privacy-and-release.md',
    scope: 'Anti-cheat backend query',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'JS deep protection forbids eval, with, TDZ and fn.toString from 1.06.2401020',
    page: 'devtools/codeprotect',
    mustContain: ['1.06.2401020', 'eval', 'with', 'toString', '.map'],
    reference: 'privacy-and-release.md',
    scope: 'DevTools JS code hardening',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Unity security hardening encrypts global-metadata.dat and obfuscates WASM methods',
    page: 'devtools/security_hardening_tool',
    mustContain: ['global-metadata.dat', 'WasmObfuscate'],
    reference: 'engines.md',
    scope: 'Unity export security hardening',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'project.private.config.json settings do not affect compiled output',
    page: 'devtools/projectconfig',
    mustContain: ['project.private.config.json', '与最终编译产物有关的设置无法在'],
    reference: 'tooling-and-backend.md',
    scope: 'Project config build boundary',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Version review requires Apple developer account field, age rating and 5000-user expedited gate',
    page: 'https://developers.weixin.qq.com/minigame/introduction/guide/bbsh.md',
    mustContain: ['苹果开发者账号', '适龄提示', '5000', '加急审核', '2 次加急次数'],
    reference: 'privacy-and-release.md',
    scope: 'Version review submission',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Age rating badge supports 8+, 12+ and 16+ in MP',
    page: 'https://developers.weixin.qq.com/minigame/introduction/guide/slts.md',
    mustContain: ['8+', '12+', '16+', '适龄提示'],
    reference: 'privacy-and-release.md',
    scope: 'Age rating badge compliance',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Unlimited mini-program QR codes cap at 5000/min while legacy QR APIs cap at 100000',
    page: 'guide/open-ability/qr-code',
    mustContain: ['已发布的小程序', '100,000', '5000次/分钟', 'api_getunlimitedqrcode'],
    reference: 'privacy-and-release.md',
    scope: 'Mini-program QR code limits',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'getStableAccessToken isolates refresh from getAccessToken with 20 forced refreshes per day',
    page: 'api-backend/access-token/api_getstableaccesstoken',
    mustContain: ['stable_token', 'force_refresh', '20', '512'],
    reference: 'tooling-and-backend.md',
    scope: 'Backend access token management',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'wxcloud Skills builds WXML mini-program skills from 3.16.1',
    page: 'wxcloud/Skills',
    mustContain: ['3.16.1', 'mcp.json', 'wx.cloud.callFunction'],
    reference: 'tooling-and-backend.md',
    scope: 'Mini-program AI skill boundary',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'setInnerAudioOption starts at 2.3.0 and does not apply to WebAudioContext or useWebAudioImplement',
    page: 'api/media/audio/wx.setInnerAudioOption',
    mustContain: [
      '2.3.0',
      'obeyMuteSwitch',
      'speakerOn 为 true 时，客户端会忽略 mixWithOther',
      '不兼容 wx.createWebAudioContext 接口，也不兼容 wx.createInnerAudioContext 开启 useWebAudioImplement',
    ],
    reference: 'input-audio-lifecycle.md',
    scope: 'Global inner audio options and WebAudio incompatibility',
    status: 'confirmed',
    reviewed: '2026-11-13',
  },
  {
    claim: 'Canvas.toTempFilePath is callback-only and restricts open-data output to share/save APIs',
    page: 'api/render/canvas/Canvas.toTempFilePath',
    mustContain: ['不支持', 'tempFilePath', 'wx.showShareImageMenu'],
    reference: 'rendering-and-layout.md',
    scope: 'Canvas screenshot export callback contract',
    status: 'confirmed',
    reviewed: '2026-11-13',
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
