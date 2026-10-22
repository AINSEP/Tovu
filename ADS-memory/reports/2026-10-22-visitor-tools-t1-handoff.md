Programmer + TDD (Direct): implement the isolated visitor execution boundary and specify its policy, abuse, settings-bypass and retention tests.

# Visitor tools T1 handoff — 2026-10-22

T1 is implemented in this checkout and remains uncommitted. No tests, installs, builds, type checks, servers or background processes were run. `git diff --check` passed. Test execution and 100% statement/branch/function/line coverage per touched production file are **not verified or certified**. No coverage exclusions or threshold changes were added. The initial untracked `.cloud-coord/visitor-tools-design.md` and `AI-Dev-Shop` were left untouched.

## Inputs and authority

Read the canonical Opus review before the design, at `/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-22-visitor-tools-design-review.md` and `2026-10-22-visitor-tools-design.md`. Review SHA-256: `dea600248207985fdb8d3af4a9e3add20ff12f09bfc5ea68ab018164aa61f41c`. Design SHA-256: `107a5019c4978a9ccae87c28c9ffdee69213b9d420075689a2214c720123def3`. Amended local SPEC-046 SHA-256: `af60e9d2ab4e746d8bb39bcce71cb56dea33e4093f2ceb86530f80d42733e528`. The owner dispatch and review override the earlier scope. Read governing repository/persona instructions, architecture sections 13/14, project memory, ADR-054, SPEC-046 and applicable governance ADR-001. T1 has no gated destructive mutation, migration, plugin execution, commerce code or vendor implementation.

Graph tools were unavailable. Discovery used source searches, the current manifests, existing handlers/settings/audit tests, and sibling Jini sources. The checkout has no installed dependencies; sibling source is contract evidence, not verification of a released package. Framework pattern approval/test-running steps were superseded by this bounded implementation dispatch and explicit no-run instruction.

## Result and ownership

The private visitor registry contains only explicitly visitor-offerable reviewed CMS contracts. It never accepts the admin registry, admin catalog, another-tool invoker, CLI, plugin code or credentials. Shared Jini ToolExecutor and attempt-audit owners execute/observe it. Existing post/member visibility and directive owners remain unchanged.

`site.assistant/visitor_tools` is a version-1 JSON object with `tools` keyed by tool id. Each choice has `mode: auto | ask | off` and normalized `limits: {perIpPerHour, perSitePerDay}`. Omitted choices preserve Auto only for the frozen seven-tool upgrade cohort; future ids default Off. Explicit Off survives. Ask is stored and denied in T1. Invalid stored JSON, absent definitions and failed policy reads deny the managed catalog. Advertisement uses the initial effective policy; invocation and guide content re-read it.

Only the management service writes the setting, through the existing host chokepoint using `visitor-tools.manage`. One dedicated-writer table now covers comments-provider and visitor-tools. Generic set, clear, namespace reset and aliases are refused, including HTTP and agent settings tools. The host reset wrapper carries its key list inside the required object, then delegates to Jini's existing reset API; no existing host call sites used the previously re-exported reset function. Existing comments guard names remain compatibility aliases.

Budgets are per process and per tool: 30/hour/IP, 1,000/day/site; four attempts per managed turn. The existing chat admission limiter stays in place. HTTP-kit owns counters/expiry. Profile changes preserve their stores, and checks serialize so concurrent policy changes cannot reset/overrun counts. Reservations are conservative: a later IP refusal can consume a site slot. No cookies, table, migration or scheduler were added.

Visitor audit uses `anonymous-visitor`. Durable retention has independent workspace/principal buckets: 20,000 anonymous rows and 50,000 non-visitor rows, with separate pruning cadence. Failures remain observations; the visitor decorator reports thrown sink errors and durable composition wires the sink's own failure callback through the existing redacted error reporter. The existing memory sink remains the unbounded test/dev event recorder.

Rollback: `TOVU_VISITOR_TOOLS_POLICY=off` returns the literal built-in surface and keeps stored choices. It bypasses T1 policy, tool budgets and visitor attempt-audit decoration; the chat admission limiter and public-content checks still apply.

