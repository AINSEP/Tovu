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
| Jini | `packages/cms/src/admin-http/http/menus.ts` | serializers only, object arguments (no host types, no DTO declarations) |
| Jini | `packages/core/src/contracts/site/cms-menus.ts` | the wire DTO declarations, shared by the serializer and the admin client (§2.1) |
| Jini | `packages/cms/src/admin-http/routes/menus/__tests__/*` | spec unit tests (written first) |
| Tovu | `apps/website/src/server/runtime/composition/modules/menus.ts` | registrars: build small deps, mount |
| Tovu | `apps/website/src/server/inbound/admin-http/admin-json-route-ports.ts` | host ports (workspace 404, principal, 403, 500); mount options `authorizationByPermission`, `deferMissingPrincipal` |

> **Corrected by `reviews/rv1123e.md`** (Tovu `c20f88365`, Jini `c73309b4`). A family converted from the
> earlier text (Tovu `582db5967`) applies [the migration checklist](#migration-for-families-converted-before-582db5967).

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
    mountOptions({ operation: "routes/menus/get-by-id", authorization: "direct" }),
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
| **each** `authorize…OrRespond` call | **its own** `authorize` call in the spec — never merge two checks into one. Parity is per call: same permission, entity type, `entityId` presence and decision source as that hand-written call |
| two calls in one route with different modes | mount default = the first call's mode; `authorizationByPermission: { [<PERMISSION_CONSTANT>]: "<other mode>" }` for the other (menus update-tree: `direct` + raw-HTML `guarded`) |
| by-id route `entityId: id` | pass `{ entityId }` scope; id-free routes (list, create, import) pass no scope |
| conditional `...(id ? { entityId: id } : {})` | the same condition in the spec: `id ? { entityId: id } : {}` (an empty id sends **no** key) |
| `res.status(400).json({ error })` before auth | `rejectRoute({ status: 400, error })` **inside `parse`** + mount `deferMissingPrincipal: true` (keeps the 400-before-session order; see §6.2) |
| `res.status(4xx).json({ error[, code] })` in `try` | `rejectRoute({ status, error[, code] })`, or a per-family mapping table (`rejectMenuError`) |
| `instanceof` ladder in `catch` | ordered mapping list per route, subclass before superclass; unmapped → rethrow. Keep the **wire** pair exact: menus' lost compare-and-set answers status `409` with body code `"VERSION_CONFLICT"`; `MENU_VERSION_CONFLICT` is only the Jini mapping constant's name and never appears on the wire. List its rung before `MENU_CONFLICT` (plain `409`, no code), which it extends |
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
- Function shape everywhere: `fn(required, _optional = {})` — **object arguments, never positional**,
  including small helpers (`toAdminMenuDto({ menu })`, `menuIdParam({ params })`, the host's
  `mountOptions({ operation, authorization }, { … })`); ≤ 80 lines; complexity ≤ 10. A long `catch`
  ladder becomes a mapping table, not a longer function.

### 2.1 Wire DTOs live in neutral Core

- The DTO **declarations** (response bodies, envelope interfaces, the unions they carry) go to
  `@jini-ai/core/contracts/site/<pkg>-<family>.ts` (menus: `cms-menus.ts`), with the export triple and
  `jini.entries` `"universal"` row in `packages/core/package.json`. Core imports no feature package, so a
  union from the feature (e.g. `NavTarget`) is restated structurally; a compile-time parity test in the
  feature package pins both directions (`Same<A, B>` in `cms/src/admin-http/http/__tests__/menus.test.ts`).
- The **serializers** (`to<Family>Dto`, envelope builders, body field readers) stay in the feature package
  (`@jini-ai/<pkg>/admin-http/http/<family>.ts`), importing the declarations from Core. No re-export of
  the Core types from the feature entry (no re-export shells).
- The Tovu admin client (`apps/admin/src/features/<family>/api/*-api.types.ts`) consumes the Core
  declarations instead of mirroring them; editor-only shapes (menus: the draft `AdminMenuTarget`) stay in
  the client, and a Core DTO that must carry one is generic over it (`AdminMenuDto<Target>`).

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
    // object arguments, never positional; every key below is optional and defaults to the old behaviour
    {
      authorization: "direct" | "guarded",                                    // the route's first/only check
      failure: { operation: "routes/<family>/<file>", code: "INTERNAL_ERROR" },
      authorizationByPermission: { [<TOVU_PERMISSION_CONSTANT>]: "guarded" }, // ONLY if a second check had the other mode
      deferMissingPrincipal: true,                                            // ONLY if the route refused a bad body before reading the session
    },
  );
};
```

When to opt into `deferMissingPrincipal`: the hand-written route returned a body/param 400 **before**
`getAuthedPrincipal(res)` (menus: create, update-tree, assign-location — not list, get-by-id, delete). The
spec must then call `authorize` before any side effect, since that is where the missing principal now
fails closed (500, `getAuthedPrincipal`'s message). A route that read the session first keeps the default,
so its missing-session 500 still comes before parse.

- Keep every `registerAdmin…Route` export name and the module's registration order: the route-table
  pin (`create-app-route-table.pin.test.ts`) must not change (mounted handlers are `<anonymous>`, as before).
- Public routes use `mountPublicJsonRoute({ app, spec, deps, failure: { operation, visitorError } })`.
- Non-JSON routes (streams, uploads, HTML, SSE, static, redirects-as-302) do **not** use this template:
  they are core `ServerRoute` factories mounted through `@jini-ai/http-kit/node-bridge` `createNodeDispatcher`.
- Host ports (`admin-json-route-ports.ts`) are shared composition: a family conversion never edits them.
  If a family needs a port change, stop and raise it — the pilot needed two mount options (§6.2, §6.3),
  now available to every family as per-mount opt-ins.

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
2. **Authenticate before parse — deferral is a per-mount opt-in.** `mountJsonRoute` runs workspace →
   authenticate → parse → handle. http-kit's `authenticate` may return `undefined`; Tovu's port does so
   **only** on a mount with `deferMissingPrincipal: true`, and `authorize` then fails closed with
   `getAuthedPrincipal`'s message and the same redacted 500. Opt in only for routes with a legacy
   parse-first refusal (§3); every other mount keeps failing in `authenticate`, before parse, as before.
   Pin both at the wire: no session + malformed body ⇒ the old 400; no session + valid body ⇒ 500 and
   no side effect (`admin-menus-routes.test.ts` "deferral is per mount").
3. **`"direct"` vs `"guarded"` is per authorization call.** Menus update-tree asks `admin.menus.update`
   `direct` (RBAC only) and the raw-HTML permission `guarded` (a publishing grant answers when present).
   The spec keeps two `authorize` calls; the mount sets `authorization: "direct"` plus
   `authorizationByPermission: { [MENU_RAW_HTML_PERMISSION]: "guarded" }`. Pin it with a wire test whose
   grant and RBAC **disagree** on each permission (`admin-menus-routes.test.ts` "publishing grant"), and
   run mutation `update-html-use-direct-rbac` (drop the override ⇒ RED). A family with mixed modes in one
   route does the same, and lists each call's mode in the report.
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
[ ] One spec `authorize` call per hand-written check; per call: permission, entityType, entityId presence
    (incl. conditional omission), decision source ("direct"/"guarded"/override) match the old call
[ ] Wire DTO declarations in @jini-ai/core/contracts/site/<pkg>-<family>.ts + parity test (§2.1);
    serializers in admin-http/http/<family>.ts with object args; admin client types consume Core
[ ] Object arguments everywhere (helpers, serializers, host mountOptions); no positional calls
[ ] Host policy, Node helpers and host services injected as REQUIRED deps; values bound in the registrar
[ ] package.json: exports triple + jini.entries (runtime) + jini.isolation.entries (domain); changeset (patch)
[ ] Jini: build, `pnpm guard`, `pnpm api:update` then `api:check`, `pnpm typecheck`, package vitest
[ ] Tovu: delete sources; modules/<family>.ts mounts with small deps; same registrar names + order;
    "direct"/"guarded" and failure.operation copied per route; authorizationByPermission only for a
    mixed-mode route; deferMissingPrincipal only for parse-first routes (both pinned at the wire)
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
- **Shared seams changed once for all families** (§6.2, §6.3): http-kit `JsonRoutePorts.authenticate` may
  return `undefined` (Jini, with test + changeset); Tovu `admin-json-route-ports.ts` defers a missing
  session to `authorize` **only on a mount that opts in** (`deferMissingPrincipal`), and answers one
  permission from another source with `authorizationByPermission`.

## Migration for families converted before 582db5967

A family branched from the uncorrected template (Tovu `582db5967` / Jini `28ce682b`) merges the fix
commits at the next combine, then applies this checklist. Fix commits to merge (each is small and
separate): Jini `3638b1fd` (update-tree auth parity), `04b2ebf9` (Core menus DTOs), `2729295d`
(CMS object args), `c73309b4` (README); Tovu `069155845` (port options), `f3d023419` (menus mounts +
wire tests), `8e668087a` (admin client types), `c20f88365` (why-comments).

```
[ ] Merge the fix commits; resolve `mountOptions` in modules/<family>.ts to the object form
    mountOptions({ operation, authorization }, { authorizationByPermission?, deferMissingPrincipal? })
