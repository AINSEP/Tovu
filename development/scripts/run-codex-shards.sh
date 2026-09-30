#!/bin/bash
# Runs one Codex (`gpt-6.1-sol`, reasoning $CODEX_EFFORT, default medium) job per prompt file, at most 5 at a time.
#
# Usage: development/scripts/run-codex-shards.sh <prompt-dir> <read-only|workspace-write> <out-dir>
#
# Each prompt file <prompt-dir>/<shard>.<ext> is sent on STDIN (never as a CLI argument), prefixed
# with the <<PEER_DISPATCH>> marker so the repo's CLAUDE.md/AGENTS.md bootstrap is skipped. Per shard:
#   <out>/<shard>.jsonl   raw `codex exec --json` event stream
#   <out>/<shard>.err     stderr
#   <out>/<shard>.md      the final agent_message — written ONLY when the stream has turn.completed
#                         and no error/turn.failed event (exit 0 does NOT mean success)
#   <out>/<shard>.failed  reason, when the run did not succeed
# A shard whose .md already exists is skipped, so a re-run resumes where the last one stopped.
# Blocks in the foreground until every shard has finished; prints a status table at the end.
set -u

PROMPT_DIR=${1:?usage: run-codex-shards.sh <prompt-dir> <read-only|workspace-write> <out-dir>}
SANDBOX=${2:?sandbox mode: read-only | workspace-write}
OUT_DIR=${3:?output dir}
MAX_JOBS=${CODEX_SHARD_CONCURRENCY:-5}
EFFORT=${CODEX_EFFORT:-medium}
REPO=/Users/la/Programming/Tovu

case "$SANDBOX" in
  read-only|workspace-write) ;;
  *) echo "sandbox must be read-only or workspace-write, got: $SANDBOX" >&2; exit 2 ;;
esac
case "$EFFORT" in
  minimal|low|medium|high|xhigh) ;;
  *) echo "CODEX_EFFORT must be minimal|low|medium|high|xhigh, got: $EFFORT" >&2; exit 2 ;;
esac
[ -d "$PROMPT_DIR" ] || { echo "no such prompt dir: $PROMPT_DIR" >&2; exit 2; }
mkdir -p "$OUT_DIR"

# Parses a finished run's JSONL. Writes <shard>.md on success, <shard>.failed otherwise.
parse_run() {
  node - "$1" "$2" "$3" <<'NODE'
const fs = require("fs");
const [jsonl, md, failed] = process.argv.slice(2);
let completed = false;
const errors = [];
let lastMessage = null;
let usage = null;
const raw = fs.existsSync(jsonl) ? fs.readFileSync(jsonl, "utf8") : "";
for (const line of raw.split("\n")) {
  if (!line.trim()) continue;
  let ev;
  try { ev = JSON.parse(line); } catch { continue; }
  if (ev.type === "turn.completed") { completed = true; usage = ev.usage ?? null; }
  else if (ev.type === "turn.failed") errors.push(`turn.failed: ${JSON.stringify(ev.error ?? ev)}`);
  else if (ev.type === "error") errors.push(`error: ${ev.message ?? JSON.stringify(ev)}`);
  else if (ev.type === "item.completed" && ev.item && ev.item.type === "agent_message") lastMessage = ev.item.text;
}
if (completed && !errors.length && lastMessage) {
  fs.writeFileSync(md, lastMessage.endsWith("\n") ? lastMessage : lastMessage + "\n");
  if (fs.existsSync(failed)) fs.unlinkSync(failed);
  console.log(`ok${usage ? ` (in=${usage.input_tokens ?? "?"} out=${usage.output_tokens ?? "?"})` : ""}`);
} else {
  const reason = errors.length ? errors.join("\n") : !completed ? "no turn.completed event" : "no agent_message";
  fs.writeFileSync(failed, reason + "\n");
  console.log(`FAILED: ${reason.split("\n")[0].slice(0, 200)}`);
}
NODE
}

run_shard() {
  local prompt=$1 shard=$2
  local jsonl="$OUT_DIR/$shard.jsonl" err="$OUT_DIR/$shard.err"
  { printf '%s\n\n' '<<PEER_DISPATCH>>'; cat "$prompt"; } \
    | codex exec --ignore-rules --ignore-user-config --ephemeral --json -s "$SANDBOX" -m gpt-6.1-sol \
        -c model_reasoning_effort="$EFFORT" -C "$REPO" - > "$jsonl" 2> "$err"
  local rc=$?
  echo "[$shard] exit=$rc $(parse_run "$jsonl" "$OUT_DIR/$shard.md" "$OUT_DIR/$shard.failed")"
}

running() { jobs -rp | wc -l | tr -d ' '; }

shards=()
for prompt in "$PROMPT_DIR"/*; do
  [ -f "$prompt" ] || continue
  base=$(basename "$prompt")
  shard=${base%.*}
  shards+=("$shard")
  if [ -f "$OUT_DIR/$shard.md" ]; then
    echo "[$shard] skipped (already has $shard.md)"
    continue
  fi
  while [ "$(running)" -ge "$MAX_JOBS" ]; do sleep 5; done
  echo "[$shard] started"
  run_shard "$prompt" "$shard" &
done
wait
[ "${#shards[@]}" -gt 0 ] || { echo "no prompt files in $PROMPT_DIR" >&2; exit 2; }

ok=0; bad=0
for shard in "${shards[@]}"; do
  if [ -f "$OUT_DIR/$shard.md" ]; then ok=$((ok + 1)); else bad=$((bad + 1)); echo "not done: $shard ($(head -1 "$OUT_DIR/$shard.failed" 2>/dev/null))"; fi
done
echo "done: $ok ok, $bad failed/missing, of ${#shards[@]} shard(s) in $OUT_DIR"
[ "$bad" -eq 0 ]
