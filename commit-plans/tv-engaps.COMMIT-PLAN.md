# Tovu engineering gaps handoff

Dispatch branch: `codex/tv-engaps`. Supplied base: `7801b3d883` (`codex/tv-c7a`).
Order: T1 → T2 → T3 → T4 → T6. T5 skipped as directed; owned by `codex/tv-sharezip`.
No tests, builds, installs, type-checks, linters, graph tools, commits or pushes were run.
RED/GREEN and mutation outcomes below are source-based expectations, not execution results.
The dispatch's complete sheets govern; existing optional pads and argument rules are preserved.

## T1 — DONE (implementation; combine verification owed)

- Base: `7801b3d883`.
- Files: `apps/website/src/cli/__tests__/integration/adopt-command.integration.test.ts`.
- Change: bound `initSite({ dir, name })` replaces only fixture CLI initialization and its exit assertion; the fixture and affected callbacks are async, and all 12 fixture calls are awaited. Both marker removals and actual CLI assertions remain verbatim.
- Tests first: reviewed the existing markerless-refusal/real-serve, schema identity and database byte-identity cases before editing. No new cases required or added. These behavior-preserving cases are expected green on the base; they are not claimed red. The CLI and direct path use the same bound initializer with equivalent defaults; persisted shape still needs execution evidence.
- Mutation owed to combine: omit each marker removal separately. Keeping config must break adoption of the partial marker set; keeping meta must break the existing absent-meta assertion. Retain real serving and database identity checks.
- Combine evidence owed: paired process counts and file runtime before/after on the same linked build, plus a completed run. Static call-site inventory predicts 12 fewer fixture init subprocesses; no measured saving claimed. Pair with T2 when its stop is resolved.
- API-baseline delta (Jini): none; no Jini edits or new APIs/dependencies.
- Look owed: none.
- Limits: fixture is 8 physical lines; changed callbacks span 14–39 physical lines. Existing why-comments retained verbatim, including the old CLI-fixture description.
- Diff re-read deletions: removed the fixture's CLI init assignment and exit assertion as required. No unrelated additions retained or removed.

## T2 — STOPPED (function length)

- Base: `7801b3d883`.
- Files: none changed. Inspected `apps/website/src/cli/__tests__/integration/serve-command.integration.test.ts`.
- Stop: required `initFixture` caller at line 596 belongs to callback lines 595–667: 73 physical lines, 63 excluding blank and line-comment lines. The provider/loopback witness caller at line 670 belongs to callback lines 669–748: 80 physical lines, 69 excluding blank and line-comment lines. Both exceed the hard 50-line limit. Awaiting those callers would change those callbacks; splitting or restructuring them is not named by the sheet.
- Tests: existing seeded-route and foreign-CWD cases reviewed; no tests added or changed. No RED/GREEN claim.
- Mutation owed to combine after an authorized replacement sheet: remove sample content. The seeded welcome route must fail. Retain foreign-CWD and real provider/loopback witnesses.
- Combine evidence owed: paired before/after timing and subprocess counts on the same linked build and a completed run after the stop is resolved.
- API-baseline delta (Jini): none.
- Look owed: none.
- File-size note: inspected serve integration file has 794 lines; file size is not the stop reason.
- Diff re-read deletions: none; no T2 edits were made.

## T3 — DONE (implementation; combine verification owed)

- Base: `7801b3d883`.
- Files: `apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts`; `apps/website/src/server/runtime/lifecycle/__tests__/agent-daemon-port.test.ts`.
- Ownership check: base `readExplicitOrigin` at line 59 returns nonempty URL strings directly and coerces ports with bare `Number`; neither named validation already exists.
- Tests first: added malformed URL, non-HTTP(S), credentials, query and fragment rejection cases, then blank, zero, fractional, negative and above-65535 port rejection cases. Each new rejection assertion matches a fixed setting-specific message, proving no raw input is echoed. On the base, `ensure()` resolves for every one of these inputs, so rejection assertions are expected red. Extended the existing precedence case to a scoped URL over an invalid port; this compatibility witness is expected green on the base.
- Change: validate in the existing private reader; retain original URL text, URL precedence and unconfigured allocation. Use the existing Node >=24 URL parser; no catch, helper, type, cast, import or dependency added.
- Mutation owed to combine: bypass URL validation and port validation separately; rejection cases must fail. Bypass each URL/port criterion to confirm its listed case detects it.
- API-baseline delta (Jini): none; policy remains private to Tovu.
- Look owed: none.
- Limits: reader is 18 physical lines; manually counted cyclomatic complexity 9. URL parse and numeric conversion cost O(n) time/space in setting length; no new I/O or retained state. Existing function comments left unchanged under the named-edit/comment restriction.
- Diff re-read deletions: replaced the permissive direct URL return and bare port coercion only; no unrelated additions retained or removed.

