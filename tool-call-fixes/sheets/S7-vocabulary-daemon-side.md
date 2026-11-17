# S7. The daemon's tool-failure redaction uses the same vocabulary (C2, mechanism M4)

Repos: Jini (`daemon`), Tovu wiring. Estimate: 150k Sonnet. Prerequisites: S6 merged, and S6's Step 0 table showing at
least one row masked by the daemon layer. If no row is masked there, **do not run this sheet**; report that instead.

## Read first
S6's report table. `daemon/src/tool-recovery/redaction.ts` (`redactFailedResult`, its `redactSecrets` options),
`daemon/src/http/delegated-tools.ts` (`isModelSafeToolFailure`, `describeInternalError`),
Tovu `apps/website/src/assistant/tool-recovery-preset.ts` (`createAssistantToolExecutor`, `delegatedToolErrorDisclosure`).

## Characterization (passes today)
`daemon/src/tool-recovery/__tests__/redaction.vocabulary.characterization.test.ts`: the rows S6 attributed to this layer print `[redacted]`; an API key in the same message prints `[redacted]`; the minted `ERR-…` id is kept.

## Red-first
Same rows come out readable when the decorator is given the registry and the failing tool's descriptor; the API key
stays masked. Must fail today because the decorator passes no trusted names.

## Change
1. The redaction decorator takes a `vocabulary` port: `(required: { toolId: string; input: unknown }) => readonly string[]`. Default: none (today's behaviour for other hosts).
2. Tovu supplies it from `buildDiagnosticVocabulary({ toolIds: registry ids }, { inputSchema: descriptor.inputSchema, echoed })` in `tool-recovery-preset.ts`.
3. Ids the daemon itself mints for the answer (`executionId`, job ids) go into the envelope's `details` fields, so the MCP side (S6 source 3) keeps them. Do not put them into free text only.

## Acceptance
- End-to-end Tovu integration test over the real route: a publish-status failure that names its status tool reaches the MCP result with the tool id readable and exact text asserted.
- Disclosure unchanged: assert that no new field or sentence appears in the model-facing text compared with the characterization (only `[redacted]` spans change).
- Owner decision 2026-09-16 ("hide secrets only") still holds: the secret cases from S6 pass through this layer too.
