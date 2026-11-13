### tovu:apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts
- **Over:** `registerAdminDatabaseMigrateForwardRoutes` 115 (file 139, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-14
- **Tests:** `apps/website/src/server/__tests__/routes/database-migrate-forward-routes.test.ts`. No test mocks this module.
- **Responsibility map:** A = `app.post("/api/admin/v1/database/migrate-forward/plan", …` (25) · B = `…/confirm` (30) · C = `…/execute` (58) — the three ceremony steps.
- **Splits:** HELPER at module level above the register function (after `statusFor`): `handleMigrateForwardExecute({ req, res, deps }: { req: Request; res: Response; deps: RouteDeps }): Promise<void>` ← C's handler body word for word; registration `app.post(PATH, (req, res) => handleMigrateForwardExecute({ req, res, deps }))`. A and B stay inline.
- **Importers to update:** none.
- **After:** register fn ~58; file ~142.
- **Risks / notes:** none.