[ ] Missing-principal deferral is no longer global. For each of your mounts: if the hand-written route
    returned a 400 before getAuthedPrincipal(res), add `deferMissingPrincipal: true`; otherwise add nothing.
    Without this, a no-session + malformed-body wire test answers 500 instead of its old 400.
[ ] Add the two deferral wire pins per opted-in route (malformed ⇒ old 400; valid ⇒ 500, no side effect)
[ ] Re-audit authorization per hand-written call: one spec `authorize` call each; mixed modes in one route
    ⇒ `authorizationByPermission` on the mount + a grant-vs-RBAC wire test + a named mutation
[ ] Conditional entityId (`...(id ? { entityId } : {})`) reproduced exactly in the spec
[ ] Positional helper signatures → object args with `_optional = {}` pads; update every caller (Jini + Tovu tests)
[ ] Move your wire DTO declarations to @jini-ai/core/contracts/site/<pkg>-<family>.ts (§2.1); feature
    serializers import them; no re-export from the feature entry; admin client types consume them
[ ] Error ladders: status/code pairs checked against the hand-written route's body, not the constant names
[ ] Jini: build, guard, api:update + api:check (Core + feature baselines), changeset; Tovu: typecheck,
    family + admin-json-route-ports tests, route-table pin diff == base, why-comments ok
