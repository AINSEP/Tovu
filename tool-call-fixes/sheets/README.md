# Sheets: the one contract every executor follows (revision 3)

One sheet = one Sonnet run = one sheet branch per repo. Read the `../DESIGN.md` sections the sheet names first.
This file and the sheet are **one contract**. If they disagree, stop and report; do not pick one.

## 1. Setup (before reading source)

1. Checkouts side by side, named exactly `Jini` and `Tovu`. **Base = `integ/merge-final-2026-11-16`: Jini
   `65d73b0d`, Tovu `a28cb1bf`** (revision 3; it contains merge-a in both repos and has
   `packages/core/src/errors/reporter.ts`. The Tovu branch tip has moved past `a28cb1bf` with merge fixes; any commit
   that contains it is fine). Both lines must print `ok`; otherwise STOP:
   ```bash
   git -C Jini merge-base --is-ancestor 65d73b0d HEAD && echo ok
   git -C Tovu merge-base --is-ancestor a28cb1bf HEAD && echo ok
   ```
   Never start from `merge-b` alone (it lacks the reporter). Record both SHAs in the report.
2. Jini: `pnpm install && pnpm -r build`.
3. Tovu (only when the sheet has a Tovu part): `npm ci`, then link the local Jini build:
   `JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" npm run link:jini` and check
   `JINI_PACKAGES_DIR="$(cd ../Jini/packages && pwd)" npm run link:jini -- --dry-run` reports nothing left to do.
   Tovu's `package.json` pins `@jini-ai/*` to registry versions (`^0.7.0`); without the link Tovu does not see new Jini code.
   Never run `npm run build` while linked (`check-no-linked-jini` refuses, by design). Never edit Tovu's `@jini-ai/*`
   version ranges or the lockfile: that is the release step **REL** in `../INDEX.md` §3, not part of any sheet.
   After every Jini change that Tovu reads: `pnpm --filter @jini-ai/<pkg> build` again.
4. Drift check against the plan's base (generated table at merge-final, 49 files):
   ```bash
   tail -n +2 tool-call-fixes/sheets/BLOBS.tsv | while IFS=$'\t' read repo path blob sheets; do
     [ "$(git -C ../$repo rev-parse HEAD:$path 2>/dev/null)" = "$blob" ] || echo "DRIFT $repo $path ($sheets)"; done
   ```
   A `DRIFT` line for a file your sheet names means: re-run the sheet's inventory step and re-find every symbol with
   the sheet's `rg` lines. A symbol with **zero** hits is a STOP (§4.2).
5. Green baseline on the unmodified tree, recorded in the report with test counts:
   Jini `pnpm guard && pnpm typecheck && npm --prefix packages/<pkg> run test` for each package the sheet names.
   Tovu `npm run typecheck && npm run check:size && npm run check:complexity` and the named test files (use the exact
   runner line of the `test` script in `package.json`, with the file path in place of the glob).
   A red baseline is a STOP: report it; do not start.

## 2. Order inside every sheet

