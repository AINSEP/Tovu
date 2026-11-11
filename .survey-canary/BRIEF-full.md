# Cloud survey, full run: session brief

Your session number N is given in the message that started you. This brief is self-contained. Tovu has no AI-Dev-Shop/AGENTS.md here; that's expected, so proceed without it. Skip any repo startup or bootstrap. Report only: nothing gets fixed.

## HARD CAPS (any cap reached → go straight to step 5, push, END)
- Wall clock: 3 hours from your first command. Record the start time.
- Exactly the units in `.survey-canary/full/session-N.json`: one reviewer subagent per unit, nothing else. No follow-up agents, re-runs, judges or audits.
- At most 5 subagents running at once.
- No fixes, tests, builds, tsc or lint. The only install is `npm ci --ignore-scripts`.
- PUBLIC REPO: never commit or push a plain-text report. Only `seal.sh` output and `cost-sN.md` (numbers only) are pushed.
- NEVER wait for usage numbers. Record what the Agent result shows when it shows it, and write `n/a` for anything missing. As soon as every subagent has reported or failed, go to step 5.

## Steps
1. `cd /home/user/Tovu && git status && date -u`. You start on branch `cloud/survey-canary`.
2. Setup: run `npm ci --ignore-scripts`, then
   `node development/scripts/extraction-dossier.mjs --tovu /home/user/Tovu --jini /home/user/Jini --out /tmp/dossier`
   (if Jini is elsewhere, `ls /home/user` and pass that path), then
   `PLAN=.survey-canary/full/session-N.json node .survey-canary/slice.mjs`, then `mkdir -p /tmp/canary-out`.
3. Dispatch one reviewer per unit with the Agent/Task tool. Each prompt is the text of `.survey-canary/reviewer-brief.md` with the placeholders filled in. `{BATCH}` is the unit id (e.g. u017) and `{TIER}` is the unit's `tier`.
   - **tier 2 → model opus.** `{TIER_LABEL}`=`tier-2 files (deep read)`. `{TIER_NOTE}`=`These are the risky files: do all four parts in full.`
   - **tier 1 → model sonnet.** `{TIER_LABEL}`=`tier-1 files (light read)`. `{TIER_NOTE}`=`These are lower-risk files. Read each file's header, exports and the dossier row. Give the label, obvious duplicates, and a quick bug check on runtime files (stores, services, tools, routes, hooks with effects). If a file needs a deep read, say NEEDS-TIER-2 and why, instead of doing it.`
   - As each one finishes, add a row: unit, tier, model, files, lines (the unit's `loc`), the tokens, tool uses and duration the Agent tool reports, and a status (ok / partial / failed). If its report file is missing, write its final message to `/tmp/canary-out/<unit>-<tier>.md`.
4. Do not read or summarise the findings yourself.
5. Finish (also when a cap is hit):
   - `mkdir -p .survey-canary/out-sN`, then `.survey-canary/seal.sh <file> .survey-canary/out-sN` for each `/tmp/canary-out/*.md`.
   - Write `.survey-canary/cost-sN.md`: start and end time (UTC), the table, totals per tier/model (tokens, lines, tokens per line), any cap hit, and the units that didn't finish. Numbers only.
   - Check with `git status` that no plain-text report is staged.
   - `git add .survey-canary/out-sN .survey-canary/cost-sN.md && git commit -m "chore(survey): full run session N results" && git push origin HEAD:refs/heads/cloud/survey-full-sN`
   - Your final message is the contents of cost-sN.md. Then END and start nothing else.
