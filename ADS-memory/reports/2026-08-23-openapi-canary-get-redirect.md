# OpenAPI Canary — GET_REDIRECT (SPEC-009)

Agent role: Docs Agent (`AI-Dev-Shop/agents/docs/skills.md`), `api-contracts` skill loaded.
Scope: ONE route, documentation-only, no production code touched, no dependency added.

## Route picked, and why

`GET /api/admin/v1/workspaces/:workspaceId/redirects/:id` (`GET_REDIRECT`, SPEC-009 Redirects).

Picked because it is the simplest fully-CRUD-adjacent read in the 16 documented feature
surfaces: no request body, only two path params, a single response schema, and the smallest
error surface of any Redirects endpoint (no batch semantics like `IMPORT_REDIRECTS`'s `207`
multi-status, no write-validation branches like `CREATE_REDIRECT`/`UPDATE_REDIRECT`). It
isolates exactly the three things every other admin route also needs (path-param handling,
session auth, one permission check, one repo lookup) without extra surface area — a good
first canary because whatever the pattern turns out to be, most of the other 90+ admin
routes will look structurally identical to this one.

## What I read to verify it (not just api.spec.md)

- `ADS-memory/specs/009-redirects/api.spec.md` — the doc under test (Sections 1, 2, 4, 5, 6).
- `ADS-memory/specs/009-redirects/errors.spec.md` — canonical `REDIRECT_NOT_FOUND` definition.
- `src/server/routes/admin/redirects/get-by-id.ts` — the real route handler (full file, 42 lines).
- `src/server/http/admin/redirects.ts` — `toAdminRedirectResponse`/`AdminRedirectDto` (the actual
  response serialization, i.e. exactly what JSON shape a caller receives).
- `src/redirects/types.ts` — `RedirectRecord` (the real field set/types behind the DTO).
- `src/redirects/ports.ts` — `RedirectRepoPort.findById` signature.
- `src/server/middleware/dev-auth.ts` — `requireAdminSession`, `getAuthedPrincipal`,
  `currentPrincipal`, session cookie mechanics (`tovu_session`, HttpOnly/SameSite=Strict/Secure).
- `src/server/modules/core.ts` (via grep) — confirmed `app.use("/api/admin", requireAdminSession(deps))`
  is the actual global gate every admin route (including this one) sits behind.
- `src/server/modules/redirects.ts` — confirms `registerAdminRedirectGetRoute` is wired with no
  extra middleware beyond the shared admin session gate.
- `src/server/__tests__/routes/redirects-auth.test.ts` — confirms the 403 FORBIDDEN behavior is
  actually test-covered for this route (`admin.redirects.manage` denial).
- `src/server/__tests__/routes/core-module-auth-ordering.test.ts` (grepped) — confirms 401
  UNAUTHENTICATED is genuinely test-covered for the shared `/api/admin` gate.

