### tovu:apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts
- **Over:** `registerPublishContentImportRoutes` 170 (file 224, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts`, `.../__tests__/import-errors.test.ts`, `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts`, `.../publish-content/__tests__/backstop-import-ui.routes.test.ts`. No test mocks this module.
- **Responsibility map** (inside `registerPublishContentImportRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A | `function buildHooks(bundleId: string, actorId: string, res: Response, overwriteEntityKeys:` | gated-mutation hooks for one request |
| B | `async function mayReadRawValues(`, `async function rawPlanPreview(` | refuse raw-row previews to read-only accounts |
| C | `app.post(".../publish-content/import/execute", async (re…` | redeem the confirmation and apply |
| D (stays) | plan / confirm / runs registrations | other ceremony steps |

- **Splits:** HELPERS at module level directly above `registerPublishContentImportRoutes` (after `RAW_VALUES_REFUSED`), bodies word for word, comments move:
  1. `buildImportHooks({ deps, bundleId, actorId, res, overwriteEntityKeys }: BuildImportHooksInput)` ← A (return type = what `buildHooks` returns). Call sites `buildHooks(a, b, c, d)` become `buildImportHooks({ deps, bundleId: a, actorId: b, res: c, overwriteEntityKeys: d })` — keep argument order mapping exact.
  2. `mayReadRawValues({ res, principalId, report, deps }: MayReadRawValuesInput): Promise<boolean>` and `rawPlanPreview({ res, input, deps }: RawPlanPreviewInput)` ← B (same return types; `input` = the old second param object).
  3. `handleImportExecute({ req, res, deps }: HandleImportExecuteInput): Promise<void>` ← C's handler body.
  `deps` type = the function's existing `deps` param type (copy it; it is `PublishContentRouteDeps` or similar).
- **Importers to update:** none.
- **After:** register fn ~78; file ~240.
- **Risks / notes:** none beyond argument mapping in step 1.
