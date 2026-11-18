# deps-split — sheet index (revision 3; SEQUENCE H1 step 4 = "size 01", re-derived; unblocks H1 step 5 rest and error-system E3)

Design: `../DESIGN.md`; what changed and why: `../REVISION-3.md` (wins over DESIGN and REVISION-2). Shared contract: `COMMON.md`. There is **no gate script**: every check is a repository command in a plain fail-closed block (COMMON §5). Every sheet = COMMON + the sheet.
Design base: Tovu `b5fbf2a5` (`origin/refactor/terra`, 2026-11-18) + Jini `6c9effae` (Jini `origin/refactor/terra`). Execution base: the `origin/refactor/terra` tip S0 pins in `work/BASE`, which must contain `wave3/import-cycle-b-2` (S0 prerequisite). Work branch `refactor/deps-split`, single writer, continued by every sheet, never rebased. Run strictly in order, one sheet per session.

| sheet | responsibility | prerequisites | budget ceiling | commits | product files touched |
|---|---|---|---|---|---|
| S0 | pin base, base gate status, characterization pins | `wave3/import-cycle-b-2` merged into terra (command in S0); `refactor/deps-split` absent | 200k | 9-11 | tests only (+ `__fixtures__`) |
| S1 | delete the site-paths re-export; repoint importers by symbol | S0 | 70k | 2 | `deps.ts` (1 line), `src/index.ts`, 1 dev script, tests, 1 `.mjs` test |
| S2 | source readers learn `site-deps/` | S1 | 70k | 2 | `check-capability-inventory.ts`, 3 tests |
| S3 | overrides / open-store / provider-identity groups out; positional helpers → `(required, optional)` | S2 | 120k | 3 | `deps.ts` module helpers, 3 new files, tests |
| S4 | in-place function splits; hoisted closure functions get real inputs; public factory `_required = {}` | S3 | 160k | ≈11 | `deps.ts` + new unit tests |
| S5 | agent-plugin bootstrap, media storage, prelude tail (root keeps `kernel` and the 4 prelude awaits) | S4 | 130k | 3 | `deps.ts`, slices, `wiring-identity.test.ts`, 2 source readers |
| S6 | plugin runtime, identity/settings, boot chains | S5 | 120k | 3 | `deps.ts`, slices |
| S7 | events, redirects, trash (the adapter Map moves whole) | S6 | 160k | 6 | `deps.ts`, slices |
| S8 | database journal, content repos, core resolvers, comments | S7 | 110k | 4 | `deps.ts`, slices |
| S9 | keys and providers around 3 root awaits | S8 | 160k | 6 | `deps.ts`, slices |
| S10 | mail, HTTP clients, stores, themes, publish apply around the owner await | S9 | 150k | 6 | `deps.ts`, slices |
| S11 | connections; `composeMemoryOutboundHttp` → shared `composition/outbound-http.ts` | S10 | 120k | 4 | `deps.ts`, `app.ts` (import line 8, call line 282 on `b5fbf2a5`), memory-deps test moved |
| S12 | after assembly up to the last root await | S11 | 170k | 7 | `deps.ts`, slices, `serving-app-boot-wiring.unit.test.ts` |
| S13 | literal runs, root measured (stages only if needed), debt rows, E3 check | S12 | 230k | ≈22 | `deps.ts`, `route-deps/`, maybe `stages/`, debt JSONs (exact rows) |

