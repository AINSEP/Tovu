# deps-split — revision 2 (answer to `CODEX-JUDGE-1.md`, REJECT)

Run: 2026-11-18, plan-edit only (no product code). Every finding was re-checked on Tovu `f0613d9e` (`origin/refactor/import-cycle-b`) and on the lane refs fetched the same day; evidence is the command or file:line I ran or read, not the judge's text. Verdicts: **AGREE** (reproduced; changed), **PARTIAL** (part reproduced; the rest explained), **DISAGREE** (not reproduced). Where this file and `DESIGN.md` disagree, this file wins.

New artifacts: `work/gates.sh` (every gate, fail closed), `work/gates-selftest.txt` (18 planted/clean cases at `f0613d9e`, all as expected), `work/freeze-lanes.tsv` (lanes pinned by SHA), `work/freeze-at-f0613d9e.txt` (the real freeze check on the real lanes).

## Verified facts (the judge's "REPRODUCED" rows)

| judge row | my check | verdict | change |
|---|---|---|---|
| base + prerequisites; tip of `wave2/size02-step5` is `210ba2396`, `73d5d31a` ancestral | `git rev-parse --short origin/wave2/size02-step5` → `210ba239`; `git merge-base --is-ancestor 73d5d31a origin/wave2/size02-step5` → 0 | AGREE | DESIGN §3 row 5 and INDEX cite `210ba239` and say `73d5d31a` is an ancestor |
| size, ranges, declarations, dependency rows | not re-derived beyond spot checks (the judge reproduced all four TSVs) | AGREE | none |
| importers and loggers (68 files, 17 constructions) | `grep -rhE 'createConsoleLogger\(' --include='*.ts' --exclude='*.test.ts' --exclude-dir=__tests__ apps/website/src \| wc -l` → 17 in the `f0613d9e` worktree | AGREE | the 17 is now a captured base value (`base-outputs/loggers.count`), not a constant in a sheet |

## Wrong facts

| finding | evidence | verdict | change |
|---|---|---|---|
| 14 distinct written names from 15 writes; 5 forms writes, not 6 | `awk -F'\t' '$2=="write"{print $3}' work/literal-keys.tsv \| sort \| uniq -c` → 14 names, `siteShareBackend` ×2 (2862 failure path, 2909 success path); forms writes 2747, 2748, 2749, 2755, 2756 | AGREE | DESIGN §1.5 row `routeDeps`; S12 commit 2 says 5 |
| 260 AST entries include 7 spreads | the TSV's key column holds 7 `...` entries | AGREE | DESIGN §1.3 row L; S0 pin 1's snapshot is **observed at run time**, not derived from "260 + 15" |
| the four pinned post-boot awaits omit the conditional owner await at 1979 | `deps.ts:1979` is `  if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles(…)`; `composition-boot-order.unit.test.ts`'s regex `/^  (?:const [^=]+= )?await[^\n]*/gm` cannot match a line starting with `if` | AGREE | S0 pin 6 widens the regex and the expected list to 5; DESIGN R3; S10 keeps that await in the root (`expect-count S10-OWNER-AWAIT-IN-ROOT`) |
| freeze loop prints four branches and exits 0 | replayed the rev-1 loop against `f0613d9e`: `refactor/size-02-app`, `wave2/publish-p0-rest`, `wave3/desktop-d0c`, `wave3/moves-b1`; the loop ends in `echo`, so exit 0 | AGREE | blocker 2 below |

## Blocker 1 — STOP checks fail open

