# Error system E3–E11 dispatch plan

**Four Jini source sheets and two Tovu preparation sheets are ready.** The production handoff is partial. The held `ex-err-jini` branch owns the HTTP incident helper, protocol error module, and several daemon files. Three compatibility questions also need answers before the affected production sheets can land.

Bases verified at Jini `d3e78b387` and Tovu `776ce6d0f0`. This was a read-only review. No files changed and no tests, builds, installs, type-checks, or linters ran. Line references are to merge-6 unless a branch is named. The November 16 design’s site counts are historical.

## Step order

| Step | Sheet IDs | Repo | Runs after | OPUS-CLOUD part |
|---|---|---|---|---|
| E3 | E3-J-SERVER, E3-T-HOST | Jini server → Tovu website | Jini HTTP incident seam decision and held-file clearance. Tovu after `tv-split`, `tv-rs-e`, `tv-dh`, `tv-b1`, `tv-po`, `tv-xd5-publish`; coordinate `RD-T1` for `serve-listen.ts` | Publish the Jini artifacts and refresh the Tovu locks |
| E4 | E4-J-TRACKER, E4-J-HTTP, E4-T-PINS, E4-T-READERS, E4-T-BOUNDARY | Jini core/http-kit → Tovu website/admin | Tracker sheet can precede host bindings. Pin old Tovu outputs first. Land new readers before producers. Tovu boundary follows E3-T-HOST and `tv-xd5-render` for consent composition | Core/http-kit release and Tovu lock refresh |
| E5a | E5a-J-CORE, E5a-J-HTTP, E5a-J-DAEMON | Jini core → http-kit → daemon | E2. Complete all three before connecting a live catalog resolver | Publish changed Jini contracts before Tovu uses them |
| E5 | E5-J-GUARD, E5-J-FORMS, E5-J-VERSION, E5-T-VERSION, E5-J-RULES, E5-T-RULES | Jini, then Tovu | Guard can land independently. Form delivery → version bindings → rule arrays. Live adoption follows E5a and E3 | Browser bundle check and any new consumer export or release |
| E6a / E6 | E6a-J-NOTICE, E6a-J-READER, E6a-J-HOOKS, E6a-T-READER, E6-J-CARD, E6-J-W6, E6-T-W6 | Jini UI/admin/chat/commerce → Tovu admin | Readers before E4 producers. Cards and W6 follow readers and E4 | Release UI and other consumed Jini changes |
| E7 | E7-W1/W3/W4/W5/W7/W8 | Both | Use the dependency table below | Tovu idiom consumers need the core release |
| E8 | E8-J-DAEMON, E8-J-CHAT, E8-T-AGUI | Jini daemon/chat → Tovu website/admin | AG-UI phase 2 first, including `AG-J1`/`TV-AG1` where they move the bridge. After `jb1`, `jb2`, and `RD-J1/J2`; E8 before phases 3–4 change the same transport | Publish daemon/chat artifacts, refresh locks, run the real encoder/validator proof |
| E9 | E9-J-FRAME, E9-J-HANDLER, E9-T-INVENTORY, E9-T-IPC | Jini sidecar → Tovu desktop | Frame and handler in separate commits. Desktop inventories before any wrapping; wraps after E3 and the structured refusals identified by inventory | Publish any changed sidecar or desktop-consumed core artifact; refresh desktop lock |
| E10 | E10-J-PARAMS, E10-T-I18N | Jini protocol → Tovu admin | Held-file clearance, E5 sentence set, E6a readers | Protocol release and lock refresh; bundle/completeness proof |
| E11 | E11-J/T template | Both | `r62t-err-rows`, combine reconciliation, then zero debt in the selected package | Run the gates and reconcile generated debt evidence |

## Disposition

