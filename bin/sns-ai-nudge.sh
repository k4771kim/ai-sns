#!/usr/bin/env bash
set -euo pipefail

TMUX_SOCK="/tmp/tmux-1001/default"
SESSION="sns-ai-claude-3"
STAMP_FILE="/tmp/sns-ai-claude-nudge.last"
IDLE_NUDGE_AFTER_SEC=60  # 10m

log() { printf "[%s] %s\n" "$(date "+%F %T")" "$*"; }

touch_stamp() { date +%s >"$STAMP_FILE" 2>/dev/null || true; }

last_stamp_age() {
  if [[ -f "$STAMP_FILE" ]]; then
    local last now
    last=$(cat "$STAMP_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    echo $(( now - last ))
  else
    echo 999999
  fi
}

has_session() {
  tmux -S "$TMUX_SOCK" has-session -t "$SESSION" 2>/dev/null
}

capture() {
  tmux -S "$TMUX_SOCK" capture-pane -t "$SESSION" -p -S -200 | tail -n 300 || true
}

force_prompt_and_send() {
  local cmd="$1"
  log "NUDGE: force prompt then send: ${cmd:0:120}"
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" Escape
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" C-c
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" C-l
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" C-m
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" "$cmd" C-m C-m
  touch_stamp
}

if ! has_session; then
  exit 0
fi

CAPTURE=$(capture)
[[ -z "$CAPTURE" ]] && exit 0

# If Claude is actively thinking/working, do nothing.
# BUT: if a prompt (❯) is visible, treat it as idle even if the scrollback contains "Churned for" etc.
if ! echo "$CAPTURE" | grep -Eq "^❯" && echo "$CAPTURE" | grep -Eqi "Channelling|Synthesizing|Pontificating|Canoodling|Photosynthesizing|Crunched for|Baked for|Churned for|Thinking"; then
  exit 0
fi

if echo "$CAPTURE" | grep -q "Choose the text style"; then
  log "NUDGE: selecting theme option 1"
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" "1" C-m C-m
  touch_stamp
  exit 0
fi

if echo "$CAPTURE" | grep -q "Do you want to proceed\?"; then
  log "NUDGE: approving skill prompt (option 2)"
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" "2" C-m C-m
  touch_stamp
  exit 0
fi

if echo "$CAPTURE" | grep -Eq "[0-9]+ files \+[0-9]+ -[0-9]+"; then
  log "NUDGE: detected pager/diff view (\"N files + -\"); sending q"
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" q
  touch_stamp
  exit 0
fi

if echo "$CAPTURE" | grep -Eqi "Interrupted|What should Claude do instead\?|bypass permissions on|Resume cancelled|Press up to edit queued messages"; then
  log "NUDGE: detected stuck/prompt; sending Enter Enter"
  tmux -S "$TMUX_SOCK" send-keys -t "$SESSION" C-m C-m
  touch_stamp
  exit 0
fi

if echo "$CAPTURE" | grep -Eq "^❯"; then
  age=$(last_stamp_age)
  if (( age > IDLE_NUDGE_AFTER_SEC )); then
    force_prompt_and_send "/pdca archive agent-only-quiz-lounge-v1"
    exit 0
  fi
fi

exit 0
