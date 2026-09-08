# 2026-09-08 — `<ExternalMcpSettingsPanel>` crash: ADM-003, a wire-shape mismatch that has never worked

Branch `restructure/apps-website-phased`. Dispatched against the live crash:

```
external-mcp-admissions-rules.ts:305 Uncaught TypeError: Cannot read properties of undefined (reading 'length')
    at connectionLevelEntry (external-mcp-admissions-rules.ts:305:36)
```

Commits: `b0963afd` — `fix(admin): flatten the daemon's report-nested admissions wire shape`; follow-up
(see "The `raw.report` gap" below) — `docs(admin): prove raw.report is unguarded on purpose, not by
oversight`.

## Root cause: none of the three hypotheses, precisely — it's "the type lies," but systemic

The dispatch offered three buckets. The real cause is closest to bucket 1, but bigger than a stale
type on one field:

`GET .../mcp-servers/admissions` (C-008, `apps/website/src/server/inbound/admin-http/routes/
external-mcp/admissions.ts`) deliberately treats the daemon's payload as `unknown` and relays it
**verbatim** — this is intentional, tested, and I did not touch it: `admin-external-mcp-admissions-
routes.test.ts`'s "a live daemon's real report is relayed verbatim" test pins exactly this. What the
daemon's own route (`federation-admissions-route.ts`, C-009, also "a pure serializer, never a reshape
point" by its own header) actually sends is `attachFederatedMcpTools`'s internal `reports` shape,
unmodified:

```
{ connectionId, isPreset, report: { admitted, refused, allowlistedButAbsent, writeAllowedButNotAllowlisted } }
```

But `AdminFederatedAdmissionEntry` (`apps/admin/src/lib/api.ts`) — the type every downstream reader in
apps/admin is written against — declares those four fields **flat**, directly on the entry, not nested
under `report`. Nothing between the daemon and the browser ever reshaped one into the other. **The
scope, stated plainly: `admitted`, `refused`, `allowlistedButAbsent`, and `writeAllowedButNotAllowlisted`
were `undefined` for every connection the daemon has ever reported.** The admissions/drift panel has
never worked against real daemon data — line 305 is the first place anyone happened to hit the crash,
not the extent of the bug. Every function in `external-mcp-admissions-rules.ts` that reads one of
those four fields was equally broken, most of them silently (an `undefined.map`/`.filter`/`for...of`
crashes; only line 305's `?? 0` after `.length` masked nothing — it just wasn't the first hit).

### All 8 unguarded read sites (pre-fix), `apps/admin/src/features/settings/external-mcp-admissions-rules.ts`

| Line | Function | Field |
|---|---|---|
| 165 | `refusalEntries` (`for...of`) | `refused` |
| 185 | `driftEntries` | `allowlistedButAbsent` |
| 192 | `driftEntries` | `writeAllowedButNotAllowlisted` |
| 219 | `liveOnlyEntries` | `admitted` |
| 255 | `describeConnectionDrift` | `admitted` |
| 263 | `describeConnectionDrift` (return) | `admitted` |
| **305** | **`connectionLevelEntry`** (the reported crash) | `admitted` |
| 384 | `removedButStillRunningEntry` | `admitted` |

None of these needed fixing individually — see below.

## Why the fix is NOT `?.` at line 305, and not in this file at all

Adding `?.` at 305 (or anywhere in this file) would have been wrong on two counts:
1. It would have left the other 7 sites crashing, since each is reached by a different daemon state
   (a refusal, a drift list, a live-only tool, a removed connection).