| ID | Disposition | Reason |
|---|---|---|
| E0 | RETIRE | Jini has all three rules under `scripts/eslint-rules/errors/` and `scripts/error-gate-debt.json`. Tovu has `development/scripts/check-error-gate.mjs:61` and its debt ledger. Both still operate in WARN mode by default. |
| E1 | RETIRE | Jini `infra/src/events/outbox/ports.ts:61`, `worker.ts:53`, and `cms/src/forms/delivery/retry-policy.ts:35` implement the closed ledger-code path. `failure-codes.test.ts` and `retry-policy.unit.test.ts:70` are its regression tests. |
| E2 | RETIRE | Jini `core/src/errors/` has the catalog, reporter, disclosure, approved cause, ID formatter, idioms and test fakes. `core/package.json:389–433` exposes the leaves. `reporter.ts:80` implements ER-8. HTTP-kit `settings/stream.ts:137` defines a different, module-local `createErrorReporter`; it supplies no evidence of E3 wiring. |
| E3-J-SERVER / E3-T-HOST | PARTIAL | Both presets still lack a bound incident sink. The reporter needs an ID-returning route seam and an operator record sink. Tovu also needs a current caller-by-caller logger manifest. |
| E4-J-TRACKER | READY-FOR-CODEX | ER-6 settles original object identity and per-call exact secrets. Core has no live host binding to migrate in this sheet. |
| E4-J-HTTP | OWNED-ELSEWHERE `ex-err-jini` | Held `http-kit/src/internal-error.ts` and its test are the required implementation files. The held diff does not establish E4 completion. |
| E4 route-seam compatibility | NEEDS-DECISION | May the Express `RouteHostContext` carry the existing `ReportRouteInternalError` function as an additive field? Recommend yes. The existing `onInternalError` callback takes a correlation ID already minted by HTTP-kit and returns `void`. An additive field exposes the reporter’s returned ID while preserving the legacy sink contract. |
| E4-T-PINS | READY-FOR-CODEX | Seven server characterization cases can land as a test-only commit against the old producer. |
| E4-T-READERS / E4-T-BOUNDARY | PARTIAL | Freeze both old reader directions and resolve disk-space parity before changing the producer. |
| E4 disk-space compatibility | NEEDS-DECISION | May the 507 disk-space refusal drop its legacy `errorId` and incident record? Recommend yes, keeping status, code, and safe disk-space words. `backup-policy.ts:10–16` classifies it as a refusal. Tovu `admin-failure.ts:74–77` currently records it and returns an ID. The fixed contract requires zero incidents for refusals. |
| E5a-J-CORE / E5a-J-HTTP | READY-FOR-CODEX | Core and HTTP-kit can accept the resolver with the existing default mapping. Fourteen production `statusForError` call sites were found across the three named packages, up from 11 in the design. |
| E5a-J-DAEMON | PARTIAL | Nine current sites, with held test files. Refresh the route-host flow and fakes for each site before dispatch. |
| E5-J-GUARD | READY-FOR-CODEX | Reuses the existing import parser and guard entry point. |
| E5-J-FORMS / E5-J-VERSION / E5-T-VERSION / E5-J-RULES / E5-T-RULES | PARTIAL | The generic version sentences already exist in `core/src/errors/sentences.ts` as `CORE_ERROR_SENTENCES`, including the legacy `CONCURRENT_EDIT` alias. Form delivery, scoped version bindings, and model-string parity still need feature-level sheets. |
| E5 browser bundle / Tovu package and lock changes | OPUS-CLOUD | Bundle the actual client sentence imports with Node built-ins treated as errors. Publish required exports and update the root and desktop locks. |
| E6a-J-NOTICE | READY-FOR-CODEX | Existing component and test support the visitor presentation without moving its hook or altering its entry point. |
| E6a-J-READER / E6a-J-HOOKS / E6a-T-READER | PARTIAL | Lock down which host supplies disclosure and report callbacks. Tovu `admin-failure-channel.ts:75–98` can quote a legacy server reply in the cause field; the signed-in contract specifies a fixed incident cause. |
| E6-J-CARD / E6-J-W6 / E6-T-W6 | PARTIAL | The design TSV names 13 Jini W6 sites and zero Tovu W6 sites. A notice owner, existing draft/cache behavior, and a fake-port test are required for each migrated action. |
| E7-W1/W3/W4/W5/W7/W8 | RETIRE as new shared implementation | E2 provides the idioms and reporter calls these sweeps need. The row-specific source changes and ledger reconciliation remain assigned below. |
| E7 optional probes, E3/E4/E6 rows, and 287 Jini catch-only census | OWNED-ELSEWHERE `r62t-err-rows` | Use the host, reader, and release dependencies below. |
| E8-J-DAEMON / E8-J-CHAT / E8-T-AGUI | PARTIAL | Daemon lifecycle is held. Chat and Tovu need the phase-2 branch, the first wire proof, and refreshed live/reload importer lists. |
| E9-J-FRAME / E9-J-HANDLER | PARTIAL | The parse and handler paths sit in a 91-line socket callback nested inside 131- and 156-line functions in the sidecar size ledger. Both exceed the hard edit limit. |
| E9 sidecar prerequisite | NEEDS-DECISION | May a separate sidecar size sheet extract the existing frame and handler bodies verbatim before the two E9 behavior changes? Recommend yes. Size first makes the two boundary changes independently reviewable. |
| E9-T-INVENTORY | READY-FOR-CODEX | A standalone inventory commit establishes which renderer consumers must migrate before wrapping. |
| E9-T-IPC | PARTIAL | Inventory and structured-result migrations first. Exact live registration list needs the Jini desktop extraction and pushed Tovu branch versions. |
| E10-J-PARAMS | OWNED-ELSEWHERE `ex-err-jini` | `protocol/src/errors.ts` and `src/__tests__/errors.test.ts` are held. |
| E10-T-I18N | PARTIAL | Needs released `readErrorParams`, actual catalog imports, the 21-locale manifest, and the page/post caller map around `asPage()`. |
| E11-J/T | PARTIAL | Template below. No package qualifies before `r62t-err-rows` lands. |
| Hygiene-a/b and practice | OWNED-ELSEWHERE hygiene/practice cloud cull | Existing dispatch. |
| launch-44-41 | OWNED-ELSEWHERE `jy-pay`, `jy-core`, `jy-pads`, `jy-cls`, `jy-pa`, `jy-pb`, `tv-y1`, `tv-y2` | Assume they land first. |
| ACP-3/4/5 redo | OWNED-ELSEWHERE ACP redo | Existing assignment. |
| RT-J3 | OWNED-ELSEWHERE RT-J3 | Existing assignment. |
| Tier-2 class tokens | PARKED | Per-screen pass. |
| `todos.md` section L | PARKED | Owner hold. |
| 424 UI functions over 50 lines | PARKED | Owner tabled. |
| fn50 / c6fix | OWNED-ELSEWHERE fn50 / c6fix | Existing size and complexity work. |
| Coverage | PARKED | Outside this dispatch. |
| Mutation testing campaign | PARKED | The individual sheet mutations below are acceptance checks for combine. |
| Env, GitHub/Lipay, chat-redaction remainder, arch-120, redos | OWNED-ELSEWHERE `r62t-ext2` | Use the approved SIMPLE redaction sequence for E8. |
| AG-UI phases 2–4, MCP Apps, media, M5, visitor approval | OWNED-ELSEWHERE `r62t-feat2` | E8 owns only the failure carrier and its consumers. |

