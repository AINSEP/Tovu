# lo-si-ml — SI-1b and ML-1b done; SI-2, ML-2p, ML-2 not done

Branch `wave2/lo-si-ml` in Tovu and in Jini. Base: `origin/refactor/terra` (Tovu 232764af5, Jini 65d73b0d5). Plan: `plan/left-out-areas-2026-11-16` (`INDEX.md`, `COMMON-LO.md`, `sheets/DC-SI-ML-small-areas.md`). Decisions LO-SI1 and LO-ML1 = Rec (approved). No HELD ID touches these sheets.

## Status per sheet
| sheet | status |
|---|---|
| SI-1b (M2 seam, M3 Jini, M4 repoint) | DONE |
| ML-1b (M2a, M2b, M3 Jini, M4) | DONE |
| SI-2 (`page-body.ts` -> diagnostics, adds `parse5`) | NOT DONE: blocked by the pnpm trap (below) |
| ML-2p (`kysely` optional peer of platform) | NOT DONE: same trap |
| ML-2 (mail SQL repos) | ON HOLD in the sheet itself (Lane S template is on HOLD; the delete-vs-tombstone question is open); also needs ML-2p |

## Commits (all pushed to `origin/wave2/lo-si-ml`)
Jini (first, as COMMON-LO says):
- `8569ff4075e4fb5a8c71084fbb8e70d9e7d97bfb` SI-1b M3: `diagnostics/src/web-evidence/{path-guard,bounded-body,cookie-shapes}.ts` + 3 test files + changeset (minor) + API.md line + api baseline (diagnostics only).
- `893858294ba29013d8ae8cff9a195fbd5bf04467` ML-1b M3: `platform/src/mail/activity/{vocabulary,ports,activity,suppressions}.ts`, leaf exports from `./mail`, 4 test files, changeset (minor), api baseline.
- `600b9006a45dd65a2c074a1c5d7bc8448e0a4d8c` follow-up: the M3 `api:update` had also swept two foreign subpaths (`./runtime-ports/fs`, `./runtime-ports/process`) into `api-baseline/jini-ai__platform.json`; restored to base, only `./mail` kept.

Tovu:
- `fcb502c4`, `7683c0ff` — wave1 SI-1a and ML-1a test commits, cherry-picked from `wave1/lo-SI-1a` and `wave1/lo-ML-1a` (not merged; the SI-1b and ML-1b preconditions need them). Their wave1 report files were not cherry-picked.
- `3744a526` SI-1b M2 (seam in place: `resolveSameOriginPath({ raw, base, checkPathname })`, new `site-path-policy.ts` with `resolveSitePath`).
- `dccc0058` SI-1b M4 (moved declarations deleted; importers repointed to `@jini-ai/diagnostics/web-evidence`; Jini 8569ff407 linked).
- `1efcd199` ML-1b M2a (`mail/activity-vocabulary.ts`, `mail/activity-ports.ts`).
- `aca35666` ML-1b M2b (deps object with `permissions`; `mail-status/domain-deps.ts`).
- `02e16a29` ML-1b M4 (`activity.ts`, `suppressions.ts` and the two M2a files deleted; importers repointed to `@jini-ai/platform/mail`; Jini 893858294 / 600b9006a).
- this report: the commit that adds `cloud-results/lo-si-ml.md` (Jini side: `cloud-results/lo-si-ml.md` on the Jini branch).

