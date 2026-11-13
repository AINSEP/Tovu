HARD RULE (first): stop before ~250k tokens of context. If you get close, commit what is done (explicit paths), write a REMAINING list in your report, and stop. Stopping early at a committed point is always correct.

# OPUS job, stage 12: the MOVE rows Terra could not do

EXECUTOR: Opus (UI rows: Opus with Claude in Chrome for the visual check). Why: these rows need a server-contract rewrite, a home decision, a new subpath or a package outside stages 06-11.

## Repos
- Tovu clone: `/Users/la/Programming/tovu-terra-d1` (branch `design-d1`). Jini clone: `/Users/la/Programming/jini-terra-d1`. Work ONLY in these two. Never read-modify-write `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini` (the live trees); never run `npm run link:jini`, `npm install` or `pnpm install` yourself.
- BOOTSTRAP: `AI-Dev-Shop/AGENTS.md` is missing in these clones. That is expected: do not look for it, do not stop, proceed with this prompt.
- If this job edits Jini, the runner must give you `/Users/la/Programming/jini-terra-d1` as a writable directory; if it is read-only, stop and say so.

Preconditions (check each; stop and report if one fails):
1. Stage 04 landed: `node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0` exits 0.
2. Stages 06-11 landed in both repos (their reports exist; the coordinator lists their BLOCKED rows in `development/refactor-patterns/move-to-jini/stage-12.blocked.tsv`, same columns as the stage lists plus `reason`). If that file is missing, do only `stage-12.files.tsv`.
3. The server contract is in THIS Jini clone: `grep -n "ServerMiddleware" /Users/la/Programming/jini-terra-d1/packages/core/src/contracts/server.ts` and `grep -rn "readJsonBody\|withServerMiddleware" /Users/la/Programming/jini-terra-d1/packages/http-kit/src --include=*.ts -l` both find it. It is designed and built in another clone: read `/Users/la/Programming/tovu-terra-d2/development/refactor-patterns/server-port.md` (sections 2-3 are the contract; do NOT redesign it). If it is not merged into `/Users/la/Programming/jini-terra-d1` yet, do only rows of kinds B-E below and report the Express rows as waiting.
4. Tovu `node_modules` is the APFS copy linked to `/Users/la/Programming/jini-terra-d1` (same check as the stage 06 prompt's Preflight 2).

## Input
`development/refactor-patterns/move-to-jini/stage-12.files.tsv` (23 rows: Express-bound, no package named, or a package outside 06-11: server, sandbox, commerce, cookie-consent, capability-providers) plus `stage-12.blocked.tsv`.

## Per row, decide the kind, then act
- A. Express-bound: rewrite the handler to the `{ app: Server }` contract exactly as `server-port.md` section 2 says (web Request -> Response, `ServerMiddleware` + `withServerMiddleware`, `readJsonBody`, errors by throwing, cookies via `headers.append`). The Express adapter stays in Tovu. Behaviour pins first: before rewriting, make sure a Tovu test pins status, body and headers of each route (write it if missing, run it green on the old code), then it must stay green on the new code.
- B. No package named: pick the home (an existing package and subpath; a new package is an owner decision: report it instead). One line of reasoning per row in the report.
- C. Package outside 06-11: if the package exists in `/Users/la/Programming/jini-terra-d1/packages`, move as in stages 06-11; if not (e.g. `server`, `commerce`, `cookie-consent`, `capability-providers`, `sandbox`), check the owner rules (no vendor code in core; commerce is future agent plugins; a new package is an owner decision) and report a recommendation instead of creating it.
- D. Needs a new subpath: add the export key to the package's `package.json` `exports` (dist + types, same shape as its neighbours) and its entry file; this is additive. Name it after what it does, not after the host.
- E. Visual (from stage 09): move it, then LOOK at the admin screen that renders it in the real running admin via Claude in Chrome (never a headless screenshot); the coordinator says which local site to use.
- Mechanics for every move (destination, tests to `__tests__` with node:test -> vitest, typecheck + build the package, changeset file, Tovu repoint and delete, `Jini-Base:` trailer): read and follow `development/refactor-patterns/move-to-jini/stage-06.terra-prompt.md` sections "Label check", "READY check", "Ports", "Jini half", "Tovu half".

## Ratchet gate (stage 04 has landed: every count must be 0; run before and after, paste both)
```
cd /Users/la/Programming/tovu-terra-d1
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --include-type --max-scc 0 --max-pairs 0
node development/refactor-patterns/move-to-jini/feature-cycles.mjs --app admin --include-type --max-scc 0 --max-pairs 0
```
Exit code 1 = you added a feature cycle. Find it with `--edges` and undo the import that made it (moved code must not import back up into a Tovu feature).

## Rules for every edit
- Keep every comment. A comment that explains WHY moves with the code it explains; never delete one to make a move fit. Do not add new comments except the doc comments this prompt asks for.
- No new `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!`, no lazy `await import()`.
- Do not change behaviour, error text, signatures or argument order unless this prompt says so. Functions keep the `(required, optional = {})` shape they have.
- Never `git add -A`, `git stash`, `git checkout -- <file>` or `git reset`. Other agents may share the tree.
- Run NO test suites and no repo-wide `tsc`. Allowed checks, one file at a time:
  - Tovu website/assistant/server test: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <one test file>`
  - Tovu admin test: `cd apps/admin && npx vitest run <one test file> --maxWorkers=2`
  - Jini test: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec vitest run <one test file> --maxWorkers=2`
  - Jini typecheck of a package you touched: `cd /Users/la/Programming/jini-terra-d1 && pnpm --filter @jini-ai/<pkg> exec tsc -p tsconfig.json --noEmit`
  - Lint: `npx eslint <changed files>` (no new errors).
  Single-file tests only. Leave nothing running; if a command hangs past 5 minutes, kill only the process you started.
- Commit with explicit paths: `git add -- <paths> && git commit -F msg -- <paths>` (one commit per repo per stage; message given below; end it with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). If `.git` is read-only in your sandbox, do not commit; list every changed path in the report instead. Never push.

Commit messages: Jini `feat(<pkgs>): server-contract and remaining moves from the host app (move-to-jini stage 12)`; Tovu `refactor(tovu): import stage-12 moves from Jini (move-to-jini stage 12)` + `Jini-Base:` trailer.

## Report (your final message)
1. Per row/edge: DONE, BLOCKED (with the exact blocking `file:line` and import), or SKIPPED (why). Use the row's path as the key.
2. The gate outputs (before/after).
3. Commits (sha + repo) or, if `.git` was read-only, the changed paths.
4. Anything surprising, in one line each. Do not paste diffs.
5. Per row: kind (A-E), decision in one line, DONE/BLOCKED. Owner decisions you need, as a short list.
