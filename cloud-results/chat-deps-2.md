# chat-deps-2 (Tovu half), run 2026-11-18. Status: PARTIAL

Full report: Jini `cloud-results/chat-deps-2.md` on `wave2/chat-deps` (Jini SHAs: E2-1 `59f30bc8`, E2-2 `fc527a5b`, S6-a `bf746361`, S6-c `0c8513a3` + `b6f2504e`, S6-d prep `3c1d9206`, report `cc1b8fd7`).

Tovu commits (branch `wave2/chat-deps`, fast-forward): `a3cd49f8` and `4961c1ee` (S6-b).
- NEW `apps/admin/src/integrations/__tests__/jini-surfaces.binding.unit.test.tsx` (4 cases: registry component in a Card, legacy pie chart as table, data-table row click delivery, injected registry) against Tovu's real `chatKit` + `chatSurfaces`.
- NEW `apps/admin/src/components/AssistantDock/__tests__/composer-agent-drive.unit.test.tsx` (2 cases: real `createDomPageDriver` fills the chat draft and refuses an outside root; real `page.find_elements` reads a collapsed tool call).
- Gates: `cd apps/admin && npx vitest run <both files> --coverage.enabled=false` 6 passed (against the linked Jini at `b6f2504e`); `npx tsc -p apps/admin/tsconfig.json --noEmit` 0 errors; eslint clean; the pre-push hook skipped desktop gates (no apps/desktop change), pushed without `--no-verify`.
- Not done: S6-d (Jini manifest trim) waits on the lockfile; see the Jini report. When it lands, hosts must already declare `@jini-ai/ui` and `@jini-ai/agent-runtime`: all three Tovu hosts do.
