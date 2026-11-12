# Quality audit 2026-11-11 — common rules for both sessions

You are a cloud session with Tovu (/home/user/Tovu, branch `cloud/quality-1111`) and Jini (/home/user/Jini, `main`) pre-cloned. Do not read AGENTS.md / CLAUDE.md / AI-Dev-Shop; your brief file + this file are everything.

GOAL: MEASURE everything wrong before one big refactor. **Report only — no fixes, no refactors, no edits to source or tests.** You may add analysis scripts/config ONLY under `development/cloud/quality-1111/`.

## HARD CAPS (iron rule — end the run when ANY cap is reached)
- Wall clock: the hours in your brief, from your first command. At the cap: commit + push what you have, write RESULTS, END.
- At most 3 subagents, only for parallel lanes of commands; no subagent fans out. Prefer plain shell; you don't need to read source files.
- No dependency upgrades; tool installs only via `npx --yes <tool>@<pinned version>` into the container.

## Setup (container facts: 4 cores, 16 GB, no Postgres, no Chromium, no IPv6)
1. Node 24: download the nodejs.org v24 linux-x64 tarball into ~/.local/node24; `export PATH=$HOME/.local/node24/bin:$PATH` in EVERY command; `corepack enable --install-directory $HOME/.local/node24/bin`; pnpm only inside /home/user/Jini.
2. Jini: `pnpm install --frozen-lockfile`, then `pnpm --no-bail -r build` → raw/jini-build.txt.
3. Tovu: `npm ci` in root, apps/admin, apps/desktop, apps/site-chat; `npm run build --workspace @tovu/sdk` BEFORE `npm run link:jini`; then `npm run link:jini`; `cd apps/desktop && npm run build:preload`.
4. Save every raw output as `raw/<step>.txt` under your output folder. NEVER `*.log` (.gitignore drops them). Mark env-only failures (no Postgres/Chromium/IPv6/EPERM) as ENV.

## Output
- Your folder: `development/cloud/quality-1111/<your-folder>/` with `RESULTS.md` (numbers + full lists, every item listed, never counts only) and `raw/`.
- Big lists go in `.tsv`/`.json` next to RESULTS.md; RESULTS.md gives totals and the top 50 of each list.
- Public repo: quality numbers and file paths are fine; describe what's wrong, never how to abuse it.
- Commit + `git push origin HEAD:refs/heads/cloud/quality-1111-<your-folder>` at the 1h mark and at the end. Commit messages end `Co-Authored-By: Claude <noreply@anthropic.com>`. Then END; start nothing else.
