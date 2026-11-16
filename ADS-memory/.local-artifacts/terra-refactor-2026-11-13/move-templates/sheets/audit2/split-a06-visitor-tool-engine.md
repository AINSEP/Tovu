# SP-A06: visitor tool engine -> `@jini-ai/daemon/visitor-tools` + `@jini-ai/diagnostics/public-errors` (template T-SPLIT) — SECURITY

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A06`. This is an anonymous-visitor authorization path (policy re-read per call, per-turn attempt cap, confirmation, budgets, audit). **Every behavioural statement below was read from the Tovu source on 2026-11-16; the executor moves code, it does not redesign it.** Opus reviews the RED/GREEN pairs and the list "Opus review points" before Slice 1 merges.

Tier: S1 Sonnet + Opus review (security), S2 Sonnet, S3 Sonnet. est. executor tokens ≈ 75k (S1 40k, S2 12k, S3 23k).

## Preconditions (all hard; the sheet STOPs at step 0 if any is false)
1. **Prior audit row A03** (`AUDIT-ADDITIONS.tsv` `audit:A03`, visitor confirmation binding -> `@jini-ai/daemon/surface-exchanges` `createBoundToolConfirmationGate`) has landed. The executor imports `createVisitorConfirmationGate`/`VisitorPlanRefused` from Tovu's `visitor-confirmation-gate.ts`, which reads `ports: VisitorExecutionPorts` and the visitor page publication; this sheet cuts that coupling with the port `VisitorConfirmationGate` below, so it can land with or without A03, but the Tovu binding in S3 uses whichever gate exists then (`rg -n "createBoundToolConfirmationGate" packages/daemon/src` decides; STOP if neither is a function taking `{ resume }`).
2. **C11a** (`C11.md` §2) edits `visitor-confirmation-gate.ts` (`crypto: globalThis.crypto`, lines 73/77) and core `approval.ts`/`records.ts`: run S3 after C11a.
3. **Server port (CLASSIFY row 167 / C4)** edits `server/runtime/composition/modules/site-assistant.ts` (the composition that calls `createVisitorToolBudgets`, :595, and `createSiteAssistantErrorReporter`, :597): run S3 after wave B's applier passes; guard that file by TEXT (its blob moves).
4. No untangle lane touches the four files themselves (`rg -n "visitor-executor|visitor-tool-budgets|public-errors|visitor-execution-ports" ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/sheets` prints nothing on 2026-11-16).

## What exists in Jini, what does not
- `daemon/src/tool-executor.ts` already provides `createToolExecutor({ registry }, { now, delegate })`, `execute(args, { signal, requireConfirmation })`, `resumeConfirmation({ executionId, decision })`; `daemon/src/tool-audit.ts` re-exports `withToolAttemptAudit`, `ToolAttemptAuditSink` (`core/tool-audit.js`). `@jini-ai/core` has `createToolRegistry`. **The sheet extends these; no second engine.** The new code is the visitor-specific orchestration around them (what Tovu calls the "execution adapter").
- No `visitor` module in daemon (`rg -il visitor packages/daemon/src` hits only `http/frontend-guest-scope.ts`, `surface-exchanges.ts`, `tool-recovery/observability.ts`: unrelated).
- `diagnostics` has `observability`, `redaction/secrets-only`, `web-evidence`, `domain-dns`; no public-error reporter.

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/website/src/assistant/site/visitor-executor.ts | blob 460f1b9138b4225eba8c14713c6604d3696bb80b
  - apps/website/src/assistant/site/visitor-execution-ports.ts | blob 5217e7565f7d62a92b2bf7e28bb90921466ad50f
  - apps/website/src/assistant/site/visitor-tool-budgets.ts | blob e64e99142157bfcde8fa911bfe228ffe1dce66eb
  - apps/website/src/assistant/site/public-errors.ts | blob 6c78eb5a5f0682f0a09eb69876cfdaf4b296dc80
tovu_tests (move cases, then delete or repoint):
  - apps/website/src/assistant/site/__tests__/visitor-executor.unit.test.ts | blob 6258cb4f27413b16ebf9e9f47e39e7f8cdaf14e1
  - apps/website/src/assistant/site/__tests__/visitor-executor-confirmation.unit.test.ts | blob 0729e8b30fb0f0704c82e0d5b6c88b8c702d4107
  - apps/website/src/assistant/site/__tests__/visitor-page-confirmation.unit.test.ts | blob 52d71c0aedbed1e8e2cdd5974fbf0abce04ff709
  - apps/website/src/assistant/site/__tests__/visitor-tool-budgets.unit.test.ts | blob 974e0689696a974c68ac2699a5aa2ba072c97d66
  - apps/website/src/assistant/site/__tests__/public-errors.test.ts | blob df55010e93bc680e9a04bd240a48ee43be5d999b
  - apps/website/src/assistant/site/__tests__/visitor-tools.integration.test.ts | blob c0e1b890a48dbd2408ae4a608038ebc0b4d4a2f0
  - apps/website/src/assistant/site/__tests__/visitor-confirmation-gate.unit.test.ts | blob 728152939f6ac36de29ed343e645ea36e376c3bf
tovu_importers (edited, stay):
  - apps/website/src/assistant/site/capability-registry.ts | blob cba032ed0c178f5ee93e96b61c75443e11e1264c
  - apps/website/src/assistant/site/visitor-page-tools.ts | blob 43e2d6ec038140b5f18e971acff4aaa7e366231a
  - apps/website/src/assistant/site/visitor-confirmation-gate.ts | blob a2bc520bdd84bac9b08a8f6da1fb4fa7337a9296
  - apps/website/src/assistant/visitor-services.ts | blob 881a42a35175c3dd903f9ebcc10e3dd77a63c141
  - apps/website/src/assistant/index.ts | blob 7fce74cd0cae8633a71e5f4da43dbaa2ab3350db
  - apps/website/src/server/runtime/composition/modules/site-assistant.ts | blob 59aaa711702d298240f2aec17bdc2a185e014a1f
  - apps/website/src/server/runtime/composition/deps.ts | blob a0c1cfca82cfc7b50fb0f725e347f81132b61091
  - apps/website/src/contracts/site-assistant/visitor-tools.ts | blob 2f5e50dd663c3798267d64d3d179b0d53eeb5c86
jini_guards:
  - packages/daemon/src/tool-executor.ts | blob 979b3fb069b926f9103b90a5fbe7b5315cdfee39
  - packages/daemon/src/tool-audit.ts | blob 7cd154b40f1b822806139a63056e038c2fca27b0
  - packages/daemon/package.json | blob 9b07e1bb869c1d5cf1909e54952e817075096a69
  - packages/diagnostics/package.json | blob 4588a2e2c687a50b9d713d17eaf8061741270adc
  - packages/daemon/src/visitor-tools/** and packages/diagnostics/src/public-errors/** must not exist
```

