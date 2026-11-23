DONE

# rv-b FIX — ex5-fnd-routes + ex5-posts (resume after weekly-limit stop)

Source: Tovu `origin/plan/whats-left-1122:reviews/rv-b-posts-fndroutes.md`. Run 2026-11-23.
Every FIX item was already committed by the interrupted run (commits after 2026-11-23T07:30Z),
so this resume SKIPPED re-applying them. It independently re-verified them, re-ran the mutations, and
added the `## Wiring` sections the rules require where the earlier run had left them out.

## Items

### ex5-fnd-routes (done first)

| # | item | status | commits |
|---|------|--------|---------|
| 1 | redirect `entityId` reaches the authorizer | fixed (prior run, re-verified) | Jini `712aa20b` (core `JsonRouteAuthorizeScope`, core `makeAuthorize` + http-kit `routeAuthorize` forward the scope, cms get/hits/update/tombstone pass `input.id`, list/import id-free, `.changeset/p9k-ex5-redirect-entity-id.md`, api-baseline); Tovu `40a9ad698` (`admin-json-route-ports.ts` maps scope → `deps.authorize({ …, entityId })`, mounted test `routes/redirects/__tests__/authorize-entity-id.test.ts` drives all six real registrars) |
| 2 | recovery tests on the production injection seam | fixed (prior run, re-verified) | Jini `8b5baf62` (deep-link/disclosure/restore-points tests use typed fakes via route deps; zero `@jini-ai/db` imports left under `cms/src/admin-http/routes/recovery`); Tovu `e522cdd00` (mounted recovery tests assert forwarded inputs + exact wire bodies) |
| 3 | CMS move changeset `minor` → `patch` | fixed (prior run, re-verified) | Jini `a056bfa3` |
| — | `## Wiring` sections | prior: Jini `3af237a6` (http-kit README), Tovu `eb5cf36f7` (server/__tests__/routes README); **this run:** Jini `cbd14e0c` (cms + core README), Tovu `65cf618ef` (apps/website/src/server/INFO.md) |

### ex5-posts

| # | item | status | commits |
|---|------|--------|---------|
| 1 | `jini-field-label` on moved labels + host CSS | fixed (prior run, re-verified) | Jini `6cf2cf1a` (PostAuthorFields ×2, PostPublishingFields, test `post-fields.test.tsx`, changeset); Tovu `b7a94ceb1` (`styles.css` shared face extended to `.jini-post-publishing__field > .jini-field-label`, post-specific selectors in `styles.css`/`styles/editor.css` moved to the jini class, test `post-field-label-css.unit.test.ts`) |
| — | `## Wiring` sections | **this run:** Jini `7192070b` (packages/admin README), Tovu `cffdfb293` (apps/admin/INFO.md) |

Duplication check: neither Jini `codex/ex2-holds-jini`, `codex/sec4-jini`, `codex/ex3-c0b-jini` nor Tovu
`codex/ex2-tovu-halves`, `codex/ex2-holds-tovu` contains the authorize scope or the post label class, so
nothing here replaces an approved version. Merge note: those Jini branches also edit
`core/src/contracts/server/json-route.ts` (`defineJsonRoute` optional args / `maxBodyBytes`). On merge, keep
their version and add `JsonRouteAuthorizeScope` plus the scope forwarding in `makeAuthorize`.
The legacy 413 body `{ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" }` is untouched.

## Verification (this run, on the pushed heads)