| finding | evidence | verdict | change |
|---|---|---|---|
| `\|\| echo` / `&& echo` turn findings into success | every rev-1 STOP block ended in `echo "STOP…"` (exit 0) | AGREE | every check is a `gates.sh` subcommand that exits non-zero with a `STOP-` line; sheet blocks start with `set -euo pipefail` and call `gates.sh forbid/expect-count/absent/…`; a grep exit >1 is `STOP-TOOL` (`selftest grep-tool-error`) |
| setup's `; cd` hides a Jini build failure | rev-1 COMMON §1 `pnpm --no-bail -r build; cd ../Tovu` | AGREE | `gates.sh setup` runs the Jini install+build in a subshell joined by `&&` and stops on its status (`pnpm --no-bail` still exits non-zero when a package failed); the Node download verifies SHA-256 instead of `curl \| grep \| head \| xargs` |
| `head`/`tail`/`wc`/`xargs`/sort in process substitutions drop upstream failures | rev-1 §5 `diff <(sort …) <(sort …) \| grep '^>'`, `\| xargs -r npx eslint … \|\| echo` | AGREE | `gates.sh` writes every tool's output and exit status to files first (`capture`), then compares files; no stage of a remaining pipeline can fail by truncation, and `pipefail` is on |
| the test command discards runner status; a crash without TAP failures passes | rev-1 `eval "$T …" > tap 2>&1` then grep `not ok` only | AGREE | `gates.sh tests` keeps the exit status: exit ∉ {0,1} → STOP; exit 1 with zero failed/cancelled → STOP; no `# duration_ms` summary → STOP (cut-short TAP); fewer `# tests` than base → STOP. Self-tested: `tests-crash`, `tests-silent`, `tests-cut`, `tests-fewer`, `tests-newfail` fire, `tests-known` passes |
| S3's extra test command propagates failure when run alone | correct (it was the one honest command) | AGREE | folded into `tests sr`, which runs every commit |
| S13's import check needs human reading and accepts `createApp` at 412 despite imports at 413-414 | `deps.ts:411-414` at `f0613d9e`: exporter, `./app.js`, `./site-app-boot-work.js`, `./settings-registration.js` | AGREE | `gates.sh imports` parses `deps.ts` with the TypeScript API and requires the last four runtime imports to be exactly those four in that order, and forbids `site-deps/` from importing any of them (values reach slices as inputs); runs every commit |
| no Tovu build in commit or handoff gates; `npm run build` refuses linked Jini | `package.json` `"build": "node development/scripts/check-no-linked-jini.mjs && npm run build:server"` | AGREE | `build:server` is a base output and a sheet-end gate (`gates.sh sheet-end`) |
| pin both setup refs | — | AGREE | `gates.sh refs-record` (S0) writes `TOVU_BASE`, `JINI`, `NODE`; `gates.sh refs` (every sheet and every commit) stops if the Tovu base is not an ancestor or `../Jini` is not at the pinned SHA |
| distinguish expected misses from tool errors | — | AGREE | `forbid`/`count` treat grep 1 as "no match", 0 as finding, ≥2 as `STOP-TOOL`; `absent`/`need` stop on missing inputs |
| plant failures for each gate class | rev-1 planted only two greps | AGREE | `gates.sh selftest` (stub tools, 18 cases incl. 4 freeze cases; transcript committed) + S0 step 3 real plants for tsc, boundaries, tests, limits, shape, imports order, loggers, why-comments |

## Blocker 2 — the freeze cannot enforce its scope