## Census (importers of the four files; resolved on 2026-11-16, prod unless noted)
- `visitor-executor.ts`: `assistant/visitor-services.ts:3` (re-export of `VISITOR_TOOL_REFUSAL`: **a forwarder, deleted in S3**), `visitor-confirmation-gate.ts:7` (type `VisitorExecutionPorts`), `visitor-page-tools.ts:8` (type `VisitorCapabilityContract`), `capability-registry.ts:57,171` (`createVisitorExecutor`, 3 types), `composition/modules/site-assistant.ts:5` (`VISITOR_TOOL_REFUSAL`); tests: `visitor-executor.unit`, `visitor-executor-confirmation.unit`, `visitor-page-confirmation.unit`, `visitor-confirmation-gate.unit`, `visitor-tools.integration`.
- `visitor-execution-ports.ts`: only through `visitor-executor.ts:1-2` (type re-export) and `visitor-confirmation-gate.ts:7`.
- `visitor-tool-budgets.ts`: `composition/modules/site-assistant.ts:10,595`, `visitor-execution-ports.ts:4`, `visitor-executor.ts:10`; test `visitor-tool-budgets.unit.test.ts`.
- `public-errors.ts`: `assistant/index.ts:136` (re-exports; check which names), `composition/deps.ts:182,1213`, `composition/modules/site-assistant.ts:28,597`; tests `public-errors.test.ts`, `server/__tests__/site-assistant-error-report.integration.test.ts:11` and `visitor-assistant-safety.integration.test.ts:10` (type only).
Full census by `scripts/census.py` at execution time; allowed hits = the above; any other hit = STOP.

