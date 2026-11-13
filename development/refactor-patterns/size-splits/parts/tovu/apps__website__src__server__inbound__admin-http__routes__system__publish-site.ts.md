### tovu:apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts
- **Over:** `registerAdminPublishSiteRoutes` 182 (file 304, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site-listing.unit.test.ts`, `.../system/__tests__/publish-site.tw4.pins.test.ts`, `.../system/__tests__/unit/h4-publish.unit.test.ts`. No test mocks this module.
- **Responsibility map** (inside `registerAdminPublishSiteRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A | `app.post("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {` | start a publish run |
| B | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {` | read publish status |
| C | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish/preview", async (req, res) =>` | preview what a publish would do |
| D | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish/destinations", …` | list saved destinations |
| E | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish-targets", …` | list registry targets for the card |
| F (stays) | `const credentialSource = composePublishCredentialSource({` + the five `app.*` registrations | wiring |

- **Splits:** HELPERS at module level directly above `registerAdminPublishSiteRoutes` (after `readPublishTriggerConfig`), one per route handler, each the handler's body word for word (comments above each `app.*` move onto its helper; keep the registration line's own comment too):
  1. `handlePublishStart({ req, res, deps, credentialSource }: HandlePublishStartInput): Promise<void>` ← A's handler body.
  2. `handlePublishPreview({ req, res, deps, credentialSource }: HandlePublishPreviewInput): Promise<void>` ← C.
  3. `handlePublishDestinations({ req, res, deps }: HandlePublishDestinationsInput): Promise<void>` ← D.
  4. `handlePublishTargets({ req, res, deps }: HandlePublishTargetsInput): Promise<void>` ← E.
  Types: `req: Request`, `res: Response` (express), `deps: AdminPublishSiteDeps`, `credentialSource: ReturnType<typeof composePublishCredentialSource>`. Registration becomes `app.post(PATH, (req, res) => handlePublishStart({ req, res, deps, credentialSource }));` — same path strings, same order. B (19 lines) stays inline.
  If a handler `return`s a value (e.g. `return res.status(…).json(…)`), keep the `return` — the helper's return type then is `Promise<unknown>`; do not change statements.
- **Importers to update:** none.
- **After:** `registerAdminPublishSiteRoutes` ~35; largest helper ~55; file ~320.
- **Risks / notes:** `credentialSource` must stay built ONCE per registration (its comment says so) and be passed, not rebuilt per request.
