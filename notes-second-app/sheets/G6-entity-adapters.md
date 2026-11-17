# G6: entity adapters, conformance and a `Server` registrar in `@jini-ai/admin`

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g6-entity-adapters`. Estimate: ~130k Sonnet.
Owner: `@jini-ai/admin`. Prerequisites: N2 merged; xpkg R1c/R2 not mid-flight on the files below (check).

## Inventory

```sh
ls packages/admin/src/redirects packages/admin/src/redirects/adapters 2>/dev/null; wc -l packages/admin/src/{redirects,seo,comments}/adapters/*/*.ts packages/admin/src/{redirects,seo,comments}/conformance*.ts 2>/dev/null | sort -n | head -20
# pick the SMALLEST existing domain as the layout precedent and name it in the report
node -e 'const j=require("./packages/admin/package.json");for(const k of Object.keys(j.exports).filter(k=>/redirects/.test(k)))console.log(k,JSON.stringify(j.exports[k]),j.jini.entries[k])'
wc -l examples/notes-app/src/gaps/entity-routes.ts examples/notes-web/src/shared/gaps/entity-http-adapter.ts
rg -n "AdminEntityPort|createAdminEntityRegistry" ../Tovu/apps ../Tovu/packages -l -g '!**/__tests__/**' | head     # Tovu consumers (expected: few or none)
git log --oneline -8 -- packages/admin/src/core/ports/entities.ts packages/admin/src/react/entities packages/admin/package.json
```

## Target

| Subpath (`jini.entries`) | Surface | Source |
|---|---|---|
| `./entities/adapters/http` (universal) | `createEntityHttpPort<D>({ descriptor, baseUrl, fetch }, optional = {}): AdminEntityPort<D>` | moved from `notes-web/src/shared/gaps/entity-http-adapter.ts` |
| `./entities/adapters/memory` (universal) | `createEntityMemoryPort<D>({ descriptor }, { rows?, ids? } = {}): AdminEntityPort<D>` with `filter`, `sort`, `limit`, opaque `cursor`, and `version` checking when the descriptor declares a required integer `version` field | new; replaces the hand-made fakes in notes tests |
| `./entities/conformance` (universal) | `runEntityPortConformance({ makePort, descriptor, … })` | new, same style as the precedent domain |
| `./entities/server` (universal: web `Request`/`Response` only) | `registerEntityRoutes({ app, port, basePath, authorize }, { bodyLimitBytes = 262144 } = {})` on `Server` | moved from `notes-app/src/gaps/entity-routes.ts`; **adds** the `authorize` port |

Wire protocol (fixed here, used by both halves): `GET base?limit&cursor&search` -> `AdminEntityPage`;
`GET base/:id` -> row or 404; `POST base` -> 201 row; `PATCH base/:id` -> row; `DELETE base/:id` -> 204 or
405 when the port has no `remove`; errors `{ error: { code: 'VALIDATION'|'NOT_FOUND'|'CONFLICT'|'FORBIDDEN', message } }`
with 400/404/409/403. `authorize({ request, action: 'read'|'create'|'update'|'remove', entity })` returns
`'allow' | 'deny'`; **required** (no default allow). Imports: own package + `@jini-ai/core` only.

## Tests first

1. Conformance suite run against the memory port and against the http port talking to `registerEntityRoutes`
   mounted on `createInMemoryServer` backed by the memory port (round trip). Checks: CRUD, unknown id ->
   null/NOT_FOUND, stale `version` -> CONFLICT and row unchanged, list with 3+ rows and each filter op,
   sort with a tie, cursor walk visits every row once, optional `remove` absent. Broken-adapter self-tests:
   ignores version; drops a filter; returns `nextCursor` forever (AP12).
2. Security first (AP7): `authorize` returning `'deny'` per action -> 403 with `FORBIDDEN` and **no port call**
   (spy via a counting fake port); a throwing `authorize` (Error, string, rejected promise) -> 403, never 200
   (fail closed, AP11).
3. Limits: body `limit-1/limit/limit+1` bytes; HOSTILE table as bodies -> 400.

## Steps (commit each)

1. Memory port + conformance (new files only). 2. `git mv` the http adapter from notes-web; re-export stub
   left in notes-web. 3. `git mv` the routes from notes-app into `entities/server`, add `authorize`;
   re-export stub left in notes-app passing an explicit local-owner `authorize`. 4. `exports` +
   `jini.entries` for the four subpaths; changeset `@jini-ai/admin` minor. 5. Examples import the subpaths;
   delete both stubs and their `GAPS.json` rows; notes tests switch their fake ports to
   `createEntityMemoryPort`.

## Acceptance

admin gates; Jini repo gates; Tovu typecheck linked (expected zero edits); both example gate sets + `gaps`;
N5 e2e unchanged. Deletion ledger: both glue files.

## Not verified by the planner

Which admin domain is the smallest precedent; how those domains name their conformance entry; whether
`jini.entries` allows "universal" for a file using `Request`/`Response` in this package.
