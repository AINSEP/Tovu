TDD(Direct): Loaded the TDD persona for behavioral coverage gap filling. Extended existing suites and added deterministic menu ID dependencies.

**CHANGED FILES:**
```text
/Users/la/Programming/Tovu/apps/admin/src/__tests__/unit/app-chat-dock-drop-capture.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/__tests__/unit/app-session-local-owner.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/menus/__tests__/use-menu-editor.hooks.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts
/Users/la/Programming/Tovu/apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx
/Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/api-external-mcp-admissions.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/api-long-tail-endpoints.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/api-system-endpoints.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/api-themes.unit.test.ts
/Users/la/Programming/Tovu/apps/admin/src/lib/__tests__/api-trash-items.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/contracts/core/__tests__/human-confirm.lifecycle.test.ts
/Users/la/Programming/Tovu/apps/website/src/contracts/core/commands/__tests__/revert.unit.test.ts
/Users/la/Programming/Tovu/apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts
/Users/la/Programming/Tovu/apps/website/src/platform/db/repos/__tests__/custom-credential-repo.test.ts
```

**PER FILE:**

| Source | Added behavioral cases |
|---|---|
| `apps/admin/src/lib/api.ts` | Theme original/copy requests; MCP approvals and configuration failures; trash filters/restore/purge; server logs; site configuration/actions; credential copying; publish destination, plan, confirm, and execute payloads. Preserved existing source edits. |
| `apps/admin/src/App.hooks.ts` | Stale login refreshes; sidebar Escape/navigation; resize callbacks, breakpoint changes, missing refs, focus restoration; WebMCP registration failures, aborts, opt-out, and bridge failure cleanup. |
| `contracts/core/human-confirm.ts` | Headless refusal, expiry, dialog options, refusal results, unexpected keys, compatibility handler, prepared values, remembered keys, and custom decline handling. |
| `contracts/core/commands/revert.ts` | Conflict metadata defaults and deletion during the final status recheck. Existing tests already exercise most reported scenarios. |
| `features/custom-credentials/vault-repo.ts` | Foreign contexts, missing envelopes, hidden revision metadata, username absence, hint preservation/clearing, prepared CAS writes, scope mismatches, ordering, and storage errors. |
| `features/menus/hooks/use-menu-editor.hooks.ts` | Nested edits/removal/reordering, boundary paths, stale load/save/copy failures, save before load, unsaved copying, UUID creation, and deterministic fallback IDs. |
| `features/roles/hooks/roles-dependencies.hooks.ts` | Real API forwarding; empty fake state; missing records; configured failures; successful mutations; permission membership enforcement. |
| `features/entries/repo.ts` | Missing/foreign trash-aware lookups, type filtering, default descending order, pagination offsets, and unchanged propagation of database failures. |

Coverage effects remain unmeasured for every file.

**UNREACHABLE:**

- `human-confirm.ts:124`: the real classifier cannot return confirmed for a non-received answer.
- `human-confirm.ts:129`: an offered choice cannot be non-string under `HumanConfirmSpec`.
- `roles-dependencies.hooks.ts:26,28,36,38`: private factories always receive objects containing generated IDs; omitted-object and missing-ID defaults have no caller.
- `use-menu-editor.hooks.ts:120`: a valid reorder requires existing siblings, so the selected ancestor cannot lack children.
- `use-menu-editor.hooks.ts:272`: the current fetch path wraps failures as `Error`, leaving the second non-Error fallback unreachable.

These remain intact for owner review.

**NOT DONE:** Tests, typecheck, builds, coverage, and package scripts were not run, as instructed. **100% coverage is not verified.** No commits or git-state mutations were made. The targeted diff whitespace check passed.
