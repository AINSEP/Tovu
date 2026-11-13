# Terra job: move Jini route code off Express onto the `Server` contract

READY after Wave 1 (2026-11-13). This prompt is self-contained. Background only: `development/refactor-patterns/server-port.md` in the Tovu repo.

Repo: the Jini clone you are given. Jini only: do not touch Tovu.

## Precondition (check first, stop if it fails)
`rg -n "app: Server" packages/http-kit/src/adapter.ts` must print a hit (Wave 1 changed `mountJsonRoute` to take a `Server`). If it prints nothing, STOP and report "Wave 1 (O-kit) has not landed". Do not change http-kit yourself.

## Why
Owner rule: Jini code never depends on Express. Route code takes `{ app: Server }` (`@jini-ai/core/contracts/server`). Handlers get a web `Request` and return a web `Response`. Tovu plugs Express in through a small adapter, so a later move to Express 5 or another server touches no Jini code.

## The tools you use (already in the repo; do not edit them)
- `import type { Server, ServerHandler, ServerMiddleware } from '@jini-ai/core/contracts/server';`
- `import { jsonResponse, readJsonBody, readBodyBytes, withServerMiddleware } from '@jini-ai/http-kit/server-port';`
  - `jsonResponse({ status, body }, { headers })` → `Response`
  - `await readJsonBody({ request }, { maxBytes })` → `{ ok: true, value } | { ok: false, error }`. Gives `{}` for no body. Default max is 100 KiB.
- `import { statusForError } from '@jini-ai/http-kit';`
- A finished example to copy line by line: `packages/daemon/src/http/message-relay.ts` and its tests `packages/daemon/src/http/__tests__/message-relay.test.ts`, `message-relay-boundaries.unit.test.ts`, `message-relay-test-helpers.ts`.

## Variants
**S1 type swap.** The file only passes `app` to `mountJsonRoute(...)` or to other `register*Routes(...)`. Replace `import type { Express } from 'express';` with `import type { Server } from '@jini-ai/core/contracts/server';`, and every `Express` type in the file with `Server`. Change nothing else.

**S2 hand-written handler.** Rewrite each `app.get|post|put|delete|patch(PATH, handler)` as `app.route({ method: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH', path: PATH, handler: async ({ request, params }) => { … } })`. Use this mapping and nothing else:

| Express | Server contract |
|---|---|
| `req.params.x` | `params.x` |
| `req.query.x` | `new URL(request.url).searchParams.get('x') ?? undefined` |
| `req.get('h')` / `req.headers['h']` | `request.headers.get('h') ?? undefined` |
| `req.body` (after `express.json(...)`) | `const body = await readJsonBody({ request }, { maxBytes: N }); if (!body.ok) return jsonResponse({ status: statusForError({ error: body.error }), body: { error: body.error } });` then `body.value`. N = the route's old `limit` in bytes (`'64kb'` → `65536`); no limit → omit the option. Read the body AFTER auth checks, at the place the old code first used `req.body`. |
| `res.status(s).json(b); return;` | `return jsonResponse({ status: s, body: b });` |
| `res.json(b)` | `return jsonResponse({ status: 200, body: b });` |
| `res.sendStatus(s)` | `return new Response(null, { status: s });` |
| `res.redirect(s, url)` / `res.redirect(url)` | `return new Response(null, { status: s /* or 302 */, headers: { location: url } });` |
| `res.cookie(name, value, opts)` | Build headers with `headers.append('set-cookie', serializeCookie(...))`, reusing the serializer the file already imports. If none exists, report the site, do not invent one. |
| `res.set(h, v)` / `res.setHeader(h, v)` | pass in `jsonResponse(..., { headers: { [h]: v } })` |
| `next(error)` / `catch (e) { next(e) }` | `throw error` / remove the try/catch that only forwarded to `next` |
| `express.json({ limit })` passed as a route argument | delete it; use `readJsonBody` maxBytes as above |
| `(req: Request, res: Response)` type imports from `express` | delete them |

**S3 middleware.** `(req, res, next) => { …; next(); }` → `const x: ServerMiddleware = async ({ request, locals, next }) => { …; return next(); };`. A refusal `res.status(s).json(b); return;` → `return jsonResponse({ status: s, body: b });`. `res.locals.k` → `locals.k`. `req.path` → `new URL(request.url).pathname`. A function that registered the middleware with `app.use(mw)` now returns the `ServerMiddleware`, and its JSDoc says: "mount with `withServerMiddleware({ server, middleware: [x] })`".