```

## 9. Request context, replies and raw routes (w3-rtfnd)

The rt-* lanes STOPPED on routes whose wire needs more than body/query/params in and a JSON body out.
These seams close those gaps without changing any existing mount (every option below is opt-in; the
route-table pin is unchanged because every mount still registers with `app[method](path, handler)`).
Jini names: `@jini-ai/core/contracts/server` (`RouteRequestFacts`, `routeReply`, `isRouteReply`,
`RouteInputContext.headers/facts`) and `@jini-ai/http-kit` (`RouteRequestOptIns`, `defineRawRoute`,
`mountRawRoute`, `RawRouteSpec`). Tovu names: `admin-http/admin-json-route-ports.ts`,
`admin-http/admin-request-facts.ts`, `admin-http/admin-raw-route-ports.ts`.

### 9.1 Spec opt-ins (`RouteRequestOptIns`, on JSON and raw specs alike)

The opt-ins are http-kit `JsonRouteSpec`/`RawRouteSpec` fields. A spec built with http-kit's
`defineJsonRoute` passes them in its second (optional) argument; a spec built with core's
`defineJsonRoute` (Jini domain packages, which never import http-kit) gets them spread on where the
composition mounts it. Both are object fields — never positional.

- **`readHeaders`** — the route reads a request header (posts/pages create/update/delete `Idempotency-Key`).
  Names are lower-cased; `raw.headers` holds ONLY the names asked for, and an absent header has no key.
  ```ts
  mountAdminJsonRoute({ app, spec: { ...postsCreateRoute, readHeaders: ["idempotency-key"] }, deps }, { failure });
  // spec: const key = raw.headers?.["idempotency-key"];   // string | undefined
  ```
- **`requestFacts: true`** — the route needs client IP / User-Agent / Host (rate limiting, analytics ingest,
  publish-trust identity `originOf`, external-mcp probe/poll/connect). `raw.facts` is
  `{ clientAddress, userAgent?, host? }`; `clientAddress` is Tovu's trust-proxy answer (`captureRequestFacts`
  → `resolveClientIp(req)`), `host` is `req.get("host")`, `userAgent` is `req.get("user-agent")`. Every
  Tovu mount (admin and public, JSON and raw) binds the `requestFacts` port; it is consulted only for a spec
  that opts in (a spec that opts in on a mount without the port throws at mount time).
  ```ts
  mountPublicJsonRoute({ app, spec: { ...analyticsIngestRoute, requestFacts: true }, deps, failure });
  // spec: const limited = deps.limiter.hit({ key: raw.facts!.clientAddress });
  ```
- **`responseHeaders`** — a STATIC header on EVERY answer of the route, refusals included, set before the
  workspace 404 (consent `Cache-Control: no-store`, folder-picker, public search/content).
  ```ts
  mountAdminJsonRoute({ app, spec: { ...consentGetRoute, responseHeaders: { "Cache-Control": "no-store" } }, deps });
  ```

### 9.2 `routeReply` — status, headers or an empty body from a JSON spec

A handler returns `ok({ value: routeReply({ status, body?, headers? }) })` when the answer is not "200/successStatus +
JSON": `Retry-After` on a 429 (members request-magic-link, publish-trust challenge/session, IP limiters),
`ETag` + bare `304` (skills list), bare `204` (users remove-policy-permission, which used `send()`).
`body` absent ⇒ `res.status(s).send()` exactly; ordinary return values are unchanged.
```ts
if (!limit.allowed) return ok({ value: routeReply({ status: 429, body: { error: "Too many requests", code: "RATE_LIMITED" }, headers: { "Retry-After": String(limit.retryAfterSeconds) } }) });
if (etag === raw.headers?.["if-none-match"]) return ok({ value: routeReply({ status: 304, headers: { ETag: etag } }) });
return ok({ value: routeReply({ status: 204 }) });
```

### 9.3 Raw routes — `mountAdminRawRoute` / `mountPublicRawRoute`

For HTML, XML/text, streams, downloads, `express.raw` uploads, `302` + `Set-Cookie`. The spec is
`defineRawRoute({ method, path, handle }, { readHeaders?, requestFacts?, responseHeaders?, maxBodyBytes? })`;
`handle({ raw, deps, context, authorize }, { signal })` returns a web `Response` (each `Set-Cookie` header
is written on its own line; a `ReadableStream` body is streamed and cancelled on client disconnect, `signal`
aborts with it; `null` body ⇒ `end()`). Same gate order and the SAME host ports as the JSON mounts (workspace
404, session, guarded/direct authorize, `sessionCredentialOnly`, `forbidden`, `failureFor`, `failureCopy`,
the redacted 500). `raw.body` is whatever the route's own parser left on `req.body` (a `Buffer` after an
`express.raw` registered for that path, ahead of the mount).
```ts
mountAdminRawRoute({ app, spec: pluginsInstallRoute, deps: { ...portDeps, installer } }, { failure: { operation: "routes/plugins/install" } });
mountPublicRawRoute({ app, spec: sitemapRoute, deps, failure: { operation: "site:sitemap", visitorError: "The sitemap couldn’t load." }, workspaceId: deps.workspaceId });
// spec: return new Response(xml, { status: 200, headers: { "content-type": "application/xml; charset=utf-8" } });
```

### 9.4 Admin mount options (`AdminJsonRouteMountOptions`, also taken by `mountAdminRawRoute`)

- **`sessionCredentialOnly: { message, permission }`** — the route called `rejectUnlessSessionCredential`
  (api-keys, folder-picker, external-mcp shared, admin-surfaces, publish-content import/backstop/bundle/
  capabilities/peer-transport, plugins provider-settings, system/* credentials). The mount answers that
  function's exact 403 (`{ error: message, code: "FORBIDDEN", details: { permission, reason:
  "credential_kind_not_permitted" } }`) in `authenticate`: after the workspace 404, before parse/authorize.
  ```ts
  mountAdminJsonRoute({ app, spec: apiKeysIssueRoute, deps }, { authorization: "direct", sessionCredentialOnly: { message: API_KEY_CREDENTIAL_MESSAGE, permission: "admin.api_keys.manage" } });
  ```
- **Admin request facts — `adminRequestFactsFor({ context })`** — the route branched on the credential
  kind (`gatedPrincipalKindFor`) or read the publish-trust grant (`getPublishTrustContext`). Bind the accessor
  into the spec's deps at the composition; the spec calls it with its `context`. Answers
  `{ credentialKind: "session" | "api_key" | "publish_key", publishTrust: PublishTrustContext | null }`,
  keyed on that request's own principal copy (never shared across requests); no Express type reaches the spec.
  Throws (⇒ the redacted 500) for a context the ports never authenticated — a wiring bug.
  ```ts
  mountAdminJsonRoute({ app, spec: publishImportRoute, deps: { ...portDeps, requestFacts: adminRequestFactsFor } });
  // spec: const { credentialKind, publishTrust } = deps.requestFacts({ context });
  ```
- **`forbidden: (decision) => { status, body }`** — the route's denial body was not `authorizeOrRespond`'s
  (media where-used/text `{ error: "media.read is required", code: "FORBIDDEN" }`, import-url
  `"not authorized for media.upload"`). Receives `{ principalId, permission, entityType?, entityId?, reason }`.
  ```ts
  mountAdminJsonRoute({ app, spec: mediaWhereUsedRoute, deps }, { forbidden: () => ({ status: 403, body: { error: "media.read is required", code: "FORBIDDEN" } }) });
  ```
- **`failureFor: (error) => FailureOptions | undefined`** — one route answered two different 500s
  (agent-plugins memory PUT: a Node system error is `agent-plugins:write-note` + "The note could not be
  saved."). `undefined` falls back to `failure`.
  ```ts
  { failure: { operation: "routes/agent-plugins/memory", code: "INTERNAL_ERROR" }, failureFor: (e) => isNodeSystemError({ error: e }) ? { operation: "agent-plugins:write-note", message: "The note could not be saved." } : undefined }
  ```
- **`failureCopy: "operation"`** — the route answered `adminFailureResponse({ error, tracker }, { operation })`
  directly (presentation PATCH: operation-only copy, not `sendAdminFailure`'s method/route-derived copy).
  ```ts
  { failure: { operation: "routes/presentation/patch-active-theme" }, failureCopy: "operation", authorization: "direct" }
  ```
- **Authorization without an entity type** — a spec calls `authorize({ permission })` with no `entityType`
  and the host authorizer receives NO `entityType` key (users list-roles/policies/policy-permissions, which
  pin exact params). Do not invent an `entityType` any more (the skills/fs-files departures above can drop theirs).

### 9.5 Public mounts

`mountPublicJsonRoute`/`mountPublicRawRoute` take an optional `workspaceId`: when given, a path with
`:workspaceId` answers the shared `{ error: "workspace was not found" }` 404 before the handler (the
hand-written `rejectForeignWorkspace`). Without it the mount behaves as before. Facts and response headers
work as in §9.1. Public routes have no session, so `context` is `undefined` and `authorize` is never wired.

### 9.6 Migration notes — families STOPPED by rt-* now convert with

| STOPPED family (lane) | reason | now use |
|---|---|---|
| posts/pages create/update/delete (rt-l1) | `Idempotency-Key` | `readHeaders: ["idempotency-key"]` |
| presentation PATCH (rt-l1) | operation-only 500 copy | `failureCopy: "operation"` |
| posts template-preview, themes preview (rt-l1) | HTML, urlencoded, 302 | `mountAdminRawRoute` (+ `express.urlencoded` registered for the path first) |
| api-keys ×3, folder-picker (rt-i2) | `rejectUnlessSessionCredential` | `sessionCredentialOnly` |
| folder-picker, consent ×5 (rt-i2) | `Cache-Control: no-store` | `responseHeaders` |
| skills list (rt-i2) | ETag / 304 | `readHeaders: ["if-none-match"]` + `routeReply({ status: 304, headers })` |
| publish-trust identity/challenge/session (rt-i2) | `req.get("host")`, 429 `Retry-After` | `requestFacts: true` (`raw.facts.host`) + `routeReply` |
| members request-magic-link (rt-i2) | 429 `Retry-After` | `requestFacts: true` + `routeReply` |
| users remove-policy-permission (rt-i2) | bare 204 `send()` | `routeReply({ status: 204 })` |
| users list-roles/policies/policy-permissions | authorize without entityType | `authorize({ permission })` |
| public members/commerce/site (rt-l3) | IP, UA, DNT, 204, workspace 404, headers | `requestFacts`, `readHeaders: ["dnt"]`, `routeReply`, `workspaceId` on the public mount; HTML/XML/bytes/303+cookie ⇒ `mountPublicRawRoute` |
| media where-used / import-url / text (rt-l3) | own 403 body | `forbidden` |
| external-mcp probe/poll/connect (rt-l4) | IP limiter, `Retry-After`, public origin | `requestFacts: true` + `routeReply` |
| external-mcp shared, agent-plugins admin-surfaces (rt-l4) | credential-kind gate | `sessionCredentialOnly` |
| external-mcp browser sign-in (rt-l4) | 302 + `Set-Cookie` | `mountAdminRawRoute` |
| agent-plugins memory (rt-l4) | two 500 copies | `failureFor` |
| agent-plugins install, plugins install, blob-put (rt-l4/l5) | `express.raw` upload | `mountAdminRawRoute` (`raw.body` is the `Buffer`) |
| publish-content import/backstop/bundle/capabilities/peer-transport, plugins provider-settings (rt-l5) | credential kind / grant | `sessionCredentialOnly` and/or `adminRequestFactsFor` |
| publish-content export, blob-get, chart-providers (rt-l5) | stream / bytes / Cache-Control | `mountAdminRawRoute` + `responseHeaders` |

Still out of scope (raise, do not work around): the asyncRoute `[forwardRejection]` handler name in the pin
(rt-i2 #3), analytics recent-hits' nested 500 envelope, `/readyz`'s source-regex consumer, blobs-probe's
413 before the workspace 404, and `res.once("finish")` hooks.
