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
      print path "\t" $0
    }
  ' | sort -u >"$index_rows"
  [ -s "$index_rows" ] || { echo "wx-doc: could not verify the site index from $BASE_URL/$INDEX_PAGE" >&2; exit 2; }
  mv "$index_rows" "$INDEX_CACHE"
}

find_pages() {
  build_index
  # The API sidebar uses only the English method name for the capsule.
  query=$1
  case "$query" in 胶囊|胶囊按钮) query=getMenuButtonBoundingClientRect ;; esac
  grep -iF -- "$query" "$INDEX_CACHE" || fail "no doc page path or title contains '$1'"
}

read_page() {
  case "$1" in
    https://developers.weixin.qq.com/minigame/*|https://developers.weixin.qq.com/miniprogram/*) url=$1 ;;
    *://*) fail "only official WeChat documentation URLs are supported" ;;
    *) page=$(printf '%s' "$1" | sed 's|^/minigame/dev/||'); url="$BASE_URL/$page" ;;
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
  if ! grep -Eq '^#{1,6} +[^ ]' "$body_file" || grep -Eiq '<!doctype html|<html[ >]|site unavailable|service unavailable|access denied|captcha' "$body_file"; then
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
