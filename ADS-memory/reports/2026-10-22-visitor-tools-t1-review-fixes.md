Programmer(Direct): selected the Programmer persona to repair the returned security, correctness and documentation findings within the existing T1 owners.

# Visitor tools T1 review fixes — 2026-10-22

Changes remain **uncommitted**. No tests, installs, builds, servers or background processes were run. Test behavior, TypeScript compatibility and coverage remain unverified. Read-only ESLint checks and `git diff --check` passed as described below. This report supersedes the original T1 handoff's site-first reservation and unbounded memory-sink descriptions.

## Inputs and boundaries

- Canonical review: `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-22-visitor-t1-j1-review.md` (F1–F12).
- T1 implementation handoff: `ADS-memory/reports/2026-10-22-visitor-tools-t1-handoff.md`; current uncommitted source and HEAD's capability-registry rationale.
- Loaded the requested canonical roster and Programmer persona, workspace bootstrap, applicable implementation/review/navigation/documentation guidance, ADR-054 and governance GOV-ADR-001. Architecture sections 13/14 and project memory are absent at this clone's instructed paths; consulted the canonical `/Users/la/Programming/Tovu/ADS-memory/` copies. No architecture change, gated mutation, provider/commerce implementation or generic platform module was added.
- Graph tools are unavailable. Source discovery used `rg` and direct reads, including the manifest-named Jini owners in `/Users/la/Programming/tovu-integration-clones/jini-int2/packages/`. Those sibling sources establish contracts, not installed-package verification. Explicit dispatch instructions supersede persona test-running and seed-approval steps for these prescribed review repairs.

## Findings

| Finding | Disposition and evidence |
| --- | --- |
| F1 | **Fixed in source.** IP check precedes site check. IP refusals cannot charge shared allowance. Both rationale comments updated. Regression exhausts one IP, sends another 1,001 rejected calls, then verifies all 970 remaining site slots still admit fresh IPs. A site refusal may conservatively spend an IP slot. |
| F2 | **Fixed in source.** `authorize` catches policy/budget errors, reports the original error, and returns `deny`. The existing `failPolicy` case remains; budget rejection joins the same table, which now asserts the denied audit phase and one error report on infrastructure failure. Runtime pass is unverified. |
| F3 | **Fixed.** Restored HEAD's rationale alongside the code: transport/capability separation, default-deny/non-disclosure, validation ownership, no plugin/config catalog, caller-class review, per-request closures, directive/model privacy split, error diagnostics and schema re-export. Only T1-changed facts were updated: private Jini registration, eligibility/caller checks, policy, uniform refusal and normalized error reporting. The former shared-caller-set rationale now sits with the replacement contract. |
| F4 | **Fixed and complexity checked.** The dedicated-writer table owns the optional `normalize` hook; the visitor row supplies validation. `set` assigns the guard's normalized return. ESLint measures `set` at 8 (review baseline: 11), with no function over 10 in the six checked logic modules. |
| F5 | **Already protected on the reported HTTP path; regression coverage added.** Jini `getEffective` → `resolveDefinition` → `resolveDefinitionRaw` follows rename aliases and reads values by stable `settingId`, so alias behavior does not downgrade the concern to INFO. However, `settings/shared.ts` already fences every definition batch touching `site.assistant`, including aliases, source namespaces and rename targets, before any item writes. `assistant-subagents-access.ts` owns that preflight. Tests now cover register/rename/retype/deprecate/tombstone on canonical and alias coordinates, mixed-batch atomic refusal, and rename into the namespace. Reused this existing owner instead of adding a second guard. |
| F6 | **Fixed in source.** The existing memory sink retains at most 20,000 events by default, evicts oldest first, preserves its live array/detail override contract, and allows a smaller injected cap for tests. Invalid caps reject. The memory composition explicitly uses it and documents public traffic. This sink is bounded operational/test history with one shared cap; separate durable visitor/admin retention is unchanged. |
| F7 | **Fixed in source.** `cancelled` maps to the uniform refusal, bypassing the route's error-report branch. Handler failures report their original exception before Jini converts it to a string, retaining server-side stacks; aborted handler work skips that report. Tests cover cancellation both before and during execution, zero error reports, and original handler stacks. The route still creates its normal safe public error id for real error outcomes; the original stack report is additional server-side diagnostics. |
| F8 | **Fixed in source.** All six CMS grants return the original `publicCapabilityCard` object unchanged, preserving summary, explanation and pointers. Reduced cards keep the operator-guidance suffix while advertising only granted actions. Tests compare both model-facing operations against the original output under default grants. |
| F9 | **Fixed.** Comment and test name now describe the synchronous increment/check after the awaited audit append. |
| F10 | **Deferred as requested.** Existing revision-dependent refusal/J1 seam remains. T2 must adopt published CAS, forward the option through the host writer and handle conflicts. No proxy CAS added. |
| F11 | **No T1 change, as requested.** Per-process scope, shared-IP effects, IPv6 rotation and busy-site defaults remain T2 design notes. |
| F12 | **Deferred as requested.** No role grants added. T2 owns management permission exposure. |

## Files changed by this repair

Production (relative to `apps/website/src/`):

- `assistant/site/visitor-tool-budgets.ts`
- `assistant/site/visitor-executor.ts`
- `assistant/site/capability-registry.ts`
- `features/settings/site-title-write.ts`
- `features/tool-audit/repo.memory.ts`
- `server/runtime/composition/app.ts` (bounded-sink composition/comment only)
- `server/runtime/composition/public-site-guide.ts`