| finding | evidence | verdict | change |
|---|---|---|---|
| besides D0c the loop flags `refactor/size-02-app`, `wave2/publish-p0-rest`, `wave3/moves-b1` | diffs since each lane's merge-base: size-02-app = the `app.js`/`site-app-boot-work.js`/`settings-registration.js` import split, **already identical on the base**; publish-p0-rest = `deps.ts:1035` and `:2879` (live); moves-b1 = `deps.ts:197` (live) | AGREE (size-02-app is a false positive of the rev-1 method; the other two are live) | the freeze is a **merge-tree** check of the candidate commit: a lane is flagged only if merging it would change an exclusive path. On `f0613d9e` that flags exactly D0c, publish-p0-rest, moves-b1 (`work/freeze-at-f0613d9e.txt`); they are pinned by SHA with a merge-before sheet (S6, S4, S3) in `work/freeze-lanes.tsv` |
| INDEX misses D0c's `src/index.ts`, K-T-PO's `error-gate-debt.json`, `wave3/xpkg-c12obs-r12`'s edits of both S3 importer tests | `git diff --name-only $(git merge-base <lane> f0613d9e) <lane>`: D0c → `src/index.ts`, `deps.ts`, `error-gate-debt.json`; `kt-t-po` → `error-gate-debt.json`; `xpkg-c12obs-r12` → `composition/__tests__/deps-observability-wiring…`, `…deps-provider-plugin-boot…`, `app.ts` (+ others) | AGREE | INDEX overlap table lists them with tips; those files are in `SHARED`: a commit that **creates** a conflict with any lane on them stops |
| `site-deps/**` omitted | rev-1 §3 diffed only `deps.ts` | AGREE | `EXCLUSIVE` = `deps.ts`, `site-deps/**`, `composition/outbound-http.ts` |
| failed merge-base lookups skipped | rev-1 `mb=$(git merge-base …) \|\| continue` | AGREE | a failed merge-base or merge-tree is `STOP-FREEZE-NO-MERGE-BASE` / `STOP-FREEZE-TOOL` |
| sampled only at sheet entry | rev-1 COMMON §3 ran once per sheet | AGREE | `gates.sh commit` runs `freeze` on the candidate (`git write-tree` + `commit-tree` of the index) before **every** commit; proven on a staged edit of `deps.ts:2879` → `STOP-FREEZE-CONFLICT origin/wave2/publish-p0-rest` |
| S11 itself edits `app.ts` (5, 370) | `app.ts:5` imports and `:370` calls `composeMemoryOutboundHttp` | AGREE | S11 says so; `app.ts` is a shared file; INDEX lists "this plan, S11" as a row so size-02 rebases onto it |
| agree on lane SHAs and file ownership; enforce through H1 step 5 | — | AGREE | `freeze-lanes.tsv` = agreed SHAs (a moved tip is a STOP); ownership in INDEX; the freeze holds from S0 to the unfreeze after H1 step 5 |
| new finding from the real run (mine) | `refactor/desktop-args` (`size-debt.json`), `refactor/size-02-app` and `wave2/size02-step5` (`app.ts`) **already conflict with the base** | — | the gate reports those as NOTE (the lane's own rebase) and stops only on conflicts the candidate creates; recorded in INDEX |

## Blocker 3 — S0 and S13 cannot finish

| finding | evidence | verdict | change |
|---|---|---|---|
| `S0:21` calls `projectKeys.bindOAuth` before construction; it is an injected callback absent from `ProjectKeysPort` | `deps.ts:1844-1875`: `projectKeys` is built after `await providerPluginBoot` (1844) at 1859; `features/project-keys/service.ts:31` (`ProjectKeysPort`), `:55-68` (`bindOAuth` is a `createProjectKeys` input), `:84-97` (`use` calls it for a shared-OAuth row) | AGREE | S0 pin 3a characterizes at the binding seam: real `openProjectStore` (temp dirs, as `deps-project-credentials.integration.test.ts:27-49`) + the existing fake OAuth provider fixture `composition/__tests__/fixtures/acme-provider.ts`; `projectKeys.use` on a seeded shared-OAuth key reaches `sharedOAuth.bind` (base outcome recorded verbatim); mutation "delete the 2113 write" yields the exact domain error. The 1859-2113 window is unreachable from outside, so the getter contract is also a unit pin when S4 makes `compositionProjectKeys` a module function. If seeding needs a port the store lacks: `STOP-SEAM` naming it (no seam is added in S0) |
| the provider runtime lacks the proposed getter | `provider-plugins.ts:114-119` (`ProviderPluginRuntime`: `providerContributions`, `listProviderPlugins`, `loadProviderPlugins`) | AGREE | S0 pin 3b sits on `composePluginRuntime({ getPluginHost })` (`plugin-runtime.ts:34,75,87`; same inputs as `plugin-host.integration.test.ts:82`) |
| `S13:12-16` loses contextual typing (`runExportSite`, strict) | `deps.ts:2623` `runExportSite: (options, _optional = {}) => exportSite(options)`; `tsconfig.json` `"strict": true` | AGREE | each run returns `{ … } satisfies Partial<SiteRouteDeps>` (contextual types as today; precise inferred return); fallback `Pick<SiteRouteDeps, …>` annotation; `any` forbidden by a STOP |
| self-reads need getters | 9 `routeDeps` self-reads (TSV) | AGREE | `required.late.routeDeps()` inside the same arrow |
| the final census dereferences `.properties` on a call | `literal-keys.cjs:26,29` read `lit.properties` | AGREE | S13 commit 1 updates the script first and proves byte-identical output on the unmodified tree |
| `S13:15` mandates a size-debt update mode that `check-size-drift.ts` lacks | `check-size-drift.ts:145-166`: prints `Delete stale debt entry: …` and sets exit 1; no write mode | AGREE | COMMON §7: the crossing commit deletes **exactly** the entries the script names (node one-liner that fails unless it removes exactly one entry); `error-gate-debt.json` (identity file+rule, value = count, `check-error-gate.mjs:15`) gets an exact count transfer to the new file. Applies in whichever sheet crosses, not only S13 |

## Major — behaviour that must travel

| finding | evidence | verdict | change |
|---|---|---|---|
| S1-S3 carries (site-path callers, override pairing, provider identity, drain → registrations → sweeps → close) | `deps.ts:504-520, 686-721, 830-928` | AGREE | S1/S3 "Carries" tables, one pin per item (new `site-deps-overrides.unit.test.ts`; S0 pin 5 teardown; existing integration tests) |
| `S3:12` leaves positional APIs at 512/558/568/767 | `assertOverridesPairedOrAbsent(overrides?)`, `resolveThemesDirOverride(siteBinding, overrides?)`, `resolveSiteBindingOverride(overrides?)`, `resolveWorkspaceIdOverride(kernel, overrides?)` | AGREE | S3 commit 1 converts all four with every caller and the boot-order anchor text; `forbid S3-POSITIONAL` |
| `S2:9` points at test examples; the daemon's regexes are at 25-34 | `agent-daemon-import-graph.unit.test.ts:25-34` (`FORBIDDEN`), `:160-166` (examples) | AGREE | S2 edits both |
| preserve per-file AST parsing | `production-readiness-boot.integration.test.ts:140-175` (`compositionReferences(...files)` parses each file) | AGREE | S2 passes each file path separately, never concatenated text |
| S4-S8 carries (purge snapshots, shared trash Map, close hooks, buffered lifecycle, lazy media credentials, settings/comment chains, resolver fallback) | `deps.ts:962-1284, 1391-1693` | AGREE | S4-S8 "Carries" tables |
| S5's refreshed indices are invalid after S4 hoists declarations | S4 turns 9 hoisted closure functions into module functions → census rows disappear | AGREE | S5+ name every move by binding and anchor text (COMMON §2 lookup); no index in S5-S13 |
| `S5:18` pins `await warnOnOrphanedChatRows` where the root awaits its wrapper; misses the `storeBound` assertion | `deps.ts:1042` `await warnCompositionChatOrphans({}, {})`, `:1055` inner await; boot-order test line with `storeBoundServicesFor` | AGREE | S0 pin 6 pins the root's `await warnCompositionChatOrphans(` and the inner await separately; S5 keeps the root await and moves the wrapper as the original async callee; the `storeBound` assertion reads `deps.ts` + `site-deps/**` |
| S9-S12 carries (vault fence, provider disposal/revision watch, logger bindings, mail readiness, owner-only protection, OAuth loopback, host attach/drain, sharing/import, consent) | `deps.ts:1795-2133, 2715-2932` | AGREE | S9-S12 "Carries" tables |
| `DESIGN:212` awaits synchronous boot-data; S9/S10 add async return turns | rev-1 §2.2 `await composeBootDataStage(…)`; rev-1 S9/S10 async slices | AGREE | **DESIGN §2.2 rewritten**: the nine top-level awaits stay in `composeSiteRouteDeps` verbatim; every slice and stage is synchronous; a stage never spans an await. STOPs: `forbid …-ASYNC-SLICE` per sheet; `expect-count` of the root awaits (S5 4, S9 3, S10 1, S12 1) |
| `S11:20` counts the unrelated DNS policy | `domain-dns-adapters.ts:15` `DOMAIN_DNS_EGRESS_POLICY` also has `denyPrivateAddresses: true` | AGREE | S11 counts the guarded client's policy line in production composition files only |
| preserve fresh-client and OAuth-port assertions with interface fakes | `memory-deps/__tests__/outbound-http.test.ts:20-33` uses `mock.module("@jini-ai/platform/http/guarded")` | AGREE | the test moves with the owner; `mock.module` → an interface fake passed through the owner's new optional `createHttpClient` port; every assertion kept |
| S13 carries (evaluation/overwrite order, optional capabilities, late self-reads); a return type permits omitted optional keys; keep the runtime shape pin; move or wire backup/version and consent helpers | `routes/types.ts:1303-1304` (`siteShareBackend?`, `siteImportBackend?`); `deps.ts:571-604`, `:2955-2964` | AGREE | S13 "Carries"; S0 pin 1 kept through S13; helpers move into the run file that uses them (`forbid S13-HELPER-LEFT`) |

## Minor and over-engineering

| finding | evidence | verdict | change |
|---|---|---|---|
| `COMMON:61` excludes tests and non-composition changes despite `DESIGN:308` | rev-1 `git diff --name-only HEAD~1 -- composition \| grep -v __tests__` | AGREE | `gates.sh limits` checks every added or changed `.ts` file in the candidate, any path, tests included (added: zero findings; changed: nothing new, no size number up) |
| the standalone lint config checks cyclomatic complexity only | `work/limits.eslint.config.mjs` enforces `max-lines-per-function` 50, `complexity` 10 **and** `max-lines` 500; the repo's `check:complexity` also ratchets `sonarjs/cognitive-complexity` (`check-src-complexity-drift.ts:27`) | PARTIAL — all three owner limits are covered; cognitive complexity is not in the config | cognitive complexity stays under `check:complexity`'s no-new-line rule (COMMON §5 says so) |
| CI's why-comment gate uses `--merge-base` | `.github/workflows/ci.yml:252` `npm run check:why-comments -- --merge-base` | AGREE | `gates.sh why` runs `-- --merge-base --base <TOVU_BASE>` |
| use findings, not summary lines, as baseline evidence | — | AGREE | `gates.sh newlines` compares normalized **finding lines** (digits → N) plus exit status; a summary-count change alone is not a finding, a new path/rule/message is |
| `S11:11-15` client factory / one-call stages are over-engineering | `memory-deps/slices/outbound-http.ts:5-19` already builds both ports | AGREE | S11 moves `composeMemoryOutboundHttp` to `composition/outbound-http.ts` (renamed `composeOutboundHttp`) and calls it from both roots; no factory, and a stage file only where two adjacent sync calls exist |
| budget ceilings sum to 2.15M; execution cost unverified | — | AGREE (unverifiable here) | INDEX states ceilings (now ≈2.26M) are not measured costs; a sheet at ~90% commits green work and reports PARTIAL |

## Unverifiable (judge's list) — how revision 2 handles each

- **Runtime parity, full baseline builds/tests**: not run in this plan-only run. S0 captures them on the base with complete-TAP and exit-status checks, so a cut-short base run (the judge's note on the import-cycle report's 16 failures) is a `STOP-TAP-INCOMPLETE`, not a baseline.
- **Future lane activity**: enforced per commit by `gates.sh freeze` (moved tips stop the run).
- **Unpublished coordinator records**: the freeze announcement and any change to `freeze-lanes.tsv` are commits on the work branch.