**S4 helper over req/res.** A parameter `{ req }: { req: Request }` → `{ request }: { request: Request }` (web Request, no import), with the S2 mapping. `req.secure` → `new URL(request.url).protocol === 'https:'`. A helper that wrote to `res` (`res.setHeader`, `res.cookie`, `res.status`) now returns `Headers` (or a `Response` for a final answer), and its caller adds them to the response it returns.

**S6 rename.** Move the folder `src/<area>/express/` to `src/<area>/http/` with `git mv`. Fix relative imports. In that package's `package.json`, rename the export key `./<area>/express` to `./<area>/http` in `exports` and in the `jini` metadata block, with matching `dist/<area>/http/...` paths. Add a line under "Unreleased → Breaking" in that package's `CHANGELOG.md`: "`./<area>/express` is now `./<area>/http`; it takes the framework-neutral `Server` contract."

## Rules
- Tests first, for every S2/S3/S4 file. Rewrite the file's existing tests to the contract the way `message-relay.test.ts` was rewritten: build a `new Request(url, { method, headers, body: JSON.stringify(b) })`, call the handler with `{ request, params }`, assert on `res.status` and `await res.json()`. Run that one test file and paste the red. Convert. Run it green. Then mutate one guard in the source (for example, delete one refusal `if`), run again, paste the red, and restore. Put red/green/mutant output in your report.
- Keep every refusal message, status code and response body exactly as it was. The only allowed difference is the one in `message-relay.test.ts`: a bare JSON `null`/string body is now refused by `readJsonBody`.
- Never delete or move a "why" comment; when code moves, its comment moves with it. Update comments that say "Express" to say "the host adapter".
- No `eslint-disable`, no `as any`, no non-null `!`. Function args stay `(required, optional = {})`.
- Single test files only: `cd packages/<pkg> && npx vitest run --maxWorkers=2 --minWorkers=1 <file>`. Before running daemon tests, build the packages they import once: `(cd packages/protocol && npx tsc -p tsconfig.json) && (cd packages/core && npx tsc -p tsconfig.json) && (cd packages/platform && npx tsc -p tsconfig.json) && (cd packages/http-kit && npx tsc -p tsconfig.json)`. No suites, no root tsc. Leave nothing running.
- If a file needs something not in this prompt (streaming, `res.write`, uploads, a cookie serializer that does not exist), do NOT improvise. Leave it unchanged and list it under "Needs Opus" in your report.

## Done check
`rg -n "from ['\"]express['\"]" <every file you changed>` → no hits. `npx eslint <changed files>` → no new errors. Commit per package: `git add -- <paths> && git commit -F msg -- <paths>`, message `refactor(<pkg>): route code takes the Server contract instead of Express`. Never push.

## Sites (57 from the audit; 36 are yours, 1 done, 20 SKIP)
Variant `O-*` = SKIP (Opus lane; leave untouched). `DONE` = already converted (use as the example). Combined variants (`S1+S2`) mean the file has both shapes.