2. Per the dispatch's own bucket 3: `admitted: undefined` (never resolved) and `admitted: []` (resolved,
   nothing admitted) are different facts to this file's own logic (`resolveConnectionLevelKind` branches
   on `liveToolCount`). Collapsing every unguarded read to `?? []`/`?? 0` would have silently turned
   "the wire is malformed" into "this connection admitted nothing" — a **wrong but silent panel state**,
   worse than the crash it replaces, and exactly the failure class this whole file's header exists to
   close (`ADM-001`/`ADM-002`'s own "every refusal is reportable, never silent" discipline).

`external-mcp-admissions-rules.ts` is correct relative to its own documented, tested contract
(`AdminFederatedAdmissionEntry`, flat) — 55 existing unit tests construct fixtures directly against that
flat shape and all still pass, untouched. The type itself is what lied about what actually arrives over
the wire.

## Where the fix landed, and why

`apps/admin/src/lib/api.ts`'s `getExternalMcpAdmissions()` — the one function where this HTTP response
enters the client (apps/admin, the browser app). Added:
- `RawAdmissionConnection` — documents the real wire shape (nested `report`), with doc comments tracing
  back to the daemon route and the certified "relayed verbatim" test so a future reader doesn't
  "fix" this by flattening at C-008 or C-009 and re-diverging from those tests.
- `flattenAdmissionConnection(raw): AdminFederatedAdmissionEntry` — un-nests `report`'s four fields onto
  the entry, copies `isPreset` only when the wire actually sent it (never defaulted — an older daemon
  build omitting the field must read as "not a preset," per that field's own existing doc, not `false`
  invented here).
- `getExternalMcpAdmissions` now awaits the raw shape, maps every connection through the flattener, and
  guards a missing `connections` key (`raw.connections ?? []`) — needed because several unrelated
  `api.ts` tests in `api-long-tail-endpoints.unit.test.ts` share a generic `stubFetchCapturing()` helper
  that stubs every endpoint with `okJson({})`; that guard does not mask a real server response (C-008
  always sends `{ connections: [...] }` on 200 and a down/unreachable daemon is already a distinguishable
  503, thrown as an `ApiError` before this line ever runs).

## The `raw.report` gap (team-lead follow-up)

`flattenAdmissionConnection` reads `raw.report.admitted` and its three siblings without guarding
`raw.report` itself — flagged as worth a explicit decision, the same way `raw.connections ?? []` was:
either prove `report` is genuinely guaranteed from the daemon's own construction code (not from the
type — the type is what lied last time), or handle a missing one explicitly without silently
substituting empty arrays.

Traced `bootstrap.ts`'s full history (`git log --follow -p`), not just its current state. The `reports`
array has been built the same way since the commit that introduced this shape,
`e3843594` ("attach federated MCP tools" / admissions reporting): `if (attached.report)
reports.push({ connectionId, report: attached.report, ... })`. That gate is the ONLY place an entry
ever enters `reports`, in every commit since, including today's. There is no code path, in this
codebase's entire history, that has ever pushed an entry with no `report` — unlike `isPreset`, which
was added later (`333eb70e`, today) and is genuinely optional because an already-running older daemon
process predates it. `report` is not a "recently added field" case; it is core to the shape from its
first commit.

Decision: **left unguarded, on purpose**, and documented that proof directly on `RawAdmissionConnection
.report`'s JSDoc so a future reader has the evidence trail rather than rediscovering it. Did NOT add a
`raw.report ?? {admitted: [], ...}` fallback, for the same reason `?.` at line 305 was wrong the first
time: no real producer of a report-less connection exists anywhere in this repo to justify the branch,
and defaulting one in would silently recreate the exact "malformed data read as admitted-nothing"
collapse this whole fix exists to avoid. The `raw.connections ?? []` guard stayed, because — unlike
this — a real, currently-passing test in this repo (`api-long-tail-endpoints.unit.test.ts`'s shared
`okJson({})` stub) already exercises that exact case; there is nothing equivalent for a report-less
connection to defend against. If one somehow arrives anyway (corrupt payload, a hand-rolled test double
that skips the constraint), throwing here is the correct fail-loud outcome, not a silent one.

Re-verified after this doc-only change: `api-external-mcp-admissions.unit.test.ts` +
`api-long-tail-endpoints.unit.test.ts` — 60/60 passing; tsc — 0 errors.

## Completeness check: is `api.ts` the only place this response enters the client?

Yes — confirmed by grep, not assumed. Control grep first, to prove the search was live (14 hits across
the whole repo for the URL substring, so the search tooling was working, not silently matching zero):

```
$ grep -rn "mcp-servers/admissions" --include="*.ts" --include="*.tsx" . | grep -v node_modules | wc -l
14
```

Then three targeted greps:
- **The URL path itself** (`mcp-servers/admissions`): only one fetch call site exists —
  `apps/admin/src/lib/api.ts:2597` (inside `getExternalMcpAdmissions`). Every other hit is either the
  C-008 server route registering that path, its own route-level test, or a doc comment.
