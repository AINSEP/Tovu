# 2026-09-04 — Full Cyclomatic + Cognitive Complexity Inventory (ESLint, threshold 0)

STATUS: complete — all 9 scopes measured successfully, 0 tooling failures

## Purpose

Machine-generated, uncensored complexity distribution for all first-party Tovu application
code, using ESLint's `complexity` (cyclomatic) and `sonarjs/cognitive-complexity` rules run at
threshold **0** (not 9) so every function's score is captured, not just gate breaches. No
manual function reading. No test execution.

## Method

```
npx eslint --no-error-on-unmatched-pattern \
  --ignore-pattern '**/__tests__/**' --ignore-pattern '**/__measurements__/**' \
  --rule '{"complexity":["error",0],"sonarjs/cognitive-complexity":["error",0]}' \
  -f json -o <OUTFILE> <SCOPE>
```

Raw JSON per scope: `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/<scope-slug>.json`
(gitignored). Reference gate script (not modified): `development/scripts/check-src-complexity-drift.ts`.

Repo's enforced ceiling: **9** (hard-error) — `eslint.config.mjs` scopes `error`/9 to
`apps/admin/src/**` only; `apps/website`'s listed subtrees are gated at 9 solely by
`check-src-complexity-drift.ts`. This inventory is not limited to either gate's coverage — it
runs the nine scopes below regardless of which gate currently covers them, and reports the full
distribution, not just breaches.

## Row-join methodology (read before trusting the per-function numbers)

`complexity` fires on every function (cyclomatic is always >=1, threshold 0), so it is the
superset. `sonarjs/cognitive-complexity` only emits a message when the score is nonzero (a
straight-line function scores 0 and gets no message), so it is a subset — a `cognitive: null` in
the row data means "not reported because its cognitive score is 0", not a join failure.

Rows are joined on `(filePath, line)` as directed, with two refinements found necessary by
inspecting the raw JSON (mechanical inspection of tool output, not of function bodies):

