### tovu:apps/website/src/features/identity/tool-registrations.ts
- **Over:** `buildGatedIdentityRegistrations` 154 (file 213)
- **Phase:** after-move (MOVE-AFTER write-service.ts …; STAY-WIRING) · **Batch:** size-48
- **Tests:** `apps/website/src/features/identity/__tests__/tool-registrations.human-confirm.test.ts`, `apps/website/src/features/identity/__tests__/change-username-tool.test.ts`, `apps/website/src/features/identity/__tests__/permission-list-tool.test.ts`, `apps/website/src/server/runtime/composition/modules/__tests__/assistant-tool-exec.integration.test.ts`
- **Responsibility map:** delete-reference lookup (`deleteReferences`) · human-confirmed delete wrapper (`confirmedDelete`) · human-password user create wrapper (`createUserWithHumanPassword`) · clock/identity/username port assembly + `return withToolMetadata(` (stays).
- **Splits** (HELPERS, module level above the function, closures turned into explicit inputs):
  1. `loadIdentityDeleteReferences({ routeDeps, kind, id }: LoadIdentityDeleteReferencesInput): Promise<…same return…>` ← the `deleteReferences` arrow body (+ "Each family supplies" comment). Inside the main function keep `const deleteReferences = ({ kind, id }, _options = {}) => loadIdentityDeleteReferences({ routeDeps, kind, id });` only if its call sites pass `_options`; otherwise call the helper directly.
  2. `confirmedIdentityDelete({ registration, kind, surfaces, routeDeps }: ConfirmedIdentityDeleteInput): ToolRegistration` ← `confirmedDelete`'s body (calls helper 1).
  3. `createUserWithHumanPassword({ inner, publishedSchema, routeDeps, surfaces }: CreateUserWithHumanPasswordInput): ToolHandler` ← that arrow's body (56 lines).
  In the `return withToolMetadata(` call, replace the closure references with arrows passing `routeDeps`/`surfaces` (same call shape the Jini builder expects).
- **Importers to update:** none.
- **After:** `buildGatedIdentityRegistrations` ~55; helpers ~12 / ~33 / ~58; file ~225.
- **Risks / notes:** check the exact parameter shape Jini's `buildIdentityRegistrations` passes to these two callbacks — the wrappers keep that shape.
