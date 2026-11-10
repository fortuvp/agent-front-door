#!/usr/bin/env bash
# Screenshot one slide of the built deck with headless Chrome. Builds nothing: run `node build.mjs` first.
#   deck/shot.sh <slide-id> [step] [out.png]   → deck/shots/<slide-id>-<step>.png (step: a number or "last", default 0)
#   deck/shot.sh --all [step]                  → every slide in src/slides/order.txt (default step "last")
#   deck/shot.sh --overview [out.png]          → a contact sheet of every slide (deck/shots/overview.png)
# Opens index.html?slide=<id>&step=<n>&static=1 at 1920×1080 (static: no transitions or animations).
# Prints the page's console messages and uncaught errors, if any (node check.mjs checks every slide).
# Env: SHOT_BASE  page to open instead of the local file, e.g. http://127.0.0.1:4900/deck/ (for live slides)
#      SHOT_WAIT  milliseconds of page time before the shot (default 2500)
#      CHROME     path to Chrome
set -euo pipefail

DECK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
BASE="${SHOT_BASE:-file://$DECK/index.html}"
WAIT="${SHOT_WAIT:-2500}"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
[ $# -ge 1 ] || usage 1
[ "$1" = "-h" ] || [ "$1" = "--help" ] && usage 0
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME (set CHROME=...)" >&2; exit 1; }
[ -f "$DECK/index.html" ] || { echo "No $DECK/index.html: run node build.mjs in $DECK first" >&2; exit 1; }
mkdir -p "$DECK/shots"

shot() {
  local id="$1" step="$2" out="$3" size="${4:-1920,1080}"
  local sep="?"; case "$BASE" in *\?*) sep="&";; esac
  local url="${BASE}${sep}slide=${id}&step=${step}&static=1"
  [ "$id" = "--overview" ] && url="${BASE}${sep}overview=1&static=1"
  local profile log pid
  profile="$(mktemp -d "${TMPDIR:-/tmp}/deck-shot.XXXXXX")"
  log="$profile/console.log"
  rm -f "$out"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
    --user-data-dir="$profile" --force-device-scale-factor=1 --window-size="$size" \
    --virtual-time-budget="$WAIT" --enable-logging=stderr --v=1 \
    --screenshot="$out" "$url" >/dev/null 2>"$log" &
  pid=$!
  for _ in $(seq 1 450); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done # 45 s at most
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  # Console lines look like: [..:INFO:CONSOLE:12] "message", source: file:///… (12)
  local problems
  problems="$(grep -E ':CONSOLE[:(]' "$log" || true)"
  rm -rf "$profile"
  if [ -s "$out" ]; then echo "$out"; else echo "FAILED $id (no screenshot)" >&2; return 1; fi
  if [ -n "$problems" ]; then echo "console ($id):"; echo "$problems" | sed -E 's/^\[[^]]*CONSOLE[:(][0-9]+\)?\] /  /; s/, source: .*\/([^/?]+)[^ ]* \(([0-9]+)\)$/  (\1:\2)/' | cut -c1-400; fi
}

if [ "$1" = "--overview" ]; then
  out="${2:-$DECK/shots/overview.png}"
  case "$out" in /*) ;; *) out="$PWD/$out";; esac
  shot --overview 0 "$out" 1920,1500
  exit $?
fi

if [ "$1" = "--all" ]; then
  step="${2:-last}"
  status=0
  for id in $(cat "$DECK/src/slides/order.txt"); do shot "$id" "$step" "$DECK/shots/$id-$step.png" || status=1; done
  exit $status
fi

id="$1"; step="${2:-0}"
out="${3:-$DECK/shots/$id-$step.png}"
case "$out" in /*) ;; *) out="$PWD/$out";; esac
shot "$id" "$step" "$out"