The requested held-branch stat showed **89 changed files**. Direct overlaps include HTTP-kit `internal-error.ts` and `__tests__/internal-error.test.ts`; protocol `errors.ts` and `__tests__/errors.test.ts`; daemon `run-lifecycle.ts` and its lifecycle tests, plus HTTP tests for attachments, connectors, DB ops, media, remote run events, research, runs, terminals, and xAI. `core/src/contracts/server/request-body.ts` and its test are held as well. Apply the same file hold to the remaining entries in the `ex-err-jini` stat, including held admin/UI, CMS, and chat files. E5a-J-CORE deliberately uses `api-error.ts` and `json-route.ts`, which were outside that write set.

`dh-jini` and `tv-dh` already move the entries/content-type write-error mappers and media parsers. Their `write-error-status.ts` and `metadata-fields.ts` moves are retired as extraction work. Catalog adoption remains separate.

## Rules to copy into each Codex brief

Behaviour identical except for the changes explicitly named in the sheet. API args `(required, optional = {})` for new functions only, with framework-dictated signatures exempt. No re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`. Functions ≤50 lines and complexity ≤10. Record files over 500 lines in `COMMIT-PLAN.md` and continue. STOP only the affected sheet for a missing declaration, an unlisted production importer, a needed cast, or a size or complexity overage. Check production importers with `git grep -n -F '<symbol>' -- apps/ development/ packages/`. Record unlisted test importers that need the same repoint in `REFRESH.md`.

Machine rules for executors: no other repo-wide scans, tests, builds, installs, type-checks, linters or codebase-memory-mcp. `.git` read-only. `COMMIT-PLAN.md` at repo root. Test edits precede source edits. Combine runs the named tests and mutations. Hooks are injected as props. Vendors stay in provider packages. Jini domains use framework-neutral ports. Lockfile changes, new npm dependencies, new Jini packages, and publication go to OPUS-CLOUD.

Make only named edits. Move code and why-comments verbatim. Add only named helpers and only named tests. Avoid added guards, defaults, retries, abstractions and unused options. Re-read the diff and list removed extras in `COMMIT-PLAN.md`. New Jini code contains no Tovu names. Any approved Jini identity rename carries a `BREAKS:` line listing each downstream break.

## Ready sheets — Jini first

### E4-J-TRACKER · Jini core · merge-6 after the in-flight set · 4k

**Contract:** Logs / tracker and Logs / host incident record, ER-6.

- **Tests first.** In `packages/core/src/errors/__tests__/reporter.test.ts:50`, require `reports[0].error` to be the same object as `original`. At `:78`, assert the host diagnostic blanks standing secrets, call secrets, and recognizable secret shapes. Assert the in-process tracker receives the original object and `context.exactSecrets` contains the call’s list. At `:274`, retain the single-report assertion for `record`. Mutations restore `trackerCarrier`, omit the exact list, or omit the tracker handoff.
- In `packages/core/src/errors/reporter.ts:27`, add `readonly exactSecrets?: readonly string[]` to `IncidentTrackerReport.context`. Delete `trackerCarrier` at `:115`. In `reportToTracker` at `:122`, replace its `diagnostic` argument with the original `error` and per-call `exactSecrets`. In `recordIncident` at `:142`, pass `error` and `optional.exactSecrets` at `:160`. Preserve the redacted host record, level, attributes, rejected-promise observation, and `tracker: 'skip'`.
- **Imports and entry.** Existing imports stay. The direct type importer is `packages/core/src/errors/testing.ts:9`. The test imports the reporter at `reporter.test.ts:12`. Entry remains `@jini-ai/core/errors/reporter`. API baseline `api-baseline/jini-ai__core.json:1297` needs generated reconciliation. No injection or error-gate debt delta. No visual check.
- **STOP** if a live tracker consumer has appeared without verified adapter-side redaction and third-party label-plus-ID projection. The recording fake is in-process evidence. The host sheets must prove what leaves the process.

### E5a-J-CORE · Jini core · merge-6 after the in-flight set · 5k

**Contract:** Rules 1–3. The resolver changes status only.

- **Tests first.** Extend `packages/core/src/contracts/server/__tests__/api-error.test.ts` with a fake host mapping a feature code to 409, a host returning `undefined` for `NOT_FOUND` yielding 404, and no host for an unmapped feature code yielding 500. Bypass the resolver or remove the table fallback as the mutations. New import: `import { routeStatus } from '../json-route.js';`.
- In `packages/core/src/contracts/server/json-route.ts:69`, add `readonly statusFor?: (required: { error: ServerApiError }) => number | undefined` to `RouteHostContext`. Add `routeStatus({ error }: { readonly error: ServerApiError }, { host }: { readonly host?: RouteHostContext | undefined } = {}): number` returning `host?.statusFor?.({ error }) ?? statusForError({ error })`.
- At `:152`, have `errorAnswer` take `{ host }` and use `routeStatus`. Thread the existing host through `sameOriginRefusal:209` using `origin` as host, both `routeAnswer:235` refusal exits, `finalAnswer:251`, and `exceptionAnswer:260`’s `ClientFacingError` branch. Keep the incident branch and `api-error.ts:60` default table intact.
- **Imports and entry.** No production import changes in core. `contracts/server.ts` already exports `json-route.ts`, so `@jini-ai/core/contracts/server` is the entry. Update the generated core API baseline in combine. No manifest, injection, or error-gate debt change. No visual check.
- **STOP** if the current host type needs a cast or `request-body.ts` needs an edit.

### E5a-J-HTTP · Jini http-kit · after E5a-J-CORE · 5k

`split-jini`, `dh-jini`, and `rs-e-jini` all retain the adapter anchors below, including `adapter.ts:141`. This sheet is file-disjoint from their diffs and the held `internal-error.ts` edits.

**Contract:** Rules 1–3. Preserve refusal body and caller words.

- **Tests first.** In `packages/http-kit/src/__tests__/adapter.test.ts`, reuse `makeApp`, `makeRes`, `adapter`, and the existing `err`, `createApiError`, and `mountJsonRoute` imports. Mount a handler returning a feature refusal and assert 409 with a fake resolver, 500 without one, and the identical body. In `origin.test.ts:16`, exercise the existing foreign-origin refusal with a fake resolver and preserve the case without it. Mutations bypass `routeStatus` at the result or origin path.
- `adapter.ts:7` becomes `import { ClientFacingError, routeStatus, type JsonRouteAuthorize, type Result, type RouteHostInternalErrorContext, type RouteHostContext } from '@jini-ai/core/contracts/server';`. Change the parse result at `:65`, returned refusal at `:108`, and thrown `ClientFacingError` at `:130` to `routeStatus({ error }, { host: adapter })`. Thread `adapter` into private `sendRouteResult` from `:75`.
- `origin.ts:3` becomes `import { guardSameOrigin, routeStatus, type OriginContext } from '@jini-ai/core/contracts/server';`. At `:16`, pass `origin` as host. Keep `passesSameOriginGuard` and its callers on their current imports and signature. The other `statusForError` test imports test the old default table directly.
- **Debt and STOP.** No public subpath, API signature, injection, or ledger change. No visual check. STOP if a held file needs modification or the mount callback exceeds the hard limits.

### E5-J-GUARD · Jini scripts · merge-6 after the in-flight set · 5k

- **Tests first.** Add `scripts/__tests__/check-error-sentence-imports.test.ts` with `import { findErrorSentenceImportViolations } from '../check-error-sentence-imports.js';`. Cases: one allowed static import passes; no import fails; a second type-only import fails; a sole import from an error-class module fails. Mutations remove the count or allowed-target check.
- Add `scripts/check-error-sentence-imports.ts` with `findErrorSentenceImportViolations({ files }: { files: readonly { file: string; text: string }[] })` and `checkErrorSentenceImports()` as the argument-free guard runner. Use `import { importSites } from './lib/import-sites.js';`, `import { listSourceFiles, REPO_ROOT } from './lib/walk-imports.js';`, `import type { Violation } from './check-engine-boundaries.js';`, `import { readFileSync } from 'node:fs';`, and `import { join, relative } from 'node:path';`. Check `*.sentences.ts` for one static `import` or `type-import` of `@jini-ai/core/errors/sentences`. For files directly in `packages/core/src/errors/`, accept `./sentences.js` as the same owner. Report other import forms through the existing `Violation` shape.
- In `scripts/guard.ts:68`, add `import { checkErrorSentenceImports } from './check-error-sentence-imports.js';`; invoke it beside `checkErrorDisclosureCallers()` at `:121`. These are the only new importers. No package entry, manifest, API baseline, or debt row. No visual check. **STOP** if the existing parser misses a fixture import or the guard main exceeds the limit. Cloud owns bundling.

### E6a-J-NOTICE · Jini UI · merge-6 after the in-flight set · 4k

**Contract:** Site visitor and signed-in site owner rows.

- **Tests first.** Extend `packages/ui/src/features/panel-kit/__tests__/ErrorNotice.test.tsx:11`. With `disclosure="id-only"` and the existing fixture, assert operation words, the ID and “Report this error ID.” Assert the details, clipboard button, cause, step, versions and time are absent. An old failure without an ID shows its words without an ID prompt. Existing full-mode clipboard tests stay. Mutations render full details in visitor mode or suppress the ID prompt.
- In `ErrorNotice.tsx:8`, add `readonly disclosure?: 'full' | 'id-only'`; default it to `'full'` at `:21`. Keep the injected hook call unconditional. In ID-only mode render the operation words and, when an ID exists, the ID and translated `Report this error ID.`. Use the default markup for full mode.
- **Imports and entry.** No repoints. `index.ts:2–3` is the existing export, `ErrorNotice.test.tsx:3` and `src/__tests__/hook-injection.sweep2.test.tsx:8` retain their imports. Existing Tovu consumers keep their default; visitor call sites come with E6/E8. API baseline `api-baseline/jini-ai__ui.json:342,2751` needs generated reconciliation. No manifest or debt changes. Chrome look after visitor adoption, including a failure with no reference.
- **STOP** if the visitor rendering requires changing the hook, clipboard contracts, or Tovu callers in this sheet.

## Ready preparation sheets — Tovu

### E4-T-PINS · Tovu website · after `tv-split`, `tv-rs-e`, `tv-dh`, `tv-b1`, `tv-xd5-publish` · 6k

**Contract:** Characterization of the old wire ahead of the signed-in, visitor, authorized-export, and refusal changes. This sheet changes tests only.

- Extend `apps/website/src/server/inbound/admin-http/routes/system/__tests__/user-facing-failure.test.ts:5,16,30,65`. Keep `import { adminFailureResponse, sendAdminFailure } from "#src/server/inbound/shared/admin-failure";`. Add `import crypto from "node:crypto";`, `import { syncBuiltinESMExports } from "node:module";`, and `import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";`. Pin `Date` with the Node test clock. Mock the built-in `randomUUID` using the test context, sync named ESM exports after installing and restoring the mock, and use a fixed UUID.
- Pin seven cases. **Plain signed-in** carries the pinned UUID and fixed cause. **Anonymous** omits details and private canaries. **Export pilot** keeps approved redacted details. **`field: "message"`** contains the safe words. **Extra details** survive on the authenticated response. **Disk-space** pins the current 507, code and UUID before any policy change. **Existing ERR ID** supplies an export cause carrying `ERR-1234-5678-9ABC-DEF0` and pins the reused ID. Mutations remove the ID from the envelope, disclose visitor details, publish the unredacted export canary, change the response field, drop extra details, collapse 507 to 500, or mint over the existing ERR ID.
- The branch copies of `admin-failure.ts` retain `reportServerFailure:53`, `adminFailureResponse:69`, and `sendAdminFailure:122`. No production repoints, exports, debt, manifests, or visual check. **STOP** if the test runner cannot isolate the clock or built-in mock, or an existing-ID case differs from the old producer. Record the actual old output for the compatibility decision.

