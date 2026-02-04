#!/usr/bin/env bash
set -euo pipefail

LOG=/tmp/sns-ai-claude-watch.log
SCRIPT=/home/sandboxer/git/sns-ai/bin/sns-ai-nudge.sh

ts() { date "+%F %T"; }

printf "[%s] tick\n" "$(ts)" >>"$LOG" 2>&1 || true
bash "$SCRIPT" >>"$LOG" 2>&1 || true
sleep 30
printf "[%s] tick\n" "$(ts)" >>"$LOG" 2>&1 || true
bash "$SCRIPT" >>"$LOG" 2>&1 || true