## Production files changed (paths relative to apps/website/src)

| File | Why |
| --- | --- |
| `contracts/site-assistant/visitor-tools.ts` | Bounded closed policy parser, permission/setting constants, upgrade grants and default limits. |
| `assistant/public-assistant-settings.ts` | Register visitor_tools beside public_enabled/widget through the existing registrar. |
| `assistant/site/capability-registry.ts` | Reviewed eligibility declarations and schemas over the visitor-only executor; preserve all CMS handlers. |
| `assistant/site/visitor-executor.ts` | Private Jini registry/executor, policy recheck, four-attempt gate, uniform refusal and value-free anonymous audit adapter. |
| `assistant/site/visitor-tool-budgets.ts` | Tovu-specific IP/site budget adapter over HTTP-kit, preserving counters across limit changes. |
| `assistant/site/visitor-tool-settings.ts` | Fail-closed policy reads from the current settings API. |
| `features/settings/visitor-tools-write.ts` | Dedicated permissioned writer and explicit J1 revision-CAS seam. |
| `features/settings/site-title-write.ts` | Shared dedicated-writer guard table, canonical validation, protected clear/reset wrappers. |
| `features/settings/index.ts` | Export guarded writers; preserve old comments guard aliases. |
| `features/settings/tool-registrations.ts` | Deny both dedicated settings in generic tools via the shared table. |
| `features/tool-audit/repo.ts` | Separate durable visitor/admin retention and prune cadence. |
| `server/runtime/composition/modules/site-assistant.ts` | Compose per-process budgets and per-turn policy/audit ports, cancellation and rollback flag. Moved the existing cancellation why-comment with its logic. |
| `server/runtime/composition/public-site-guide.ts` | Derive public guide descriptions/pointers from effective capabilities. |
| `server/runtime/composition/deps.ts` | Route durable audit failures through the existing redacted reporter. |

Documentation changes: `ADS-memory/reports/architecture/ADR-054-public-visitor-assistant.md` §2 and `ADS-memory/specs/046-site-assistant-page-actions/spec.md` REQ-0 have narrowly scoped T1 amendments. This handoff is a required delivery artifact. The ignored local `ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md` records the J1 seam. Why-comments were kept with the decisions/effects they justify; public boundaries describe their contracts and costs. No generic package owner was forked.

## Tests written/updated (exact repository paths)

New runnable suites:

- `apps/website/src/contracts/site-assistant/__tests__/visitor-tools.unit.test.ts` — upgrade defaults, explicit Off/Ask, invalid JSON/ids/fields/bounds and property-based valid reductions.
- `apps/website/src/assistant/site/__tests__/visitor-tool-budgets.unit.test.ts` — hourly/day boundaries, IP/tool/site isolation, 1,001 concurrent calls, policy-change races, process isolation and failure recovery.
- `apps/website/src/assistant/site/__tests__/visitor-executor.unit.test.ts` — identical unknown/Off/Ask/quota refusal, four-call concurrency cap, fresh policy, declaration-only eligibility, audit/cancellation/failure behavior and separate admin registry unreachable.
- `apps/website/src/assistant/site/__tests__/visitor-tools.integration.test.ts` — real public/member owners through every CMS built-in, guide parity/filtering, invalid-policy advertisement, and a TypeScript-AST import boundary check.
- `apps/website/src/features/settings/__tests__/visitor-tools-write.unit.test.ts` — dedicated permission, unchanged ledger on refusal, invalid JSON/scope/CAS, alias/reset guards and failed reads.
- `apps/website/src/server/inbound/admin-http/routes/settings/__tests__/visitor-tools-protection.integration.test.ts` — captured real HTTP route handlers and generic tool handlers reject canonical/alias set, clear and reset without writes/cards.

Updated runnable suites:

- `apps/website/src/assistant/__tests__/public-assistant-settings.test.ts` — definition/default assertions.
- `apps/website/src/assistant/site/__tests__/capability-registry.test.ts` — uniform refusal and executor failure contract; existing capability coverage retained.
- `apps/website/src/features/tool-audit/__tests__/repo.dialects.test.ts` — visitor/admin floods and interleaved workspace/bucket pruning through the existing SQLite/PGlite dialect harness.
- `apps/website/src/server/runtime/composition/__tests__/public-site-guide.test.ts` — effective actions, empty grants and injected engine.
- `apps/website/src/server/__tests__/integration/tool-attempt-audit-sink-composition.integration.test.ts` — the durable root reports a closed-handle sink failure through its redacted reporter without rejecting.
- `apps/website/src/server/__tests__/site-assistant-routes.test.ts` — provider-stub HTTP tests for Off, literal rollback, stored-choice preservation, four-call cap and no raw tool SSE/audit data.

Shared DI fixture: `apps/website/src/features/settings/__tests__/visitor-tools.fixture.ts` (not a runnable suite). Tests use in-memory repositories, injected clocks/IDs/budgets/sinks/guide engines, captured routes and existing loopback provider/dialect fixtures; no live provider or key is required.

Central runner, after normal dependency setup outside this builder task:

```sh
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --experimental-test-coverage \
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
  apps/website/src/server/__tests__/integration/tool-attempt-audit-sink-composition.integration.test.ts
```

Also run the existing settings/comments-provider and composition regression suites, then the repository coverage suite (`npm run test:cov`). The focused command is not a claim of 100% coverage for pre-existing large composition/settings files. Central validation must inspect every touched production file for 100% statements, branches, functions and lines, and measure complexity ≤10. No metrics, tests, type checker or builds were executed here; any remaining coverage/compiler gaps must be addressed before certification.

## Reuse-before-write decisions

- Reuse: CMS reads/page actions; searched public tools, public-content and post/member owners; used the existing six handlers and anonymous guide port. Owner: ADR-054 / SPEC-046. No parallel visibility predicate.
- Reuse: execution/audit lifecycle; searched registry/executor/audit decorators and current admin wiring; used Jini createToolRegistry/createToolExecutor/withToolAttemptAudit with a fresh private registry. No public admin registry or confirmation state machine.
- Reuse: quotas; searched HTTP-kit limiter and api-connections/budgets; used existing memory counter/limiter owners. New code selects only the two Tovu visitor scopes and serializes policy changes.
- Reuse: settings protection; inspected comments-provider guards, host chokepoint, generic registrations and HTTP service; extended one dedicated-writer table. Used Jini set/getEffective for persistence. Owner: Opus required change 2.
- Reuse: retention; inspected the Kysely audit adapter and existing principal column; extended its selection/delete predicates, without a table or migration. Owner: Opus required change 6.

## Remaining seams and uncertainty

- **J1:** expectedRevisionSeq is not available in the inspected API. Supplying it to writeVisitorTools explicitly refuses. Adopt the published CAS-enabled set/clear owner and pass the option through the host chokepoint before T2 uses revisions. Do not add a proxy CAS or use an unlocked pre-read comparison.
- **T2:** page/chat tools, permission exposure, revision read model, always-ask/non-rememberable widening approval and all admin UI remain unimplemented. T1 allows defaults/reductions only. Generic tools remain denied even for a caller with management permission.
- **T3:** Ask is stored as `ask` and treated as Off. No confirmation transport, challenge ids, cookie or SSE variant was added. T3 must extend the existing Jini confirmation and proposal-strip owners.
- **T3b/T4:** commerce-plugin product search and saved requests remain absent; no store/product code was added to core.
- Budgets are per serving module/process, not distributed or restart-persistent. Audit is capped operational history, not acknowledged compliance persistence.
- Runtime compatibility, complexity measurements and every coverage percentage remain unverified under the no-run constraint. The canonical SPEC-046 file still has its older draft header; the owner-authorized T1 amendment is explicitly scoped rather than falsely approving unrelated historical requirements.

Next assignee: Coordinator / central TestRunner for compile, focused/regression execution, per-file coverage and complexity checks; then Security/Code Inspection for the visitor boundary and settings/audit changes. No subagents were dispatched.