### E9-T-INVENTORY · Tovu desktop · after `tv-c6fix`, `tv-b1`, `tv-b3`, `tv-ext-rs-c`, `tv-tq`, `tv-split` and the in-flight Tovu set · 5k

**Contract:** Electron IPC / sidecar. Inventory only, one proposed commit containing the root `COMMIT-PLAN.md` entry.

- Enumerate current renderer catch consumers from `apps/desktop/src/renderer`; use scoped exact lookups for `.message`, `catch`, and the named classifier calls. Follow matching paths to their registered IPC channel and record file:line, current rejection text dependency, and structured refusal owner. Start at `use-add-site.hooks.ts:84,149` (`describeAddFailure` and the cancellation sentinel), `use-site-workspace.hooks.ts:292,298` (`ERR_ABORTED`, `PROJECT_NOT_OPEN_MESSAGE`), `use-site-theme-preview.hooks.ts:43`, and `import-error-details.ts:10`. Classify which of the webview, copied-details, and rejection-display paths depend on IPC rejection text.
- Trace imported renderer classifiers through the consumed Jini desktop-host artifact. `use-app-version.hooks.ts:20` delegates to `createAppVersionLoader`; the old direct catch reference in the design is stale. List the test that pins each actual text match and the mutation that changes that text.
- No production or test edits, imports, exports, or debt changes. **STOP the later wrap sheet** for any channel with unresolved rejection-text semantics. Electron look follows E9-T-IPC, including cancel, import, site switching and app version.