Jini `codex/ex5-fnd-routes-jini` @ `3af237a6` (+ docs-only `cbd14e0c`):
- `pnpm install --frozen-lockfile` ok; `pnpm -r build` exit 0; `pnpm typecheck` exit 0; `pnpm guard` exit 0 ("zero violations").
- vitest: core `json-route.test.ts` 19/19; http-kit `src/__tests__` 31 files 592/592; cms `routes/redirects` + `routes/recovery` 10 files 39/39.
- eslint complexity ≤ 10 (complexity + sonarjs cognitive) and function length ≤ 80 on json-route.ts, adapter.ts, redirects/*.ts: clean.

Jini `codex/ex5-posts-jini` @ `6cf2cf1a` (+ docs-only `7192070b`):
- frozen install ok; `pnpm --filter "...@jini-ai/admin..." build` exit 0; `pnpm typecheck` exit 0; `pnpm guard` exit 0.
- vitest admin `src/posts` 3/3. eslint complexity/length clean on both components.

Tovu (`npm ci` root + apps/admin, `packages/{contracts,sdk}` built, `link-jini.mjs` → local Jini at the matching branch):
- posts @ `b7a94ceb1`: website `tsc -p tsconfig.json` exit 0 (0 errors). admin `tsc` exit 2 with **4 pre-existing errors**
  (`AdminKit` `values`/`Icon`/`useT` host-assignment gap in `integrations/jini-kits.ts`, `main.tsx`, `__tests__/render-with-jini-kits.tsx`).
  These are the same 4 errors the lane recorded in `ex5-fnd-routes-raw/tovu-final-admin-tsc.txt` and the "base AdminKit
  host-assignment gap" the review notes. They are not caused by these FIX items.
  vitest `post-field-label-css.unit.test.ts` 3/3 (`--maxWorkers=2`).
- fnd-routes @ `eb5cf36f7`: website tsc exit 0; admin tsc the same 4 pre-existing errors.
  Website tests run under node:test (the repo's runner for `apps/website`, not vitest): `recovery-routes.test.ts`,
  `authorize-entity-id.test.ts`, `admin-json-route-ports.test.ts` → 33/33 pass (the last one covers the exact 413 cap, one byte over, and the short-circuit).

## Mutations (re-run by this run: red, then restored and green)

- Jini cms `redirects/shared.ts`: always `authorize(required)` → 4 red (get-by-id, hits, tombstone, update).
- Jini http-kit `adapter.ts` `routeAuthorize`: drop scope → 1 red (adapter-ports "forwards a by-id route's entity id").
- Jini core `json-route.ts` `makeAuthorize`: drop scope → 1 red (json-route "forwards a by-id route's entity id").
- Jini cms `recovery/deep-link.ts`: forward `envelope: {}` instead of the request envelope → 1 red (deep-link test).
- Tovu `admin-json-route-ports.ts`: `entity = { entityType }` → 1 red (`authorize-entity-id.test.ts`).
- Jini admin `PostPublishingFields.tsx`: back to `field-label` → 1 red (post-fields test).
- Tovu `styles.css` L171: post label selector back to `.field-label` → 2 red (face/margin and stale-selector tests).
All restored (`git checkout`), suites green again.

## FILES MOVED

None this run. The prior run's commits were edits in place plus new test files:
Jini `packages/core/src/contracts/server/__tests__/json-route.test.ts` (cases added), `packages/http-kit/src/__tests__/adapter-ports.test.ts` (case added),
`packages/admin/src/posts/__tests__/post-fields.test.tsx` (new); Tovu
`apps/website/src/server/inbound/admin-http/routes/redirects/__tests__/authorize-entity-id.test.ts` (new),
`apps/admin/src/__tests__/unit/post-field-label-css.unit.test.ts` (new).

## Open (not FIX items)

- Tovu admin tsc: the 4 pre-existing `AdminKit` host-assignment errors above. They come from the base and belong to a separate lane.
- The review's NOT-CHECKED gaps (exhaustive old-specifier zero-importer search) were not in scope for this FIX run.
- Merge order per the review: each Jini half before its Tovu half. The shared Tovu files `doc-nodes.ts`, `social-entries.ts`
  and `development/why-comments-debt.json` need the union resolution the review describes.

## Pushed heads

- Jini `codex/ex5-fnd-routes-jini` → `cbd14e0c`
- Jini `codex/ex5-posts-jini` → `7192070b`
- Tovu `codex/ex5-posts-tovu` → `cffdfb293`
- Tovu `codex/ex5-fnd-routes-tovu` → this report commit (on top of `65cf618ef`)
