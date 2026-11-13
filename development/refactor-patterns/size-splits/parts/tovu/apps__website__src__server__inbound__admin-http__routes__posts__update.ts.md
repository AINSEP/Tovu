### tovu:apps/website/src/server/inbound/admin-http/routes/posts/update.ts
- **Over:** `registerAdminPostUpdateRoute` 109 · its `app.put` handler 103 (file 186, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/http/__tests__/ranked-user-facing-errors.test.ts`, `apps/website/src/server/inbound/admin-http/routes/posts/__tests__/revision-attribution.test.ts`; plus `rg -l "posts/update(\.js)?['\"]|registerAdminPostUpdateRoute" apps/website/src --glob '*.test.*'` hits. No test mocks this module.
- **Responsibility map** (the PUT handler):

| unit | statement anchor | job |
|---|---|---|
| A | `let postId: string;` + the following `try {` (slug → id resolution) | resolve the URL's slug-or-id to the stored post id, or answer 404/error |
| B (stays) | workspace check, `rawParam`, `idempotencyKey`, `let priorPost`, the main `try {` through the gateway call | the update itself |

- **Splits:**
  1. HELPER at module level above `registerAdminPostUpdateRoute` (after `sendPostUpdateError`): `resolvePostIdOrRespond({ rawParam, res, deps }: ResolvePostIdOrRespondInput): Promise<string | undefined>` ← the `try {` that assigns `postId` (returns the id; where the block responded and returned, return `undefined`). Keep the "Admin URLs use the slug…" comment on it. Caller: `const postId = await resolvePostIdOrRespond({ rawParam, res, deps }); if (postId === undefined) return;`. If the block is synchronous, make the helper synchronous (match the source; do not add awaits).
  2. HELPER `handlePostUpdate({ req, res, deps }: HandlePostUpdateInput): Promise<void>` ← the whole `app.put` handler body; registration becomes `app.put(PATH, …existing middleware args…, (req, res) => handlePostUpdate({ req, res, deps }))` with the same path and any middleware between them unchanged.
- **Importers to update:** none.
- **After:** `registerAdminPostUpdateRoute` ~8; `handlePostUpdate` ~92; file ~195.
- **Risks / notes:** `deps` is untyped in the `const-fn` signature (`(app, deps)`) — give the helpers the type the const's declared type gives `deps` (look at the `registerAdminPostUpdateRoute` type annotation, e.g. `RouteRegistrar` → `RouteDeps`). `priorPost` is assigned inside `captureInverse` closures in the main try — it stays inside `handlePostUpdate`.