## Behaviour that must survive byte-for-byte (read from `visitor-executor.ts`, numbered for the review)
B1. Unknown or non-visitor caller classes collapse to `toolId: "unavailable"` (`invoke`: `caller === <anonymous principal> && registry.has(name) ? name : "unavailable"`), so a forged class never reaches a handler; the refusal text is the same for denied and unknown.
B2. Turn-wide attempt counter `attempts++` happens BEFORE any check, synchronously; `attempts > callsPerTurn` (Tovu 4) denies even in parallel calls; refuse-only mode (`refuseOnly`) denies without evaluating policy.
B3. `acceptsInput` (capability-level input validation) runs before approval lookup; failure = denied attempt (still audited).
B4. Confirmation: `requiresConfirmation({ input })` strengthens only that call (`requireConfirmation: true`); a descriptor-level `ask` mode registers `requiresConfirmation: true` on the descriptor; the handler calls `confirmation.assertApproved({ executionId, input })` before `execute`; `confirmation.forget({ executionId })` after every outcome.
B5. Policy is re-read on EVERY authorize (`readPolicy()`), a null policy denies, mode `off` denies, `ask` needs a human return channel (`confirmation && readSnapshot`), an Auto snapshot cannot become Ask mid-turn (`visitorModeAllowed`).
B6. Budgets are charged only after the mode checks pass; a thrown error anywhere in authorize reports and DENIES.
B7. Rollback mode (no ports): page tools denied, others allowed, literal capability surface, no audit.
B8. Audit wrapper: `withToolAttemptAudit` with the sink detail `{"audience":"visitor","source":"builtin"}` fixed provenance (no input keys, no provider errors in the sink), `readErrorId: () => undefined`, `onSinkError -> reportError`.
B9. Outcome mapping: `denied|cancelled|confirmation-denied` or `error === refusal` -> `{kind:"refused", reason: refusal}`; non-`completed` -> `{kind:"error", error}`; thrown -> reported + refused.
B10. `structuredClone(input)` before execution; the aborted-signal rule (no error report for a disconnected caller or a plan refusal).
B11. Budgets: two-level counters (per-IP then per-site), IP checked FIRST so refused traffic cannot spend the site allowance, charges serialized through one promise chain (`pending`), a changed ceiling rebuilds the limiter but keeps its store (consumed windows survive), keys are `JSON.stringify([workspaceId, canonicalToolId(, ip)])`, no timers, no raw IP persistence.
B12. Public errors: fixed public messages per code, default message, error id appended, `diagnostic` redacted through the injected `redact` with `exactSecrets`, visitor-caused codes yield no incident (`siteAssistantIncident` returns undefined).

## Ports and contracts (Jini side, `daemon/src/visitor-tools/ports.ts`)
```ts
export type VisitorToolMode = 'auto' | 'ask' | 'off';
export interface VisitorBudgetLimits { readonly ip: { readonly max: number; readonly windowSeconds: number }; readonly site: { readonly max: number; readonly windowSeconds: number } }
export interface VisitorToolChoice { readonly mode: VisitorToolMode; readonly budget: VisitorBudgetLimits }
export interface VisitorCapability<TDirective = unknown> {            // = Tovu VisitorCapabilityContract minus presentation
  readonly name: string;
  readonly visitorOfferable: true;                                    // a site grant never adds eligibility
  readonly readOnly?: boolean;
  readonly acceptsInput?: (required: { input: unknown }) => boolean;
  readonly requiresConfirmation?: (required: { input: unknown }) => boolean;
  readonly execute: (required: { input: unknown; context?: ToolHandlerContext }, optional?: Record<string, never>) => Promise<{ readonly result: unknown; readonly directive?: TDirective }>;
}
export interface VisitorConfirmationGate {                            // what createVisitorConfirmationGate returns today
  readonly delegate: ExecutionDelegate;
  assertApproved(required: { executionId: string; input: unknown }, optional?: Record<string, never>): Promise<void>;
  forget(required: { executionId: string }, optional?: Record<string, never>): void;
}
export interface VisitorExecutionPorts<TPolicy, TDirective = unknown> {
  readonly principalId: string;                                       // Tovu "anonymous-visitor"
  readonly refusalReason: string;                                     // Tovu VISITOR_TOOL_REFUSAL (public copy stays host)
  readonly callsPerTurn: number;                                      // Tovu VISITOR_TOOL_CALLS_PER_TURN (4): REQUIRED, no default (a missing cap must not silently unbound a turn)
  readonly emptyPolicy: TPolicy;
  readonly resolveChoice: (required: { policy: TPolicy; toolId: string }, optional?: Record<string, never>) => VisitorToolChoice;
  readonly allowedWithoutPorts: (required: { name: string }, optional?: Record<string, never>) => boolean;  // Tovu: !name.startsWith("page.")  (B7)
  readonly initialPolicy: TPolicy | null;
  readonly readPolicy: () => Promise<TPolicy | null>;
  readonly readSnapshot?: () => Promise<{ policy: TPolicy | null; revision: string }>;
  readonly createConfirmationGate?: (required: { resume: ToolExecutor['resumeConfirmation']; isAborted: () => boolean }, optional?: Record<string, never>) => VisitorConfirmationGate;
  readonly isPlanRefusal: (required: { error: unknown }, optional?: Record<string, never>) => boolean;     // Tovu: error instanceof VisitorPlanRefused
  readonly budgets: VisitorToolBudgets;
  readonly budgetId: (required: { toolId: string }, optional?: Record<string, never>) => string;           // Tovu visitorToolBudgetId (legacy page ids)
  readonly ip: string; readonly workspaceId: string; readonly runId: string;
  readonly clock: { nowMs(): number; nowIso(): string };
  readonly ids: { newId(): string };
  readonly sink: ToolAttemptAuditSink;
  readonly reportError: (required: { error: unknown }, optional?: Record<string, never>) => void;
  readonly signal?: AbortSignal;
}
export interface VisitorToolBudgets { charge(required: { workspaceId: string; toolId: string; ip: string; budget: VisitorBudgetLimits }, optional?: Record<string, never>): Promise<boolean> }
export interface BudgetLimiterFactory<TStore> {
  newStore(required: Record<string, never>, optional?: Record<string, never>): TStore;
  limiter(required: { max: number; windowSeconds: number }, optional: { store: TStore }): { check(required: { key: string }, optional?: Record<string, never>): Promise<{ allowed: boolean }> };
}
```
The old `owner`, `publicationRevision`, and `requiresConfirmation` members of `VisitorExecutionPorts` are NOT carried into the Jini type: `owner`/`publicationRevision` are read only by Tovu's gate (`rg -n "ports\.(owner|publicationRevision)" apps/website/src` shows the gate and the composition; they stay on a Tovu `VisitorExecutionPorts extends` the Jini type), and `requiresConfirmation` is derived inside the engine (B4).
Why `TPolicy` is a type parameter: the policy document (`VisitorToolPolicy`, `parseVisitorToolPolicy`, defaults, setting key/permission) is Tovu settings vocabulary and stays; the engine only needs `resolveChoice`.

