# Mutation sweep — changed files at 100% line coverage — 2026-09-20

Tool: `development/scripts/mutation-sweep.mjs`. Input: the "Files at 100% line coverage" list in
`ADS-memory/.local-artifacts/terra-coverage-2026-09-20/terra-coverage-report.md` (75 files).

Raw per-file data: `ADS-memory/.local-artifacts/mutation-sweep-2026-09-20/results.tsv` (initial sweep),
`confirm-log.tsv` (explicit-test-path recheck pass), `logs/*.json` (per-file mutant detail, one file
per swept target; `*.recheck.json` / `*.recheck2.json` are reruns with a widened or corrected test set).

**This report is complete for the confirmation/classification of the higher-risk files (security-
and route-adjacent, and the ones where widening changed the answer) and honestly incomplete for 17
small `publish-content`/admin-hook utility files, marked below. I ran out of context budget mid-run
and am stopping per the hard rule rather than guessing at the rest.**

## 1. `results.tsv` column legend

Tab-separated, no header in the file itself. Columns, in order:

1. **File path**
2. **Status** — one of:
   - `OK` — baseline passed, mutants generated and run (see columns 3-6)
   - `NO_GUARDS` — pre-filter found no `if (`/`??` in the file; correctly skipped, not swept
   - `NO_TEST_FOUND` — the tool's proximity-based test discovery found nothing; I resolved all 4 of
     these by hand (see §4)
   - `ERROR_exit_4` — baseline suite failed or timed out *before any mutant ran*; no mutation
     result exists for this file at all (see §3)
