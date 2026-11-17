# S5. "Reads…" wording must match the tool's real class (C1c, mechanism M3)

Repo: Tovu. Estimate: 100k Sonnet. Prerequisites: none.
Blocking decision: none.

## What is already true (judge finding 8; do not rebuild it)
- Jini `core/src/registration-kit.ts` (`assertRiskIsCorroborated`) refuses a registration whose declared `sideEffects`
  differs from the wiring layer's own derived risk, and derives `descriptor.readOnly` in **one** place
  (`readOnly: catalogEntry.sideEffects === "none"`). Declared risk and the read-only flag cannot drift for tools built there.
- `external_mcp_get_admissions` is classified **correctly** as a write: metadata `approval.class: 'edit'`
  (`contracts/core/tool-metadata/external-mcp.ts`), `sideEffects: "mutates-durable-state"` and the same derived risk
  (`features/external-mcp/operations-tools.ts`), because starting federation may store a refreshed OAuth grant.
  The read-only gateway refusing it is right. What is wrong is the **wording**: its description starts with "Reads".

So the audit's "get tool refused by the read-only gateway" class is a wording class plus one unchecked field
(`approval.class`). This sheet never relabels a tool to read-only.

## Red-first
`apps/website/src/assistant/__tests__/tool-read-wording.integration.test.ts` over the full registry:
1. Wording: a description that starts with `Reads`, `Lists`, `Gets`, `Tests`, `Checks`, `Reports` on a tool whose
   `descriptor.readOnly !== true` fails, unless its first sentence ends with the fixed clause
   `(needs the full gateway: it can store data)`. Must fail today and name `external_mcp_get_admissions`
   (and `external_mcp_probe_connection`); paste the whole list.
2. Approval metadata (the additional invariant): `approval.class === 'read'` ⇒ `descriptor.readOnly === true`, and
   `readOnly === true` ⇒ `approval.class` is `'read'` or absent. Print every mismatch. If there is none, say so and
   keep the test as a gate.
3. Registrations **not** built through the registration kit (find them: `rg -n "readOnly:" apps/website/src --glob '!**/*test*'`):
   each one is listed in the test with the handler evidence for its flag.

## Change (per finding, after reading the handler end to end)
- Wording: reword the first sentence so it does not read like a pure read, or add the fixed clause. Example:
  `Shows the server's current external MCP tool admissions (needs the full gateway: it can store data): …`.
- An `approval.class` mismatch: fix the metadata to match the corroborated `sideEffects`. Never the other way round.
- Never set `readOnly: true` or `sideEffects: "none"` in this sheet. A tool that really only reads but is declared a
  write is **reported to the owner** with file:line evidence, not changed here (security class: authority laundering
  through the read-only gateway).

## Acceptance
- The test passes; every reworded description is listed old → new; search-eval fixtures that embed a changed
  description are updated in the same commit and named.
- `rg -n "sideEffects" $(git diff --name-only $BASE...HEAD)` shows no changed `sideEffects` line (`git diff` proof pasted).
- Gate green; counts recorded.