Budget ceilings sum to **1,970k** tokens (`awk -F'|' '$5~/[0-9]+k/{gsub(/[ k]/,"",$5); s+=$5} END{print s "k"}' sheets/INDEX.md`); the largest is S13 at 230k. They are ceilings, not measured costs. A sheet near ~90% of its ceiling pushes what is green and reports PARTIAL with the next step. One Opus review after S4, S9 and S13 (diff with `--color-moved=zebra` + the S0 pins' mutation outputs).

## Freeze (H1 step 4) — one rule, enforced by the coordinator, detected by the sheets

From S0's first push until H1 step 5 has merged, no lane other than this plan merges a change to `apps/website/src/server/runtime/composition/deps.ts` or `…/composition/site-deps/**` into `refactor/terra`. Every sheet runs COMMON §2's check at its start and before every push: `git log <TOVU_BASE>..origin/refactor/terra -- deps.ts site-deps` must be empty and `TOVU_BASE` must still be an ancestor of terra; any hit is `STOP-FREEZE`. Nothing else is frozen; shared files (`app.ts`, `src/index.ts`, debt JSONs, tests) meet at the coordinator's integration merge, which re-runs COMMON §5 on the merged tree.

**Open lanes that change `deps.ts` relative to `b5fbf2a5`** (2026-11-18; `git diff --name-only $(git merge-base <lane> b5fbf2a5) <lane> -- …/deps.ts`, lanes already merged skipped). The coordinator decides each one **before S0**: merge it into terra (then it is in the base) or hold it until the unfreeze and have it rebase onto the split files. The sheets never merge a lane.

| lane (tip) | its `deps.ts` change | note |
|---|---|---|
| `wave3/import-cycle-b-2` (not yet pushed) | re-applies `refactor/import-cycle-b`'s Tovu half (`f0613d9e`: import repoints at 25-48, literal tail 2711-2713) | **S0 prerequisite: merged first** |
| `wave3/desktop-d0c` (`a7ebde506`) | `startupSecretEnvironment` import → `@tovu/host-shared/startup-secrets`; `node:fs`/`node:path` import trims | before S0, or rebase after the unfreeze (the import then lives in `site-deps/slices/identity-settings.ts`) |
| `wave3/moves-b1` (`b8a306376`) | `isInMemoryDbPath` import → `@jini-ai/db/data-modules` | before S0, or rebase onto `site-deps/open-store.ts` |
| `wave3/su-s5` (`53d469bd5`) | `outboxEventValues` import → `@jini-ai/db/events` | before S0, or rebase onto `site-deps/slices/events-origin.ts` |
| `fix/vendor-names-out-of-core` (`2dac2ef28`) | chart source import `./charts-recharts-source.js` → `./default-chart-provider-source.js` (judge 2's omitted lane); also `app.ts` | before S0, or rebase |
| `refactor/size-02-app` (`9224337d6`) | its `deps.ts` import split is already on the base; also `app.ts`, `memory-deps/slices/outbound-http.ts` (S11 moves that file) | coordinator retires or rebases it; `size02-step5` (its successor) is merged |
| `integ/ratchets-arch-2026-11-17` (`1a31cd7a2`) | an integration branch carrying import-cycle-b's `deps.ts` edits | not a lane to merge during the freeze |
| `refactor/import-cycle-b` (`f0613d9e5`) | superseded by `wave3/import-cycle-b-2` | never merged directly |
| `wave3/xpkg-c12obs-r12` (`d82438965`) | `app.ts` only (no `deps.ts`); also edits both S3 importer tests | shared files: integration merge |

`wave2/daemon-r8` (H1 step 3) does not touch `deps.ts` (S0 prerequisite re-checks it). Three refs (`integ/demo-fixes`, `integ/desktop-mem-1103`, `integ/merge-1029`) share no history with terra (`git merge-base` fails) and are not lanes.

## Base gate status (measured on the design base; S0 re-measures on its base)

`../work/base-gates-b5fbf2a5.txt` — Tovu `b5fbf2a5`, Jini `6c9effae`, Node v24.22.3, after COMMON §1 setup:

| command | exit | used how |
|---|---|---|
| `npm run typecheck`, `npm run typecheck:tests` | 0, 0 | plain gate |
| `npm run check:size`, `check:complexity`, `check:hooks` | 0, 0, 0 | plain gate |
| `npm run check:errors` | 0 — **WARN mode: exits 0 on a new finding** (planted, `../work/rev3-command-proofs.txt`) | gate as `check:errors -- --strict` (planted: exit 1) |
| `npm run check:inventory` | 0, prints `check:inventory — OK: all 25 …` — exits 0 on findings too | gate on the OK line |
| `npm run check:architecture` | **1** (base-red: 3 metrics regressed, 120 `NEW cross-feature edge` lines) | finding-line diff from sheet start (COMMON §4) |
| `npm run check:boundaries` | **15** (base-red: 15 errors, 88 warnings; none names `deps.ts`) | finding-line diff from sheet start (COMMON §4) |
| `npm run check:why-comments -- --base <parent>` | 0 | plain gate on the committed candidate (planted deletion: exit 1) |
| `npm run build:server` | 0 (26 s) | plain gate, every commit |

Setup facts found while measuring: `@tovu/sdk` and `@tovu/contracts` need `npm run build -w packages/contracts -w packages/sdk` after `npm ci` (else 12 typecheck errors); `npm run link:jini` needs `JINI_PACKAGES_DIR=…/Jini/packages` outside the owner's laptop path.

Limits actually enforced by those commands (planted, `../work/rev3-command-proofs.txt`): function **80** code lines (`check:size`: an 86-line function fails, a 56-line one passes), file 500, cyclomatic and cognitive complexity 10 (`check:complexity`), production code only (tests are outside `complexityScopes`, the repository's own policy). The owner's 50-line line is a **warn** level in `size-exceptions.json`; the sheets report it (COMMON §6) and S13 requires it for `site-deps/**` and the root.

## What H1 step 5 and E3 can start on

- **H1 step 5** on `b5fbf2a5`: `wave2/size02-step5` (`210ba2396`) is **merged** into terra (memory-root literal fragments under `memory-deps/route-deps/`); `createRouteDeps` is still in `app.ts:128`; `memory-route-deps.ts` is 10 lines; `app.ts` imports `composeMemoryOutboundHttp` at 8 and calls it at 282. What remains (size-02 steps 6-7: `createRouteDeps` → `memory-route-deps.ts`, shared outbound owner) starts after S13; it needs S11's `composition/outbound-http.ts`.
- **E3** starts after H1 step 5 merges (unfreeze). Ready check on the merged base (each line stops with its reason):
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs "$D/deps.ts" || { echo "E3-BLOCKED deps.ts over the repository size limits"; exit 1; }
grep -rn 'createConsoleLogger(' "$D/deps.ts" "$D/site-deps" > "${TMPDIR:-/tmp}/e3-loggers" || [ $? -eq 1 ]
test "$(wc -l < "${TMPDIR:-/tmp}/e3-loggers")" -eq 1 || { echo "E3-BLOCKED expected exactly one createConsoleLogger( in deps.ts + site-deps"; exit 1; }
grep -n 'export function createRouteDeps' "$D/app.ts" > "${TMPDIR:-/tmp}/e3-memroot" || [ $? -eq 1 ]
test "$(wc -l < "${TMPDIR:-/tmp}/e3-memroot")" -eq 0 || { echo "E3-BLOCKED memory root still in app.ts (H1 step 5)"; exit 1; }
git merge-base --is-ancestor origin/refactor/error-e0-e2 HEAD || { echo "E3-BLOCKED E2 not merged"; exit 1; }
```
On `b5fbf2a5` the first line stops (`deps.ts` 1,198-line closure, file over 500).