## Partial implementation handoff

- **E3 / E4 host wiring.** On each of `split-jini`, `dh-jini`, and `rs-e-jini`, `server/src/route-host.ts:34–37` forwards the HTTP-kit reporter function, and `http-kit/src/internal-error.ts:33` still owns UUID minting. Jini `create-local-node-daemon.ts:505` builds an origin-only adapter. `compose-jini-kernel.ts:409–410` supplies it to route composition; the extension path does so at `create-local-node-daemon.ts:374`. Tovu `tv-split`, `tv-rs-e`, and `tv-dh` each retain `composition/jini-routes.ts:65` and the tracker binding at `composition/app.ts:418`. The base logger lookup found **16 production constructor calls plus one test fixture** under the website source, so refresh the design’s 17 production calls. Bind one catalog/reporter per host. Keep full incident metadata on the operator sink. `core/src/primitives/logger.ts:125–132` prints projected `meta` before delivering diagnostics, and string metadata under `diagnostic` can pass through. Passing the reporter’s full `meta` to that console path would expose the operator record. The host test throws through a mounted Jini route and asserts one record and the response’s exact ERR ID, with the route response free of a private prose canary.

- **E4 readers and boundary.** Freeze `approvedFailure` and `exportFailureFields` from `80b00f5b` in test fixtures. Feed both new envelopes and assert accepted fields. In the other direction, give the new reader old flat-with-details, flat-without-details, nested-with-`requestId`, and no-ID responses, including a UUID. Pin export and legacy `field: "message"` / extra details. Separate the guard removals at `warm-site-control.ts:41` and `site-cookie-consent.ts:331,369` from the additional consent guard at `:107`, which is outside the three design rows. Tovu producer tests need the `site-share-password.ts:77` export policy and the real host’s tracker projection. Preserve its approved cause only after the operation’s authorization check. Mutate identity, audience, matching step, and tracker exact-secret handling in the corresponding cases.