1. **Same-line disambiguation.** 103 of 11,343 lines carry more than one `complexity` message
   (nested/inline arrow functions). Of those, only 4 lines also carry more than one `cognitive`
   message. For these, both rules report at genuinely different columns depending on node shape
   — e.g. a `complexity` message anchors on an object-literal method's property key while
   `sonarjs` anchors on the arrow token several columns later
   (`apps/website/src/features/comments/tool-registrations.ts:180`, confirmed by reading that
   line's raw source, not its logic) — so an exact `(line, column)` key silently orphaned ~5% of
   cognitive messages on a first pass. Fixed with greedy nearest-column matching per `(file,
   line)`, which reproduces exact-column matches where they exist (verified against the 4 known
   multi-cognitive lines, all plain arrow functions with identical columns on both rules) and
   still resolves the single-candidate case regardless of column offset.
2. **Multi-line signature fallback.** 5 of 11,442 functions have a parameter list spanning
   several lines before the arrow token/opening brace (e.g.
   `apps/admin/src/lib/api.ts:2269-2272`, `getConnector: (\n  ...\n) => {`), which makes
   `complexity` report at the node-start line and `sonarjs` report at the arrow-token line —
   different lines for the same function. Confirmed by reading the raw source at both reported
   lines. Resolved by matching an unassigned cognitive message to the nearest unused complexity
   message in the same file within 10 lines *before* it (multi-line signatures only push the
   arrow later, never earlier).

After both refinements, **0 orphaned cognitive messages remain across all 9 scopes** — every
`sonarjs` message is attached to exactly one `complexity` row. Duplicate-message hazard from the
dispatch brief (two textually identical violations at different lines,
`admin-http/routes/widgets/agent-tools.ts`-style) is a non-issue for this join because keys
include the line number, not the message text.

Function identity (`name`/`kind`) is parsed from the `complexity` message prefix (13 message
shapes observed: `Function 'X'`, `Arrow function`, `Async function 'X'`, `Method 'X'`, `Async
generator function 'X'`, `Constructor`, `Async arrow function`, `Async generator method 'X'`,
`Async method 'X'`, `Class field initializer`, `Static method 'X'`, `Getter 'X'`, `Async method`
— all 13 parsed without a fallback/unparsed case; `unparsedCount` was 0 in every scope).

## Scopes

| # | Scope | Status | Exit code |
|---|-------|--------|-----------|
| 1 | `apps/website/src/features` | SUCCESS | 1 (violations found, expected at threshold 0) |
| 2 | `apps/website/src/server` | SUCCESS | 1 |
| 3 | `apps/website/src/platform` | SUCCESS | 1 |
| 4 | `apps/website/src/assistant` | SUCCESS | 1 |
| 5 | `apps/website/src/contracts` | SUCCESS | 1 |
| 6 | `apps/website/src/cli` | SUCCESS | 1 |
| 7 | `apps/admin/src` | SUCCESS | 1 (single pass, 12s — no split needed) |
| 8 | `apps/site-chat/src` | SUCCESS | 1 |
| 9 | `packages/sdk/src` | SUCCESS | 1 |

No scope hit exit code 2 or 0. No scope required splitting.

## Full distribution per scope

### Cyclomatic complexity distribution

| Scope | Files | Functions | Median | p75 | p90 | p95 | Max | >=10 (gate) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `apps/website/src/features` | 307 | 3357 | 2 | 3 | 5 | 7 | 18 | 2 |
| `apps/website/src/server` | 344 | 1911 | 2 | 4 | 7 | 8 | 11 | 1 |
| `apps/website/src/platform` | 82 | 796 | 1 | 3 | 5 | 7 | 18 | 14 |
| `apps/website/src/assistant` | 67 | 698 | 2 | 4 | 6 | 7 | 9 | 0 |
| `apps/website/src/contracts` | 20 | 119 | 2 | 3 | 5 | 7 | 15 | 3 |
| `apps/website/src/cli` | 14 | 59 | 2 | 3 | 6 | 8 | 14 | 2 |
| `apps/admin/src` | 345 | 4431 | 1 | 2 | 4 | 6 | 25 | 10 |
| `apps/site-chat/src` | 8 | 70 | 2 | 3 | 5 | 7 | 9 | 0 |
| `packages/sdk/src` | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 |

### Cognitive complexity distribution (functions with a nonzero score only — sonarjs emits no message at 0)

| Scope | Functions scored | Median | p75 | p90 | p95 | Max | >=10 (gate) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `apps/website/src/features` | 1650 | 2 | 4 | 6 | 7 | 9 | 0 |
| `apps/website/src/server` | 929 | 3 | 4 | 6 | 7 | 10 | 1 |
| `apps/website/src/platform` | 280 | 2 | 3 | 6 | 8 | 21 | 9 |
| `apps/website/src/assistant` | 352 | 2 | 3 | 5 | 6 | 9 | 0 |
| `apps/website/src/contracts` | 55 | 2 | 3 | 6 | 8 | 15 | 2 |
| `apps/website/src/cli` | 25 | 2 | 4 | 8 | 10 | 15 | 2 |
| `apps/admin/src` | 1391 | 1 | 3 | 4 | 6 | 20 | 5 |
| `apps/site-chat/src` | 39 | 2 | 4 | 6 | 7 | 8 | 0 |
| `packages/sdk/src` | 0 | n/a | n/a | n/a | n/a | n/a | 0 |

`apps/site-chat/src`: max cyclomatic 9, max cognitive 8, 0 over the gate on either metric —
consistent with the dispatch brief's prior claim ("already known to have 0 functions over 9").

## Count over the gate (>=10, i.e. failing the enforced ceiling of 9)

| Scope | cyclomatic>=10 AND cognitive>=10 |
|---|---:|
| `apps/website/src/features` | 0 |
| `apps/website/src/server` | 1 |
| `apps/website/src/platform` | 6 |
| `apps/website/src/assistant` | 0 |
| `apps/website/src/contracts` | 2 |
| `apps/website/src/cli` | 1 |
| `apps/admin/src` | 4 |
| `apps/site-chat/src` | 0 |
| `packages/sdk/src` | 0 |

**Totals across all 9 scopes: 11,442 functions scanned. 32 at cyclomatic>=10. 19 at
cognitive>=10. 14 high on both. 3 flagged REVIEW-SHAPE.**

Note the gap between cyclomatic breaches (32) and cognitive breaches (19): `apps/website/src/features`
and `apps/website/src/platform` both have functions with cyclomatic >=10 whose cognitive score
stays under 10 — consistent with the brief's framing that high cyclomatic alone is often the
honest shape of an exhaustive switch/dispatch table rather than a real refactor signal.

## Ranked refactor table — cognitive >= 10, sorted desc (all 19; full set also in `refactor-table-full.json`, well under the 150-row cap)

| # | Scope | File:Line | Function | Cognitive | Cyclomatic |
|---:|---|---|---|---:|---:|
| 1 | platform | `apps/website/src/platform/db/migration/manifest.ts:691` | topologicalTableCopyOrder | 21 | 15 |
| 2 | admin | `apps/admin/src/App.tsx:253` | App | 20 | 15 |
| 3 | admin | `apps/admin/src/lib/api.ts:1759` | request | 16 | 17 |
| 4 | admin | `apps/admin/src/features/media/Media.tsx:709` | Media | 16 | 14 |
| 5 | cli | `apps/website/src/cli/errors.ts:103` | mapErrorToCliOutcome | 15 | 14 |
| 6 | platform | `apps/website/src/platform/http/client.ts:111` | resolvePinnedPeer | 15 | 12 |
| 7 | contracts | `apps/website/src/contracts/core/entry-refs/extractor.ts:106` | extractEntryRefs | 15 | 11 |
| 8 | platform | `apps/website/src/platform/oauth/device-code.ts:110` | beginDeviceAuthorization | 14 | 18 |
| 9 | admin | `apps/admin/src/lib/assistant-transport.ts:503` | buildLocalCliContextRef | 13 | 18 |
| 10 | contracts | `apps/website/src/contracts/core/commands/revert.ts:51` | revertChangeSet | 13 | 15 |
| 11 | platform | `apps/website/src/platform/db/sqlite/jsonb-column.ts:229` | decodeContainerPayload | 13 | 8 |
| 12 | platform | `apps/website/src/platform/connectors/connector-credential-store.ts:187` | hydrate | 12 | 8 |
| 13 | platform | `apps/website/src/platform/oauth/discovery.ts:410` | discoverAuthorizationServer | 10 | 13 |
| 14 | platform | `apps/website/src/platform/http/client.ts:46` | classifyIpv4 | 10 | 12 |
| 15 | server | `apps/website/src/server/inbound/admin-http/routes/system/sites.ts:99` | Async arrow function | 10 | 11 |
| 16 | platform | `apps/website/src/platform/db/migration/manifest.ts:457` | classifyCoreColumn | 10 | 10 |
| 17 | platform | `apps/website/src/platform/site-dir/init-site.ts:135` | initSite | 10 | 9 |
| 18 | cli | `apps/website/src/cli/commands/theme/validate.ts:43` | runThemeValidateCommand | 10 | 8 |
| 19 | admin | `apps/admin/src/lib/api.ts:1668` | fetchOrThrowUnreachable | 10 | 7 |

## High-on-both subset — cyclomatic >= 10 AND cognitive >= 10 (14 functions)

This cross-reference is the real refactor signal per the dispatch brief.

| Scope | File:Line | Function | Cyclomatic | Cognitive | File LOC | \|cyc−cog\| | Flag |
|---|---|---|---:|---:|---:|---:|---|
| platform | `apps/website/src/platform/db/migration/manifest.ts:691` | topologicalTableCopyOrder | 15 | 21 | 914 | 6 | - |
| admin | `apps/admin/src/App.tsx:253` | App | 15 | 20 | 519 | 5 | - |
| admin | `apps/admin/src/lib/api.ts:1759` | request | 17 | 16 | 3285 | 1 | - |
| admin | `apps/admin/src/features/media/Media.tsx:709` | Media | 14 | 16 | 912 | 2 | - |
| cli | `apps/website/src/cli/errors.ts:103` | mapErrorToCliOutcome | 14 | 15 | 152 | 1 | REVIEW-SHAPE |
| platform | `apps/website/src/platform/http/client.ts:111` | resolvePinnedPeer | 12 | 15 | 241 | 3 | - |
| contracts | `apps/website/src/contracts/core/entry-refs/extractor.ts:106` | extractEntryRefs | 11 | 15 | 312 | 4 | - |
| platform | `apps/website/src/platform/oauth/device-code.ts:110` | beginDeviceAuthorization | 18 | 14 | 221 | 4 | - |
| admin | `apps/admin/src/lib/assistant-transport.ts:503` | buildLocalCliContextRef | 18 | 13 | 757 | 5 | - |
| contracts | `apps/website/src/contracts/core/commands/revert.ts:51` | revertChangeSet | 15 | 13 | 153 | 2 | REVIEW-SHAPE |
| platform | `apps/website/src/platform/oauth/discovery.ts:410` | discoverAuthorizationServer | 13 | 10 | 441 | 3 | - |
| platform | `apps/website/src/platform/http/client.ts:46` | classifyIpv4 | 12 | 10 | 241 | 2 | - |
| server | `apps/website/src/server/inbound/admin-http/routes/system/sites.ts:99` | Async arrow function | 11 | 10 | 182 | 1 | REVIEW-SHAPE |
| platform | `apps/website/src/platform/db/migration/manifest.ts:457` | classifyCoreColumn | 10 | 10 | 914 | 0 | - |

## REVIEW-SHAPE flags (mechanical heuristic only — not adjudicated by reading the function)

Heuristic applied: cyclomatic >= 10 AND cognitive within 4 points of cyclomatic (`|cyc−cog| <=
4`) AND the file is small (<= 200 lines total, measured mechanically via line count, not
content). 3 of the 14 high-on-both rows match:

- `apps/website/src/cli/errors.ts:103` (`mapErrorToCliOutcome`) — cyc 14, cog 15, file 152 lines
- `apps/website/src/contracts/core/commands/revert.ts:51` (`revertChangeSet`) — cyc 15, cog 13, file 153 lines
- `apps/website/src/server/inbound/admin-http/routes/system/sites.ts:99` (async arrow) — cyc 11, cog 10, file 182 lines

These are flagged, not adjudicated: they *may* be the benign long-flat-`??`-chain shape the
brief describes, or they may be real. No file was opened to decide which.

## Failures / gaps

None. All 9 scopes completed successfully at exit code 1 (violations found, expected at
threshold 0). No scope hit exit code 2 (tooling failure) or required splitting for buffer/size
reasons. `unparsedCount` was 0 in every scope (all `complexity` and `cognitive-complexity`
message shapes were parsed). Orphaned-cognitive count was reduced to 0 in every scope after the
two join refinements documented above — full detail in the raw per-scope JSON and
`ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/summary.json` (gitignored, available
on this machine for follow-up).

## Artifacts (gitignored, this machine only)

- `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/<scope-slug>.json` — raw `eslint -f json` output per scope
- `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/summary.json` — per-scope stats + totals + high-both + review-shape, as consumed for this report
- `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/refactor-table-full.json` — full cognitive>=10 list (19 rows, same as the table above)
- `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/high-both-full.json` — full high-on-both list (14 rows, same as the table above)
- `ADS-memory/.local-artifacts/metrics/2026-09-04-complexity/all-rows.json` — every function's row (11,442 rows)
