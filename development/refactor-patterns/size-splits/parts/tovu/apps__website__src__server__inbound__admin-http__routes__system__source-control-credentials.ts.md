### tovu:apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts
- **Over:** `registerAdminSourceControlCredentialsRoutes` 103 (file 148, under)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts`; plus `rg -l "source-control-credentials" apps/website/src --glob '*.test.*'`. No test mocks this module.
- **Responsibility map:** A = nested `async function rejectUnlessAuthorized(req: Request, res: Response)` (workspace + `source-control.credentials.write` gate); B (stays) = `readDeps`, `writeDeps`, the five route registrations (≤18 lines each).
- **Splits:** HELPER at module level directly above the register function (after `sendStoreError`): `rejectUnlessSourceControlAuthorized({ req, res, deps }: RejectUnlessSourceControlAuthorizedInput): Promise<boolean>` ← A's body word for word (its comment moves). Keep `const rejectUnlessAuthorized = (req: Request, res: Response) => rejectUnlessSourceControlAuthorized({ req, res, deps });` at the same spot so the route bodies are unchanged. `deps: AdminSourceControlCredentialsDeps`.
- **Importers to update:** none.
- **After:** register fn ~83; file ~152.
- **Risks / notes:** none.
