# backcheck2-67 — r2 checker (a-agent-caps, b-chat, d-admin), 2026-10-17

## Commits
- Jini (branch general-work, not pushed):
  - 1008d761 — 1534 boot policy/permission checks, 1544 filterReadOnlyToolCatalog, 1562 entity schema on validation errors
  - e8be2089 — 329 tool_use dedupe on save, live content and ledger merges
- Tovu:
  - 640839418 — 1426 metaDescription (sdk, preview route, content-analyzer), 1544 BYOK discovery filter
  - f55386160 — 191 visitor model-refresh failure reason
  - 8beb08bf0 — 366 doc, plus the chat-runtime handoff doc

## 1534 boot safety (the special-attention item)
- The type system already requires `ToolRegistration.policy` and `AgentToolDefinition.authorization.permission: string`. Nothing in the Tovu or Jini source casts to these types. No empty-string permission exists.
- Catalogs built from data use constant permissions: agent plugins and skills use `admin.assistant.use`, plugin capabilities use `content.read`, and permanent-delete uses literal specs.
- Desktop: every registration uses OPERATOR_POLICY. The daemon module-level registrations are typed.
- Empirical check: `realToolCatalog()` built all 265 tools of the real first-party roster with `@jini-ai/core` resolved to the new Jini src through a loader hook. Result: PASS.
- Live check: core/cms/daemon dist were already rebuilt at 11:24–11:27 by someone else (JINI-BUILD-OK never existed). :3000 restarted at 11:39 on that dist and serves 200.

## Tests (named files, under the lock)
- Jini vitest:
  - 7 new-test files: 122/122 pass.
  - Neighbours (cms write-service create/import/update-publish/owner, args-convention, pack-lifecycle, chat compact-events/message-blocks/MessageRow/dbpkg run-events): all pass.
  - MessageRow must run from packages/chat. From the root it lacks jsdom.
- Tovu:
  - node --test byok-tool-surface + content-analyzer plugin.unit + preview-route.unit: 59/59.
  - admin vitest use-visitor-credential-form: 45/45.
- Root tsc: my files are clean. 2 errors are another lane's uncommitted media/trash work:
  - trash/adapters/media.ts:89 — "still-referenced" is not a TrashPurgeOutcome
  - permanent-delete-deps.ts:199 — listRetiredSlugs is missing
- I emitted the `packages/sdk` d.ts only (`--emitDeclarationOnly`, gitignored dist) so tsc sees metaDescription. The JS was not touched, so :3000 did not restart.
- RED is argued from the diff for every item. Mutation was not run (10-17 rule).
- Thermal: two short runs started at CPU_Speed_Limit 74/84 (≈8 s each) before I added the poll gate. Every later run was gated.

## Waits on the Jini chat dist rebuild (gate never appeared in 45 min)
- apps/website/src/assistant/persistence/__tests__/run-ledger.dialects.test.ts (329 Tovu-side test) is uncommitted.
- After `npm run -s build` in Jini packages/chat, run it with node --test, then commit it.

## Follow-ups
- None sent back to Codex: no bugs or overbuild found.
- Still open from Codex NOT DONE, needing coordinator decisions: 1540, 1546, 1549, 1558, 37, 326, 328, 355, 1267, 1276.
- sites.json md5 changed during the session, but it still lists exactly the same 5 sites. Only `lastOpened` changed (tovu-dev 11:44, zoran 11:41), which is site activity, not test pollution.
