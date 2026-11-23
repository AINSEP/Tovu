# K1 route template — converting a Tovu admin route family to Jini `defineJsonRoute` specs

Pilot: **Menus** (all 6 routes), Jini `codex/k1-pilot-jini`, Tovu `codex/k1-pilot-tovu`, 2026-11-23.
Recipe authority: `plan/whats-left-1122:plans/P9K-extraction.md` §2 K1. Step sheets: `plans/P9-steps/RT-K1-*`.
This file is the copyable pattern. When it and a step sheet disagree on a detail, the sheet names
the files and this file names the shape. Where this file departs from the sheet, it says so and
says why (see "Departures from the generated sheets").

Reference implementation (read these before converting anything):

| side | file | role |
|---|---|---|
| Jini | `packages/cms/src/admin-http/routes/menus/get-by-id.ts` | the pilot spec (smallest complete example) |
| Jini | `packages/cms/src/admin-http/routes/menus/shared.ts` | per-family guards: authorize, error ladder, actor id, path param |
| Jini | `packages/cms/src/admin-http/routes/menus/{create,update-tree}.ts` | body refusal in `parse`, injected host policy |
| Jini | `packages/cms/src/admin-http/routes/menus/delete.ts` | an injected host collaborator (`trashMenu`) |
| Jini | `packages/cms/src/admin-http/http/menus.ts` | DTO helper moved verbatim (no host types) |
| Jini | `packages/cms/src/admin-http/routes/menus/__tests__/*` | spec unit tests (written first) |
| Tovu | `apps/website/src/server/runtime/composition/modules/menus.ts` | registrars: build small deps, mount |
| Tovu | `apps/website/src/server/inbound/admin-http/admin-json-route-ports.ts` | host ports (workspace 404, principal, 403, 500) |

## 1. Before → after

### Before (Tovu, hand-written Express route)

```ts
// apps/website/src/server/inbound/admin-http/routes/menus/get-by-id.ts  (DELETED)
export const registerAdminMenuGetRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  app.get("/api/admin/v1/workspaces/:workspaceId/menus/:menuId", async (req, res) => {
    if (rejectForeignWorkspace({ req, res, workspaceId: deps.workspaceId })) return;      // → workspace port
    const menuId = String(req.params.menuId ?? "");                                           // → parse
    try {
      const principal = getAuthedPrincipal(res);                                              // → authenticate port
      const params = { principalId: principal.id, permission: "admin.menus.read",
        workspaceId: deps.workspaceId, entityType: "menu", entityId: menuId };
      if (!(await authorizeDirectOrRespond({ res, authorize: deps.authorize, params }))) return; // → authorize port ("direct")
      const bySlug = await deps.menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug: menuId.trim().toLowerCase() });
      const menu = bySlug ?? (await deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: menuId }));
      if (!menu) { res.status(404).json({ error: `menu '${menuId}' was not found` }); return; } // → rejectRoute
      res.json(toAdminMenuResponse(menu));                                                    // → ok({ value })
    } catch (error) {
      sendAdminFailure({ res, error }, { operation: "routes/menus/get-by-id", code: "INTERNAL_ERROR" }); // → onError port (failure options)
    }
  });
};
```

### After (Jini, server-neutral spec)

```ts
// packages/cms/src/admin-http/routes/menus/get-by-id.ts
import { defineJsonRoute, ok } from "@jini-ai/core/contracts/server";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import type { MenuRepoPort } from "../../../navigation/index.js";
import { toAdminMenuResponse, type AdminMenuEnvelope } from "../../http/menus.js";
import { authorizeMenus, menuIdParam, type MenuRoutePrincipal } from "./shared.js";

/** The deps this route reads: the workspace it serves and the two menu lookups. */
export interface MenuGetRouteDeps {
  workspaceId: string;
  menuRepo: Pick<MenuRepoPort, "findBySlug" | "findById">;
}

export const menuGetRoute = defineJsonRoute<{ menuId: string }, AdminMenuEnvelope, MenuGetRouteDeps, MenuRoutePrincipal>({
  method: "get",
  path: "/api/admin/v1/workspaces/:workspaceId/menus/:menuId",
  parse: (raw) => ok({ value: { menuId: menuIdParam(raw.params) } }),
  handle: async ({ input, deps, authorize }) => {
    await authorizeMenus({ authorize, permission: "admin.menus.read" }, { entityId: input.menuId });
    const bySlug = await deps.menuRepo.findBySlug({ workspaceId: deps.workspaceId, slug: input.menuId.trim().toLowerCase() });
    const menu = bySlug ?? (await deps.menuRepo.findById({ workspaceId: deps.workspaceId, id: input.menuId }));
    if (!menu) rejectRoute({ status: 404, error: `menu '${input.menuId}' was not found` });
    return ok({ value: toAdminMenuResponse(menu) });
  },
});
```

