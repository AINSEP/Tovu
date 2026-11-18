# deps-split — revision 3 (answer to `CODEX-JUDGE-2.md`, REJECT)

Run: 2026-11-18, plan-edit only (no product code). Facts re-derived on Tovu **`b5fbf2a5`** (`origin/refactor/terra`) with Jini **`6c9effae`** (Jini `origin/refactor/terra`), Node v24.22.3, after a real setup (npm ci, Jini install + build, link). Evidence is the command I ran, not the judge's text. Verdicts: **AGREE** (reproduced; changed), **PARTIAL** (part reproduced; the rest explained), **DISAGREE** (not reproduced, or the proposed fix conflicts with an owner/coordinator rule). This file wins over `DESIGN.md` and `REVISION-2.md` where they differ.

## Why revision 3 is a redesign, not a third patch

Judges 1 and 2 both found the same class of defect: the bespoke gate machinery (`gates.sh`, byte-equal TSV snapshots at sheet end, stub self-tests, the merge-tree freeze scanner) failed open or judged stale evidence. Owner rule: two fix rounds with the same class of finding means the design is questioned. Coordinator decision, applied here:

1. **Deleted**: `work/gates.sh`, `work/gates-selftest.txt`, `work/freeze-lanes.tsv`, `work/freeze-at-f0613d9e.txt`, `work/limits.eslint.config.mjs`, `work/limits-base.txt`.
2. **Gates = the repository's own commands**, one fail-closed block per commit (COMMON §5): `typecheck`, `typecheck:tests`, the test runner on `SR_TESTS` + `SHEET_TESTS` + the commit's changed tests, `check:size`, `check:complexity`, `check:errors -- --strict`, `check:hooks`, `check:architecture` and `check:boundaries` (both base-red: finding-line `diff` against a file recorded at sheet start, fails on any new line), `check:inventory` (OK line), `build:server`, `check:why-comments -- --base <pinned parent>`, the freeze check, then a non-forced push.
3. **Behaviour pins are ordinary characterization tests** in S0 (no TSV comparisons; pin 1's JSON fixture is the test's own observed snapshot).
4. **Freeze = one coordinator rule**: no lane merges a change to `deps.ts` or `site-deps/**` into terra while the split runs; every sheet start and every push runs `git log <TOVU_BASE>..origin/refactor/terra -- <those paths>` and STOPs on any hit (COMMON §2).
5. The census TSVs are evidence at `b5fbf2a5` and lookup aids regenerated into scratch; nothing compares against them.

Every command in the new blocks was run for real (`work/base-gates-b5fbf2a5.txt`, `work/rev3-command-proofs.txt`); all 38 fenced bash blocks pass `bash -n`.

### Where I deviated from the coordinator's wording, and why (evidence)

| coordinator wording | what the sheets do | evidence |
|---|---|---|
| `check:architecture` compared "via a plain diff that fails on any new line" | plain `diff` + `awk` on the **finding lines** only (`  NEW …`, `    + …` cycle pairs, the composition back-edge line, `FAILED: N metric(s)`) | the full output has file-count lines (`check:architecture — 2232 files`, `bidirectional hub count 16.40% (366/2232)`); every added slice file changes them, so a whole-output diff would STOP every slice commit with no new finding |
| `npm run check:errors` | `npm run check:errors -- --strict` | the plain form is WARN mode: a planted swallowed `catch` printed `New: [catch-reads-error] …` and **exited 0**; `--strict` exited 1 (`work/rev3-command-proofs.txt`) |
| (not listed) | `check:boundaries` handled like `check:architecture`; `check:inventory` by its OK line; `build:server` per commit | boundaries exits 15 on the base (no line names `deps.ts`); inventory exits 0 on findings by design (`check-capability-inventory.ts:42-47`); judge 2 asked for the build at the commit boundary (26 s) |
| `check:size` / `check:complexity` as the limits | yes — and the docs now say what they enforce | planted: a new 86-line function fails `check:size`, a **56-line one passes** (repo policy: warn 50, error 80, `size-exceptions.json`); complexity 12 fails `check:complexity`. The owner's 50 line is reported per sheet and required in S13's STOP via the repo's size config + `--rule` (COMMON §6) |
| `--base <pinned parent SHA>` | `P = origin/refactor/deps-split` (the last pushed, gated commit), fetched before the commit | covers a fix commit made after a failed block; planted: a committed why-comment deletion with `--base <parent>` exits 1 |

## Judge 2's checked claims