## Setup and baselines
- Node v24.22.3 in `~/.local/node24`. Jini: `pnpm install --frozen-lockfile` ok, `pnpm --no-bail -r build` ok. Tovu: `npm ci`, `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (71 links), contracts + sdk built.
- S-BLOB (sidecar `SI-1b.files.tsv`, `ML-1b.files.tsv`): no drift. S-PRE: both satisfied after the cherry-picks. `SI-2` blob also matched.
- BASE-RED, recorded before the first edit (`npm run check:size`, `check:complexity`, `check:errors`, `check:architecture` on the unmodified tree): size exit 1 (31 lines), complexity exit 1 (27 lines), errors exit 0 (WARN, 12 new or worse), architecture exit 1 (4 metrics regressed). Final state versus that output: size and complexity byte-identical; errors identical except "17 -> 18 entries improved or are gone" (an improvement); architecture has no new line, cross-feature edges 436 -> 431, module API surface 852 -> 852 (same as base).
- Tovu `npx tsc -p tsconfig.json --noEmit` exit 0 and `npm run typecheck:tests` exit 0 at every commit and at the final HEAD. Jini: `pnpm --filter @jini-ai/{diagnostics,platform} run typecheck` ok; `pnpm guard` exit 0 ("zero violations", output identical to the guard run before the platform change after stripping timings); `pnpm api:check` exit 0; `pnpm check:size`, `pnpm check:complexity` exit 0.

## Gates (exact commands, final state)
- Jini diagnostics: `cd packages/diagnostics && npx vitest run --maxWorkers=2 --minWorkers=1` -> 61 files, 1001 tests pass. New files at 100% statement/branch/function/line (`--coverage`): `path-guard.ts`, `bounded-body.ts`, `cookie-shapes.ts`.
- Jini platform: `cd packages/platform && npx vitest run --maxWorkers=2 --minWorkers=1` -> 168 files, 3161 pass, 6 skipped (skips pre-existing). New `mail/activity/*.ts` at 100%.
- Tovu (`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <files>`): the 32 site-inspection/consent/routing/consumer test files, the whole `site-inspection/__tests__`, `consent/__tests__`, `features/__tests__` (boundary), `development/eslint-rules/__tests__/error-gate.unit.test.ts`, every test that mentions `features/mail`, `mail-status`, `mail/activity`, `suppression-admin`, and all of `mail/__tests__` + `mail-status/__tests__`: 965 tests, 965 pass, 0 fail. (SI list alone: 650/650 at M2 and at M4; mail list: 351/351 at M2a, M2b, M4.)
- S-LIM (COMMON-LO block, per-file, against `origin/refactor/terra`): prints nothing at every commit, both repos. `npx eslint` on touched files: 0 errors from my changes; pre-existing warnings only (e.g. `sonarjs/no-nested-incdec` in `published-page.unit.test.ts`, `buildMailStatusRegistrations` 51 lines, and `server/routes/types.ts` max-lines 518, which a two-line import edit did not cause).
- S-IMPORT, S-BARREL, S-TEXT, S-RUNTIME, S-ARGS, S-MOCK, S-SUPPRESS, S-FORWARD, S-DELETE, S-CENSUS (final: no stale importers; the only hits are architecture-baseline edge lines I then removed), S-BOOT: print nothing. S-NET: hits are strings asserted on (`http://evil.example/x`), never fetched. Jini S-RUNTIME first hit a comment that said `Buffer`; reworded.
- STOP checks from the sheets: SI-1b `rg -n "resolveSameOriginPath\(" apps/website/src -g '!**/__tests__/**'` prints only `site-path-policy.ts`. ML-1b: no ML-1a assertion edited; the only edits are import lines and the new `permissions` field in deps objects (the sheet allows "the deps-object shape").
- V3 (proof the new Jini guard tests can fail): in `path-guard.ts` replaced `checkPathname({ url: resolved })` with `{ kind: "ok" }` -> 6 red (`refuses a surface the injected policy reserves`, `the injected policy refuses /admin and /api in every spelling...`, `a decoded backslash or control character is refused through the host check`, `the policy runs on the RESOLVED url...`, `each policy verdict maps to its own refusal wording`, `a verdict the guard does not know...`); restored, 28/28 green. The SI-1a and ML-1a mutations are in their wave1 reports.
- S-COMMENT: SI-1b — 137 comment lines left `published-page.ts`; 149 arrived in Jini (3 files); 5 added to `published-page.ts`; 33 in `site-path-policy.ts`. ML-1b — 93 left the four deleted Tovu files; 92 arrived in Jini; the Tovu-specific why (tool and route names, the "fresh confirmation every time" rule) was kept in `domain-deps.ts`. The 22 lines not found verbatim are the file headers that I reworded neutral for Jini.

## The trap, recorded (SI-2 and ML-2p)
Added `parse5: 7.3.0` as devDependency, optional peer and `jini.optionalPeers` note to `packages/diagnostics/package.json` and ran `pnpm install`, then `pnpm install --lockfile-only`. Both fail: `ERR_PNPM_NO_MATURE_MATCHING_VERSION  Version 7.30.2 (released 12 days ago) of undici does not meet the minimumReleaseAge constraint` (resolving `electron`'s tree). Did not touch `minimumReleaseAge` or the lockfile; `package.json` restored with `git checkout`, `git status` clean. ML-2p (`kysely` on platform) hits the same error because any manifest change forces re-resolution. Retry after 2026-11-19.
Two things SI-2 needs decided or checked when it runs: (1) the sheet exports `page-body.ts` from the existing `./web-evidence` entry while declaring `parse5` as an OPTIONAL peer; `pnpm guard` has a driver-isolation check for optional peers, and a static `parse5` import from the entry index would make `@jini-ai/diagnostics/web-evidence` fail to load for a host without parse5. Either make the peer required, or give it its own subpath. (2) The sheet's SI-2 text names no M2 seam; I did not invent one.

## Where this differed from the sheet
1. Cherry-picked the two wave1 test commits (see above); both wave1 branches are unmerged.
2. "SI-1a tests stay green unedited": not literally possible. `resolveSameOriginPath` now needs `checkPathname`, so `published-page.unit.test.ts` and `reserved-paths.test.ts` import `resolveSitePath as resolveSameOriginPath` (import line only), later `SameOriginPathError as PublishedPagePathError` and the Jini `toCookieShapes`/`readBoundedBody`/`MAX_PATH_LENGTH`. `toCookieShapes` was reshaped to `({ headers })` (owner rule 3; no ABI exception was named), so four test call sites and one prod call site (`live-url.ts`) changed shape. No assertion edited.
3. Files outside the sheet's lists that had to change with the rename: `development/scripts/check-error-gate.mjs` (the reviewed pure-helper registry named `resolveSameOriginPath` in `published-page`, now `resolveSitePath` in `site-path-policy`), `development/eslint-rules/__tests__/fixtures/error-gate-sites.json`, `.../error-gate.unit.test.ts` (3 one-word edits), and `development/scripts/check-architecture.baseline.json` (renamed or removed the cross-feature edges of the moved importers). Without them the error gate and the architecture ratchet would have turned red. COMMON-LO says an unlisted edit is a STOP; I judged these mechanical mirrors of the sheet's own rename and made them, so review them first.
4. ML-1b M2b: no `fail` injection. Input errors are `ToolInputError` from `@jini-ai/core`, which Tovu already used and which a Jini platform file may import; an injected factory would change nothing observable.
5. `PublishedPagePathError` is `SameOriginPathError` in Jini, so `error.name` is now `"SameOriginPathError"` (nothing in the tree reads the name). The model-facing description in `agent-tools.ts` still says "Throws PublishedPagePathError"; left alone (the tool layer wraps it as `ToolInputError`), you may want to reword it.
6. `readBoundedBody`: the Node `Buffer.concat` became a `Uint8Array` join because `./web-evidence` is a universal entry. Same bytes (tests pin them).
7. Moved verbatim and flagged for later: `readBoundedBody` swallows a `reader.cancel()` failure (pinned by a test; rule 8 says never swallow); `nextMailCursor` throws a plain `Error`; the activity-id refusal message names `mail_list_activity`.
8. Tovu keeps its copies of the ML-1a and the SI-1a tests (import lines changed), and Jini has ported copies (neutral ids / fake policy). Redundant by design: the Tovu ones pin this site's real ids and wording.
9. Jini `vitest run --maxWorkers=2` alone fails with a tinypool conflict (vitest 2.1.9 with tinypool 2.1.2); used `--maxWorkers=2 --minWorkers=1`. The `npm --prefix ... run test -- --maxWorkers=2` form fails the same way.

## Failures that are not mine
- `apps/website/src/contracts/core/events/__tests__/forms-notification-restart.integration.test.ts`: 4 of 4 fail on the base worktree too (checked on a clean `origin/refactor/terra` worktree).
- `apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts`: `Cannot find package '@tovu/publish-content-ui'` (admin app deps are not installed in this container). Not run for the final list.

## Overlaps with parallel runs
Shared files I edited, so expect trivial conflicts: `development/scripts/check-architecture.baseline.json` (any run that moves cross-feature importers), `development/scripts/check-error-gate.mjs` + its fixture (error-system runs), `api-baseline/jini-ai__platform.json` and `jini-ai__diagnostics.json` (xpkg runs touching those packages; keep only the `./mail` and `./web-evidence` entries when merging), `packages/platform/src/mail/index.ts`, `apps/website/src/server/routes/types.ts` (two import specifiers). Also a `.changeset/` file per Jini package (names `diagnostics-web-evidence-path-guard.md`, `platform-mail-activity-operations.md`).

## Left and next step
- Merge order for review: Jini three commits, then Tovu. Tovu is green against the linked Jini at 600b9006a.
- After 2026-11-19: re-run SI-2 and ML-2p from a branch based on this one (decide the entry question above first). ML-2 stays on hold until Lane S is released and the delete-vs-tombstone question is answered.
- No test or server process was left running.
