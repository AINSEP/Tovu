# Cull of r62t-debt-jini

Input `o-r62t-debt-jini/r62t-debt-jini.md`. Jini base `ro-m6-jini` d3e78b387. Read-only checks (`git grep -n -F`, file reads, gate rule source `scripts/eslint-rules/errors/*.mjs`).

## Owner summary
1. Seven small fixes swap a silent `catch` for the gate's own named idioms (`orFallback`, `observed`, `afterSettled`) or shrink a `try` to the bare `JSON.parse`. Nothing new is built; the idioms already exist in `@jini-ai/core/errors/idioms` and ten other files already use them.
2. One ledger sheet removes 21 keys (8 fixed + 13 already stale). Debt goes down only.
3. The design's two new test cases (commerce queue, OAuth invalidation) are cut: the swaps are exact equivalents and existing tests already pin them.
4. 480 rows stay put: 82 wait for E6 (feature notice owner), 111 wait for E3/E4 (wire envelope), 287 catch-only rows need a per-site census first. 59 rows are held/owned elsewhere or accepted KEEP.

Counts: KEEP 5 / CUT-TO 3 / DROP 0 / NEEDS-DECISION 0 / BLOCKED 3 (groups). New bugs: none found.

## Verdicts

| Item | Verdict | Reason (checked) |
|---|---|---|
| J1 admin widget placement (row 46) | **CUT-TO** | `region-editor.controller.ts:30–32` `.catch(() => {})` is the finding (rule `catch-reads-error.mjs` flags param-less `.catch`). Drop the `lookup` binding: `orFallback` is `async` and calls `work()` before its first `await` (`idioms.ts:47`), so `api.getWidget` still runs synchronously inside `addPlacement`. |
| J2 chat attachment liveness (128) | KEEP | `attachment-liveness.ts:45–58` try has an `await`, so not a pure parse; `orFallback` with `fallback: false` is exact. |
| J3 CMS date label (191) | KEEP | `date-label.ts:49–53`. The `const siteTimeZone` binding is needed for type narrowing inside the closure. `normalizeTimeZone`'s catch is already exempt (`Intl.DateTimeFormat` is on the rule's constructor list). |
| J4 daemon live session state (241) | KEEP | `live-session-state.ts:9–14`: `isRecord` inside the `try` is what breaks the pure-parse exemption; moving that one return line out is the smallest fix. |
| J5 UI fetch-query adapters (512–513) | KEEP | `adapter.react.tsx:118`, `adapter.tanstack.tsx:184`: `promise.catch(() => {})` ≡ `observed({ promise })` (`idioms.ts:24`). Keep the comment above each. |
| J6 commerce transaction tail (209) | **CUT-TO** | `repo.memory.ts:484` `run.catch(() => undefined)` ≡ `afterSettled({ promise: run })`. Drop the new test: `ledger-contract.ts:864–880` already throws inside a transaction, asserts the original rejection, then runs the next transaction (the `tail = run` mutation turns it red). |
| J7 OAuth invalidation (407) | **CUT-TO** | `registration-cache.ts:58` swap as designed. Drop the new test; the change is an exact equivalent; witness stays `dynamic-registration.test.ts:177`. |
| J8 ledger shrink | KEEP | 13 stale keys verified: `ai-trace/{capture,sinks}.ts` absent; `use-form-editor.hooks.ts`, `claude-stream.ts`, `useVersionManager.ts` have no `catch`; `use-entity-edit.ts:39` is a pure parse, `:118` reads `error`; `json-event-stream.ts:51` try is bare `JSON.parse`; `mcp-bridge.ts:216,239`, `frontend-request-route.ts:53`, `frontend-sessions.ts:274,298,333` bind and read their errors; `useMemoryConnectors.hooks.ts:199` passes `err` on and has no inline text. Delta: 21 keys. |
| Accepted handling (11 rows) | KEEP | No edit. |
| Held `ex-err-jini` (42), routing/ACP/AG-UI/redact (5) | KEEP (owned elsewhere) | No edit. |
| U browser notices (82 rows) | **BLOCKED** on E6 | Needs the feature owner for each notice. |
| W wire and audience (111 rows) | **BLOCKED** on E3/E4 | Needs the host reporter (E3) and the frozen reader directions (E4/E6a). |
| O catch-only remainder (287 rows) | **BLOCKED** on a per-site census | Recommendation for round 2: one mechanical census that sorts each catch into "exact named idiom" (`observed`/`afterSettled`/`orFallback`/`orFallbackSync`/bestEffort with an existing logger), "shrink the try to a pure parse", or "needs a decision". Sheet only the first two kinds, as J1–J7 do here. |