```
id: SP-A06-1 .. SP-A06-3
feature: website/assistant/site (visitor tool engine)
jini_target: daemon src/visitor-tools/{ports.ts,executor.ts,budgets.ts,index.ts} (+ package.json "./visitor-tools": "universal"); diagnostics src/public-errors/{index.ts} ("./public-errors": "node": it calls node:util inspect)
changeset: @jini-ai/daemon: minor | "visitor-tools: anonymous-caller executor and scoped budgets over the tool executor"; @jini-ai/diagnostics: minor | "public-errors: public error reporter"
```

## SP-A06-1 — daemon `visitor-tools` (Jini commit 1, Opus reviews)
0. Preconditions above; blobs; guard paths absent.
1. Failing tests first (written BEFORE the code, each maps to a B-row; the moved Tovu cases are the green twins): in `daemon/src/visitor-tools/__tests__/`
   - `executor.test.ts`: B1 forged caller -> refused, handler never called; B2 five parallel calls with `callsPerTurn: 4` -> exactly four reach policy, the fifth is `denied`, handler count 4; B2 refuse-only never calls `readPolicy`; B3 `acceptsInput` false -> denied + audited; B5 `readPolicy` returns off on the second call of one turn -> second call refused; B5 null policy; B5 ask without channel; B5 ask snapshot vs auto snapshot; B6 `budgets.charge` throws -> denied + `reportError`; B7 no ports -> `allowedWithoutPorts` decides; B8 sink never receives input keys or error text (feed a secret-looking key and a throwing handler; assert the appended event JSON equals the fixed detail); B9 mapping table (denied, cancelled, confirmation-denied, completed, failed, thrown); B10 aborted signal suppresses `reportError`; plan refusal suppresses it; `structuredClone` isolates a mutated input.
   - `budgets.test.ts`: from `visitor-tool-budgets.unit.test.ts` (IP first, site untouched when IP refuses, serialization with parallel `charge`, changed ceiling keeps consumed counts, no timers) against a fake `BudgetLimiterFactory` in `testing/` (`daemon/src/visitor-tools/testing.ts`: in-memory counter store + limiter using the injected clock). NEW: two different workspaces never share a bucket (key includes workspaceId); IP A cannot exhaust IP B's allowance.
   - Confirmation tests stay in Tovu with the gate (S3); the executor tests use a fake `VisitorConfirmationGate` and assert B4 (`forget` always called, `requireConfirmation` only when the capability asks).