### After (Tovu, the registrar keeps its name and mounts the spec)

```ts
// apps/website/src/server/runtime/composition/modules/menus.ts
export const registerAdminMenuGetRoute: MenuRouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: menuGetRoute, deps: { ...menuPortDeps({ deps }), menuRepo: deps.menuRepo } },
    mountOptions("routes/menus/get-by-id", "direct"),
  );
};
```

### Translation table (every hand-written idiom has exactly one replacement)

| hand-written | spec / host |
|---|---|
| `rejectForeignWorkspace(...)` | gone — the host `workspace` port (404 `workspace was not found`), automatic for paths containing `:workspaceId` |
| `getAuthedPrincipal(res)` | gone — the host `authenticate` port; the spec reads `context?.id` only when it needs an actor (`menuActorId`) |
| `authorizeOrRespond(...)` | `await authorize({ permission, entityType }, { entityId })` + mount `"guarded"` |
| `authorizeDirectOrRespond(...)` | same call + mount `"direct"` (never switch a route between the two in a move) |
| by-id route `entityId: id` | pass `{ entityId }` scope; id-free routes (list, create, import) pass no scope |
| `res.status(400).json({ error })` before auth | `rejectRoute({ status: 400, error })` **inside `parse`** (keeps the 400-before-auth order) |
| `res.status(4xx).json({ error[, code] })` in `try` | `rejectRoute({ status, error[, code] })`, or a per-family mapping table (`rejectMenuError`) |
| `instanceof` ladder in `catch` | ordered mapping list per route, subclass before superclass (`MENU_VERSION_CONFLICT` before `MENU_CONFLICT`); unmapped → rethrow |
| `sendAdminFailure(..., { operation, code })` | rethrow; mount with `failure: { operation, code }` — the **same operation string**, it picks the user-facing 500 copy |
| `res.status(201).json(x)` | `defineJsonRoute(spec, { successStatus: 201 })` + `ok({ value: x })` |
| `res.json(x)` | `ok({ value: x })` |
| `deps.<anything>` | a field on `<Name>RouteDeps` (only what the route reads) |
| host constant / product policy (`MENU_RAW_HTML_PERMISSION`) | a deps field (`rawHtmlPermission: string`), value bound by the registrar |
| Node-only helper (parse5 normalizer) | a deps field (`normalizeMenuHtml`), bound by the registrar from the `/node` entry |
| host-local service (`trashMenu`) | a deps field typed as a function (`MenuTrashFn`), bound by the registrar |
| a body cap (`express.json({ limit })` per route) | `defineJsonRoute(spec, { maxBodyBytes })` — only when the route had one (see §4.4) |

## 2. The deps-type shape

```ts
/** The deps this route reads. */
export interface <Name>RouteDeps extends Pick<<ServiceDeps>, "clock" | "idGen" | "outbox"> { // Pick from the Jini service's own deps type
  workspaceId: string;
  <repo>: Pick<<RepoPort>, "<only>" | "<methods>">;  // Pick the methods it calls; never the whole port unless the service needs it
  <hostPolicy>: <primitive>;                         // product policy the host owns (a permission name, a copy string — K3)
  <hostCollaborator>: <FnType>;                      // host-local service, as a function type declared next to the route
}
```

Rules:
- One type per route, next to the route, named `<Name>RouteDeps`. **Never `RouteDeps`**, never a shared family bag.
- Types come from Jini (`@jini-ai/cms/<domain>` ports, `@jini-ai/core` contracts). Tovu-specific types
  go to `@tovu/contracts`; nothing in the spec imports Tovu.
- Every injected field is **required** (no `?`). A Jini service that has an optional dep
  (`normalizeMenuHtml?`) becomes a required route dep: the host decides, explicitly.