| claim | my check on `b5fbf2a5` | verdict | change |
|---|---|---|---|
| base and prerequisites reproduced on `ada11733`/`f0613d9e` | the coordinator moved the base: terra is now `b5fbf2a5` (242 commits past `ada11733`); `git merge-base --is-ancestor origin/refactor/import-cycle-b b5fbf2a5` → 1; `wave2/publish-p0-rest` and `wave2/size02-step5` (`210ba2396`) are ancestors; `refactor/error-e0-e2` ancestor (0) | AGREE (facts moved) | DESIGN header + §3 rewritten for `b5fbf2a5`; S0 prerequisite = `wave3/import-cycle-b-2` merged into terra |
| counts reproduced | censuses re-run on `b5fbf2a5`: 3,036 lines; 305 imports (last ends 411); 215 statements in `composeSiteRouteDeps` 951-2934; literal 2131-2714 with **258** entries (252 keys + **6** spreads — `...bindCredentialsHostPorts` and `staticSitePackager` are gone, `staticSiteContext` is inline); 68 importer files, 171 text mentions; eslint 1,910 / 1,198 / 68 code lines; 17 production loggers | AGREE | `work/*.tsv` regenerated; every DESIGN/sheet line number re-derived with the exact `git diff -U0 f0613d9e b5fbf2a5` hunk map (two mapper slips — `10 * 60 * 1000` and comma-followed numbers — found and fixed by review) |
| "WRONG: five forms writes, 15 writes to 14 keys" | `awk -F'\t' '$2=="write"' work/literal-keys.tsv` → 15 rows, 14 names; forms writes 2747, 2748, 2749, 2755, 2756; DESIGN §1.3 row I2 still said "6 writes" | AGREE | I2 row: `formSubmissions` + 5 writes |
| budget sums to 2,160k, largest 240k | — | AGREE | ceilings re-set and summed by the command in INDEX: **1,970k**, largest S13 230k |
| gate and freeze proofs wrong as a fail-closed guarantee | — | AGREE | machinery deleted (above); the new blocks' proofs are real-tree plants |

## Blockers

| # | finding | evidence | verdict | change |
|---|---|---|---|---|
| 1a | S0 requires import-cycle-b ancestral to terra → deterministic STOP | `git merge-base --is-ancestor origin/refactor/import-cycle-b origin/refactor/terra` → 1 (still, on `b5fbf2a5`) | AGREE with the finding; DISAGREE with the fix "pin and branch from `f0613d9e`" | coordinator decision: a separate run re-applies the Tovu half as `wave3/import-cycle-b-2`; S0's first block STOPs unless `git merge-base --is-ancestor origin/wave3/import-cycle-b-2 origin/refactor/terra` (or the coordinator-supplied `IC_B2` SHA) exits 0. Branching from a lane tip would base the split on unmerged work |
| 1b | S4 forbids `_required: Record<string, never>` on the retained public factory (`deps.ts:830-832`) that DESIGN keeps | `deps.ts:827-829` on `b5fbf2a5`: `createSiteRouteDeps(_required: Record<string, never> = {}, …)` | AGREE with the contradiction; PARTIAL on the fix | owner rule: retained public factory args keep `= {}` and never `Record<string, never>` → S4 commit 11 changes it to `_required = {}` (callers unchanged); the placeholder check then covers every `_required:` parameter in `deps.ts`, so it is consistent; the `optional?: Record<string, never>` callback types (492, 686, 853, 952, 3007) are named out of scope. S11 does the same for `composeMemoryOutboundHttp` → `composeOutboundHttp` |
| 2a | sheet-end gate compares stale TSVs; S1's re-export deletion already fails | rev-2 `COMMON:71-74` + `gates.sh` byte equality | AGREE | no TSV is a gate any more (COMMON §3): lookups regenerate the census into scratch; S0 reports the diff of its base vs the design TSVs and STOPs only if an anchor the sheets use is missing (17 anchors, each must match once — run on `b5fbf2a5`: all match) |
| 2b | debt command uses `rows.filter`; the file stores `.violations` and names the field `function` | `size-debt.json:1-3` (`"violations": [`), `:1230-1242` (`"function": "<file>"`, `"composeSiteRouteDeps#1"`) | AGREE | the node one-liner is gone; COMMON §5 names the real shape; `check:size` and `check:errors -- --strict` in the same block prove the edit (a wrong deletion is a "New violation") |
| 3a | why-comments ran before commit but diffs committed `HEAD`; the plant proved a different path | `check-why-comments.mjs:60-61,77-82` (default head `HEAD`) | AGREE | COMMON §5 commits locally first, then runs `check:why-comments -- --base "$P"`; planted through that path (committed deletion → exit 1) |
| 3b | `gates.sh:89` masks a failed lookup; `:208-209` discards baseline statuses | rev-2 script | AGREE | script deleted. Base-red checks: exit status checked to the known value (`|| [ $? -eq 1 ]` for architecture) or recorded, completeness by a summary sentinel (`^check:architecture — (FAILED|OK)`, `dependencies cruised`), findings by line diff; missing path / `diff` trouble stop (planted) |
| 3c | S2 accepts inventory findings because the tool exits 0 | `check-capability-inventory.ts:42-47` | AGREE | S2 and every commit judge `check:inventory` by its `check:inventory — OK` line (OK on `b5fbf2a5`: 25 entries); S2's red-first proof reads the output |
| 4a | gate, then rebase, then push an unchecked result | rev-2 `COMMON:55-61` | AGREE | single-writer work branch; never rebased; push is non-forced and a rejection is `STOP-BRANCH-MOVED`; a failed block pushes to `refactor/deps-split-stop-S<n>` instead |
| 4b | checks end at S13 but the freeze runs through H1 step 5 | `SEQUENCE:19-20,103` | AGREE | the rule is the coordinator's from S0's first push to the merge of H1 step 5; sheets detect breaches at start and before every push |
| 4c | the scanner omits `wave1`, `fix/*`; `fix/vendor-names-out-of-core` edits the chart import | `git diff $(git merge-base b5fbf2a5 origin/fix/vendor-names-out-of-core) …` → `./charts-recharts-source.js` → `./default-chart-provider-source.js` | AGREE | the check now reads **terra's own history**, so any lane name is covered; INDEX lists the lanes that change `deps.ts` relative to `b5fbf2a5` (import-cycle-b-2, desktop-d0c, moves-b1, su-s5, fix/vendor-names-out-of-core, size-02-app, the integ branch) for a decision **before S0**; no lane merges mid-run, so no sheet has a "merge before" prerequisite any more |
| 4d | `refactor/size-02-app` edits S12's `serving-app-boot-wiring` test and S11's moved test | judge's diff | AGREE (not frozen by design) | those are shared files, not frozen; they meet at the coordinator's integration merge, which re-runs COMMON §5 on the merged tree; INDEX says so |