2. Code: `executor.ts` = Tovu `visitor-executor.ts` lines 45-190 re-shaped to `createVisitorExecutor<TPolicy, TDirective>({ capabilities, ports }, optional = {})` where `ports` is now `{ ports }` OPTIONAL as today (rollback mode B7) — keep the exact structure, split the 120-line factory into: `createAdmission` (registry + authorize), `createInvoker` (the `audited`/`invoke` half), `registerCapabilities`, and the existing small helpers, each ≤ 50 lines and ≤ 10 complexity. Replace `VISITOR_TOOL_REFUSAL`, `"anonymous-visitor"`, `VISITOR_TOOL_CALLS_PER_TURN`, `EMPTY_VISITOR_TOOL_POLICY`, `resolveVisitorToolChoice`, `.startsWith("page.")`, `instanceof VisitorPlanRefused`, `createVisitorConfirmationGate` with the ports of the contract above; nothing else changes. `budgets.ts` = Tovu `visitor-tool-budgets.ts` with `createVisitorToolBudgets({ limiters, store?: ... }, optional = {})` over `BudgetLimiterFactory`; the `Clock` is the factory's concern (Tovu's `createRateLimiter` already takes it). `index.ts` exports `createVisitorExecutor`, `createVisitorToolBudgets`, all types.
3. Why-comments move (neutral): the "rollback", "synchronous attempt increment", "AND no secrets in the sink" paragraphs keep their reasoning; strip product names (Tovu, CMS handlers -> "reviewed capability handlers").
4. Checks: COMMON 2-9; `rg -n -i "tovu|site-chat|apps/|visitor-publication|page\\." <new files>` prints nothing apart from the generic phrase "visitor"; imports only `@jini-ai/core` (leaf paths), own package leafs, protocol; no `http-kit`; eslint; changeset; commit `feat(daemon/visitor-tools): anonymous-caller executor and scoped budgets`.

## SP-A06-2 — diagnostics `public-errors` (Jini commit 2)
1. Failing tests first: the moved cases of `public-errors.test.ts` (fixed message per code, default message, id suffix, redaction receives `exactSecrets`, visitor-caused codes give no incident). NEW: a thrown non-Error object is rendered by `inspect` with `customInspect: false, getters: false` (a getter that throws is not invoked: this guards against a hostile diagnostic running code at log time).
2. Code: `diagnostics/src/public-errors/index.ts` = Tovu `public-errors.ts` renamed neutrally (`createPublicErrorReporter`, `PublicError`, `PublicErrorLogEntry`, `publicErrorIncident`, option `messages: Readonly<Record<string, string>>`, `defaultMessage: string`, `visitorCausedCodes: ReadonlySet<string>`: the three Tovu tables become REQUIRED options so Jini ships no product copy). package.json export + `jini.entries` `"./public-errors": "node"` + README line.
3. Checks as above; commit `feat(diagnostics/public-errors): public error reporter`.