- **E5a daemon / E5 adoption.** Daemon status sites are `attachment-lookup-routes.ts:91`, `attachments.ts:375`, `message-relay.ts:45`, `model-proxy.ts:466`, `remote-run-events.ts:83`, `runs.ts:282`, `terminals.ts:252`, `tool-execution-caller.ts:42`, and `tool-execution-routes.ts:134`, all under `packages/daemon/src/http/`. Refresh their host arguments and held fakes. Form delivery needs nine catalog sentences plus the total `FORM_DELIVERY_CATALOG_CODE` map; use `instanceof FormDeliveryError` as `retry-policy.ts:38` already does. Keep the kebab values in the outbox ledger. Resolve sentence status and retryability for each code against the existing status and retry owners before dispatch. For rule arrays, preserve each distinct model-facing construction-site string, including both `MemberValidationError` reasons, and verify status and retryability per code. Separate `errors.sentences.ts` from server bindings. Tovu arrays need a refreshed manifest after `tv-fn50-2`, `tv-bl`, `tv-b2`, `tv-rs-e`, `tv-tq`, `tv-split`, `tv-xd5-render`, and `tv-xd5-publish` for their respective files. The exact-type lookup finds 10 Tovu arrays, while the old plan counted 14; inferred and moved arrays still need enumeration.

