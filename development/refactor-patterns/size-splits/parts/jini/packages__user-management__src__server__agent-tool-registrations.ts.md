### jini:packages/user-management/src/server/agent-tool-registrations.ts
- **Over:** `buildIdentityRegistrations` 186 (file 361)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/server/__tests__/agent-tool-registrations.consistency.test.ts`, `packages/user-management/src/server/__tests__/agent-tool-registrations.guards.test.ts`, `packages/user-management/src/server/__tests__/change-username-tool.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | handlers `identity_user_list`, `identity_role_list`, `identity_policy_list` | read tools |
| B | `identity_user_create`, `identity_user_update_email`, `identity_user_change_username`, `identity_user_disable`, `identity_user_enable` | user write tools |
| C | `identity_role_create`, `identity_role_assign`, `identity_role_rename`, `identity_role_delete` | role write tools |
| D | `identity_policy_create`, `identity_policy_update`, `identity_policy_delete`, `identity_policy_attach` (+ any later policy keys) | policy write tools |
| E | `serviceDeps`, `handlers` object, `buildDomainRegistrations` return | assemble registrations (stays) |

- **Splits** (same file, module level above `buildIdentityRegistrations`; each `({ routeDeps, serviceDeps }: IdentityHandlerInput): Record<string, ToolHandler>`):
  1. `identityReadHandlers` ← A entries verbatim.
  2. `identityUserWriteHandlers` ← B.
  3. `identityRoleWriteHandlers` ← C.
  4. `identityPolicyWriteHandlers` ← D (all remaining `identity_policy_*` keys).
  `handlers` becomes `{ ...identityReadHandlers(i), ...identityUserWriteHandlers(i), ...identityRoleWriteHandlers(i), ...identityPolicyWriteHandlers(i) }` with `i = { routeDeps, serviceDeps }` — key insertion order identical to today (spread in source order). Comments inside entries move with them; the "Assembled per call…" comment stays on `serviceDeps`.
- **Importers to update:** none.
- **After:** `buildIdentityRegistrations` ~15; largest helper ~60; file ~380.
- **Risks / notes:** `consistency.test.ts` likely asserts the handler key set equals the catalog — order/coverage unchanged by spreading. Check no handler references another handler by `handlers.x` (if one does, keep those two in the same helper).