## T4 — STOPPED (function complexity)

- Base: `7801b3d883`.
- Files: none retained. Attempted, then fully restored: `apps/website/src/server/inbound/assistant/agent-daemon-server.ts`; `apps/website/src/server/inbound/assistant/__tests__/integration/daemon-boots.integration.test.ts`.
- Ownership check: base standalone listener at line 210 still uses bare `Number`; the requested setting validation is absent.
- Stop: `start()` at line 207 already has manually counted cyclomatic complexity 10: initial path 1, port ternary 1, port nullish fallback 1, address guard/OR 2, standalone guard 1, exiting guard 1, registry optional access 1, registry nullish fallback 1, lifecycle-log guard 1. Adding even one guard exceeds 10. The sheet names no helper or restructuring to create room.
- Tests first: wrote the one spawned-child case before trying the guard, then removed it with the stopped production edit. It checked prompt failure, setting/range guidance, no supplied canary and no listener announcement. Base bare coercion would fail the setting/range assertions; not executed.
- Mutation owed to combine after an authorized replacement sheet: restore bare `Number` coercion and require the child case to fail.
- API-baseline delta (Jini): none.
- Look owed: packaged Electron daemon-start look after the stop is resolved; missing→4319, explicit zero→OS assignment and shared-host internal zero must remain intact.
- Diff re-read deletions: deleted the attempted listener guard and its entire new child test. Both files match HEAD again. No side-effectful entry import was added.

## T6 — DONE (test implementation; combine verification owed)

- Base: `7801b3d883`.
- Files: `apps/website/src/features/deployments/static-publish/__tests__/adapter.unit.test.ts` only.
- Base check: named successful publish case did not assert an export count.
- Tests first: added local `exportCalls`, wrapped the existing injected `deps.exportSiteBound` while calling that same function, and asserted exactly one export with a plain-words message. Existing success assertions and imports remain unchanged. The base already exports once, so this test is expected green before production changes; no production edit is required or made.
- Mutation owed to combine: invoke the export twice in `adapter.ts`'s existing export path; the count must become 2 and fail the new assertion.
- API-baseline delta (Jini): none.
- Look owed: none.
- File-size note: adapter test file is 940 lines; continue per owner correction. Changed success callback remains below 50 lines.
- Diff re-read deletions: none; retained only the named counter, wrapper and assertion.

## Source review and remaining verification

Architecture audit: PASS for retained source changes against the dispatched boundaries: Tovu-only env policy; existing composition entry reused; no new platform module, Jini API, dependency, wrapper layer, re-export shell, cast or suppression. Execution status: PARTIAL because T2/T4 stopped and machine rules prohibit runtime verification.

| Unit | Source review | Direct evidence owed |
| --- | --- | --- |
| T1 fixture and affected callbacks | Existing contract/defaults retained; async sequencing explicit; no unrelated assertion changes | Existing refusal, real-serve and database identity cases; marker mutations; timing |
| T3 private env reader | Fixed diagnostics; URL precedence preserved; no findings recorded in allowed source review | Added rejection tables and scoped URL precedence; validation mutations |
| T6 success-case injection | Calls the same bound exporter; count observes actual invocations | Existing successful publish case and double-export mutation |

Zero-findings skepticism for the retained production change: checked malformed URL acceptance, protocol/credential/query/fragment criteria, lower/upper proxy bounds, raw-value disclosure, URL precedence and variable meanings. `url` is the parsed URL; `port` is the numeric explicit port. Runtime results and coverage remain unverified. No certified test was deleted or weakened in the retained diff.

Final diff review used targeted `git show HEAD:<path>` comparisons for the named files. No existing `_optional = {}` / `_options = {}` pad or argument rule was changed. All added or changed assertions carry plain-words messages. REFRESH.md records discovery and combine obligations.