## SP-A06-3 — Tovu binding + delete (commit 3, after S1/S2 landed and the preconditions)
1. New `apps/website/src/assistant/site/visitor-tools-binding.ts` (a binding, not a forwarder): `visitorPorts(...)` builds the Jini `VisitorExecutionPorts` from Tovu's existing options: `principalId: "anonymous-visitor"`, `refusalReason: VISITOR_TOOL_REFUSAL` (the constant moves here from the deleted `visitor-executor.ts`, public wording), `callsPerTurn: VISITOR_TOOL_CALLS_PER_TURN`, `emptyPolicy: EMPTY_VISITOR_TOOL_POLICY`, `resolveChoice` mapping `resolveVisitorToolChoice` to `{ mode, budget: { ip: { max: limits.perIpPerHour, windowSeconds: 3600 }, site: { max: limits.perSitePerDay, windowSeconds: 86_400 } } }`, `allowedWithoutPorts: ({ name }) => !name.startsWith("page.")`, `budgetId: visitorToolBudgetId`, `isPlanRefusal: ({ error }) => error instanceof VisitorPlanRefused`, and the Tovu limiter factory (`createRateLimiter` from `contracts/core/rate-limit` + `createMemoryCounterStore` from `@jini-ai/http-kit/rate-limit`; both host-side imports are legal in Tovu).
2. Edits (exact): `capability-registry.ts:57` import -> `@jini-ai/daemon/visitor-tools` for `createVisitorExecutor` and the types, `VisitorCapabilityContract` stays a Tovu type (`extends VisitorCapability<ClientDirective>, VisitorToolPresentation`) in a new `visitor-capability-contract.ts` (moved from `visitor-executor.ts:15-24`); `visitor-page-tools.ts:8` and `visitor-confirmation-gate.ts:7` repoint their type imports; `visitor-services.ts:3` the forwarder export is deleted and its importers (`rg -n "visitor-services" apps/website/src`) take `VISITOR_TOOL_REFUSAL` from `visitor-tools-binding.ts`; `composition/modules/site-assistant.ts:5,10,595` -> `createVisitorToolBudgets` from Jini with the Tovu limiter factory, `VISITOR_TOOL_REFUSAL` from the binding; `assistant/index.ts:136` and `composition/deps.ts:182,1213`, `modules/site-assistant.ts:28,597` -> `createPublicErrorReporter` with the three tables passed (`PUBLIC_MESSAGES`, `DEFAULT_PUBLIC_MESSAGE`, `VISITOR_CAUSED_CODES` move into `site-assistant-public-errors.ts` in Tovu, verbatim).
3. Tests: `visitor-executor.unit` / `visitor-executor-confirmation.unit` / `visitor-page-confirmation.unit` / `visitor-tools.integration` stay as Tovu integration tests of the BINDING (they exercise real capabilities and the real gate): repoint their imports, keep every assertion (STOP on any assertion that no longer fits, COMMON rule 20). Generic cases already have Jini twins (S1); list each Tovu case with its Jini twin in the commit body. `visitor-tool-budgets.unit.test.ts` and `public-errors.test.ts` are deleted once their cases are in Jini (verified by name). `server/__tests__/site-assistant-error-report.integration.test.ts` and `visitor-assistant-safety.integration.test.ts` repoint the type import.
4. `git rm -q` the four source files; baselines: `rg -F -n "assistant/site/visitor-executor" *.json *.mjs *.yml` (include `write-path-inventory.baseline.json`, `coverage-integrity-baseline.json`, `deploy-targets/__tests__/vendor-exceptions.json`).
5. Census: `rg -n "site/(visitor-executor|visitor-execution-ports|visitor-tool-budgets|public-errors)" apps` prints nothing; eslint on touched files; commit `refactor(assistant/site): visitor tool engine from @jini-ai/daemon`.

## Opus review points (security; reviewer reads S1 test file first)
1. Is `callsPerTurn` REQUIRED with no default (so a host cannot forget it and unbound a turn)? Is the check still `attempts++` before any await?
2. Does any path call a handler without passing `authorize` (registry `has` pre-check, `refuseOnly`, `acceptsInput`, unknown name -> `"unavailable"`)? Does `"unavailable"` ever resolve to a registered id?
3. Policy re-read per authorize: confirm no caching was introduced when splitting the factory (`readPolicy` called inside `authorize`, not at construction).
4. `allowedWithoutPorts` (B7): the default must be DENY if the host supplies nothing (make it required; the Tovu rule is `!page.*`).
5. Audit sink content (B8): assert no input key/value or provider error reaches the event; `readErrorId` stays `undefined`.
6. Budget ordering and serialization (B11): IP before site; a refused IP leaves the site counter untouched; two parallel `charge` calls cannot both pass when one slot remains; a ceiling change preserves counts; key collision resistance (`JSON.stringify` of a tuple, not string concatenation).
7. `isPlanRefusal`/signal handling (B10): an aborted caller or plan refusal does not report, everything else does; no secret in `reportError` payload.
8. Confirmation: `forget` runs on every outcome including throw; `requireConfirmation` can only strengthen (never bypass a descriptor `requiresConfirmation`); a plan approved for input A cannot execute input B (this lives in the gate, covered by prior A03's tests: confirm they exist before approving).
9. `structuredClone(input)` stays (mutation isolation) and `ToolExecutionResult` `denied` for refusal keeps the audit append.
10. Public errors: tables are required options (no Tovu copy in Jini), `inspect` options unchanged, redaction applied BEFORE logging, never after.
11. Both repos are public: the commit messages and code comments describe mechanisms, never an exploit (COMMON rule 18).

## STOP specific to this sheet
- Any B-row has no failing/passing test in S1.
- A Tovu test assertion would have to be weakened to fit (rule 20).
- `ports.callsPerTurn` or `allowedWithoutPorts` ends up optional.
- The gate's shape differs from `VisitorConfirmationGate` (then S3 needs a thin adapter: report, do not widen the port).
