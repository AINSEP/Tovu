### tovu:apps/website/src/server/inbound/admin-http/routes/system/sites.ts
- **Over:** `registerAdminSitesRoutes` 128 (file 322, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/sites/sites-wiring.unit.test.ts`, `.../routes/sites/local-sites.unit.test.ts`, `.../routes/sites/sites-home-errors.unit.test.ts`, `.../routes/sites/__tests__/local-sites.pins.unit.test.ts`, `development/scripts/__tests__/sites-route-parity.test.ts`. Check `rg -n "mock.*system/sites" apps/website/src` first (none seen).
- **Responsibility map** (inside `registerAdminSitesRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A (stays) | `const sitesWorkspace = …` … `registerLocalSitesRoutes({ app, deps: { ...deps, localSiteSupervisor, …` | resolve ports + mount sub-route groups |
| B (stays) | `app.get("/api/admin/v1/workspaces/:workspaceId/system/sites", …`, `app.get(".../system/sites/token-sign-in-plugins", …` | listings (20 lines each) |
| C | `app.post("/api/admin/v1/workspaces/:workspaceId/system/sites", async (req, res) => {` | create a site |
| D | `app.post("/api/admin/v1/workspaces/:workspaceId/system/sites/:name/activate", async (req,` | switch the served site |

- **Splits:** HELPERS at module level directly above `registerAdminSitesRoutes` (after `registerDevWarmSiteRoute`), handler bodies word for word:
  1. `handleCreateSite({ req, res, deps, isSiteSwitcherEnabled }: HandleCreateSiteInput): Promise<void>` ← C.
  2. `handleActivateSite({ req, res, deps, isSiteSwitcherEnabled, listSites, devRestart, sitesWorkspace, warmServer }: HandleActivateSiteInput): Promise<void>` ← D.
  Types: `deps: AdminSitesDeps`, `req: Request`, `res: Response`; the resolved locals keep their inferred types — name them with `NonNullable<AdminSitesDeps["listSites"]>` / `ReturnType<typeof warmSiteServerForHost>` / `ReturnType<typeof createSitesWorkspace>` etc. (copy what the declarations resolve to; `devRestart` = the type of its `const`). Registration: `app.post(PATH, (req, res) => handleCreateSite({ req, res, deps, isSiteSwitcherEnabled }));` same order.
- **Importers to update:** none.
- **After:** `registerAdminSitesRoutes` ~65; helpers ~36 each; file ~335.
- **Risks / notes:** keep each handler's early `return` statements as they are (helper returns `Promise<unknown>` if a body returns `res.…`).