## Major

| finding | evidence | verdict | change |
|---|---|---|---|
| pins 3b/3c (S0) and S6 demand behaviour the seams cannot show: Jini decides per SDK build; the fixture changes metadata on a bound host | `@jini-ai/plugins` `runtime-core.js:279-281` (`buildSdk`: `const host = optional.lookup?.(); … ...(host ? { plugins } : {})`); `plugin-host.integration.test.ts:79-93` | AGREE | pin 3b = two fresh activations on one runtime (`lookup-probe-a` while the cell is undefined → no `sdk.plugins`; set the cell; `lookup-probe-b` → `['findProviders','getPlugin']`); mutation: capture the host at construction. S6's unit test only proves the slice passes the getter itself |
| 3c: swapping tracker assignment and flush cannot turn a behaviour test red (the flush passes `tracker` explicitly) | `deps.ts:1884-1885` on `b5fbf2a5` | AGREE | behaviour = an event emitted after boot through the lifecycle owner (`productTracker: () => lifecycleTracker`, 977) reaches the recording tracker; mutation: delete the swap. The swap-vs-flush order stays a source-order assertion |
| S5 groups calls on both sides of `store.content`; keep the stage boundary there | `deps.ts:989` `const kernel = store.content;` after theme seeding (961-986) | AGREE | no foundation stage: the root calls `composeAgentPluginBootstrap`, keeps `const kernel = store.content;` and `const storeBound = …`, calls `composeMediaStorage`; S5 STOP + a boot-order assertion pin the order |
| COMMON broadened the body-only SQLite check to all `site-deps` files (incl. `open-store.ts`, which uses `db`) | `deps.ts:694` (`openSiteStore({ …, db: overrides… })`) | AGREE | COMMON §9 rule 7: the check reads each extracted slice function's body |
| coverage: CI hook rule, per-commit build missing | `ci.yml:242` `check:hooks` | AGREE | both in the per-commit block |
| cognitive ratchet excludes tests | `complexity-eslint.config.mjs:20-27` | DISAGREE as a blocker | that exclusion is the repository's own policy (tests are outside `complexityScopes` for `check:size` too); the coordinator's rule is "repository commands only", so no bespoke test-complexity gate is added. The new tests still go through `typecheck:tests` and run every commit |
| `S8:17` calls a feature test "wide" that no set includes | rev-2 sheets | AGREE | there is no "wide" set; every sheet prints `SHEET_TESTS` with paths verified by `git ls-files` on `b5fbf2a5` (e.g. `features/widgets/__tests__/unit/create-core-resolvers.unit.test.ts`); S0 runs every sheet's array on the base (`STOP-BASE-RED-TEST`); a sheet re-runs its own at sheet start |
| `S4:30-34` accepts ESLint exit 1 and ignores fatal JSON diagnostics | rev-2 S4 | AGREE (moot) | the bespoke ESLint step is gone; `check:size` throws on a fatal message (`check-size-drift.ts:33`) |

