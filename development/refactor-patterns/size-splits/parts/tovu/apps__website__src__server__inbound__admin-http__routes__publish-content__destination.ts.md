### tovu:apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts
- **Over:** `registerPublishContentDestinationRoutes` 135 (file 197, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `rg -l "publish-content/destination|registerPublishContentDestinationRoutes" apps/website/src --glob '*.test.*'` (design time: none found by path; smoke = `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peers.routes.test.ts` if it mounts it, else `npx eslint` + `outline --check` only). No test mocks this module.
- **Responsibility map:** A = `const guard = async (` (mount-path 404 + `publish_content.apply` gate); B = `app.post(`${base}/connect`, …` (53 — connect a destination); C (stays) = `base`, GET (30), disconnect (30).
- **Splits:** HELPERS at module level directly above the register function (after `respondWithError`):
  1. `guardDestinationRoute({ req, res, deps }: GuardDestinationRouteInput)` ← `guard`'s body (copy its params into the object and its return type); keep `const guard = (…same params…) => guardDestinationRoute({ …, deps });` (its comment moves to the helper).
  2. `handleConnectDestination({ req, res, deps, own, guard }: HandleConnectDestinationInput): Promise<void>` ← B's handler body. Types: `deps: PublishContentRouteDeps`, `own: PublishDestinationDeps`, `guard: typeof guard` → declare `type DestinationGuard = (…) => Promise<…>`.
- **Importers to update:** none.
- **After:** register fn ~70; file ~210.
- **Risks / notes:** none.
