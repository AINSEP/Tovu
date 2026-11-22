# RT-K1-0 — route-spec base: the host's JSON-route ports and the legacy-shape refusal (K1, J then T)

Owner K1 (11-22): routes leave Tovu as server-framework-neutral specs with their own small deps types; Tovu keeps registration/composition. Every `RT-K1-*` step depends on this one. Est: J 100 min, T 90 min.

## Why this step exists (verified)
- Core's `jsonRoute` answers a returned `err` as `{ error: ServerApiError }` (`packages/core/src/contracts/server/json-route.ts:152`). Tovu routes answer `{ error: "<string>", code }` with their own statuses, and ~440 Tovu route tests pin those bodies.
- The admin client already decodes both shapes (Jini `packages/protocol/src/errors.ts:112-122`), but visitor/theme JS and the route tests do not. **Wire parity is kept through the host's `onError` port, not by changing bodies.**
- Tovu already has the exact pattern for one feature: `apps/website/src/server/inbound/admin-http/routes/settings/shared.ts:157` `SettingsRequestError`, `:167` `rejectSettingsRequest`, `:209-229` `ports: { workspace, authenticate, authorize, onError }`, `:230` `mountJsonRoute({ app, spec, deps })`. Express ports type: Jini `packages/http-kit/src/types.ts:14-18`; mount: `packages/http-kit/src/adapter.ts:37`.

## J (Jini) — K4 seam split of that pattern's generic half
1. Tests first: `packages/core/src/contracts/server/__tests__/route-refusal.test.ts` — a refusal carries `status` and the exact `body`, is an `Error`, keeps `name`.
2. Move `SettingsRequestError` + `rejectSettingsRequest` (settings/shared.ts:157 and :167, verbatim bodies, why-comments kept) to `packages/core/src/contracts/server/route-refusal.ts`, renamed `RouteRefusalError` / `rejectRoute` (generic names; no other change). Export from `@jini-ai/core/contracts/server` (existing barrel) — universal.
3. `CONTENT_ENTRY_MAX_BODY_BYTES` (`apps/website/src/server/inbound/shared/body-size-limit.ts:26`) → `packages/cms/src/admin-http/limits.ts` (export `./admin-http/limits`); route specs set `maxBodyBytes` from it instead of calling `rejectOversizedJsonBody`.
4. api-baseline delta for core + cms; changeset `p9k-rt-k1-0`.
Mutation: make `rejectRoute` drop `code` from the body → the new test goes red.

## T (Tovu) — the host ports (composition, stays in Tovu)
1. New `apps/website/src/server/inbound/admin-http/admin-json-route-ports.ts` exporting `adminJsonRoutePorts` (http-kit `JsonRoutePorts<{ workspaceId: string; authorize: RouteDeps["authorize"] }, OperatorPrincipalRecord>`), built ONLY from existing helpers, each kept where it is:
   - `workspace`: the `rejectForeignWorkspace` rule (`shared/route-guards.ts:30`) expressed on `raw.params` — throws `rejectRoute({ status: 404, error: "workspace was not found" })`.
   - `authenticate`: `getAuthedPrincipal(res)` (`admin-http/dev-auth.ts:313`).
   - `authorize`: the `authorizeOrRespond` decision (`admin-http/authorize-guard.ts:49`), throwing the same 403 body it writes today.
   - `onError`: `RouteRefusalError` → `res.status(e.status).json(e.body)`; anything else → `sendAdminFailure` (`shared/admin-failure.ts:123`) exactly as the hand-written routes call it today (product copy + redaction stay host-side).
   - `publicJsonRoutePorts` beside it for public routes: no authenticate/authorize; `onError` → `reportServerFailure` (`shared/admin-failure.ts:54`) with the visitor-safe body the public routes write today.
2. Repoint settings/shared.ts to `RouteRefusalError`/`rejectRoute` from core and its `ports` to `adminJsonRoutePorts` + its two settings-only checks (keep them in its `handle`). Delete the local class.
3. Gates: every settings route test green unchanged (`apps/website/src/server/inbound/admin-http/routes/settings/__tests__/*`, `server/__tests__/routes/settings-*.test.ts`).

STOP: if a port needs a field beyond `workspaceId`/`authorize`/the principal, stop and report (no new port).