- **`getExternalMcpAdmissions` itself**: exactly one caller — `use-external-mcp-admissions.hooks.ts`'s
  `getAdmissions: () => api.getExternalMcpAdmissions()` — which is what `ExternalMcpSettingsPanel.tsx`
  consumes. No second hook, route, or component calls it independently.
- **`AdminFederatedAdmissionEntry` / `AdminExternalMcpAdmissionsSnapshot`**: referenced in exactly 6
  files — `external-mcp-admissions-rules.ts` + its test, `use-external-mcp-admissions.hooks.ts` + its
  test, `api.ts`, and my new test. No third consumer of the flat type exists to have the nested-shape
  assumption independently.
- **The daemon's raw endpoint** (`FEDERATION_ADMISSIONS_PATH` / `/api/federation/admissions`, C-009):
  its only HTTP caller is the C-008 proxy (`admissions.ts`) itself, plus its own route-level test.
  `refusal-notice.ts` and `bootstrap.ts` read the identical `report.admitted`-nested shape, but
  **in-process**, off the module-level `federationAdmissionReports` variable the daemon holds — never
  over HTTP/JSON, so they were never exposed to this bug (nesting is exactly what they expect and
  already correctly read).

`apps/admin/src/lib/api.ts` is the only boundary. The fix is complete — no other consumer shares the
now-fixed assumption.

## `writeAllowedButNotAllowlisted` — confirmed rendering correctly, not just present