- `workspaceId` + `authorize` are the two port fields; the spec reads `workspaceId` itself, `authorize`
  only reaches it through the `authorize` handle argument (`AdminJsonRoutePortDeps` adds it at mount).
- Function shape everywhere: `fn(required, _optional = {})`; ≤ 80 lines; complexity ≤ 10. A long
  `catch` ladder becomes a mapping table, not a longer function.

## 3. How the host mounts it

```ts
// modules/<family>.ts  — RouteDeps is read ONLY here, at registration
export interface <Family>RouteDeps extends RouteDeps {}            // keep the old name if fixtures import it
function <family>PortDeps({ deps }: { deps: <Family>RouteDeps }, _o: Record<string, never> = {}): AdminJsonRoutePortDeps {
  // `authorize` read per request so a later reassignment of deps.authorize is honoured (tests rely on it)
  return { workspaceId: deps.workspaceId, authorize: (params) => deps.authorize(params) };
}
export const registerAdmin<X>Route: <Family>RouteRegistrar = ({ app, deps }, _options = {}) => {
  mountAdminJsonRoute(
    { app, spec: <x>Route, deps: { ...<family>PortDeps({ deps }), <field>: deps.<field>, <policy>: <TOVU_CONSTANT> } },
    { authorization: "direct" | "guarded", failure: { operation: "routes/<family>/<file>", code: "INTERNAL_ERROR" } },
  );
};
```

- Keep every `registerAdmin…Route` export name and the module's registration order: the route-table
  pin (`create-app-route-table.pin.test.ts`) must not change (mounted handlers are `<anonymous>`, as before).
- Public routes use `mountPublicJsonRoute({ app, spec, deps, failure: { operation, visitorError } })`.
- Non-JSON routes (streams, uploads, HTML, SSE, static, redirects-as-302) do **not** use this template:
  they are core `ServerRoute` factories mounted through `@jini-ai/http-kit/node-bridge` `createNodeDispatcher`.
- Host ports (`admin-json-route-ports.ts`) are shared composition: a family conversion never edits them.
  If a family needs a port change, stop and raise it — the pilot needed one (§6.2), now done for all.

## 4. Tests every converted route must have

### 4.1 Jini spec unit test (written FIRST, committed RED, then the spec)
File: `packages/<pkg>/src/admin-http/routes/<family>/__tests__/<route>.test.ts`, fakes in `__tests__/helpers.ts`.

| # | what | how (menus example) |
|---|---|---|
| 1 | method + path + success status + `maxBodyBytes` pinned | `expect(route.method/path/successStatus/maxBodyBytes)` |
| 2 | `parse` happy path and every fallback (`?? ""`, defaults, string-only fields) | `route.parse(raw(params, body))` toEqual `{ ok: true, value }` |
| 3 | every `parse` refusal: **status + exact flat body** (no `code` if the host sent none) | `refusalOf(() => route.parse(...))` toEqual `{ status: 400, body: { error } }` |
| 4 | auth: exact permission, entity type, `entityId` present on by-id / **absent** on id-free | recording `authorize` → `calls` toEqual `[{ permission, entityType, entityId }]` |
| 5 | auth refusal stops all side effects (no repo read / write) | denying `authorize` → rejects; counter stays 0 |
| 6 | every mapped domain error → exact `{ status, body }`, in ladder order (subclass first) | table-driven over the error classes |
| 7 | unmapped error rethrown unchanged (the host 500) | `rejects.toThrow(<same message>)` |
| 8 | injected host policy/collaborator is the one used (not a default) | e.g. normalizer appends a marker → response carries it |
| 9 | fails closed without authorizer / principal (wiring bug) | `rejects.toThrow(/no authorizer|no authenticated principal/)` |
| 10 | happy path through the real Jini service over in-memory repos | `makeWriteDeps()` (real `InMemory*Repo`) |

### 4.2 Tovu wire tests (the parity proof) — **unchanged except import lines**
- Every existing route test stays in Tovu. Repoint `../<route>.js` → `#src/server/runtime/composition/modules/<family>`
  and `http/<family>` → `@jini-ai/<pkg>/admin-http/http/<family>`. Change nothing else. A body/status
  mismatch means **fix the spec (or raise a port change), never the test**.
