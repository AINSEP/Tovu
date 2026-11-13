### tovu:apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts
- **Over:** `registerAdminSiteImportRoutes` 112 (file 128, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts`, `apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts`, `apps/website/src/server/__tests__/routes/owner-action-product-events-wave2.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | statement anchor | job |
|---|---|---|
| A | `const fail = (res: Response, error: unknown, req: Request) => {` | map an import failure to the response (22 lines) |
| B | `app.post(root + "/uploads", async (req, res, next) => {` | streamed upload with deadline/idle limits + busy flag |
| C (stays) | `root`, `let uploadBusy`, `gate`, `requestSignal`, `ownerGate`, the other four routes | wiring |

- **Splits:** HELPER at module level above the register function (after `importStep`): `sendSiteImportFailure({ res, error, req, deps }: SendSiteImportFailureInput): void` ← A's body (return type = what `fail` returns today). Keep `const fail = (res: Response, error: unknown, req: Request) => sendSiteImportFailure({ res, error, req, deps });`. `deps: Deps`.
  B stays inline — it writes the `let uploadBusy` flag; moving it would need a state holder.
- **Importers to update:** none.
- **After:** register fn ~92; file ~133.
- **Risks / notes:** none.