This field is the one named failure mode for write grants (`trust.ts`'s
`writeAllowedButNotAllowlisted`, rendered as `inert-write-grant` / `INERT_WRITE_GRANT_KEY`: "on the
write list but not on the allowlist"). Before this fix it was silently `undefined` for every
connection, meaning **the panel could never have warned an operator about an inert write grant** —
not a cosmetic gap. Verified end-to-end, not just "present on the object":
1. My new regression test's wire fixture includes `writeAllowedButNotAllowlisted: ["list_styles"]` and
   asserts the flattener returns it intact (`api-external-mcp-admissions.unit.test.ts`).
2. The existing, untouched `external-mcp-admissions-rules.unit.test.ts:99-105` proves the next stage:
   an `AdminFederatedAdmissionEntry` with `writeAllowedButNotAllowlisted: ["edit_image"]` produces an
   `["inert-write-grant", "edit_image"]` row via `driftEntries`/`describeConnectionDrift`.

Chained together: real wire data → `flattenAdmissionConnection` (proven) → `AdminFederatedAdmissionEntry`
→ `driftEntries` → `inert-write-grant` row with the correct copy (proven). The full path is exercised.

## RED / GREEN

New file: `apps/admin/src/lib/__tests__/api-external-mcp-admissions.unit.test.ts`.

**RED** (pre-fix, `getExternalMcpAdmissions` returned the raw nested body untouched):
```
FAIL  getExternalMcpAdmissions flattens the daemon's report-nested wire shape into AdminFederatedAdmissionEntry
  expect(result.connections).toEqual([...flat shape...])
  - Expected: admitted/refused/allowlistedButAbsent/writeAllowedButNotAllowlisted at top level
  + Received: { connectionId, isPreset, report: { admitted, refused, ... } }
```

**GREEN** (post-fix): `2 passed (2)`.

A second RED/GREEN cycle happened mid-fix: running the FULL `apps/admin` suite (before load made that
run untrustworthy — see below) turned up a real regression my first pass introduced —
`api-long-tail-endpoints.unit.test.ts`'s `getExternalMcpAdmissions hits GET /mcp-servers/admissions`
test uses a generic `okJson({})` stub (shared by ~50 other "hits the right URL" tests in that file) and
my first implementation did `raw.connections.map(...)` unguarded, so a body with no `connections` key
at all threw `TypeError: Cannot read properties of undefined (reading 'map')`. Fixed with the
`raw.connections ?? []` guard described above. Re-ran and confirmed GREEN:

```
Test Files  4 passed (4)
     Tests  90 passed (90)
```
(`api-long-tail-endpoints.unit.test.ts`, `api-external-mcp-admissions.unit.test.ts`,
`external-mcp-admissions-rules.unit.test.ts`, `use-external-mcp-admissions.unit.test.tsx`.)

## tsc

`cd apps/admin && npx tsc --noEmit -p .` — **0 errors**, confirmed twice: once right after the initial
fix, once again after the `raw.connections ?? []` guard was added. Baseline held at 0.

## Full-suite caveat (team-lead direction, not my own evidence)

I ran the full `apps/admin` vitest suite once (`5 failed | 5837 passed`, all 5 failures either the
`getExternalMcpAdmissions` regression above or two unrelated component tests —
`composer-slash-plugin-pin.unit.test.tsx` and `AgentPlugins.unit.test.tsx` — timing out at their hard
5000ms `userEvent` limit). System load was 349 at the time (18 shell users, several agents' own test/tsc
runs contending). Re-running `AgentPlugins.unit.test.tsx` in near-isolation still showed a 31s transform
/ 50s import phase before the test itself even started — confirms the timeouts are load-induced, not
caused by this change (nothing in api.ts or external-mcp-admissions-rules.ts touches
`AgentPlugins`/`AssistantDock`). Per team-lead: an unscoped full-suite result at that load is not
trustworthy evidence either way and was not used to certify this fix — the scoped re-runs above are.
Not chased further; flagging here so nobody double-reports it as caused by this commit.

## Architecture Audit

- **Status: PASS.**
- ADR rules checked: layer boundary (fix stays inside `apps/admin`'s own client adapter, does not touch
  `apps/website` server routes or the certified "relayed verbatim" test); no new cross-app import; no
  change to the daemon's C-009 "pure serializer" contract or the C-008 proxy's "treat as unknown, relay
  verbatim" contract, both of which have their own certified tests that still pass untouched.
- Files audited: `apps/admin/src/lib/api.ts`,
  `apps/admin/src/lib/__tests__/api-external-mcp-admissions.unit.test.ts`.
- No violations found.

## Pre-Completion Checklist

- Requirements re-verified: the live crash's exact stack trace was reproduced by tracing the real data
  flow (not guessed), root-caused to a wire/type mismatch, and fixed at the one boundary that needed it.
- Fresh evidence commands: `npx vitest run` (scoped to the 4 relevant files, twice — pre- and post-guard-
  fix) and `npx tsc --noEmit -p .` (twice), all run from `apps/admin`, all passing.
- No certified test deleted or weakened — `admin-external-mcp-admissions-routes.test.ts`'s "relayed
  verbatim" test and all 55 `external-mcp-admissions-rules.unit.test.ts` tests are untouched and green.
- Scope: `apps/admin/src/lib/api.ts` + one new test file. No production file outside `apps/admin`
  touched, despite the root cause spanning two apps' worth of routes — the completeness check above is
  why that was safe.
- Open items: the two load-induced test timeouts noted above are pre-existing and unrelated; not fixed,
  not in scope.

## Self-Validation

Not run as a live-browser check — no daemon/admin dev session was safe to drive without disturbing other
agents' shared state (repo-wide warning: admin dev-server saves full-reload and can destroy a live chat
run other agents may be using; no browser automation session was confirmed free). Confidence instead
comes from the RED/GREEN regression test using the EXACT wire body the daemon's own route sends
(pinned by the certified C-008 route test), chained through the existing, untouched pure-function tests
that already prove the next stage (flat entry → drift rows, including the `writeAllowedButNotAllowlisted`
chain above) — i.e., every hop of the real pipeline has direct test coverage, even though no single test
drives the full HTTP round trip through a real browser.

## Style Notes

- `flattenAdmissionConnection`: pure, `O(1)` (copies four already-computed arrays, does not iterate
  them), no findings. `getExternalMcpAdmissions`: one await + one map + one `?? []` guard, no findings.
- No deviation from the required-input-object convention — both changed functions take a single value
  or nothing, matching the surrounding file's existing endpoint-wrapper style.
- Zero-findings skepticism: variable names checked — `raw` (the pre-flatten wire object) and its field
  `raw.connections` are never confused with the post-flatten `AdminExternalMcpAdmissionsSnapshot`
  they produce; no stale/misleading name introduced.

## Risks / tech debt

- None introduced. The two flaky component-test timeouts under load are pre-existing and outside this
  change's files.
