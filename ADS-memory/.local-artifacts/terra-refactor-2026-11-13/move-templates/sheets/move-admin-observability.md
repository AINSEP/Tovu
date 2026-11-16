# admin/features/observability — BLOCKED on a precondition + not filled (W1 #18). Written 2026-11-16 from Tovu `b28d38c6` / Jini `b7666092`.
Skeleton: `make-sheet.py admin/features/observability --kind all` (move/dedupe/delete-observability.gen.md). KIND-SUSPECT fired once (DELETE hook).
untangle_overlap: none (no repoint.tsv row names these files).

## Findings (read from code)
1. `recent-errors-rules.ts` (236 lines, MOVE label, blob 88a156606c137ceeac0f6a04380c8c263e0083fa; importers: `hooks/use-recent-server-errors.hooks.ts:15` (blob f7f5dc324a4b9ee0cb91bcf413609fe5b75de240) and its test `__tests__/recent-errors-rules.unit.test.ts:12` (blob ff2836ef7831a101a51786c4c110298087e00e0c)). Not a pure verbatim move:
   - it imports the Tovu wire type `AdminServerLogEntry` (`@/lib/api:502`). Jini side must declare `ErrorLogEntry { at; source; message }` and make `RecentErrorGroup<Entry extends ErrorLogEntry = ErrorLogEntry>` / `groupErrorEntries<Entry>` generic; the hook's `toRow` (line 103) then types `RecentErrorGroup<AdminServerLogEntry>` (its row copies the narrow `source` union).
   - `REPO_ANCHORS = ["/apps/", "/packages/"]` (line 32) is this monorepo's layout: it must become an optional value (`{ anchors }`) with Tovu passing its two folders.
   - The header's redaction paragraph names `apps/website/src/platform/server-logs/index.ts`: Tovu-specific why, stays in the hook's header.
   - The 237-line test is full of Tovu paths (`/Users/la/Programming/Tovu/apps/...`, `sites/tovu-dev`): it cannot move to Jini verbatim (COMMON rule 2) and its fixture data may not be rewritten by an executor. Decision: Tovu test stays, repointed; Jini gets a NEW neutral test (to be written by the sheet author, not the executor).
   So it is a SPLIT-with-values (value injection + generic type), not MOVE.
2. **Precondition (coordinator):** `apps/admin/package.json` does not depend on `@jini-ai/diagnostics` (it lists admin, agent-plugins, agent-runtime, agentic, chat, cms, core, integrations, platform, plugins, protocol, ui, ui-kit, user-management). Adding it touches the lockfile, which an executor may not do. Also the survey's "existing subpath" does not fit: `./observability` is universal but its barrel pulls the OTel adapter (`otel.js`) into the admin bundle; the sheet needs a NEW universal subpath (proposed `./error-groups`, file `packages/diagnostics/src/error-groups.ts`; package.json blob 4588a2e2c687a50b9d713d17eaf8061741270adc, README blob 248c937dcec6b888d8e7657041542b691eed0e82).
3. `hooks/use-recent-error-item.hooks.ts` (38 lines, DELETE label "inline in the panel", KIND-SUSPECT correct): a real hook (useState/useId/useCopyToClipboard), 1 importer + its own unit test. A fold into `recent-errors-panel.tsx` moves a hook body into a component under the admin 9/9 complexity gate and relocates `use-recent-error-item.hooks.unit.test.ts`; it is a Tovu-only UI fold (re-kind: UI fold, Tovu commit only, no Jini change).
4. `observability-visuals.tsx` (90 lines, DEDUPE "shared icon helper"): not checked against a Jini twin in this run.

## Status
- BLOCKED on: (P1) coordinator adds `"@jini-ai/diagnostics": "^0.7.0"` to `apps/admin/package.json` + lockfile; (P2) none for owner. Then an Opus/Sonnet+review sheet for SP-observability-1 (rules) and a Sonnet sheet for the UI fold.
- Owner question: none.
