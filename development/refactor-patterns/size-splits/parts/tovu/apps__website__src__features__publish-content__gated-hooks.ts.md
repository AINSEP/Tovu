### tovu:apps/website/src/features/publish-content/gated-hooks.ts
- **Over:** `buildPublishContentImportHooks` 104 (file 171, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-08
- **Tests:** `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import-errors.test.ts`; plus `rg -l "gated-hooks" apps/website/src --glob '*.test.*'`. No test mocks this module.
- **Responsibility map:** A = nested `async function buildReport(): Promise<PublishContentReport>` (re-derive the current report from live state — reads only `input`); B (stays) = the returned hooks object with `executeMutation`.
- **Splits:** HELPER at module level directly above `buildPublishContentImportHooks`: `buildCurrentPublishContentReport({ input }: { input: BuildPublishContentImportHooksInput }): Promise<PublishContentReport>` ← A's body word for word (its "never cached across…" comment moves). Inside the factory keep `const buildReport = () => buildCurrentPublishContentReport({ input });` so the hooks object is unchanged.
- **Importers to update:** none.
- **After:** `buildPublishContentImportHooks` ~73; file ~175.
- **Risks / notes:** none.
