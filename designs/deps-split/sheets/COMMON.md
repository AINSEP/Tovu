# deps-split sheets — COMMON (revision 2; read with your sheet — one contract: a sheet overrides COMMON only where it says "replaces COMMON §n")

Executor: Sonnet, unattended. Repo: Tovu (+ Jini attached, checked out as a sibling named exactly `Jini`). Work branch: `refactor/deps-split`, created once by S0 from the **latest** `origin/refactor/terra` that contains `origin/refactor/import-cycle-b`; later sheets continue it. Never force-push; `git pull --rebase` before every push; push after every commit. Never push `main` or `refactor/terra`. No subagents. DESIGN = `designs/deps-split/DESIGN.md`, revision notes = `designs/deps-split/REVISION-2.md` (both on `origin/plan/design-deps-split-2026-11-17`). S0 vendors `designs/deps-split/` into the work branch; every later sheet uses the vendored copy.

**All gates live in one script, `designs/deps-split/work/gates.sh`.** Every subcommand exits 0 only on a pass and prints `STOP-…` and exits non-zero on a finding **or on any tool error** (missing file, grep error, crashed runner, cut-short TAP, failed merge-base). A sheet never wraps a gate in `|| echo`, `&& echo`, `; cd`, `| head`/`tail`/`wc`/`xargs`/`sort`, or a process substitution: a gate's own exit status decides. A STOP means: stop the sheet, commit nothing more, write the report (§8) with the STOP line verbatim.

Every fenced block below starts with `set -euo pipefail` and is run as one `bash` invocation (paste into `bash -c '…'` or a script file); `export DS_SHEET=S<n>` first.

## §1 Setup (every sheet; idempotent)

```bash
set -euo pipefail
export DS_SHEET=S<n>                        # this sheet
bash designs/deps-split/work/gates.sh setup # Node 24 (sha256-checked), Jini install + build (fails on any failed package), npm ci, link-jini, link check (root + every app)
export PATH="$HOME/.local/node24/bin:$PATH"
bash designs/deps-split/work/gates.sh refs  # S1-S13: Tovu base is an ancestor of HEAD; ../Jini is at the SHA S0 pinned (work/base-outputs/refs.env)
```
If `setup` stops on the Jini build: that is a setup failure, not your breakage — report it (`STOP-SETUP-JINI-BUILD`) and stop. The Tovu build is `npm run build:server` (`npm run build` refuses a linked Jini by design: `check-no-linked-jini.mjs`); it is captured as a base output and compared at every sheet end (§5).

## §2 Facts re-check (lesson 43) — every sheet, before editing

```bash
set -euo pipefail
bash designs/deps-split/work/gates.sh facts   # regenerates the 4 censuses; each must equal the committed TSV byte for byte
```
The TSVs on the work branch are the ones the previous sheet committed as its last commit (§9 rule 8). A drift not explained by that sheet's commits = STOP.

