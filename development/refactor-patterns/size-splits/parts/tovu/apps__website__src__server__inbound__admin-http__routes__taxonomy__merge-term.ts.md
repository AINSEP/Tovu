### tovu:apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts
- **Over:** `registerAdminTaxonomyMergeTermRoutes` 117 (file 134, under)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/server/__tests__/routes/taxonomy-merge-term-routes.test.ts`. No test mocks this module.
- **Responsibility map:** A = `app.post("/api/admin/v1/taxonomy/terms/:id/merge/plan", …` (40) · B = `…/merge/confirm` (38) · C = `…/merge/execute` (37) — the merge ceremony steps.
- **Splits:** HELPER at module level above the register function (after `statusFor`): `handleMergeTermPlan({ req, res, deps }: { req: Request; res: Response; deps: RouteDeps }): Promise<void>` ← A's handler body word for word; registration `app.post(PATH, (req, res) => handleMergeTermPlan({ req, res, deps }))`. B and C stay inline (one helper is enough; do not extract more).
- **Importers to update:** none.
- **After:** register fn ~80; file ~138.
- **Risks / notes:** none.
