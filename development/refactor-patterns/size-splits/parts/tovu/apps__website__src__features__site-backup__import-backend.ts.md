### tovu:apps/website/src/features/site-backup/import-backend.ts
- **Over:** `createSiteImportBackend` 141 (file 172, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts`, `apps/website/src/cli/__tests__/integration/import-local.integration.test.ts`, `apps/website/src/server/__tests__/routes/owner-action-product-events-wave2.test.ts`; plus `rg -l "import-backend" apps/website/src --glob '*.test.*'`. No test mocks this module.
- **Responsibility map:**

| unit | statement anchor | job |
|---|---|---|
| A | `const fetchArchive = async (input: { parsed: ParsedSiteImportInput; principalId: string; i…` | read/download the archive, recording the consumed upload first |
| B | `const verifyAndStage = async (input: { row: SiteImportRecord; parsed: ParsedSiteImportInpu…` | verify + stage, or roll the stage back |
| C | `const createImportedSite = async (input: { row: SiteImportRecord; adminPassword: string; s…` | create the site from the stage, or roll back to failed |
| D (stays) | `registry`, `workspace`, `view`, `put`, `let active`, `exclusive`, `const backend: SiteImportBackend = {` | the backend surface + one-at-a-time lock |

- **Splits:** HELPERS at module level directly above `createSiteImportBackend`, bodies word for word (their "why" comments move):
  1. `fetchSiteImportArchive({ input, required, optional }: FetchSiteImportArchiveInput)` ← A.
  2. `verifyAndStageSiteImport({ input, required, put, view }: VerifyAndStageSiteImportInput)` ← B (calls `fetchSiteImportArchive({ input: …, required, optional })` — add `optional` to its input if B's call needs it).
  3. `createImportedSiteFromStage({ input, required, optional, put }: CreateImportedSiteFromStageInput)` ← C.
  Return types: copy each arrow's inferred return (`Promise<…>`). `required`/`optional` = the factory's own param types (name them `SiteImportBackendRequired` / `SiteImportBackendOptional` by extracting the inline param type literals into module-level types). `registry`/`workspace` are read via `required.registry` / `required.workspace` inside the helpers (same objects). The factory keeps `const fetchArchive = …` etc. only if `backend` calls them directly; otherwise `backend` calls the helpers.
- **Importers to update:** none.
- **After:** `createSiteImportBackend` ~92; file ~190.
- **Risks / notes:** the `active` lock and `exclusive` stay in the factory — helpers must not touch `active`.