Tests (relative to `apps/website/src/`):

- `assistant/site/__tests__/visitor-tool-budgets.unit.test.ts`
- `assistant/site/__tests__/visitor-executor.unit.test.ts`
- `features/tool-audit/__tests__/repo.dialects.test.ts`
- `server/inbound/admin-http/routes/settings/__tests__/visitor-tools-protection.integration.test.ts`
- `server/runtime/composition/__tests__/public-site-guide.test.ts`

Artifacts: this report and the ignored `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` follow-up. Other pre-existing T1 files, `.cloud-coord/visitor-tools-design.md` and `AI-Dev-Shop` were not edited by this repair.

## Reuse and function assessment

- Reuse: budget accounting; inspected HTTP-kit's limiter/store and Tovu profiles plus visitor adapter; retained the same serialized accounting owner, reordered only the two site-specific checks. No counter implementation added.
- Reuse: authorization, cancellation, error/audit lifecycle; inspected Jini ToolExecutor/withToolAttemptAudit and visitor registry/route; retained their lifecycle and added the prescribed visitor-boundary normalization/reporting. Ports remain injected and public object signatures remain compatible.
- Reuse: settings validation and definition fencing; inspected host chokepoint/table, settings HTTP routes/preflight, Jini alias/definition/read/write contracts and generic tool registrations; extended the existing normalize table, retained the existing batch fence. ADR-054 names the dedicated settings owner.
- Reuse: memory retention; inspected host memory/durable sinks and Jini's audit port/decorator; extended the host memory sink, preserving its live array. Array eviction is O(capacity); no ring module or dependency added. Future generic extraction is recorded in SURVEY because sibling Jini is outside this dispatch's write scope.
- Reuse: guide output; inspected the anonymous card and Jini guide adapter; return the existing card for complete grants and retain the policy-filtered variant for reduced grants.

All newly changed logic uses existing injectable seams. Refusal paths return stable outcomes; failed infrastructure reports before denying. Resource costs remain two serialized amortized O(1) limiter checks, bounded policy validation, fixed capability lists and bounded memory retention. Documentation is contract/rationale-focused; no coverage exclusions, metrics gates or thresholds changed.

## Read-only verification

Used `/Users/la/Programming/Tovu/node_modules/eslint/bin/eslint.js` with a temporary minimal flat config loading the already-installed `@typescript-eslint/parser` and `complexity: ["error", 10]`; no install or clone dependency symlink was created. Checked all functions in the six repaired logic modules, not only the named functions:

| Module | Maximum cyclomatic complexity |
| --- | ---: |
| `assistant/site/visitor-tool-budgets.ts` | 6 |
| `assistant/site/visitor-executor.ts` | 10 |
| `assistant/site/capability-registry.ts` | 4 |
| `features/settings/site-title-write.ts` | 8 |
| `features/tool-audit/repo.memory.ts` | 6 |
| `server/runtime/composition/public-site-guide.ts` | 6 |

The five changed test files also passed parser-only ESLint (complexity disabled). This is syntax validation, not type checking or test execution. `git diff --check` passed. No claims of passing runtime tests, full lint, coverage certification or installed Jini compatibility are made.

## Exact tests to run centrally

After the central runner's ordinary dependency setup, run from this repository root (command provided only; not executed here):

```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --test-concurrency=1 --experimental-test-module-mocks --experimental-test-coverage \
  apps/website/src/contracts/site-assistant/__tests__/visitor-tools.unit.test.ts \
  apps/website/src/assistant/site/__tests__/visitor-tool-budgets.unit.test.ts \
  apps/website/src/assistant/site/__tests__/visitor-executor.unit.test.ts \
  apps/website/src/assistant/site/__tests__/visitor-tools.integration.test.ts \
  apps/website/src/features/settings/__tests__/visitor-tools-write.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/settings/__tests__/visitor-tools-protection.integration.test.ts \
  apps/website/src/assistant/__tests__/public-assistant-settings.test.ts \
  apps/website/src/assistant/site/__tests__/capability-registry.test.ts \
  apps/website/src/features/tool-audit/__tests__/repo.dialects.test.ts \
  apps/website/src/server/runtime/composition/__tests__/public-site-guide.test.ts \
  apps/website/src/server/__tests__/site-assistant-routes.test.ts \
  apps/website/src/server/__tests__/integration/tool-attempt-audit-sink-composition.integration.test.ts \
  apps/website/src/features/settings/__tests__/site-title-write.test.ts \
  apps/website/src/features/comments/__tests__/provider-selection.test.ts \
  apps/website/src/features/comments/__tests__/provider-tools.test.ts \
  apps/website/src/features/comments/__tests__/builtin-provider.test.ts \
  apps/website/src/server/inbound/admin-http/routes/settings/__tests__/comments-provider-protection.test.ts \
  apps/website/src/server/inbound/admin-http/routes/settings/__tests__/assistant-subagents-access.unit.test.ts \
  apps/website/src/server/inbound/admin-http/routes/settings/__tests__/shared.unit.test.ts
```

Then run the central type check for the website via root `tsconfig.json` (`tsc --noEmit -p tsconfig.json`) and measure per-file statement/branch/function/line coverage for touched production code. These checks remain outstanding under the explicit no-test/no-build dispatch.

Next assignee: Coordinator / central TestRunner for runtime/type/coverage evidence, then Code Inspection for review. F10–F12 remain T2 work. No processes remain from this repair.