- A test of a Tovu helper that moved into the spec (e.g. `authorizeMenuHtmlOrRespond`) is replaced by a
  wire test of the same rule through the registrar — never just deleted. State it in the report.
- Each family must keep (or gain) at the wire: workspace-mismatch 404, 403 body with `details`, the
  `failure` matrix (`testRouteFailureMatrix` — the per-operation 500 copy), each 4xx body, and the
  `?? ""` param fallback via `invokeRouteDirectly`.

### 4.3 Route-table pin
Run `create-app-route-table.pin.test.ts`. Expected: no diff caused by the family. On today's base the
pin is already red for `/internal/*` rows (base-merge drift, not K1); compare the failure diff
**base vs. your branch** — it must be identical (pilot: 5,696 diff lines, identical).

### 4.4 `maxBodyBytes`
- Declare it only if the hand-written route had its own cap (e.g. content entries:
  `CONTENT_ENTRY_MAX_BODY_BYTES`). Menus had none, so `maxBodyBytes` is pinned `undefined`.
- When declared: a Jini test pins the value; a Tovu wire test sends `cap + 1` bytes and asserts 413 with
  the **same body the hand-written route sent**. http-kit's `allowRouteBody` answers core's
  `PAYLOAD_TOO_LARGE` envelope; if Tovu's legacy 413 body differs, keep the host's body-size middleware
  binding for that path (one cap binding, per `reviews/rv1123a.md` MERGE-ORDER) and stop to raise it.
  GET/HEAD are exempt.

## 5. The mutation to run (named; record both REDs)

Mutate the **Jini spec source**, rebuild the package (Tovu imports the linked `dist/`), run both sides, restore
by byte copy and `cmp`:

1. **M1 (parse refusal):** make `parse` accept the malformed field (menus: `if (false && …) rejectRoute(…)`
   in `create.ts`). Must go RED: the Jini parse-refusal tests **and** the Tovu wire 400 tests.