Comparison method: read the doc's claim for each field/status/auth requirement, then read the
line of code that actually produces that behavior, side by side. Where I could not find code
producing a documented behavior (or found code producing a behavior the doc doesn't mention),
I recorded it below as drift rather than silently preferring one source.

## Fragment

`ADS-memory/reports/2026-08-23-openapi-canary-get-redirect.yaml` — a complete, self-contained,
syntactically valid OpenAPI 3.0.3 document (single path/operation, verified with Python's
`yaml.safe_load` plus a manual `$ref` resolution check — all three refs resolve; no new
dependency installed for this, see "Tooling" below).

## Drift found between `api.spec.md` and real code

Two real mismatches, both minor, neither breaking:

1. **401 UNAUTHENTICATED is real but wholly undocumented.** `api.spec.md` Section 6's
   error-mapping table lists only `403 FORBIDDEN` and `404 REDIRECT_NOT_FOUND` for
   `GET_REDIRECT` (and, checking the rest of the table, no endpoint in this file lists a 401 at
   all). But every `/api/admin/*` route — this one included — sits behind
   `requireAdminSession`, which returns `401 { error: "unauthenticated", code: "UNAUTHENTICATED" }`
   before the route body ever runs (verified in `dev-auth.ts` and independently exercised by
   `core-module-auth-ordering.test.ts`). Section 2 of the spec does say `Auth Required: true`
   for the `ADMIN_SESSION` profile, so the *requirement* is documented — but the concrete 401
   status/body an integrator should expect is not itemized anywhere in this feature's own
   contract file. The `api-contracts` skill's own checklist ("Response schemas for each status
   code: 200/201, 400, 401, 403, 404, 409, 422, 429, 500 minimum") calls out 401 as expected
   baseline coverage, which this file's error table doesn't meet, generically, for any
   endpoint in the registry. This is a real gap, not implementation drift caused by a recent
   code change — it looks like the shared-middleware auth layer was simply never itemized
   per-endpoint when this file was written.

2. **The 404 path has two shapes; only one matches the documented contract.** Reading
   `get-by-id.ts` line by line: there are two independent `res.status(404)` branches.
   - `id` not found in the repo → `{ error: "redirect '<id>' was not found", code:
     "REDIRECT_NOT_FOUND" }`. This matches `api.spec.md` and `errors.spec.md` exactly.
   - `workspaceId` path param doesn't match the server's bound `deps.workspaceId` → `{ error:
     "workspace was not found" }`, **with no `code` field at all**. This branch runs *before*
     auth/permission checks, isn't mentioned anywhere in `api.spec.md`, and breaks the
     otherwise-consistent pattern (every other error response on this route — 403, the other
     404, 500 — includes a `code` field; this one doesn't). Whether this is a deliberate
     "this deployment is single-workspace, so this is really a can't-happen guard" shortcut, or
     an oversight, I can't tell from the code alone — it reads as unintentional (a stray
     early-return in the middle of an otherwise-uniform error-shape convention).

No other mismatch found. Path, method, request contract (`workspaceId`/`id` path params only,
no body), response body shape (`{ data: RedirectRule }`), and every documented field on
`RedirectRule` all matched the real DTO/type exactly, field-for-field.

One non-drift note worth flagging in the fragment itself: `api.spec.md` types both path params
as `format: uuid`, but `src/redirects/types.ts`'s own doc comment says the `id` is a ULID
("stable identity"), and the route performs zero format validation on either param (just
`String(req.params.x ?? "")`) — so `format: uuid` is a shape hint, not an enforced constraint,
and a malformed/non-UUID string doesn't 400, it just 404s like any other non-matching id. This
isn't a doc/code disagreement (the doc never promised a 400 for malformed IDs either), just a
precision gap worth carrying into the OpenAPI fragment's parameter descriptions, which I did.

## Tooling / dependency decision

Checked before writing anything:
- Jini (`/Users/la/Programming/Jini`, read-only) — no `openapi`/`swagger` hits anywhere in its
  packages (grepped source trees and every `package.json`). Jini has no existing OpenAPI or
  schema-generation tooling to reuse.
- Tovu itself — no `openapi`/`swagger` dependency in `package.json`, and no `zod` (or
  equivalent schema library) driving request validation anywhere near this route; the route
  validates by hand (`String(req.params.id ?? "")`, no schema object at all). There is no
  code-first schema this canary could have been generated *from* even if a generator existed —
  the "schema" is the hand-written prose in `api.spec.md` plus ad hoc coercions in the handler.
- No new dependency was added. The fragment is hand-authored YAML. Validation used Python's
  already-present `yaml` module (stdlib-adjacent, already on this machine, not installed for
  this task) for a syntax + `$ref`-resolution check — not a full OpenAPI schema validator
  (e.g. `@redocly/cli`, `openapi-spec-validator`), which I deliberately did not install: one
  canary route doesn't justify a new dependency, and the task explicitly says a hand-authored
  fragment is an acceptable, arguably better outcome here.

## Recommendation: scaling this to the rest of the API surface

- **Don't hand-author all ~90+ admin routes this way.** This route took a full read of 8 files
  to verify with confidence; at that rate, doing all 16 `api.spec.md` files by hand is a large,
  error-prone effort, and — per the 2026-07-28 audit's own framing — the docs can drift the
  moment code changes without a mechanical check pulling them back into alignment.
- **If this scales, it should be code-first, not spec-first.** The actual validation in these
  routes is hand-written (`String(req.params.x ?? "")`, manual `if` chains), not a schema
  object — so there is nothing today to mechanically introspect into OpenAPI. The realistic
  path to automation is: (a) introduce a schema-validation layer at the route boundary (zod or
  similar) as routes get touched anyway, and (b) generate OpenAPI from *that* schema, with
  `api.spec.md` demoted to prose commentary/rationale rather than the source of truth for
  shapes. That is a design change to how routes validate input, well outside a docs-only
  canary — flagging it, not doing it.
- **A cheaper, immediately actionable middle step**: a drift-detection script (not a generator)
  that, for each of the 16 `api.spec.md` files, great-greps the documented endpoint registry
  against `src/server/routes/admin/**` route registrations and flags endpoints present in one
  but not the other. That catches the "doc says X, code doesn't" class of drift (like finding
  #1 above) far more cheaply than full OpenAPI generation, and doesn't require picking a schema
  library yet.
- Given the actual motivation (Tovu-Runner needs a structured way to call each forked
  instance's HTTP API), the highest-value next slice is probably **not** more OpenAPI coverage
  breadth but confirming Tovu-Runner's actual call pattern needs (which routes, how often,
  what shape) before investing further — this canary proves the mechanism works, it doesn't
  yet prove the 16-file corpus is the right scope to cover.

## Jini-vs-Tovu ownership answer

**The generation mechanism, if and when one gets built, belongs in Jini — not Tovu — but there
is currently no generation mechanism to relocate.** This canary is 100% hand-authored YAML; no
code was written that generates OpenAPI from anything, so there's nothing to move today.
Reasoning for *if it existed*: "read a route-validation schema and emit an OpenAPI fragment" is
generic infrastructure with zero Tovu-specific business logic in it (same shape of tool Jini
already houses other cross-repo capability as `@jini-ai/*` packages, per the portfolio-ownership
rule) — any other Jini-based product with an HTTP admin surface would want the same generator.
What must stay in Tovu is the *content*: the 16 `api.spec.md` files, the actual route
inventory, and this route's specific request/response shapes are legitimately Tovu's own
domain knowledge, not something Jini should own or house. So the concrete recommendation for
later: if this scales past "one canary," build the schema-to-OpenAPI generator as a small
`@jini-ai/*` package (consuming whatever schema library the routes adopt), and keep every
`*.spec.md`/generated `openapi.yaml` file itself in Tovu, generated by calling into that Jini
package rather than by a bespoke Tovu-only generator script.