**Anchors, not indices.** From S4 on, statement indices of `work/closure-census.tsv` shift (S4 turns hoisted closure functions into module functions). Sheets name every move by **binding** (the `declares` column) and **anchor text** (a verbatim substring of the first and last statement). Find the current lines with:
```bash
set -euo pipefail
awk -F'\t' -v b='<binding>' 'NR>2 && ("," $5 ",") ~ ("," b ",") {print $1, $2}' designs/deps-split/work/closure-census.tsv   # prints index + lines; empty output = the binding moved: STOP
```
(`awk` exits 0 with empty output when nothing matches — so the empty-output rule is read by you, and the sheet's own STOP block re-checks every moved binding with `gates.sh expect-count`.)

## §3 Freeze (SEQUENCE H1 step 4) — before EVERY commit, not only at sheet entry

`gates.sh freeze` (run by `gates.sh commit`) fetches every `origin/wave*`, `origin/refactor/*`, `origin/integ/*` lane, builds the candidate commit from the index, and for each lane not already merged:
- **exclusive paths** `composition/deps.ts`, `composition/site-deps/**`, `composition/outbound-http.ts` (S11): if merging the lane would change one, the lane must be listed in `work/freeze-lanes.tsv` **with its exact tip SHA** and the current sheet must be **before** the sheet that needs it merged; otherwise STOP. A lane whose tip moved since it was listed = STOP (re-agree with the coordinator).
- **shared files** (`app.ts`, `src/index.ts`, `size-debt.json`, `error-gate-debt.json`, `memory-deps/slices/outbound-http.ts`, `composition/__tests__/**`, the source-reader tests, `check-capability-inventory.ts`, the two dev scripts): a conflict that **this candidate creates** (absent when the lane is merged into the sheet base) = STOP. Conflicts a lane already has with the base are printed as NOTE (the lane's own rebase).
- a failed `merge-base` or `merge-tree` = STOP (no silent skip).

Listed lanes on 2026-11-18 (`work/freeze-lanes.tsv`; transcript at `f0613d9e`: `work/freeze-at-f0613d9e.txt`): `wave3/desktop-d0c` (deps.ts:4, merge before S6), `wave2/publish-p0-rest` (deps.ts:1035, 2879, merge before S4), `wave3/moves-b1` (deps.ts:197, merge before S3). INDEX §"Freeze" holds the full overlap table and who resolves what.

## §4 Base outputs (lesson 44) — S0 captures once on the unmodified base

```bash
set -euo pipefail
bash designs/deps-split/work/gates.sh refs-record    # work/base-outputs/refs.env: TOVU_BASE, JINI, NODE
bash designs/deps-split/work/gates.sh base-capture   # tsc ×2, build:server, check:{boundaries,architecture,size,complexity,errors,inventory}, loggers.count, tests-sr, tests-wide
```
S0 commits `work/base-outputs/` so every later session compares against the same files. Judging rule (in `gates.sh newlines`): exit status equal to the base's or 0, and **no normalized output line beyond the base** (digits → `N`, so moved line numbers and counts are not findings; a new path, rule or message is). A line a sheet expects (e.g. a debt row the sheet removes) is listed in `work/expected-new-lines.tsv` as `S<n><TAB><gate><TAB><normalized line>` in the same commit, with the reason in the report. Known base reds (import-cycle-b report): `check:boundaries` exit 15, `check:architecture` exit 1.

## §5 Gates

Per commit — stage everything, then gate, then commit:
```bash
set -euo pipefail
git add -A
bash designs/deps-split/work/gates.sh commit   # refs, freeze(candidate), tsc ×2, 6 check gates, why-comments --merge-base, limits, shape, loggers, imports, tests sr
git commit -m "<message>"
git pull --rebase && git push
```
What `commit` runs, so the sheet text never repeats it:
- **limits**: the owner limits config (`max-lines-per-function` 50, `complexity` 10, `max-lines` 500) on **every** `.ts` file the candidate adds or changes, tests included. Added files: zero findings. Changed files: no new (rule, message) and no size number above the same entry at `HEAD` (so `deps.ts` may only shrink). Cognitive complexity is covered by `check:complexity`'s ratchet (no new line).
- **why-comments**: `npm run check:why-comments -- --merge-base --base <TOVU_BASE>` (the CI form; a deleted why-comment with no matching addition stops).
- **shape**: under `site-deps/` no module `let`/`var`, no `export *`/`export {…} from`, no module `const` initialised by `new`/`create*`/`[`/`{`/`await`, no `createConsoleLogger`.
- **loggers**: production `createConsoleLogger(` lines in `apps/website/src` equal the base count (17 at `f0613d9e`).
- **imports** (DESIGN R5): the last four runtime imports of `deps.ts` are, in order, `#src/features/site-export/index`, `./app.js`, `./site-app-boot-work.js`, `./settings-registration.js`; nothing under `site-deps/` imports those four, `app.ts` or `deps.ts`. Their values reach slices as `required.*` inputs.
- **tests sr**: every source reader of the moved code + `composition/__tests__/*.test.ts` + `memory-deps/__tests__/*.test.ts` (list in `gates.sh` `SR_FILES`). The runner's exit status is kept: exit ∉ {0,1}, or exit 1 with zero failing/cancelled tests, or a TAP without its final summary = STOP; a failing name not in the base list = STOP; fewer tests than the base = STOP.

Sheet end (after the last product commit, before the TSV refresh commit):
```bash
set -euo pipefail
bash designs/deps-split/work/gates.sh sheet-end   # build:server vs base, tests wide (server unit + integration + routes) vs base, facts
```
Postgres-only tests are skipped by the runner on this host; their names are in the base failing list and stay there (R12). Record "not run" for `create-site-route-deps.postgres.test.ts`.

## §6 Planted failures (lesson 40) — S0 proves every gate can fail

`gates.sh selftest` plants a failure per gate class with stub tools (new output line, silent crash, new failing test, runner crash with no failure, cut-short TAP, fewer tests, module `let`, module cell, grep tool error, unlisted lane, listed lane at its sheet, moved lane tip) and exits non-zero unless **every** plant fired with a `STOP-` line and every clean case passed. Its transcript at `f0613d9e` is `work/gates-selftest.txt`. S0 then runs the **real** plants (S0 step 3) after setup. Re-run `selftest` whenever `gates.sh` changes.

## §7 Moving code

- Move statements **verbatim with the comment lines directly above them** (`git diff --color-moved=zebra` must show the block as moved); only identifiers that become `required.x` or getter calls change.
- A moved function takes `(required, optional = {})` (owner rule). A positional helper that moves is converted **in the same commit**, with every caller and every source-reading anchor of its call text (S3 lists them).
- Getters for late reads are named after the binding (`settingsRepo: () => settingsRepo`) and are read **only when called** — never at slice entry, never at module scope.
- **Awaits stay at their original boundaries.** No new `async` function wraps an original `await`, and no synchronous block becomes async. Every top-level `await` of today's closure stays a top-level statement of `composeSiteRouteDeps`, verbatim except for identifiers renamed by the move (DESIGN §2.2 lists the nine). Slices and stages are **synchronous**; the root calls them between its awaits. This keeps the number of microtask turns between every pair of statements identical to today.
- One commit = one slice (or one helper group), with every importer and every source-reading test anchor it moves repointed in the **same** commit (no assertion deleted; a moved anchor is asserted in its new file; an order between anchors in different files is asserted as the order of the calls in the root).
- **Carries.** Each sheet lists the behaviour that must travel with each move and the pin that fails if it does not. A move whose pin is not green on the commit = STOP.
- **Debt files** (never by hand-edited value, never re-keyed silently):
  - `size-debt.json`: when `check:size` prints `Delete stale debt entry: <entry>` for a `composition/deps.ts` row this sheet shrank below the limit, delete **exactly that entry** in the same commit (`node -e` below) and name it in the report. Any other `Delete stale…`/`New violation`/`Worsened` line = STOP.
  - `error-gate-debt.json` (identity = file + rule, value = count): when a counted finding moves (`check:errors` then shows the old row improved and a new file added), transfer **exactly the moved count** in the same commit: decrement (or delete at 0) the `deps.ts` row, add `{file: <new file>, rule, value: <moved count>}`. Total count unchanged. Any other change = STOP.
```bash
set -euo pipefail
# delete one debt entry by exact file + rule (+ name for size rows); fails if it does not remove exactly one entry
node -e '
  const fs = require("fs"); const [f, file, rule, name] = process.argv.slice(1);
  const rows = JSON.parse(fs.readFileSync(f, "utf8"));
  const keep = rows.filter((r) => !(r.file === file && r.rule === rule && (name === undefined || r.name === name)));
  if (rows.length - keep.length !== 1) { console.error("STOP-DEBT-EDIT removed " + (rows.length - keep.length)); process.exit(1); }
  fs.writeFileSync(f, JSON.stringify(keep, null, 2) + "\n");' development/scripts/size-debt.json "<file>" "<rule>" "<name>"
```
(Check the field names against the row first: `grep -n -A4 '<file>' development/scripts/size-debt.json`.)

## §8 Report (last commit of each sheet): `cloud-results/deps-split-<sheet>.md`

Commits (SHA + one line each), gates table (subcommand → result vs base), test counts before/after (`tests-sr`, `tests-wide`), carries table with each pin's name and its red-once evidence, deviations, the exact next step. Push and print the SHAs. On a STOP: the STOP line verbatim, the last green commit, the next step.

## §9 Stage extraction rules (S5-S12; S13 replaces rule 2 at its root commit)

1. Top-down, in DESIGN §1.3 order. Inside a sheet: one slice per commit (statements verbatim into `site-deps/slices/<slice>.ts`, called from the closure at the same position), then one commit that groups the sheet's consecutive synchronous slice calls into `site-deps/stages/<stage>.ts` **only between two root awaits** (a stage never spans an await; DESIGN §2.2 lists the segments).
2. The closure keeps today's local names: the extracted block becomes `const { a, b, … } = composeX(required, optional)` — **never `await`ed** (slices are synchronous). The destructured names are exactly the block's names that a later statement reads (census eager or deferred column, located by binding). Later code does not change.
3. A read of a binding declared **later** (census "forward(late)") is passed as a getter at the call site: `{ settingsRepo: () => settingsRepo }`.
4. Root cells (`pendingLifecycleEvents`, `lifecycleTracker`, `routeDepsBuiltForPluginHost`, `formCollectionProviders`, `bindSharedApiOAuth`, `resolveRouteDeps`/`routeDepsBuilt`) stay in the closure; slices receive getters; every write stays in the closure at its position (DESIGN §2.3).
5. A slice that logs receives `required.logger`; the closure passes `logger: consoleLogger`. No slice imports `createConsoleLogger`.
6. A single-user module helper (DESIGN §1.3 table) moves into its user's slice file in the same commit.
7. Source-reading anchors move with their code (§7). `composition-boot-order.unit.test.ts`'s top-level-await list keeps reading `composeSiteRouteDeps` (the awaits stay there); its "no `db` identifier" / "no `sqliteDb`" / `storeBound` assertions read `deps.ts` **and** every file under `site-deps/` from S5 on.
8. Last commit of the sheet: refresh the four `work/*.tsv` with the census scripts (S13 first updates `literal-keys.cjs`, see S13).
