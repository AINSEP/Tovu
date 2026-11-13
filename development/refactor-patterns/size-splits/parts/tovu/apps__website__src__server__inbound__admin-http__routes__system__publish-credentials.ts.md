### tovu:apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts
- **Over:** `registerAdminPublishCredentialsRoutes` 134 (file 210, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-24
- **Tests:** `apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts`, `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts`. No test mocks this module.
- **Responsibility map** (inside the register function):

| unit | statement anchor | job |
|---|---|---|
| A | `async function verifyAfterSave(id: string)` | verify one just-touched row against its provider |
| B | `async function rejectUnlessAuthorized(req: Request, res: Response)` | workspace + `system.publish` gate |
| C | `app.post(BASE_PATH, asyncRoute({ handler: async (req, res) => {` | create a credential |
| D (stays) | `readDeps`, `writeDeps`, `accountLabelHealScheduler`, `triggerAccountLabelHeal`, GET / PUT / verify / DELETE registrations | wiring + small handlers |

- **Splits:** HELPERS at module level directly above `registerAdminPublishCredentialsRoutes` (after `sendStoreError`), bodies word for word with their long doc comments:
  1. `verifyPublishCredentialAfterSave({ id, deps }: VerifyPublishCredentialAfterSaveInput): Promise<PublishCredentialVerificationResult | …>` (copy the exact return type) ← A; keep `const verifyAfterSave = (id: string) => verifyPublishCredentialAfterSave({ id, deps });` at the same spot — it is still built once per registration and handed to `createAccountLabelHealScheduler` as before.
  2. `rejectUnlessPublishAuthorized({ req, res, deps }: RejectUnlessPublishAuthorizedInput): Promise<boolean>` ← B; keep `const rejectUnlessAuthorized = (req: Request, res: Response) => rejectUnlessPublishAuthorized({ req, res, deps });`.
  3. `handleCreatePublishCredential({ req, res, deps, writeDeps, verifyAfterSave, rejectUnlessAuthorized }: HandleCreatePublishCredentialInput): Promise<void>` ← C's inner `handler` body; registration `app.post(BASE_PATH, asyncRoute({ handler: (req, res) => handleCreatePublishCredential({ … }) }));`. `writeDeps` type = `typeof writeDeps` → declare it via a named type alias above (`type PublishCredentialWriteDeps = { … }` copied from the literal's fields) or pass `deps` and rebuild nothing — prefer passing the same object.
- **Importers to update:** none.
- **After:** register fn ~80; file ~225.
- **Risks / notes:** `verifyAfterSave` identity matters to the heal scheduler's in-flight dedupe (comment says built ONCE) — keep the single `const` before the scheduler.
