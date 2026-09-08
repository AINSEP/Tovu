# 2026-09-07 — MCP drift detection silently hides a deleted-but-still-live connection

Branch `restructure/apps-website-phased`. Dispatched as "MCP drift detection tears down a still-live
connection." That premise did not hold as literally stated — verified and corrected before writing
any test, per team-lead's go-ahead (option a: proceed with the real, adjacent bug, full cross-package
fix).

## Correcting the record

The dispatch said this feature had "zero commits against it — nobody has touched it." That was
stale. `apps/admin/src/features/settings/external-mcp-admissions-rules.ts` (this exact file) was
modified TODAY, same branch, in commit `659b98ec` — findings ADM-001/ADM-002, written up in
`ADS-memory/reports/2026-09-07-fix-admin-mcp-misc.md`. Per team-lead: that agent was TaskStopped
before it reported, so `659b98ec` is unattested — noted here, not chased further. My fix builds on
top of it and does not regress it (see below).

## What "tears down a live connection" actually means here

Verified, read-only, before touching any code:

- `apps/website/src/server/inbound/admin-http/routes/external-mcp/delete.ts` only deletes the DB
  row. Its own doc: "the effect lands at the next daemon restart... a still-running daemon holds an
  already-connected session for this server, and the tab must not imply otherwise."
- `external-mcp-store.ts`'s `deleteExternalMcpServer` is a bare repo delete, no side effects.
- `mcp-federation/trust.ts` R5 freezes the admitted set at connect; federation only re-reads the
  roster at daemon boot (`bootstrap.ts`).
- The admissions banner's only action is a manual, full-daemon restart button — nothing auto-fires.

So nothing in this codebase tears down a live MCP session when its saved config is deleted, today or
before my change. The real defect is a **visibility** drop, not a socket teardown: the admin's own
drift detector (`describeAdmissionDrift`/`describeConnectionDrift`) could not distinguish "no roster
card because this is an env preset, by design" from "no roster card because the operator just deleted
it" — both produced `savedById[connectionId] === undefined`, and by design (ADM-001, to avoid
false-positiving every preset tool as removed on every boot) that was read as "nothing to report."
So: delete a saved MCP server while the daemon is still running it → the daemon correctly keeps it
alive (no teardown, by design) → but the drift banner goes silent about it, indistinguishable from
agreement. The operator gets zero signal that a server they explicitly removed is still live and its
tools still callable.

## The fix: thread connection origin through the whole path

`describeAdmissionDrift` can't fix this from the admin side alone — nothing upstream of it tagged a
connection's origin (preset vs. roster) past `bootstrap.ts`'s merge point. Threaded an `isPreset`
flag the entire way:

1. **`apps/website/src/assistant/mcp-federation/bootstrap.ts`** — `resolveFederationAttachInputs` now
   tags each connection with its origin (`presetConnections` vs. `extraConnections`, i.e. exactly the
   two arrays that were already being concatenated — `params.connections` stands in for presets in
   this file's own tests, `extraConnections` is documented as the operator roster). `reports` now
   carries `isPreset: boolean` per entry.
2. **`apps/website/src/server/inbound/assistant/federation-admissions-route.ts`** — pure passthrough,
   `res.json({ connections: deps.reports })`. Only needed a type-doc update; no behavior change, and
   verified by test that the field survives unmodified.
3. **`apps/website/src/server/inbound/admin-http/routes/external-mcp/admissions.ts`** — also pure
   passthrough (treats the body as `unknown`, re-serializes verbatim). No code change needed;
   verified by a new test that `isPreset` survives this hop too.
4. **`apps/admin/src/lib/api.ts`** — `AdminFederatedAdmissionEntry.isPreset?: boolean`. Optional
   (not defaulted) at this boundary: an older daemon build that predates the field omits it, and the
   rules file reads `!entry.isPreset`, which treats `undefined` the same as `false` — the fail-loud
   direction (warn about a possibly-live orphan rather than silently assume it's a preset).
5. **`apps/admin/src/features/settings/external-mcp-admissions-rules.ts`**:
   - New `AdmissionDriftKind`: `"removed-but-still-running"`.
   - New copy (English-only, same deliberate choice ADM-001 recorded for its three keys —
     `createDictionaryTranslator` falls back to English, and translating ahead of the copy settling is
     the more expensive mistake to undo): *"This server was removed from your configuration, but the
     assistant is still running it. Restart the assistant to unload it."*
   - New `removedButStillRunningEntry()` — a whole-connection row, superseding any per-tool rows, the
     same pattern `connectionLevelEntry`'s `not-running`/`disabled-but-running` arms already use.
   - `describeLiveConnection` now branches on `entry.isPreset` when there's no saved card: preset →
     unchanged silent behavior (still routes through `describeConnectionDrift(entry, undefined)`,
     which can still report refusals/config-drift independent of this fix); not-a-preset → the new
     `removed-but-still-running` row.

## What the operator now sees

Same banner (`ExternalMcpAdmissionsBanner.tsx`), no UI changes needed. A connection whose roster card
was deleted while still live now gets its own section: *"This server was removed from your
configuration, but the assistant is still running it. Restart the assistant to unload it."* The
existing "Restart the assistant" button (already wired, `system.write`-gated, D-4) is the correct and
complete remedy — a restart re-reads the roster fresh, so the deleted connection simply isn't
reconnected on the next boot. No new action needed on this row; it uses the same
`AdmissionRestartFooter` every other connection-level kind already does.

## RED — website side (`bootstrap.ts` origin tagging)

Wrote the new tests first, then discovered I'd already applied the `bootstrap.ts` fix before running
them (process slip). Corrected by stashing ONLY the two implementation files
(`bootstrap.ts`, `federation-admissions-route.ts`) with `git stash push -- <paths>`, keeping the new
tests in the working tree, and running against the pre-fix code:

```
env -u TOVU_ADMIN_PASSWORD node --import tsx --test \
  apps/website/src/assistant/__tests__/mcp-federation.registrations.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/federation-admissions-route.unit.test.ts \
  apps/website/src/server/__tests__/admin-external-mcp-admissions-routes.test.ts
```

```
✖ tags each report with whether it came from a preset or the operator's roster (13.838444ms)
```

The two route-level "isPreset survives this hop" tests were already GREEN at this point — correctly:
those hops are pure passthroughs that never needed a fix; only `bootstrap.ts` needed to compute the
flag in the first place. (Also surfaced a pre-existing, unrelated env trap in
`admin-external-mcp-admissions-routes.test.ts`: `TOVU_ADMIN_PASSWORD` was set in this shell, which
401s `loginAsOwner`'s hardcoded `tovu-dev` password — `env -u TOVU_ADMIN_PASSWORD` fixes it, matching
the standing memory note. Confirmed pre-existing by the unrelated "a workspace id that is not this
site's is 404" test failing identically before my change.)

Restored the fix with `git stash pop`, reran the same three files: **58/58 pass, 0 fail.**

## RED — admin side (`external-mcp-admissions-rules.ts`)

Wrote the 3 new tests against the unmodified rules file (real RED, implementation untouched at this
point):

```
cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/settings/__tests__/external-mcp-admissions-rules.unit.test.ts
```

```
 × a deleted roster connection is not a preset > reports a live connection with no roster card AND isPreset:false as removed-but-still-running
   AssertionError: expected [] to have a length of 1 but got +0
 × a deleted roster connection is not a preset > a whole-connection removal supersedes per-tool rows, the same way not-running/disabled-but-running already do
   AssertionError: expected [] to have a length of 1 but got +0

 Test Files  1 failed (1)
      Tests  2 failed | 23 passed (25)
```

The negative control — "still says nothing for a REAL preset with no roster card and isPreset:true —
ADM-001 must not regress" — was **already green at RED time**, proving it isn't accidentally coupled
to the fix. All 23 pre-existing tests (including `describeConnectionDrift`'s own line-210 "an env
preset is not an empty allowlist," called directly, untouched) stayed green throughout.

One pre-existing test needed a one-line update to keep testing what it originally meant: "treats a
connection with no matching roster card as having saved nothing rather than throwing" used a fixture
named `"env-preset"` but never actually set `isPreset: true`. Under the old model that didn't matter
(absence of a roster card was the only signal). Under the new model, an unset `isPreset` now means
"not a preset" — the fail-safe default — which would have silently changed what that test exercises
(a `removed-but-still-running` row instead of the destructive-refusal row it names) without failing,
since its assertions (`toHaveLength(1)`, `savedToolCount === 0`) don't check `kind`. Added
`isPreset: true` to the fixture so it keeps testing a real preset, not accidentally testing my new
code path under a stale label. This is exactly the "green test that would pass either way" trap the
team flagged for my new tests — found it in an old one instead.

## GREEN — both sides

```
cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run \
  src/features/settings/__tests__/external-mcp-admissions-rules.unit.test.ts \
  src/features/settings/hooks/__tests__/use-external-mcp-admissions.unit.test.tsx
# Test Files  2 passed (2) — Tests  30 passed (30)

cd apps/admin && env -u TOVU_ADMIN_PASSWORD npx vitest run src/features/settings
# Test Files  15 passed (15) — Tests  198 passed (198)   (was 195 before this change, +3 mine)
```

```
env -u TOVU_ADMIN_PASSWORD node --import tsx --test \
  apps/website/src/assistant/__tests__/mcp-federation.registrations.test.ts \
  apps/website/src/server/inbound/assistant/__tests__/federation-admissions-route.unit.test.ts \
  apps/website/src/server/__tests__/admin-external-mcp-admissions-routes.test.ts
# tests 58 / pass 58 / fail 0
```

## tsc / lint

- `apps/admin`: `env -u TOVU_ADMIN_PASSWORD npx tsc --noEmit -p tsconfig.json` → **0 errors** (empty
  output, exit 0). Baseline held.
- `apps/website` (repo root): `npx tsc -p tsconfig.json --noEmit` → **0 errors** (empty output, exit
  0). This excludes test files per this repo's convention (`tovu_tsc_excludes_tests`), so it checks
  `bootstrap.ts` and `federation-admissions-route.ts` — the two production files changed here — not
  the three test files.
- `npx eslint` on every changed non-test file (`external-mcp-admissions-rules.ts`, `api.ts`,
  `bootstrap.ts`, `federation-admissions-route.ts`): **0 errors, 0 warnings attributable to this
  change** (`api.ts`'s 11 warnings are all pre-existing, at unrelated line numbers elsewhere in that
  3,000+ line file).

## Files changed

apps/website:
- `apps/website/src/assistant/mcp-federation/bootstrap.ts`
- `apps/website/src/server/inbound/assistant/federation-admissions-route.ts`
- `apps/website/src/assistant/__tests__/mcp-federation.registrations.test.ts`
- `apps/website/src/server/inbound/assistant/__tests__/federation-admissions-route.unit.test.ts`
- `apps/website/src/server/__tests__/admin-external-mcp-admissions-routes.test.ts`

apps/admin:
- `apps/admin/src/lib/api.ts`
- `apps/admin/src/features/settings/external-mcp-admissions-rules.ts`
- `apps/admin/src/features/settings/__tests__/external-mcp-admissions-rules.unit.test.ts`

## Function quality — compact table

| unit | disposition | findings | local fix attempted |
|---|---|---|---|
| `resolveFederationAttachInputs` (bootstrap.ts) | NO_RECORDED_FINDINGS | pure mapping/merge, O(c) in connection count, no I/O | n/a |
| `attachFederatedMcpTools`'s loop body (bootstrap.ts) | NO_RECORDED_FINDINGS | destructuring change only, same shape/complexity as before | n/a |
| `removedButStillRunningEntry` (rules.ts) | NO_RECORDED_FINDINGS | O(1), pure, mirrors `connectionLevelEntry`'s existing shape | n/a |
| `describeLiveConnection` (rules.ts) | NO_RECORDED_FINDINGS | O(1), two added branches, well under complexity ceiling | n/a |

Zero-findings skepticism pass: every assessed unit above is a small, pure, branch-only function with
no I/O, no new mutable state, and no scale/security/concurrency surface — consistent with the rest of
this file's style (every sibling function in this module is similarly rated `overallScore 100` /
no-findings). Variable-name audit: `isPreset`, `removedButStillRunningEntry`, `REMOVED_BUT_STILL_RUNNING_KEY`
all name exactly what they hold; no stale/inverted semantics found.

## Architecture Audit

**Status: PASS.**

- No new dependency direction introduced: `bootstrap.ts` already owned both the preset list and the
  roster list before merging them; tagging origin there doesn't cross any new boundary.
- `federation-admissions-route.ts` and `admissions.ts` remain pure passthroughs — no reshaping added,
  matching their own documented "never a reshape point" contracts.
- `apps/admin/src/lib/api.ts` gained one optional field on an existing DTO — no new import, no new
  cross-package dependency.
- `external-mcp-admissions-rules.ts` stays "pure. No React, no `api`, no locale — every rule is a unit
  test," per the file's own header; unchanged.
- Complexity ceiling (9): `npx eslint` reports 0 problems on every changed non-test file.

## Pre-Completion Checklist

- Requirements re-verified against team-lead's 5-point spec: (1) not folding into Agent C's thread
  (confirmed stopped/gone, done directly) — done; (2) record correction stated above — done; (3) new
  kind fires only for non-preset+absent, preset+absent stays silent — done, tested; (4) RED first with
  both cases in the same suite, flag proven to survive the whole path (bootstrap → both HTTP hops →
  rules file), not just handled when handed one — done, with dedicated tests at each hop; (5) operator-visible
  text and remedy stated above — done.
- Fresh evidence commands: all shown above, all re-run just before writing this report.
- No certified/pre-existing test was deleted or weakened. One pre-existing test's fixture was made
  more accurate (`isPreset: true` added) to preserve its original meaning — not weakened, corrected.
- Scope: apps/website + apps/admin, as authorized. No file touched outside the list above.
- Open items: none. apps/website tsc and apps/admin tsc both confirmed 0 errors above.