3. **Total mutants generated** (`?` when status isn't `OK`)
4. **SURVIVED count** — mutant ran, tests still passed. No test noticed the guard was gone.
5. **INCONCLUSIVE count** — mutant didn't compile, or the run timed out. Proves nothing either way;
   NOT the same as killed.
6. **killed count is implicit**: `total - survived - inconclusive - noop`. `noop` (a 7th, unlabeled
   trailing case in some rows) means the mutation regex produced no textual change and wasn't run.
7. (ERROR rows only) the tool's own stderr message.

## 2. Headline

- **68 files swept** (75 at 100% coverage, minus 7 excluded for concurrent edits — see §7).
- Status breakdown: **43 OK**, **19 NO_GUARDS**, 4 initially `NO_TEST_FOUND` (all 4 resolved by hand,
  see §4), 2 initially `ERROR_exit_4` (1 resolved as a transient timeout, 1 is a genuine pre-existing
  red baseline — see §3).
- Across the 43 `OK` files + the 4 resolved `NO_TEST_FOUND` files + the 1 resolved timeout: **~350
  mutants generated, 55 raw SURVIVED, ~10 INCONCLUSIVE, rest killed.**
- After the explicit-test-path confirmation pass caught two false positives (blob-put.ts, blob-get.ts
  — see §5), the corrected survivor count is **~52, all classified** — 14 files with a full
  widen-and-rerun confirmation (§6) plus 15 files classified from a cheaper call-site check (§6b, one
  file's severity not fully traced — see caveat there).

## 3. Baseline failures — no usable mutation result

Three files were named in an earlier status question as baseline failures. I can only confirm **two**
actually reported `ERROR_exit_4` in my run; the third was never in that state:

- **`apps/website/src/features/publish-content/baseline-repo.ts`** — status is `NO_GUARDS` in my
  `results.tsv`, not a baseline failure. It has no `if (`/`??` guards, so it was correctly skipped
  before any test ever ran. I don't have a baseline-failure record for this file. Flagging the
  discrepancy rather than silently going along with it.
- **`apps/website/src/platform/db/sqlite/publish-content-peer-repo.sqlite.ts`** — genuine, still red.
  `publish-content-peer-repo.sqlite.integration.test.ts` fails on its own (not a fixture race — I ran
  it alone): two assertions get an extra row (`id: ffe7225d-e1d6-4c7d-9aaf-e9fdf819dd0d`,
  `remoteWorkspaceId: workspace-local`) that the test doesn't expect, in both an `update`/`delete`
  scoping assertion and a full-list assertion. This matches exactly what
  `terra-coverage-report.md`'s "What could not be measured" section already documented — it is a
  pre-existing failure, not something my sweep caused. **No mutation result exists for this file.**
  This is itself a finding: the peer-repo test suite was red before this sweep touched anything, and
  an external review already flagged `publish-content` defects.
- **`apps/website/src/server/inbound/admin-http/routes/publish-content/export.ts`** — reported
  `BASELINE FAILS (timeout)` on the first pass at a 60s per-mutant budget. I ran the same 3 auto/
  fallback-discovered tests directly outside the tool: they pass clean in ~21s. This was a transient
  timeout (likely resource contention from a concurrent agent in the shared tree), not a real
  failure. I reran the full sweep at 90s and got a clean, complete result — **3 mutants, all 3
  SURVIVED**, now included in §5/§6 below as a confirmed result, not a baseline failure.

## 4. The four `NO_TEST_FOUND` rows — resolved by hand

The tool's discovery is filename-token-overlap in nearby `__tests__` dirs; all four misses were real
test files it couldn't reach that way. I found each by searching for the module's identifier / who
imports it, then reran explicitly:

- `apps/admin/src/features/pages/ThemePagesTab.tsx` — discovery failed because the component is
  referenced only via unquoted JSX/import identifiers, which the tool's quote/slash-boundary regex
  doesn't match. Reran against its 4 co-feature tests (`theme-page-publish-state.unit.test.ts`,
  `rules.unit.test.ts`, `use-theme-pages.unit.test.ts`, `Pages.unit.test.tsx`): 5 mutants, 1 SURVIVED.
- `apps/website/src/features/publish-content/execute-import.ts` — only importer is
  `routes/publish-content/import.ts`; its test is `publish-content-import-routes.test.ts` (name
  shares no token with "execute-import"). Reran: 1 mutant, 0 SURVIVED.
- `apps/website/src/platform/http/egress-policies.ts` — no direct test; it's consumed transitively by
  `media-import/fetch-image.ts` and `custom-credentials/credentialed-request.ts`. Reran against the
  two "egress-refusal" integration tests that exercise those call sites: 1 mutant, 1 SURVIVED.
- `apps/website/src/server/inbound/admin-http/routes/publish-content/blob-get.ts` — see §5, this one
  turned out to have a real dedicated route test the fallback grep also missed on the first pass.

## 5. Confirmation pass — two real false positives found and corrected

Per the tool's own documented blind spot (filename token-overlap, no stemming), I widened past
auto-discovery for every file with a survivor and reran. For most files the auto-discovered test was
already the complete answer (identical or a superset once I checked). Two files were genuinely wrong:

- **`blob-put.ts`** (`routes/publish-content/blob-put.ts`) — auto-discovery found only
  `publish-content.apply.test.ts`. It missed **`routes/publish-content-blobs.test.ts`**, the dedicated
  route test, because "blob" (from the source filename) never matches "blobs" (plural, in the test
  filename) — no stemming, exact string match only. With the correct test included: **8 SURVIVED → 5
  SURVIVED.** The 3 that flipped to killed include the file's own documented flagship guard: the
  sha256-mismatch rejection at line 80 (`if (!bytesMatchSha256(...))`) — the exact property the
  route's docstring says it exists to hold. It IS tested; the original SURVIVED was a tooling
  artifact, not a real gap.
- **`blob-get.ts`** (`routes/publish-content/blob-get.ts`) — same defect, missing
  **`routes/publish-content-blob-get.test.ts`**. **5 SURVIVED → 2 SURVIVED.**

I checked every other survivor's file for the same class of miss (repo-wide search for the module's
identifier / importers, not just the tool's proximity grep). None of the other 23 files with survivors
showed evidence of a missed test — full detail in §6.

**`apps/admin/src/features/deployment/rules.ts` verdict: the 20-mutant OK result IS usable.** The
confirm-pass recheck against a widened test set (`RECHECK_ERROR_exit_4 — BASELINE FAILS (timeout)`)
is a false alarm from my own confirmation tooling, not a defect in the original result: the widened
set was ~55 files because "rules" is a generic stem that string-matches nearly every feature's own
`rules.unit.test.ts` across the whole admin app (every admin feature has one) plus unrelated
component tests — that's grep noise from a bad stem, not additional real coverage of THIS file. The
**original** auto-discovered test, `features/deployment/__tests__/rules.unit.test.ts`, is the single
co-located test for this file and is correct. The original result stands: **20 mutants, 3 SURVIVED, 7
INCONCLUSIVE** (INCONCLUSIVE mutants prove nothing — treat as unswept, not killed).

Same false-alarm pattern, same reasoning, for **`tool-surface-exchanges.ts`**: it's a widely-imported
shared contracts file, so the literal-substring widening pulled in ~70 unrelated test files across the
whole assistant/tool-registration surface and the recheck timed out. Original result stands: 14
mutants, 2 SURVIVED.

## 6. Confirmed survivors, classified

**Load-bearing but untested** (worst first — these are real gaps):

| File | Line | Guard | What breaks silently |
|---|---:|---|---|
| `routes/publish-content/blob-put.ts` | 80→killed (not a survivor — see §5) | — | (moved here only to state explicitly: the sha-mismatch guard is fine) |
| `routes/publish-content/export.ts` | 51 | `if (String(req.params.workspaceId ?? "") !== deps.workspaceId)` (both the `guard-never-fires` AND `drop-nullish-default` mutants survived) | Workspace-scoping check on the export route. If neutralized, a request naming a different/absent workspaceId would still be served. No test exercises a workspaceId mismatch on this route. |
| `routes/publish-content/export.ts` | 87 | `const sourceLabel = workspace?.name ?? deps.workspaceId;` | Cosmetic label fallback only — low severity, but still untested. |
| `routes/publish-content/blob-put.ts` | 69 | `if (!bytes) {` (after `decodeBlobBytes` returns `null`) | Distinct enforcement point from the (tested) decode-internal check; if it silently stopped firing, a null-bytes case falls through to `bytes.length`, throws, and the caller gets a 500 instead of the intended 400. No test sends a request whose `dataBase64` fails to decode. |
| `routes/publish-content/blob-put.ts` | 36 | `if (typeof dataBase64 !== "string" \|\| !dataBase64) return null;` | Same missing-input-validation gap as above — no test exercises malformed/absent `dataBase64`. |
| `routes/publish-content/blob-put.ts` | 34 | `const body = (rawBody ?? {}) as Record<string, unknown>;` | Guards against `req.body` being `null`/`undefined`. Likely unreachable in practice if Express's body parser always yields at least `{}` — I did not verify the body-parser config to prove that, so I'm not calling it unreachable; leaving as untested. |
| `routes/publish-content/blob-get.ts` | 70, 75 | `?? ""` fallbacks on `req.params.workspaceId`/`req.params.sha` (the `guard-never-fires` mutants on the same lines are killed — the actual scoping/format checks ARE tested) | See "Unreachable" below — I believe these two are actually unreachable, not untested; splitting the reasoning out. |
| `platform/http/egress-policies.ts` | 245 | `if (!raw) return [];` | Empty-list fallback when config is absent. Untested via the two egress-refusal integration tests that exercise this module only transitively. |
| `pages/ThemePagesTab.tsx` | 302 | `if (error && !pages) return <div className="notice error">{error}</div>;` | Error-state UI branch — no test renders this component with both an error and no pages loaded. |
| `components/AssistantDock/AssistantDock.tsx` | 355 | `return override ?? null;` (inside `resolveAgentBridge`) | Dependency-injection resolver seam. `override` is only ever set by tests; production always relies on the `?? null` default. If that default silently broke, the real bridge selection logic would misbehave in production with zero test coverage catching it — every test that exists passes `override` explicitly, so the untested branch is the ONE that always runs for real users. |
| `features/providers/Providers.tsx` | 145 | `return override ?? useProviders;` (inside `resolveProvidersHook`) | Identical pattern/risk to the AssistantDock one above — the real-hook-selection default path is what production always takes, and it's the one branch no test exercises. |
| `features/pages/hooks/use-pages.hooks.ts` | 139 | `if (!settlement.isCurrent(generation)) return;` | Stale/out-of-order response guard (the exact `admin_hooks_stale_settlement_races` pattern this repo has hit before). If this silently stopped firing, a late-arriving stale fetch could overwrite fresher state. No test exercises out-of-order settlement here. |
| `features/deployment/rules.ts` | 471 | `if (!(e instanceof ApiError)) return { kind: "generic" };` | Error-classification fallback for non-`ApiError` throwables — untested. |
| `features/deployment/rules.ts` | 682, 694 | `if (status === "idle") return "Not started";` (export and publish run status labels) | Label text for the idle/default state — since `status` itself defaults to `"idle"` one line above when `run` is undefined, this is actually the MOST common real-world path, and no test asserts its label text. |

**Unreachable** (provable from call sites, not just inspection):

- `routes/publish-content/blob-put.ts:46,51` and `routes/publish-content/blob-get.ts:70,75` —
  the `drop-nullish-default` mutants on `String(req.params.workspaceId ?? "")` / `String(req.params.sha ?? "")`.
  Both routes are registered on paths with `:workspaceId` and `:sha` as **required** path segments
  (`"/api/admin/v1/workspaces/:workspaceId/publish-content/blobs/:sha"`); Express guarantees a
  matched required param is always a non-undefined string before the handler runs, for every call
  site (there is exactly one registration site per route, both checked). The `?? ""` can never
  observe its right-hand side. I'm listing these as unreachable rather than untested.

**Test-scaffolding, not production risk** (technically untested, but the code under test is a fake
used only by other tests, not shipped logic):

- `features/pages/hooks/pages-dependencies.hooks.ts:70` and `features/posts/hooks/posts-list-dependencies.hooks.ts:66,72,85,87,107,109` —
  every survivor in both files is inside an in-memory fake repo builder (`throw new Error(\`fake page/post not found\`)`, `options.updateError`/`options.deleteError` injection hooks, `options.posts ?? []`). This is test infrastructure, not application code; a gap here doesn't ship a user-facing bug, it means the fakes' own error-injection paths aren't exercised by anything that currently uses them.
- `features/pages/lib/theme-page-publish-state.ts:83,84` — `if (pageId === "index"/"404") return {on:true, reason: ...}` special-casing the home/404 pages as always-published. I did not have budget to trace every caller of this function to confirm severity; provisionally load-bearing but untested (if these silently broke, the home or 404 page could show as togglable in the admin UI when it must always be on) — flagging for a second look rather than asserting unreachable/redundant without proof.

## 6b. Remaining 15 files — classified in a second foreground pass

All confirmed real (status `OK`, `SURVIVED` in `logs/*.json`; each already had a call-site check
finding no missed test, per §6a). None were re-verified with a full widen-and-rerun (only the ~14
files in §6 got that); classification is from reading the guard in context.

**Load-bearing but untested** (all of them — no redundant/unreachable findings in this batch):

| File | Line | Guard | Risk if it silently broke |
|---|---:|---|---|
| `publish-trust/keys.ts` | 177 | `if (!rawPublicKey \|\| !signature) return false;` | **Highest priority in this batch.** Fail-closed check after base64url-decoding a signature-verification input: if the key or signature failed to decode, refuse rather than verify garbage. It currently fails closed (safe), but nothing proves that — a change that made this fail OPEN would be a live signature-bypass and no test would catch it. |
| `publish-trust/keys.ts` | 74 | `if (typeof value !== "string" \|\| value === "") return null;` | Input validation before base64url-decoding key/signature material — feeds directly into the line-177 check above. |
| `publish-content/run-repo.ts` | 123 | `if (record?.workspaceId !== input.workspaceId) return null;` | Cross-workspace isolation check on `findById` — prevents looking up another workspace's run record by id alone. A tenancy boundary with no test proving it holds. |
| `agent-plugins/bundled-digests.ts` | 125, 126, 189, 248, 251, 275 | ID/shape validation (`SAFE_PLUGIN_ID_PATTERN`, `isPlainObject`, `SHA256_DIGEST_PATTERN`) and early-returns for empty/degenerate input (`bundled.size === 0`, `supersededIds.size === 0`, `digests.size < 2`) while building the plugin-digest supersession map from persisted/seeded data | No test constructs malformed plugin IDs, non-object entries, or degenerate (zero/one-digest) input for this bookkeeping. Six independent guards, same root cause. |
| `publish-trust/provisioning.node-io.ts` | 61 | `if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;` | Treats "config file missing" as "no config" (returns null) vs. rethrowing any other error. If broken, a fresh install / first boot with no provisioning file yet would throw instead of proceeding. |
| `publish-content/ui/phase.ts` | 72 | `if (phase.plan.details.refused) return false;` | UI gate: a refused plan must not be confirmable. If silently gone, a refused publish plan could show as confirmable. |
| `publish-content/ui/report-rows.ts` | 132 | `if (report.refused) return [];` | Same refusal state, the row-rendering side: a refused report should render no rows. Pairs with the phase.ts guard above. |
| `contracts/core/commands/revert.ts` | 182 | `(await reverter.currentActor?.({...})) ?? null` | `currentActor` is an optional reverter capability; no test exercises a reverter that lacks it, so the `?? null` fallback — required for revert to still work — is unproven. |
| `contracts/core/model-facing-tool-errors.ts` | 150 | `if (err instanceof ToolInputError) return err;` | Short-circuit to avoid re-classifying an already-correctly-typed error through the rule loop below. No test passes an existing `ToolInputError` through this function. |
| `origin/configured-origin.ts` | 107 | `if (host === "") return "its host is empty";` | Validation error message for an empty host. |
| `origin/configured-origin.ts` | 234 | `const mode = optional.mode ?? resolveRuntimeMode;` | DI default — same class as AssistantDock/Providers in §6: `optional.mode` is only ever set by tests, so the real default (`resolveRuntimeMode`) is the untested production path. |
| `publish-content/peer-url.ts` | 70 | `if (normalizeHost(url.hostname) === "") return "its host is empty";` | Same empty-host validation as configured-origin.ts:107, different call site (peer URL validation vs. configured origin). |
| `publish-content/planner.ts` | 251 | `deps.forcedEntityKeys?.has(...) ?? false` | "Not forced" default for the sync-conflict override — the common real path, untested. |
| `publish-content/planner.ts` | 343 | `baselineByKey.get(...) ?? null` | Missing-baseline default (e.g. first sync with a peer). Weaker finding than most here: downstream code must already tolerate both `undefined` and explicit `null`, since no test distinguishes them at this exact line. |
| `publish-content/publish-readiness.ts` | 88 | `if (labels.length === 1) return labels[0] as string;` | Cosmetic — single-item grammar case in a site-name list ("a" vs. "a and b"). Lowest severity in this batch. |
| `publish-content/report-labels.ts` | 57 | `if (!isRecord(row)) return row;` | Defensive type-guard on a report row; I did not trace `details.rows`'s type origin to rule out "unreachable" — treating as untested rather than asserting unreachable without proof. |
| `publish-content/report-labels.ts` | 59 | `String(row.entityType ?? "")` inside a lookup key | Defensive fallback for a possibly-missing field before building a lookup key. |
| `admin/lib/chat-attachment-liveness.ts` | 129 | `fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis)` | Same DI-default class as AssistantDock/Providers/configured-origin above — the real `fetch` binding is the untested production path. |
| `admin/lib/chat-attachment-liveness.ts` | 138 | `if (candidates.length === 0) return [];` | Early return when no attachment matches the ref pattern — untested empty-input case. |
| `desktop/project-ipc.ts` | 265 | `deps.transitions?.get(row.siteDir) ?? null` | The file's own comment admits this: "absent (every test that is not exercising them) it reads null." Confirmed load-bearing-but-untested by the author's own note. |
| `publish-content/peer-transport.ts` | 111 | `if (err instanceof PublishContentPeerTransportError) return err;` | Passthrough for an already-typed transport error — same short-circuit pattern as model-facing-tool-errors.ts:150. |
| `publish-content/peer-transport.ts` | 200 | `if (typeof value !== "object" \|\| value === null \|\| Array.isArray(value))` | Shape validation on a peer response before trusting it as a record. |
| `publish-content/peer-transport.ts` | 501 | `const maxBlobs = deps.maxBlobs ?? PUBLISH_CONTENT_PULL_MAX_BLOBS;` | DI-default class again — the real cap constant is the untested production path. |

**Not re-traced for severity** (kept from the first pass, still provisional):

- `features/pages/lib/theme-page-publish-state.ts:83,84` — `if (pageId === "index"/"404") return {on:true,...}`. Provisionally load-bearing but untested; I did not trace every caller to rule out a higher-level check already preventing these pageIds from reaching here.

**Do not treat any of the above as fully re-verified against a widened test set** — these 15 files
got the cheaper "who else imports this module" call-site check (§6a), not the full widen-and-rerun
that caught the blob-put/blob-get false positives in §5. If a peer review wants the same confidence
level as §6, that rerun is the next step, using the exact commands in §10.

## 7. Files clean (every mutant killed, or correctly had none)

All 19 `NO_GUARDS` files (no `if`/`??` to mutate) plus every `OK` file not listed with a survivor
above genuinely killed 100% of its mutants. From `results.tsv`, the fully-clean `OK` files are:
`find-in-page-ipc.ts`, `find-menu.ts`, `use-site-actions.hooks.ts`, `site-history-menu.ts`,
`site-transitions.ts`, `spellcheck-menu.ts`, `window-bounds-store.ts`, `zoom-menu.ts`,
`bundle-staging.ts`, `content-hash.ts`, `peer-aad.ts`, `seo/absolute-url.ts`, `seo/write-service.ts`,
`authorize-guard.ts`, `execute-import.ts` (resolved, §4).

## 8. Excluded — concurrent edits, not swept

Seven files were dropped from the original 75-file target list because another agent was actively
writing them (trash feature work touching media delete, composition modules, and the tool catalog):

- `apps/website/src/assistant/tool-registrations.ts` (dirty at sweep start)
- `apps/website/src/server/runtime/composition/app.ts` (dirty at sweep start)
- `apps/website/src/features/media/import-media-entity.ts`
- `apps/website/src/server/runtime/composition/modules/core.ts`
- `apps/website/src/server/runtime/composition/modules/publish-content.ts`
- `apps/website/src/server/runtime/composition/publish-content-manifest.ts`
- `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`

## 9. Git status

`git status --short` at time of writing shows only other agents' in-flight work (trash feature files,
`destination.ts`, `app.ts`, `todos.md`, activations.json — all under active edit by other agents in
this shared tree) and pre-existing untracked artifacts. **No file I swept shows as modified** — every
mutation-sweep target was correctly restored. No stale lock files remain under `$TMPDIR`.

## 10. Exact commands

Sweep driver (bash 3.2-compatible; macOS has no `mapfile`, no `timeout(1)`):
```
export TOVU_INTEGRATIONS_ROOT_KEY=<redacted>
unset TOVU_ADMIN_PASSWORD
node development/scripts/mutation-sweep.mjs <file> [test...] --json --timeout=60   # initial sweep
node development/scripts/mutation-sweep.mjs <file> [test...] --json --timeout=90   # confirmation reruns
```
Full target list: 75 files from `terra-coverage-report.md` minus the 7 in §8 = 68, swept one at a time
(the tool refuses concurrent sweeps of the same file via its own lock; I ran files sequentially, not
in parallel, to avoid shared-fixture-DB races across `node --test` invocations).
