All eight sheets **done**; no STOPs.

`AP` = `apps/website/src/features/agent-plugins`. Each listed ledger target uses rule `catch-reads-error`; zeros await combine verification.

| Sheet | Files touched | Ledger target |
|---|---|---|
| B1 | `AP/capability-projection.ts` | 181 |
| B2 | `AP/exports/source.ts` | 183 |
| B3 | `AP/host-plugin-guidance.ts` | 184 |
| B4 | `AP/host-signals.ts` | 185 |
| B5 | `AP/new-site-agent-plugin-tokens.ts` | 188 |
| B6 | `AP/provider-plugin-link.ts` | 189 |
| B7 | `AP/soon-lock.ts`, `AP/supersession.ts` | 190–191 |
| RC-W2 | Under `features/external-mcp/`: deleted `external-mcp-shared-oauth.ts`; updated `contracts.ts`, `__tests__/h1a/hosted-mcp-type-pins.test.ts`, `__tests__/h3/moved-shims.test.ts` | None |

B1–B7 have no test edits. RC-W2 repoints the type-test import and deletes exactly three obsolete H3 lines; no absence assertion added.

Pads removed: **0 per sheet**. No incidental importers or `REFRESH.md` entries. Diff re-read found no extraneous changes requiring deletion.

Created [COMMIT-PLAN.md](SCR/c-tv-b4/COMMIT-PLAN.md) with eight entries covering mutations, conditional Chrome looks, deletions, and EXTRACT-S5 H3 provenance.

No checks ran. Ledger, packages, and lockfiles are untouched. Changes remain uncommitted on `codex/tv-b4`.