- **E6a / E6.** Jini reader destination is `ui/src/features/panel-kit/failure-from-response.ts`. Tovu keeps session and page/post context from `admin-failure-channel.ts:128–145`. Use the existing feature notice owner and injected `useReportFailure`; keep drafts and cached data. Map W6 in Jini by package. Admin owns ten TSV sites across form editor, access tokens, other credentials, root key, source control and region editor. Commerce owns two in `browser/checkout.ts`, and UI owns one in `useMemoryConnectors.hooks.ts`. Each needs a fake rejection and an ID/step assertion with a private canary excluded. Do not count held UI/admin preference or parsing edits as these notice migrations.

- **E8.** Start with the actual encoder and `HttpAgent` validator round trip. The existing browser witness is `apps/admin/src/lib/__tests__/assistant-transport.ag-ui.unit.test.ts:551`. Server witnesses include `apps/website/src/server/__tests__/assistant-ag-ui-routes.test.ts:621,637`. Shared write set after phase 2 includes `assistant-ag-ui.ts`, Jini `chat/src/core/ag-ui/event-projection.ts` and `assistant-client/ag-ui-transport.ts`, and the Tovu admin transport test. Current Tovu bridge error exits are `assistant-ag-ui.ts:216,304,405`. Preserve `payload.error` in `rawEvent`. If the real validator strips it, test the design’s immediately preceding `CUSTOM` event in the existing translation state. Keep the ID in the terminal words in either case. Pin intentional abort and terminal-state precedence first. Then prove emitter → decoder → `RunFailure` → projected status with `failure` → saved/reloaded notice, once per transport. Mutations strip metadata, rebuild an untyped error, emit twice, or turn abort into an incident. Apply the visitor, signed-in and model rows independently. The SIMPLE redaction change belongs to `r62t-ext2`.

