# website/server/runtime/services (W1 #26) — NOT FILLED
Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`. **NOT FILLED** in this run (context budget: Group B stopped at ~250k tokens after 6 features). Facts below are from `make-sheet.py --kind all` + CLASSIFY-files.tsv + the untangle TSVs; nothing here is executable yet.

untangle_overlap: none

## Files and labels
external-mcp-admissions.ts (MOVE 40, 3 importers) -> `jini:mcp/src/federation/hosted/admissions.ts`; external-mcp-probe.ts (MOVE 198, 1 stay import) -> `mcp/src/federation/hosted/probe.ts`.

## Judgment notes for the sheet author
PLAN.md blockers: owner 'hosted MCP' pilot rejection applies to `external-mcp`; this feature depends_on website/features/external-mcp. Unavailable copy/code is a host value. Tier: Sonnet once the owner position on hosted MCP is known.

## Owner question
Q-services: does the 'hosted MCP' pilot rejection (PLAN.md blockers row) also block moving these two hosted-federation helpers into `@jini-ai/mcp`? Recommended: BLOCKED until answered.
