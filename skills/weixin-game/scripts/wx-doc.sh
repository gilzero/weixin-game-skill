#!/bin/sh
# @file: wx-doc.sh
# @desc: find and read current WeChat docs
#
# Usage:
#   wx-doc.sh find <text>    match page paths and sidebar titles
#   wx-doc.sh read <page>    print a page as Markdown (accepts a path from find, or a full URL)

set -eu

BASE_URL=https://developers.weixin.qq.com/minigame/dev
# Any API page carries the full site index in its sidebar.
INDEX_PAGE=api/render/canvas/wx.createCanvas.html
INDEX_CACHE="${TMPDIR:-/tmp}/wx-doc-index-v2-$(date +%Y%m%d).txt"

fail() {
  echo "wx-doc: $1" >&2
  exit 1
}

# The site serves gzip whether or not it was asked for, so --compressed is required.
fetch() {
  curl --silent --show-error --location --compressed --max-time 30 -A 'wx-doc' "$@"
}

build_index() {
  [ -s "$INDEX_CACHE" ] && return 0
  index_html=$(mktemp)
  index_rows=$(mktemp)
  trap 'rm -f "$index_html" "$index_rows"' EXIT
  fetch --fail "$BASE_URL/$INDEX_PAGE" >"$index_html" || { echo 'wx-doc: index evidence unavailable' >&2; exit 2; }
  # Split anchors without requiring a JS runtime in the installed skill.
  tr '\n' ' ' <"$index_html" | sed 's|</a>|</a>\
|g' | awk '
    /href="\/minigame\/dev\/[^"#]+\.html"/ {
      sub(/^.*href="\/minigame\/dev\//, "")
      path = $0; sub(/\.html".*/, "", path)
      sub(/^[^>]*>/, ""); sub(/<\/a>.*/, "")
      gsub(/<[^>]*>/, ""); gsub(/&amp;/, "\\&")
      if ($0 != "" && $0 != "undefined") print path "\t" $0
    }
  ' | sort -u >"$index_rows"
  [ -s "$index_rows" ] || { echo "wx-doc: could not verify the site index from $BASE_URL/$INDEX_PAGE" >&2; exit 2; }
  mv "$index_rows" "$INDEX_CACHE"
}

find_pages() {
  build_index
  # Map common developer terms to the names used in the official sidebar.
  query=$1
  case "$query" in
    胶囊|胶囊按钮) query=getMenuButtonBoundingClientRect ;;
    安全区|安全区域|safeArea|刘海|刘海屏) query=getWindowInfo ;;
    离屏|离屏画布) query=createCanvas ;;
    声音|音乐|音效|bgm|BGM) query=音频 ;;
    震动) query=振动 ;;
    省电|省电模式|温控|发热|发烫) query=power-saving-mode ;;
    横屏|竖屏|旋转) query=orientation ;;
    输入框) query=键盘 ;;
    harmony|harmonyos|HarmonyOS) query=ohos ;;
    leaderboard|ranking) query=ranklist ;;
    iap|IAP|内购|充值) query=virtual-payment ;;
    格子广告|模板广告) query=custom-ad ;;
    性能评分|评分) query=perf-audit ;;
    反作弊) query=antiadcheat ;;
    poster|海报) query=share-image ;;
    subscription) query=subscribe-message ;;
    scene|launch-scene|入口场景) query=场景值 ;;
    灰度|灰度发布|staged-release) query=code-beta ;;
    云测|云测试|cloud-test) query=perf-tools-cloudtest ;;
    chattool) query=chat-tool ;;
    得分存档|score-storage) query=storage-score ;;
    加固|混淆|code-protect) query=codeprotect ;;
    离线|离线模式) query=OfflineMode ;;
    官方组件|浮窗组件) query=OfficialComponentsInfo ;;
    stable_token|access_token) query=stableaccesstoken ;;
    # These pages are linked from guides or API headers but absent from the sidebar index.
    点击限制|点击行为|tap-gated|touch-limit)
      printf 'guide/base-ability/touch-limit\t点击行为限制\n'
      return 0
      ;;
    限频|调用频率|rate-limit|api-frequency)
      printf 'guide/performance/api-frequency\t接口调用频率规范\n'
      return 0
      ;;
    加密通道|加密网络通道|user-encryptkey|encryptKey|getLatestUserKey)
      printf 'guide/open-ability/user-encryptkey\tHTTPS加密网络通道\n'
      return 0
      ;;
    wasm|WASM)
      grep -iE -- 'wasm|webassembly' "$INDEX_CACHE" || fail "no doc page path or title contains '$1'"
      return 0
      ;;
  esac
  grep -iF -- "$query" "$INDEX_CACHE" || fail "no doc page path or title contains '$1'"
}

read_page() {
  case "$1" in
    https://developers.weixin.qq.com/minigame/*|https://developers.weixin.qq.com/miniprogram/*) url=$1 ;;
    *://*) fail "only official WeChat documentation URLs are supported" ;;
    *) page=$(printf '%s' "$1" | sed -e 's|^\./||' -e 's|^/*minigame/dev/||'); url="$BASE_URL/$page" ;;
  esac
  url=$(printf '%s' "$url" | sed -e 's|[?#].*$||' -e 's|\.html$||' -e 's|\.md$||').md
  body_file=$(mktemp)
  trap 'rm -f "$body_file"' EXIT
  status=$(fetch -o "$body_file" -w '%{http_code}' "$url") || { echo "wx-doc: evidence unavailable for $url" >&2; exit 2; }
  case "$status" in
    200) ;;
    404|410) fail "HTTP $status for $url (try: wx-doc.sh find <part of the name>)" ;;
    *) echo "wx-doc: evidence unavailable: HTTP $status for $url" >&2; exit 2 ;;
  esac
  # A few official pages (the scene list) use a Setext "====" underline instead of a # heading.
  if ! grep -Eq '^#{1,6} +[^ ]|^={3,} *$' "$body_file" || grep -Eiq '<!doctype html|<html[ >]|site unavailable|service unavailable|access denied|captcha|访问过于频繁' "$body_file"; then
    echo "wx-doc: evidence unavailable: expected Markdown documentation at $url" >&2
    exit 2
  fi
  cat "$body_file"
}

[ $# -eq 2 ] || fail "usage: wx-doc.sh find <text> | wx-doc.sh read <page>"
case "$1" in
  find) find_pages "$2" ;;
  read) read_page "$2" ;;
  *) fail "unknown command '$1' (use find or read)" ;;
esac