- **E9 sidecar.** `json-ipc.ts:305–324` is the distinct parse refusal; `:352–368` is the handler incident. First replace the parse echo with `BAD_FRAME` and fixed words such as “The sidecar could not read the request frame. Send one line of valid JSON.” Update the real-socket assertions in `audit-regressions.test.ts:8` and `json-ipc.contract.test.ts:247`; mutate back to parser text. Remove `jsonIpcError` and its direct-test cases only once its production import closure is clean. Then use the injected reporter at the handler boundary. Retain `HANDLER_ERROR` and `requestId`, with the incident ID shared by peer and host record. Extend the case at `json-ipc.contract.test.ts:228` and the existing handler canary case in `index.test.ts:758`. Mutation restores the generic text or uses the connection trace ID in place of the incident reference. Keep the two sheets independent after the size prerequisite.

- **E10.** E10-J-PARAMS adds `readErrorParams({ details })` to the existing protocol error entry after the hold. Pin string/number values, the 16-key cap, and old-reader tolerance. E10-T-I18N takes the actual browser catalog’s source sentences into every one of the 21 locale blocks, with caller and key changes together. Replace `asPage` at `admin-failure-channel.ts:18` with the `{noun}` parameter at the real sentence/interpolation owner. Mutations remove one locale entry, omit `details.params`, or use the wrong noun. The fixed Copy details sentence and wire compatibility follow the disclosure contract.

### E7 dependencies for `r62t-err-rows`

| Rows | Follow |
|---|---|
| W1 optional probes and owned settlements | E2. Tovu follows the core release. Preserve fallback values and rejection ownership. |
| W3 cleanup | E3 host logger into `bestEffort`; use E2 where a logger is already injected. |
| W4 dropped writes/alerts and W7 unsafe log text | E3 host sinks. E4 when a reply and the incident record share an ID. |
| W5 absence | E2 `absentWhen`; E3/E4 for newly surfaced unexpected boundary failures. |
| W6 client actions | E6a-J-NOTICE, reader/hook sheets, then E6 feature notice owner. |
| W8 cause retention | E4 for HTTP, E8 for chat, E9 for IPC. Use existing `cause` or the existing reporter according to the boundary. |

### E11 template — one package activation per sheet

In Jini `scripts/check-error-gate.mjs`, or Tovu `development/scripts/check-error-gate.mjs`, name one exact package root in the strict-root set. Use the existing findings to return exit 1 for any current finding under that root, including when `--update` is requested. Keep global `--strict` and out-of-package WARN behavior. Match `root + '/'` to keep similarly named packages separate. Test zero clean findings, one in-package finding, and one elsewhere. The mutation removes the root-specific failure. First activation per repo owns the selector; later activations edit only its root list. STOP if the selected root has any checked-in debt or current findings. Combine must verify the `--update` path: both base scripts currently write `stored` directly, so that flag alone does not prove shrink-only reconciliation.

Base ledger anchors include Jini core 7, http-kit 6, daemon 57, server 4, chat 34, UI 58, protocol 3, and sidecar 5 file/rule entries. Tovu has admin 101, desktop 48, site-chat 7, and website 332. The same zero-debt condition applies to every other package after the sibling ledger lands.

## Batch reservation

| Order | Branch | Candidate sequence | Estimate |
|---|---|---|---|
| 1 | `codex/jini-error-system-1` | E4-J-TRACKER → E5a-J-CORE → E5a-J-HTTP → E5-J-GUARD → E6a-J-NOTICE with the four ready portions consolidated as described above → E5a-J-DAEMON → E3-J-SERVER. The two production tail sheets need refreshed held-file and route-seam clearance. Base merge-6 plus the in-flight Jini set; honor `split-jini`, `dh-jini`, `rs-e-jini` at the host handoff. | ~40k when fully specified |
| 2 | `codex/tv-error-system-1` | E4-T-PINS → E9-T-INVENTORY → E6a-T-READER → E4-T-READERS → E3-T-HOST → E4-T-BOUNDARY. Base merge-6 plus the Tovu prerequisites in the step table. Production adoption follows the matching Jini branch and Cloud artifacts. | ~45k when fully specified |

Both batch reservations remain incomplete under the six-to-eight-sheet dispatch rule. The ready Jini list comprises **five** entries above, counting the guard and UI notice alongside the tracker and two status sheets. The remaining work is the exact importer and test closure for the partial items, the held-file and size prerequisites, and the three decisions in the table. Use one Cloud publication/lock run for the eligible Jini outputs, including both Tovu core lock entries. The current desktop import at `apps/desktop/src/tracked-site-relocation.ts:27` is already a registry-install verification case for that run.
