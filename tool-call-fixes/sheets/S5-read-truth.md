# S5. One truth test for "read" (C1c, mechanism M3)

Repo: Tovu. Estimate: 110k Sonnet. Prerequisites: none.

## Read first
`../DESIGN.md` §2.3, M3. Jini `core/src/tool-registry.ts` (`isReadOnlyTool`, `toolDiscoveryMetadata`).
Tovu `apps/website/src/contracts/core/tool-metadata/*.ts` (approval classes),
`apps/website/src/features/external-mcp/operations-tools.ts`, `development/evals/tool-search-eval-registry.ts`.

## Red-first
`apps/website/src/assistant/__tests__/tool-read-truth.integration.test.ts` over the full registry. For every registration:
- `approval.class === 'read'` ⇔ `descriptor.readOnly === true`;
- `readOnly === true` ⇒ `sideEffects` is absent or `"none"`;
- a description starting with `Reads`, `Lists`, `Gets`, `Tests`, `Checks`, `Reports` on a tool that is not read-only fails, unless the id is in a small allowlist with a one-line reason.
It must fail today and name `external_mcp_get_admissions` (and print every other mismatch). Paste the list.

## Change (per mismatch, after reading the handler end to end)
- The handler only reads → register it read-only (`readOnly: true`, `sideEffects: "none"`, metadata class `read`).
- The handler writes anything durable (a cache row counts) → keep it a write, and reword the description so it does not start like a read; or add it to the allowlist with the reason.
- Never change a registration to read-only to make the test pass without reading its handler. A wrong "read" lets a read-only client run a write (security class: authority laundering through the read-only gateway).

## Acceptance
- The test passes; the allowlist has a reason per entry.
- For each tool moved to read-only, one test calls it through the read-only gateway and asserts it runs, and one existing permission test for it still passes unchanged.
- Report lists each mismatch, the handler evidence (file:line of every write or of none), and the decision.
