Completed J03, J05, and J06. Stopped J02 and J04 under the unlisted-production-importer rule.

All paths below are under `packages/`; each ledger key is `(path, catch-reads-error)`.

| Sheet | Result and file | Expected reduction |
|---|---|---|
| J02 | **STOPPED** — `diagnostics/src/web-evidence/page-work-budget.ts:82`; existing production importers found, including `collect-page-evidence.ts:48`. Untouched. | 0 |
| J03 | **Done** — `infra/src/events/outbox/worker.ts:366`; applied `observed`. | 3→2 |
| J04 | **STOPPED** — `mcp/src/core/config.ts:278,305`; production re-export found at `mcp/src/index.ts:15`. Untouched. | 0 |
| J05 | **Done** — `mcp/src/core/opencode/config.ts:117`; applied `orFallbackSync`. | −1 |
| J06 | **Done** — `plugins/src/host/node/runtime-core.ts:385`; applied `observed`. File length recorded: 553 lines. | −1 |

[COMMIT-PLAN.md](SCR/c-jz2-b/COMMIT-PLAN.md) records every sheet and combine mutation. [REFRESH.md](SCR/c-jz2-b/REFRESH.md) records J02/J04 production and test references; the other symbols have only local references.

Diff re-read removed nothing extra. No tests, builds, gates, ledger edits, or Git mutations ran. Expected reductions remain unverified.