1. Inventory step (the sheet's `rg` lines). Paste the lists in the report.
2. Characterization test: passes on the unmodified tree, pins today's behaviour. Gate (§3), commit, push.
3. Red-first test: write it, run it, see it **fail for the reason the sheet names**, paste the failure in the report.
   Do **not** commit it alone.
4. Smallest change that makes it pass. If the characterization test pinned behaviour that now changes, change that
   assertion in the same commit. Gate (§3), commit test + change together, push.
5. Repeat 3 and 4 per numbered change. Every commit on the sheet branch passes the gate by itself.

Work that is not green yet is never lost and never on the sheet branch: push it to `wip/<sheet-id>` (same repo) as
often as you like. The sheet branch receives only gated commits. This is how "push every 5 to 10 minutes" and
"every commit green" both hold. `git pull --rebase` before each push. Never force-push.

## 3. The gate (run before every commit on the sheet branch)

```bash
# Jini
pnpm guard && pnpm typecheck && for p in <packages the sheet names>; do npm --prefix packages/$p run test || exit 1; done
# Tovu (linked)
npm run typecheck && npm run check:size && npm run check:complexity && <the sheet's test files>
# both repos: blocks 4.3 to 4.9, 4.15, 4.16 and 4.17 of §4 print nothing (except what §4 allows)
```

## 4. Stop and report instead of guessing. Each stop has the command that detects it.

`BASE` = the integration SHA you started from (§1.1). **Copy commands only from the fenced blocks below.** The table
names each rule and holds no commands: a `\|` written inside a markdown table cell is copied as a backslash plus a
pipe, which `rg`/`grep -E` read as a **literal** `|`, so an alternation silently matches nothing (Opus review).
Every block uses plain `|`. Run the blocks from the repo root before every push, in each repo the sheet touches, and
paste their output into the report.

| # | Stop when | Command |
|---|---|---|
| 4.1 | the gate fails and you cannot fix it inside the sheet's scope | §3 exits 0 |
| 4.2 | a cited symbol is gone or already changed | block 4.2 |
| 4.3 | a declared dependency is imported lazily | block 4.3 prints nothing |
| 4.4 | a test mocks a module instead of faking an interface | block 4.4 prints nothing |
| 4.5 | a lint or type escape is added | block 4.5 prints nothing |
| 4.6 | a barrel or re-export shell is added | block 4.6 prints nothing |
| 4.7 | UI code or a hook call is touched (no sheet here has UI). If a sheet ever needs a component: every custom hook (including `useT`, `useAdminLocale`) is a prop defaulted to the real hook with a fake-hook output test, and that is a STOP to ask first | block 4.7 prints nothing |
| 4.8 | a why-comment is lost | block 4.8: every printed line is in the report with its reason (the code it explained was deleted, or behaviour changed and the comment was rewritten). An unexplained line is a STOP |
| 4.9 | a new cross-package symbol has no public entry | block 4.9 for each new file another package imports: `exports["./<entry>"]` and `jini.entries["./<entry>"]` are in the **same commit** as the file |
| 4.10 | a **blocking** owner decision is open | block 4.10 prints nothing |
| 4.11 | a prerequisite sheet or lane has not landed | every `Landed check:` command in the sheet header prints at least one line (or exits 0 for a `test` line) |
| 4.12 | a security gate would move or run in a different order than `../DESIGN.md` M1 | the sheet's gate-order test passes, and removing each named gate in a scratch edit makes a named test fail (prove once, restore, paste the failures) |
| 4.13 | the red-first test passes without a change | step 2.3 output; report "already fixed", do not invent work |
| 4.14 | a measured fact contradicts the design | the sheet's measured value (for example `pinnedFit`) against the number the sheet states |
| 4.15 | a test is skipped, weakened or deleted, or coverage settings change | test counts per touched file before and after are in the report; a lower count needs a written reason; block 4.15 prints nothing |
| 4.16 | a new or edited function is over 50 lines, cyclomatic complexity over 10 or cognitive complexity over 10, or a file over 500 lines | block 4.16 prints nothing (a function that was already over and **shrank** may print: say so in the report) |
| 4.17 | an error is swallowed (empty catch or empty function body in source) | block 4.17 prints nothing, except a line the sheet names as allowed (S8's no-op tracker) |

Block 4.2 (each sheet's `rg -n "<symbol>" <path>` line, run as written; each prints at least one line):
```bash
# example from S1; run every symbol line of your sheet the same way
rg -n "GENERIC_ERROR_CODES" packages/protocol/src/errors.ts
```
Blocks 4.3 to 4.7 (each `rg` must print nothing):
```bash
d() { git diff "$BASE...HEAD" "$@"; }
d -- '*.ts' '*.tsx' | rg -n '^\+.*await import\(|^\+(.*[^.\w])?require\(|^\+.*loadOptionalPeer\('   # 4.3
d | rg -n '^\+.*(vi\.mock|vi\.doMock|jest\.mock|mock\.module)\('                                   # 4.4
d | rg -n '^\+.*(eslint-disable|biome-ignore|@ts-ignore|@ts-expect-error|@ts-nocheck|istanbul ignore|v8 ignore)'  # 4.5
d -- '*.ts' | rg -n '^\+\s*export (\*|\{[^}]*\}) from '                                            # 4.6
d --name-only | rg '\.tsx$'                                                                       # 4.7
```
Block 4.8 (prints the comment lines that vanished):
```bash
git diff "$BASE...HEAD" -U0 | rg '^-\s*(//|/?\*)' | sed -E 's/^-[[:space:]]*//' | sort -u > /tmp/c.del
git diff "$BASE...HEAD" -U0 | rg '^\+\s*(//|/?\*)' | sed -E 's/^\+[[:space:]]*//' | sort -u > /tmp/c.add
comm -23 /tmp/c.del /tmp/c.add
```
Block 4.9 (Jini, after `pnpm -r build`; the first command exits 0; the second prints nothing for a `universal` entry):
```bash
(cd packages/<consumer> && node --input-type=module -e "await import('@jini-ai/<pkg>/<entry>')")
rg -n "from 'node:|from \"node:" packages/<pkg>/src/<entry file>
```
Block 4.10. Each sheet header has one `Blocking decision:` line and may have one `Branching decision:` line. Only
blocking decisions stop a run. A branching decision names the branch to run **while it is `OPEN`** (always the
branch that changes less); the other branch's steps are skipped and listed in the report as "waiting for OD-n".
This keeps sheets that were designed to run without a decision (S6, S13, S14b, S16a, S17, S4b) from being stopped by
it (Opus review B3). Set `SHEET` to your sheet file; prints nothing when every blocking decision is `DECIDED`:
```bash
PLAN=<path of this tool-call-fixes folder>; SHEET=$PLAN/sheets/S1-unknown-tool-404.md
for od in $(sed -n 's/^Blocking decision: //p' "$SHEET" | rg -o 'OD-[0-9]+'); do
  rg "^\| $od( |\|)" "$PLAN/INDEX.md" | rg -q '\| DECIDED: (yes|no) \|$' || echo "STOP: $od is not DECIDED"
done
```
(`\|` here is meant: these patterns match the table's literal pipes. `OD-1( |\|)` does not match `OD-10`.)

Block 4.15 (prints nothing):
```bash
git diff "$BASE...HEAD" | rg -n '^\+.*\.(skip|only|todo)\('
```
Block 4.16, the 50 / 10 / 10 / 500 limits on every source file you created or changed, compared with the same file at
`BASE`, so it prints only findings that are new or changed. Same model as the cross-package plan's `COMMON.md` S8.
Both repos load `eslint-plugin-sonarjs` (Jini `eslint.config.mjs:45` for every file; Tovu `eslint.config.mjs:55`
for `*.ts`/`*.tsx` only, hence the file filter). eslint 10 has no line formatter, so findings come from the JSON
report. The repo ratchets fail only at 80 lines (Jini `scripts/check-size.mjs:15`), so they do not replace this block.
```bash
LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
FILES=$(git diff --name-only --diff-filter=AM "$BASE...HEAD" -- packages apps development | rg '\.(ts|tsx)$' | rg -v '(__tests__|__mocks__|/fixtures/|\.test\.|\.spec\.|\.typecheck\.|\.d\.ts$)')
msgs() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s||"[]"))for(const m of r.messages)console.log(`${m.ruleId} ${m.message}`)})' | sort; }
for f in $FILES; do
  npx eslint --no-inline-config --rule "$LIM" -f json "$f" | msgs > /tmp/lim-after
  { git show "$BASE:$f" 2>/dev/null || true; } | npx eslint --no-inline-config --rule "$LIM" -f json --stdin --stdin-filename "$f" | msgs > /tmp/lim-before
  comm -13 /tmp/lim-before /tmp/lim-after | sed "s|^|$f: |"
done
```
Block 4.17 (source only; prints nothing except a line the sheet names as allowed):
```bash
git diff "$BASE...HEAD" -- packages apps ':(glob,exclude)**/__tests__/**' ':(glob,exclude)**/*.test.*' \
  | rg -n '^\+.*(catch\s*(\(\w*\))?\s*\{\s*\}|\)\s*\{\s*\}|=>\s*\{\s*\})'
```

## 5. Owner rules (acceptance criteria in every sheet)

- Functions ≤ 50 lines, cyclomatic and cognitive complexity ≤ 10, files ≤ 500 lines, checked **inside each new or
  edited function** by block 4.16. A file
  already over 500 (for example `core/src/registration-kit.ts`, 593) gets a sibling file, never more lines.
- Exported functions take `(required, optional = {})`. Clock, ids, scheduler, fetch, logger and reporters come in as
  typed ports from the host; tests pass fakes of those interfaces.
- A Jini package imports only itself, `@jini-ai/core`, `@jini-ai/protocol`. No Tovu or vendor tool names and no web
  framework (Express) in new Jini code. Express middleware lives in Tovu.
- Errors: plain words, exact text asserted with `assert.equal` / `toBe`. Never a status or a code alone. Never mask a
  tool id, an input name or a slug the vocabulary rules allow. Never print a secret. Never swallow: every catch
  either answers the caller or reports through the injected reporter.
- Text from a server that was **not** written for the caller (HTML error pages, non-JSON bodies, exception text) is
  never shown to the model. Fixed words plus a recorded reference instead (`../DESIGN.md` M5).
- No silent behaviour change: every changed model-facing sentence is listed old → new in the report.
- No schema change, no delete of user data, no new CSS, no new i18n string is needed by any sheet. If one seems
  needed, stop.
- Tools first: nothing here adds a reason for an in-app agent to use Bash.

## 6. Report (end of run)

Branches and base SHAs (both repos), every pushed SHA, files changed, test counts before/after, each pasted red
failure, the §4.8 comment list, new Jini exports Tovu now consumes (for **REL**), changed sentences old → new,
anything not verified.