| # | file:line | variant |
|---|---|---|
| 1 | `packages/cms/src/comments/express/submit-handler.ts`:5 | S2+S6 |
| 2 | `packages/cms/src/forms/express/handler.ts`:6 | S2+S6 |
| 3 | `packages/cms/src/redirects/express/index.ts`:2 | S3+S6 |
| 4 | `packages/commerce/src/http/payments-webhook.ts`:1 | O-raw-body |
| 5 | `packages/core/src/settings/express/contracts.ts`:1 | S4+S6 |
| 6 | `packages/core/src/settings/express/http-request.ts`:1 | S4+S6 |
| 7 | `packages/core/src/settings/express/http.ts`:1 | S2+S6 |
| 8 | `packages/core/src/settings/express/shared.ts`:1 | S4+S6 |
| 9 | `packages/core/src/settings/express/stream.ts`:3 | O-stream |
| 10 | `packages/daemon/src/http/active-context.ts`:22 | S1 |
| 11 | `packages/daemon/src/http/agents.ts`:17 | S1 |
| 12 | `packages/daemon/src/http/attachment-lookup-routes.ts`:18 | S2 |
| 13 | `packages/daemon/src/http/attachments.ts`:107 | O-upload |
| 14 | `packages/daemon/src/http/component-catalog.ts`:18 | S1 |
| 15 | `packages/daemon/src/http/connectors.ts`:50 | S1 |
| 16 | `packages/daemon/src/http/daemon-status.ts`:14 | S1 |
| 17 | `packages/daemon/src/http/db-ops.ts`:42 | S1 |
| 18 | `packages/daemon/src/http/delegated-tools.ts`:31 | S1 |
| 19 | `packages/daemon/src/http/frontend-control.ts`:39 | S1 |
| 20 | `packages/daemon/src/http/frontend-guest-scope.ts`:4 | S4 |
| 21 | `packages/daemon/src/http/frontend-request-route.ts`:2 | S2 |
| 22 | `packages/daemon/src/http/frontend-sessions.ts`:35 | O-stream |
| 23 | `packages/daemon/src/http/health.ts`:55 | S1 |
| 24 | `packages/daemon/src/http/host-tools.ts`:23 | S1 |
| 25 | `packages/daemon/src/http/media.ts`:45 | S1 |
| 26 | `packages/daemon/src/http/memory.ts`:50 | S1+S2 |
| 27 | `packages/daemon/src/http/message-relay.ts`:1 | DONE |
| 28 | `packages/daemon/src/http/model-proxy.ts`:87 | O-stream |
| 29 | `packages/daemon/src/http/remote-run-events.ts`:28 | S1+S3 |
| 30 | `packages/daemon/src/http/research.ts`:100 | S1 |
| 31 | `packages/daemon/src/http/routines.ts`:66 | S1 |
| 32 | `packages/daemon/src/http/run-credentials.ts`:1 | S3 |
| 33 | `packages/daemon/src/http/runs.ts`:9 | S1+S2 |
| 34 | `packages/daemon/src/http/surface-callback.ts`:1 | S4 |
| 35 | `packages/daemon/src/http/surface-restoration.ts`:1 | O-stream |
| 36 | `packages/daemon/src/http/terminals.ts`:31 | S1+S2 |
| 37 | `packages/daemon/src/http/tool-catalog.ts`:22 | S1 |
| 38 | `packages/daemon/src/http/tool-execution-routes.ts`:25 | O-stream |
| 39 | `packages/daemon/src/http/xai.ts`:122 | S1 |
| 40 | `packages/http-kit/src/adapter.ts`:9 | O-kit |
| 41 | `packages/http-kit/src/api-security-middleware.ts`:25 | O-kit |
| 42 | `packages/http-kit/src/local-daemon-request.ts`:13 | O-kit |
| 43 | `packages/http-kit/src/middleware.ts`:1 | O-kit |
| 44 | `packages/http-kit/src/observability.ts`:1 | O-kit |
| 45 | `packages/http-kit/src/origin.ts`:5 | O-kit |
| 46 | `packages/http-kit/src/request.ts`:6 | O-kit |
| 47 | `packages/http-kit/src/response.ts`:6 | O-kit |
| 48 | `packages/http-kit/src/route-registration-guard.ts`:15 | O-kit |
| 49 | `packages/http-kit/src/types.ts`:8 | O-kit |
| 50 | `packages/server/src/builtin-features.ts`:42 | O-host |
| 51 | `packages/server/src/compose-jini-kernel.ts`:31 | O-host |
| 52 | `packages/server/src/create-local-node-daemon.ts`:39 | O-host |
| 53 | `packages/cms/package.json (export `./settings/express`)` | S6 |
| 54 | `packages/cms/package.json (export `./forms/express`)` | S6 |
| 55 | `packages/cms/package.json (export `./comments/express`)` | S6 |
| 56 | `packages/cms/package.json (export `./redirects/express`)` | S6 |
| 57 | `packages/core/package.json (export `./settings/express`)` | S6 |

Notes on specific rows:
- `frontend-control.ts` (S1): `FrontendHttpExtension`'s `app: Express` becomes `app: Server`.
- `core/src/settings/express/*` and `cms/src/{comments,forms,redirects}/express/*` (S6): move the folder AND convert the file's variant in the same commit. `contracts.ts`: `app: Pick<Express, "get" | "post" | "put" | "delete">` → `app: Server`; `PrincipalResolver({ request, response })` → `({ request })`, returning the principal. If that resolver set cookies on `response`, list it under "Needs Opus".
- `cms/package.json` exports `./settings/express`, `./forms/express`, `./comments/express`, `./redirects/express`, and `core/package.json` exports `./settings/express`: these are S6 subpath renames.
- `memory.ts`, `runs.ts`, `terminals.ts` (S1+S2): the S1 swap plus the one hand-written route each.
- `remote-run-events.ts` (S1+S3): the `NextFunction` middleware becomes a `ServerMiddleware`.