## Minor

| finding | evidence | verdict | change |
|---|---|---|---|
| S7 promises registration teardown order; registrations run concurrently | `deps.ts:698-703` `stopStoreUsers`: drains → `Promise.all(registrations…)` (701) → sweeps (702) → close | AGREE | S0 pin 5 and S7 pin placement + barriers only (drain → all registrations → sweeps → close), no order among registrations; rev 2's `705` citation was the sweeps line |
| S12 specifies two error logs; base has one `info` and one `error` | `deps.ts:2726` `consoleLogger.info`, `:2730` `consoleLogger.error` | AGREE | S12 commit 1 keeps both levels and texts |

## Over-engineering

| finding | verdict | change |
|---|---|---|
| S4 splits the 43-line adapter Map before moving it | AGREE | not split; S7 moves it whole (one `Map` instance kept); split only if `check:size` fails the slice function |
| `composeEarlyStages` over five named stage calls | AGREE | no stage files before S13; the root calls slices directly; S13 measures the root and groups adjacent slice calls only until it is ≤50, never a stage of stages, never across a root statement or await |

## Judge 1's carries lists — kept

Every carry row of revision 2 survives as a row with a named test in its sheet: S1 (site-path callers), S3 (override pairing, provider identity, prelude order, drain → registrations → sweeps → close), S4 (purge snapshots, OAuth binding, boot origin, site sharing, chat orphans), S5 (buffered lifecycle, lifecycle owner, lazy media credentials, `storeBound`, prelude awaits, backfill logging), S6 (plugin host optional, deferred content types, settings chain, boot chains, admin reset), S7 (snapshots, shared trash Map — moved here from S4 with the Map, `trash` onError text, close hooks, boot origin, user removal precedence), S8 (resolver fallback, widget registry once, journal close, comment chain), S9 (vault fence, five post-boot awaits, provider disposal, revision watch, OAuth binding, logger bindings, trace reader once, lifecycle flush), S10 (mail readiness, owner-only protection, one trash Map, publish apply), S11 (one egress policy, OAuth loopback, shared OAuth write, admin-surface warning, consent readiness, memory root), S12 (host attach → cell write → runtime attach, boot drain, media credentials last, boot-work module identity, sharing, forms, commerce close, consent + analytics), S13 (key/evaluation/overwrite order, optional capabilities, late self-reads — 8 on `b5fbf2a5`, helpers moved, module evaluation order, one logger). "(wide)" references were replaced by real paths.

## New facts found while re-deriving on `b5fbf2a5`

- Setup: `npm ci` leaves `@tovu/sdk`/`@tovu/contracts` without `dist` (12 typecheck errors) → `npm run build -w packages/contracts -w packages/sdk`; `npm run link:jini` defaults to the owner's laptop path → `JINI_PACKAGES_DIR=…/Jini/packages`. Both are in COMMON §1.
- With that setup the base is green on typecheck ×2, size, complexity, errors (warn and strict), hooks, inventory, why-comments, build:server; base-red: architecture (exit 1: 3 metrics, 120 new cross-feature edges vs its baseline) and boundaries (exit 15).
- H1 step 5 moved: `wave2/size02-step5` is merged; `app.ts` is 374 lines, `createRouteDeps` at 128, the outbound owner imported at 8 and called at 282 (S11 updated).
- `check:errors` reports "13 entries improved or are gone" on the base (debt could shrink; not this plan's business).

## Unverifiable here

Runtime parity and the full test suite on the execution base (S0 measures both after `wave3/import-cycle-b-2` merges); whether that branch restores `bindCredentialsHostPorts`/`staticSitePackager` (S0 pin 1 observes the base either way); future lane activity (detected per push by the freeze check, owned by the coordinator).
