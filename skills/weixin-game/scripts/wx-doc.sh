#!/bin/sh
# @file: wx-doc.sh
# @desc: find and read current WeChat docs
#
# Usage:
#   wx-doc.sh find <text>    list doc pages whose path contains the text
#   wx-doc.sh read <page>    print a page as Markdown (accepts a path from find, or a full URL)

set -eu

BASE_URL=https://developers.weixin.qq.com/minigame/dev
# Any API page carries the full site index in its sidebar.
INDEX_PAGE=api/render/canvas/wx.createCanvas.html
INDEX_CACHE="${TMPDIR:-/tmp}/wx-doc-index-$(date +%Y%m%d).txt"

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
  fetch "$BASE_URL/$INDEX_PAGE" |
    grep -oE 'href="/minigame/dev/[^"#]+\.html' |
    sed -e 's|^href="/minigame/dev/||' -e 's|\.html$||' |
    sort -u >"$INDEX_CACHE"
  [ -s "$INDEX_CACHE" ] || fail "could not read the site index from $BASE_URL/$INDEX_PAGE"
}

find_pages() {
  build_index
  grep -iF -- "$1" "$INDEX_CACHE" || fail "no doc page path contains '$1'"
}

read_page() {
  page=$(printf '%s' "$1" | sed -e "s|^$BASE_URL/||" -e 's|^/minigame/dev/||' -e 's|[?#].*$||' -e 's|\.html$||' -e 's|\.md$||')
  body_file=$(mktemp)
  trap 'rm -f "$body_file"' EXIT
  status=$(fetch -o "$body_file" -w '%{http_code}' "$BASE_URL/$page.md")
  [ "$status" = 200 ] || fail "HTTP $status for $BASE_URL/$page.md (try: wx-doc.sh find <part of the name>)"
  cat "$body_file"
}

[ $# -eq 2 ] || fail "usage: wx-doc.sh find <text> | wx-doc.sh read <page>"
case "$1" in
  find) find_pages "$2" ;;
  read) read_page "$2" ;;
  *) fail "unknown command '$1' (use find or read)" ;;
esac
