### tovu:apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts
- **Over:** `registerAdminRecoveryRestoreRoutes` 162 (file 195, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `apps/website/src/server/__tests__/routes/recovery-restore-routes.test.ts`, `apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts`. No test mocks this module.
- **Responsibility map:** A = `app.post("/api/admin/v1/recovery/restore/plan", …` (50) · B = `…/restore/confirm` (43) · C = `…/restore/execute` (67); each is one step of the plan → confirm → execute ceremony.
- **Splits:** HELPERS at module level directly above the register function (after `sendInternalError`), handler bodies word for word:
  1. `handleRestorePlan({ req, res, deps }: RestoreRouteInput): Promise<void>` ← A.
  2. `handleRestoreConfirm({ req, res, deps }: RestoreRouteInput): Promise<void>` ← B.
  3. `handleRestoreExecute({ req, res, deps }: RestoreRouteInput): Promise<void>` ← C.
  `RestoreRouteInput = { req: Request; res: Response; deps: RouteDeps }`. The register function becomes three `app.post(PATH, (req, res) => handleRestoreX({ req, res, deps }))` lines, same order.
- **Importers to update:** none.
- **After:** register fn ~5; helpers 43-67; file ~205.
- **Risks / notes:** handlers that `return res.…` keep the `return` (helper type `Promise<unknown>` then).
