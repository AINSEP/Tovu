# S7. The daemon route sends trusted names in the error envelope (C2, mechanism M4, server side)

Repos: Jini (`daemon`), then one Tovu characterization and one Tovu end-to-end test. Estimate: 130k Sonnet.
Blocking decision: none.
Prerequisites: S1 (the route resolves the target once), S6 (the client reads `details`).
Landed checks (two commands, each must exit 0, README block 4.11; revision 3 had one `rg` over both files, which passed when only one file matched): `rg -n "inputNames" packages/mcp/src/server/daemon-client.ts` and `rg -n "inputNames" packages/core/src/text/diagnostic-vocabulary.ts`.

Revision 2 replaced this sheet. Revision 1 planned to change the daemon's failure redaction; the code shows that layer
is an injected, secrets-only port in Tovu and masks no names (S6 "Where names are really lost"). What is missing on
the server is the **metadata**: the route knows which registered tool ran and its schema, and does not say so.

## Read first
`../DESIGN.md` M4. `rg -n "function toolExecutionResultToApiResult|function failedResultToApiError|function reportInternalError" packages/daemon/src/http/delegated-tools.ts`
(392 lines: new code goes in a sibling) · `rg -n "details" packages/protocol/src/errors.ts` (`createApiError` accepts `details`) ·
Tovu `rg -n "redactSecretShapes" apps/website/src/assistant/tool-recovery-preset.ts packages/contracts/src/secret-redaction.ts`.

## Characterization (passes today)
- Jini `daemon/src/http/__tests__/delegated-tools.error-details.characterization.test.ts`: for `failed` (validation),
  `failed` (model-safe 422), `timed-out`, `denied` and a thrown executor error, the envelope has **no** `details`.
- Tovu `apps/website/src/assistant/__tests__/tool-recovery-preset.names.characterization.test.ts`: S6's rows 1, 2, 4, 5
  (imported from `@jini-ai/core/text/masked-identifier-rows`) pass through the preset's `redactSecretShapes` binding
  unchanged, and a vendor key in the same message is blanked. This pins finding 9's fact in the host that owns the binding.

## Red-first (fails: no `details`)
Jini, same route harness, a registered tool `shot_page` with properties `viewport`, `fullPage`, `dismissCookieBanners`:
1. every error answer **for a tool that resolved in the route's registry** carries
   `details: { toolId: "shot_page", inputNames: ["dismissCookieBanners", "fullPage", "viewport"] }` (sorted, top level
   and nested property names, ≤ 64 names, each `[A-Za-z_][A-Za-z0-9_]{0,63}`), plus `executionId` when the result has one.
2. unknown tool (S1's 404) and unknown run: no `inputNames` (nothing resolved; S2a's `details.family` is untouched).
3. a tool hidden from this run's registry: byte-identical to a made-up id (no `details.toolId`, no names).
4. `inputNames` come from the **descriptor**, never from the caller's input: an input key `zzSecretKeyName` that is not
   in the schema never appears in `details`.
5. existing fields unchanged: `code`, `message`, `requestId` byte-identical to the characterization.

## Change
1. New `daemon/src/http/delegated-tool-error-details.ts` (pure, ≤ 60 lines): `diagnosticDetails({ descriptor, result }, {})`.
2. `delegated-tools.ts`: the error arms attach it (`createApiError(..., { details })`); net growth ≤ 8 lines. Why-comments
   on the arms stay with them.

## Tovu end-to-end test (linked build; this is the cross-package check, in the host that assembles both sides)
`agent-daemon-server.masked-names.integration.test.ts`: a registered tool whose handler fails with row 2's text, called
through the real route by the real MCP host over a loopback fetch, for a typed call and for the gateway → the MCP
result text contains `dismissCookieBanners` exactly as written; a vendor key in the same message is `[redacted]`.

## Acceptance
- Disclosure unchanged: no new sentence in any model-facing text; only `[redacted]` spans change. The new `details`
  fields name only what `describe_tool` already shows this run.
- Owner decision 2026-09-16 ("hide secrets only") still holds: S6's secret cases pass through the full path.
- Gate green in both repos.