2. **M2 (the route's own rule):** remove one behavior the route owns (menus: drop `.trim().toLowerCase()`
   from get-by-id's slug lookup). Must go RED on both sides.

Pilot result: M1 → Jini 3 RED, Tovu 3 RED (`menu create: rejects malformed items …`); M2 → Jini 1 RED,
Tovu 1 RED (`menu get: … missing slug falls back to the unnormalized id`). Restored, `cmp` clean, 46/46 green.

## 6. Pilot findings every family inherits

1. **Body refusals live in `parse` and throw `rejectRoute`.** A returned `err(...)` gains a `code` the
   host never sent; a thrown refusal keeps the flat body. (Precedent: `redirects/import.ts`.)
2. **Authenticate before parse.** `mountJsonRoute` runs workspace → authenticate → parse → handle. The
   hand-written write routes validated the body before reading the session, and two menus wire tests
   pinned that (no-session + bad body ⇒ 400). Fixed once for every family: http-kit's `authenticate`
   may return `undefined`; Tovu's port defers the missing session to `authorize`, which fails closed with
   `getAuthedPrincipal`'s message and the same redacted 500.
3. **`"direct"` vs `"guarded"` is per mount, not per check.** Menus update-tree asked the menu permission
   `direct` and the raw-HTML permission `guarded` (`authorizeOrRespond`). One mount mode now covers both,
   so update-tree's HTML check is RBAC-only. This differs only for a publishing credential whose RBAC
   allows `admin.menus.update` but whose grant differs on raw HTML. No test pinned it; recorded, not
   silently changed. A family with mixed modes per route: list each one in the report.
4. **Keep the operation string.** `failure.operation` selects the user-facing 500 copy (`"The menus could
   not be loaded."`). Copy it verbatim from the old `sendAdminFailure` call.
5. **Read `deps.authorize` lazily** in the port deps (`(p) => deps.authorize(p)`), because tests reassign it.

## 7. Builder checklist (copy into the step report, one per family)

```
Family: <family>   Step(s): RT-K1-adm-<family>-N   Jini pkg: @jini-ai/<pkg>
[ ] Base: Jini + Tovu branches named in the dispatch; Jini built; `link-jini.mjs` run; packages/sdk built
[ ] Green baseline recorded on the unmodified tree (family tests + route-table pin diff saved)
[ ] Read every source + its http helper + every importer (rg the old paths, incl. comments)
[ ] Jini tests FIRST (§4.1 rows 1-10 that apply), committed RED and pushed
[ ] Spec per route: defineJsonRoute, own <Name>RouteDeps (Pick'd), no RouteDeps, no Tovu import,
    no express/node:/kysely in a "universal" entry, fn <= 80 lines, complexity <= 10, _optional pads
[ ] Per-family shared.ts: authorize<Family>, error mapping tables (subclass first), actor id, param reader
[ ] DTO helper moved verbatim to admin-http/http/<family>.ts (drop the host deps/registrar types)
[ ] Host policy, Node helpers and host services injected as REQUIRED deps; values bound in the registrar
[ ] package.json: exports triple + jini.entries (runtime) + jini.isolation.entries (domain); changeset (patch)
[ ] Jini: build, `pnpm guard`, `pnpm api:update` then `api:check`, `pnpm typecheck`, package vitest
[ ] Tovu: delete sources; modules/<family>.ts mounts with small deps; same registrar names + order;
    "direct"/"guarded" and failure.operation copied per route
[ ] Tovu tests: imports repointed only; moved-helper tests replaced by wire tests (named in report)
[ ] Tovu: `npm run typecheck`; family tests + redirects-auth + admin-json-route-ports tests; route-table pin diff == base
[ ] Mutations M1 + M2 RED on both sides, restored + cmp
[ ] `## Wiring` paragraph: Jini packages/<pkg>/README.md, Tovu apps/website/src/server/INFO.md
[ ] why-comments: every new non-obvious branch has a why-comment; union `development/why-comments-debt.json`
[ ] Commit every unit; `git pull --rebase` before every push; report every SHA
```

## 8. Remaining route families

Counts are Tovu non-test `.ts` files under `apps/website/src/server/inbound/<area>/routes/<family>/`
on `codex/k1-pilot-tovu`, the `app.<verb>(` registrations in them, and the `RT-K1` step sheets.
"Non-JSON" families need the `ServerRoute` variant for part of their routes (see §3).

### Already converted
| family | state |
|---|---|
| menus | **done (this pilot)**: 6/6 routes; 0 files left |
| redirects | 6/7 specs mounted; `create` still hand-written (2 files) — finish with this template |
| settings, system, sites, database, recovery, assistant | partially in Jini `cms/admin-http/routes/*` already (ex5-fnd-routes); remaining files below |

### Admin (`admin-http/routes/*`)
| family | files | regs | sheets | notes / depends on |
|---|---|---|---|---|
| system | 28 | 74 | 15 | cycle with settings + sites (one lane); SSE/daemon parts non-JSON |
| users | 21 | 20 | 9 | + `http/users.ts`; owner-mfa/passkey/recovery sheets (4) |
| newsletter | 20 | 19 | 7 | + `http/newsletter.ts` |
| assistant | 18 | 15 | 6 | imports `media`; streaming parts non-JSON |
| media | 17 | 12 | 4 | uploads non-JSON; imported by assistant + public site |
| publish-content | 16 | 26 | 6 | uses `http/plugin-hook-error`; transfer streams non-JSON |
| widgets | 15 | 17 | 4 | + `http/widgets.ts`; imports `http/site` |
| forms | 12 | 10 | 3 | + `http/forms.ts` |
| settings | 11 | 1 | 2 | mostly specs already; cycle with system |
| plugins | 10 | 12 | 5 | uses `http/plugin-hook-error` |
| agent-plugins | 9 | 11 | 5 | imports `public-http/oauth` |
| external-mcp | 9 | 14 | 5 | imports `public-http/external-mcp` |
| sites | 9 | 2 | 2 | cycle with system |
| taxonomy | 9 | 12 | 3 | |
| posts | 8 | 10 | 2 | + `http/posts.ts`; imports content, `http/site`, `public-http/site`, plugin-hook-error; 1 MiB cap |
| seo | 7 | 6 | 2 | imported by public site |
| members | 6 | 5 | 2 | + `http/members.ts` |
| integrations | 6 | 5 | 2 | + `http/integrations.ts` |
| pages | 6 | 6 | 2 | imports content + `http/posts` + plugin-hook-error; 1 MiB cap |
| workspace | 6 | 5 | 2 | + `http/workspace.ts` |
| comments | 5 | 5 | 2 | |
| content-types | 5 | 4 | 2 | imported by entries |
| trash | 5 | 4 | 1 | |
| api-keys | 4 | 3 | 2 | + `http/api-keys.ts` |
| entries | 4 | 4 | 1 | imports content-types |
| skills | 4 | 6 | 2 | |
| themes | 4 | 12 | 2 | mostly non-JSON (static/HTML); imports content + sites |
| change-sets | 3 | 3 | 1 | imports content |
| presentation | 3 | 3 | 1 | imports content + themes |
| fs-files | 2 | 5 | 1 | downloads non-JSON |
| recovery | 2 | 4 | 2 | imports database-recovery |
| analytics, commerce, consent, content, database, database-recovery, email-templates, site | 1 each | 0-7 | 1-2 each | content is a shared helper dir (no registrations) imported by 6 families |

### Public (`public-http/routes/*`)
| family | files | regs | sheets | notes |
|---|---|---|---|---|
| site | 44 | 23 | 11 + 16 render/sandbox sheets | mostly HTML (non-JSON); imports admin media + seo, pub members |
| members | 15 | 13 | 6 | imports pub site |
| commerce | 1 | 5 | 1 | imports pub members + site |
| agent-plugin-surfaces, external-mcp | 2 each | 1-2 | 1 each | external-mcp imports oauth |
| api-connections, content, oauth, ops, publish-trust | 1 each | 0-3 | 1 each | api-connections imports oauth |

Totals: **51 family dirs, 363 non-test files, 401 registrations left**; 173 `RT-K1` sheets on the plan branch.

### What can run in parallel (disjoint files)

Every lane also touches four **union-merge** files — not a reason to serialize, but each lane must
union, never overwrite: Jini `packages/cms/package.json` (exports, `jini.entries`, isolation entries)
and `api-baseline/jini-ai__cms.json` (regenerate with `pnpm api:update` after merging), Tovu
`development/why-comments-debt.json` and `apps/website/src/server/INFO.md` (`## Wiring`). Changesets are
one new file per lane.

Lanes, each internally sequential, all mutually disjoint:

| lane | families, in order | why together |
|---|---|---|
| L1 content | plugin-hook-error helper → content(-types) → entries, change-sets, email-templates → posts, pages → presentation → themes | shared `routes/content` + `http/plugin-hook-error` + `http/posts` importers |
| L2 system | settings → sites → system (15 sheets; split by sub-dir) | import cycle system ↔ settings ↔ sites |
| L3 public site | seo → media → public members → public commerce → public site (+ render sheets) → assistant | public site imports admin media/seo; assistant imports media |
| L4 oauth | public oauth → api-connections, public external-mcp → admin external-mcp → agent-plugins | oauth importers |
| L5 recovery | database-recovery → recovery → database | recovery imports database-recovery |
| L6 publish | (after L1's plugin-hook-error step) publish-content, plugins | both import plugin-hook-error only |

**Fully independent — any of these can run concurrently with each other and with L1–L6:**
users (+ owner-mfa/passkey/recovery), newsletter, widgets, forms, taxonomy, members (admin), integrations,
workspace, comments, trash, api-keys, skills, fs-files, analytics, commerce (admin), consent, site (admin),
redirects-create, agent-plugin-surfaces, ops, publish-trust, public content.

Respect the plan's batch caps (`P9K` §3): ≤ 6 implementers per batch and ≤ 2 Jini items per Jini package
per batch — almost every family lands in `@jini-ai/cms`, so the cms `package.json`/baseline union is the
real throughput limit, not file overlap.

## Departures from the generated sheets (and why)

- **Tovu test imports repoint to `modules/<family>`, not `@jini-ai/<pkg>/admin-http/routes/...`.** The sheets'
  rewrite lines point registrar imports at the Jini spec path, but the tests import `registerAdmin…Route`
  registrars, which stay in Tovu (composition). Same choice the redirects lane made.
- **`MenuRouteDeps`/`MenuRouteRegistrar` moved to `modules/menus.ts`** (the sheet deletes their old file,
  `http/menus.ts`). They describe the host's bag, so they stay host-side.
- **Two shared seams changed once for all families** (§6.2): http-kit `JsonRoutePorts.authenticate` may
  return `undefined` (Jini, with test + changeset); Tovu `admin-json-route-ports.ts` defers a missing
  session to `authorize`.
