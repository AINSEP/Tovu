# Cloud survey canary: coordinator brief

Purpose: measure what a tiered survey costs, so the owner can decide on surveying the whole Tovu codebase. This is a COST CANARY. Finishing within the caps matters more than depth. Report only: nothing gets fixed.

This brief is self-contained. Tovu has no AI-Dev-Shop/AGENTS.md here; that's expected, so proceed without it. Skip any repo startup or bootstrap.

## HARD CAPS (any cap reached → go straight to step 6, push, END)
- Wall clock: 2 hours from your first command. Record the start time.
- Exactly the 10 batches in `.survey-canary/batches.json`, and no others. At most 16 reviewer subagents (listed below). No follow-up agents, no re-runs, no judges, no extra audits.
- At most 5 subagents running at once.
- Each subagent stops before ~250k tokens of its own context (it's in their brief).
- No fixes, tests, builds, tsc or lint. The only install is `npm ci --ignore-scripts` (the dossier needs typescript).
- PUBLIC REPO: never commit or push a plain-text report. Only `seal.sh` output and `cost.md` (numbers only, no findings) are pushed.

## Steps
1. `cd /home/user/Tovu && git status`. You must be on branch `cloud/survey-canary`. `date -u` → start time.
2. Setup: `npm ci --ignore-scripts` in /home/user/Tovu. Then run
   `node development/scripts/extraction-dossier.mjs --tovu /home/user/Tovu --jini /home/user/Jini --out /tmp/dossier`
   If Jini isn't at /home/user/Jini, find the checkout (`ls /home/user`) and pass that path.
3. `node .survey-canary/slice.mjs`. It prints each batch with its file count. Missing files are OK: the reviewer reads the source anyway. `mkdir -p /tmp/canary-out`.
4. Dispatch reviewers with the Agent/Task tool. Each subagent's prompt is the text of `.survey-canary/reviewer-brief.md` with `{BATCH}`, `{TIER}`, `{TIER_LABEL}` and `{TIER_NOTE}` filled in:
   - **Tier 2 → model opus**, `{TIER}`=2, `{TIER_LABEL}`=`tier-2 files (deep read)`, `{TIER_NOTE}`=`These are the risky files: do all four parts in full.` One per batch: b166 b110 b062 b114 b157 b191 b172 b189 b041 (9 agents; b171 has no tier-2 files).
   - **Tier 1 → model sonnet**, `{TIER}`=1, `{TIER_LABEL}`=`tier-1 files (light read)`, `{TIER_NOTE}`=`These are lower-risk files. Read each file's header, exports and the dossier row. Give the label, obvious duplicates, and a quick bug check on runtime files (stores, services, tools, routes, hooks with effects). If a file needs a deep read, say NEEDS-TIER-2 and why, instead of doing it.` One per batch: b114 b157 b191 b172 b189 b041 b171 (7 agents).
   - Tier-0 files are skipped (the script labels them).
   For each finished subagent, record in a table: batch, tier, model, number of files, lines (sum of `loc` for that tier from `.survey-canary/batches.json`), the **total tokens and tool uses the Agent tool reports for that subagent**, and its duration. If its report file is missing, write its final message to `/tmp/canary-out/<batch>-<tier>.md`.
5. Do not read or summarise the findings yourself. Reading them costs tokens and isn't the point of the canary.
6. Finish (also when a cap is hit):
   - `mkdir -p .survey-canary/out` and, for each `/tmp/canary-out/*.md`, run `.survey-canary/seal.sh <file> .survey-canary/out`.
   - Write `.survey-canary/cost.md` with: the start and end time (UTC), the table from step 4, totals per tier/model (tokens, lines, tokens per line), your own coordinator token use if you can see it, any cap that was hit, and which batches or tiers didn't finish. Numbers only, no findings.
   - Check that `git status` shows no plain-text report: only `.enc`/`.key.enc` files and cost.md under `.survey-canary/`.
   - `git add .survey-canary/out .survey-canary/cost.md && git commit -m "chore(survey): canary cost results" && git push origin cloud/survey-canary`
   - Your final message is cost.md's contents, then END. Start nothing else.