Note for the release runner, not a sheet: `admin` peer-depends on `@jini-ai/core ^0.7.0` (`packages/admin/package.json:456`) and `oauth` on `^0.7.1`. `errors/idioms` is only in the unreleased `core-error-system` changeset, so those peer ranges must move when core releases. Ten cms/platform/sidecar/devops files already need the same.

## Exact cut text

All sheets: base **merge-6** (d3e78b387), no pushed prerequisite. Import line for each: `import { <idiom> } from '@jini-ai/core/errors/idioms';` (quote style of the file). No changeset (no public API change). No new tests unless named.

### J1 — admin widget placement
In `packages/admin/src/widgets/controllers/region-editor.controller.ts` `addPlacement`, replace
`void api.getWidget(…).then(({ widget }) => { … }).catch(() => {});`
with
`void orFallback({ work: () => api.getWidget(…).then(({ widget }) => { … }), fallback: undefined, step: 'read draft widget details' });`
The `.then` body and the comment above it stay verbatim. No `lookup` variable. Witness: `region-editor.controller.unit.test.ts:76,85`. STOP if `orFallback`'s `Value` type cannot infer `undefined` without a cast.

### J2 — chat attachment liveness
As designed: `isAttachmentStillServed` body becomes `return orFallback({ work: async () => { <existing request + return response.ok, verbatim> }, fallback: false, step: "probe saved attachment" });` with the two-line catch why-comment moved verbatim above `fallback`. Witness: `delivery-and-liveness.test.ts:107,126`.

### J3 — CMS date label
As designed (bind `const siteTimeZone = optional.siteTimeZone;`, keep the early return, `return orFallback({ work: async () => normalizeTimeZone({ timeZone: await siteTimeZone.resolveTimeZone(required) }), fallback: DEFAULT_SITE_TIME_ZONE, step: "read site time zone" });`). Witness: `date-label.unit.test.ts:58–66`.

### J4 — daemon live session state
As designed: `let value: unknown;` before the `try`; `value = JSON.parse(line);` inside; catch unchanged; `return isRecord(value) ? value : undefined;` after. Witness: `live-session-state.test.ts:41–49`.

### J5 — UI fetch-query adapters
Replace `void promise.catch(() => {});` with `observed({ promise });` in both adapters. Witness: `fetch-query.test.tsx:528,588`.

### J6 — commerce transaction tail
`repo.memory.ts:484` `tail = run.catch(() => undefined);` → `tail = afterSettled({ promise: run });`. Keep the comment. **No new test.** Witness: `ledger-contract.ts:864–880` (combine mutation: `tail = run`). STOP if `tail`'s declared type rejects `Promise<void>` without a cast.

### J7 — OAuth invalidation
`registration-cache.ts:58` → `const pending = inFlight.get(key);` then `if (pending !== undefined) await afterSettled({ promise: pending });`. Keep the comment and `delete` call. **No new test.** Witness: `dynamic-registration.test.ts:177`.

### J8 — ledger shrink (last)
Only `scripts/error-gate-debt.json`. Delete, by exact `(file, rule)`, the 13 stale keys (ordinals 9, 21, 22, 90, 91, 96, 103, 243, 258, 259, 505, 506, 527) and the key of each FINISHED J1–J7 sheet (46, 128, 191, 209, 241, 407, 512, 513). Keep the order and every other value. Record each key's sheet in `COMMIT-PLAN.md`. STOP a key if its sheet stopped or its `(file, rule)` differs.

## Run plan
- `j-dj-jini-DRAFT.md`: J1 → J7, then J8 last. 8 sheets, base merge-6. No split is needed because no file overlaps; the batch is already 8.
- No Tovu half. No OPUS-CLOUD.
