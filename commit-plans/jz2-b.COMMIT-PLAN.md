# Catch idiom sheets

Branch: `codex/jz2-b`. Base for every sheet: `949c622a1`.
No tests, builds, installs, type checks, linters, gate runs, commits, or ledger edits were performed. Reductions below are expected, pending combine verification.

## J02 — STOPPED

- Base: `949c622a1`.
- Target: `packages/diagnostics/src/web-evidence/page-work-budget.ts:82`; no file touched.
- STOP: targeted reference lookup found unlisted production importers of `PageWorkBudget` at `collect-page-evidence.ts:48`, `playwright-browser.ts:25`, `public-page.ts:6`, and `render-page.ts:2`, all in the same directory. The explicit importer STOP rule leaves this sheet unchanged.
- Ledger key: (`packages/diagnostics/src/web-evidence/page-work-budget.ts`, `catch-reads-error`). Expected reduction from this job: 0; the proposed reduction of 1 remains deferred.
- Combine mutation: none owed for the unchanged sheet; if later authorized and applied, restore `void closing.catch(() => {});`.
- Diff re-read deletions: none.

## J03 — DONE

- Base: `949c622a1`.
- File touched: `packages/infra/src/events/outbox/worker.ts:366`.
- Replaced only the named handler with `observed({ promise: gate });` and added its idiom import. `settleWithin` still receives `gate`; report guards and uncertain outcomes remain unchanged.
- Ledger key: (`packages/infra/src/events/outbox/worker.ts`, `catch-reads-error`). Expected reduction: 1, from 3 to 2; retain residual findings.
- Combine mutation owed: restore `gate.catch(() => {});` and confirm the finding returns.
- Diff re-read deletions: none beyond the required handler replacement.

## J04 — STOPPED

- Base: `949c622a1`.
- Targets: `packages/mcp/src/core/config.ts:278` and `:305`; no file touched.
- STOP: targeted reference lookup found an unlisted production re-export of `writeMcpConfig` at `packages/mcp/src/index.ts:15`. The explicit importer STOP rule leaves both edits in this sheet unchanged.
- Ledger key: (`packages/mcp/src/core/config.ts`, `catch-reads-error`). Expected reduction from this job: 0; the proposed reduction of 2 remains deferred.
- Combine mutations: none owed for the unchanged sheet; if later authorized and applied, restore the `prev.catch(() => {})` chain and the `resolveRealOrLexical` try/catch separately.
- Diff re-read deletions: none.

## J05 — DONE

- Base: `949c622a1`.
- File touched: `packages/mcp/src/core/opencode/config.ts:117`.
- Replaced only the alias-resolution try/catch and mutable declaration with the named `orFallbackSync` expression and its import. The lexical normalization and original return expression remain unchanged.
- Ledger key: (`packages/mcp/src/core/opencode/config.ts`, `catch-reads-error`). Expected reduction: 1.
- Combine mutation owed: restore the original `let real` declaration and alias-resolution try/catch; confirm the finding returns.
- Diff re-read deletions: none beyond the required declaration and try/catch replacement.

## J06 — DONE

- Base: `949c622a1` (includes the prerequisite core changes).
- File touched: `packages/plugins/src/host/node/runtime-core.ts:385`.
- Replaced only the named handler with `observed({ promise: attached });` and added its idiom import. The original `attached` promise, race, finally, and why-comment remain unchanged.
- Ledger key: (`packages/plugins/src/host/node/runtime-core.ts`, `catch-reads-error`). Expected reduction: 1.
- Combine mutation owed: restore `attached.catch(() => {});` and confirm the finding returns.
- File length: 552 before, 553 after; the existing file exceeds 500 lines, which is a note rather than a STOP under the dispatch.
- Diff re-read deletions: none beyond the required handler replacement.
