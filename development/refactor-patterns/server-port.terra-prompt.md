# Terra job: move Jini route code off Express onto the `Server` contract

READY after Wave 1 (revised 2026-11-13 after the Codex review: only sites a literal reading gets right are here; settings, forms, comments, streams, uploads and host wiring are Opus stages). This prompt is self-contained. Background only: `development/refactor-patterns/server-port.md` in the Tovu repo.

Repo: the Jini clone you are given. Jini only: do not touch Tovu.

## Precondition (check first, stop if any fails)
Each of these must print a hit; if one prints nothing, STOP and report "Wave 1 (O-kit) has not landed: <which>". Do not change http-kit yourself.
- `rg -n "app: Server" packages/http-kit/src/adapter.ts` (`mountJsonRoute` takes a `Server`)
- `rg -n "export function readQuery" packages/http-kit/src/server-port.ts`
- `rg -n "export const DAEMON_JSON_BODY_MAX_BYTES" packages/daemon/src/http/body-limits.ts`

## Why
Owner rule: Jini code never depends on Express. Route code takes `{ app: Server }` (`@jini-ai/core/contracts/server`). Handlers get a web `Request` and return a web `Response`. Tovu plugs Express in through a small adapter, so a later move to Express 5 or another server touches no Jini code.

## The tools you use (already in the repo; do not edit them)
- `import type { Server, ServerHandler, ServerMiddleware } from '@jini-ai/core/contracts/server';`
- `import { jsonResponse, readJsonBody, readQuery, withServerMiddleware } from '@jini-ai/http-kit/server-port';`
  - `jsonResponse({ status, body }, { headers })` → `Response`
  - `await readJsonBody({ request }, { maxBytes })` → `{ ok: true, value } | { ok: false, error }`. Gives `{}` for no body. ALWAYS pass `maxBytes` (rule below); never rely on its default.
  - `readQuery({ request })` → the query object in the same shapes Express gave (`string`, `string[]`, or a non-string for bracketed keys).
- `import { DAEMON_JSON_BODY_MAX_BYTES } from './body-limits.js';` (files in `packages/daemon/src/http/` only)
- `import { statusForError } from '@jini-ai/http-kit';`
- A finished example to copy line by line: `packages/daemon/src/http/message-relay.ts` and its tests `packages/daemon/src/http/__tests__/message-relay.test.ts`, `message-relay-boundaries.unit.test.ts`, `message-relay-test-helpers.ts`.

## Variants
**S1 type swap.** The file only passes `app` to `mountJsonRoute(...)` or to other `register*Routes(...)`. Replace `import type { Express } from 'express';` with `import type { Server } from '@jini-ai/core/contracts/server';`, and every `Express` type in the file with `Server`. Change nothing else.

**S2 hand-written handler.** Rewrite each `app.get|post|put|delete|patch(PATH, handler)` as `app.route({ method: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH', path: PATH, handler: async ({ request, params }) => { … } })`. Use this mapping and nothing else:

| Express | Server contract |
|---|---|
| `req.params.x` | `params.x` |
| `req.query.x` | `query.x`, with `const query = readQuery({ request });` once, at the place the old code first read `req.query`. Never `searchParams.get` (it keeps one of several values). Keep the old type checks on the value exactly as they were. |
| `req.get('h')` / `req.headers['h']` | `request.headers.get('h') ?? undefined` |
| `req.body` (after `express.json(...)`) | `const body = await readJsonBody({ request }, { maxBytes: N }); if (!body.ok) return jsonResponse({ status: statusForError({ error: body.error }), body: { error: body.error } });` then `body.value`. N: the route's own old `limit` in bytes if it had one (`'64kb'` → `65536`); otherwise, in `packages/daemon/src/http/`, `DAEMON_JSON_BODY_MAX_BYTES`; anywhere else, STOP for that file and list it under "Needs Opus". Read the body AFTER auth checks, at the place the old code first used `req.body`. |
| `res.status(s).json(b); return;` | `return jsonResponse({ status: s, body: b });` |
| `res.json(b)` | `return jsonResponse({ status: 200, body: b });` |
| `res.sendStatus(s)` | `return new Response(null, { status: s });` |
| `res.redirect(s, url)` / `res.redirect(url)` | `return new Response(null, { status: s /* or 302 */, headers: { location: url } });` |
| `res.cookie(name, value, opts)` | Build headers with `headers.append('set-cookie', serializeCookie(...))`, reusing the serializer the file already imports. If none exists, report the site, do not invent one. |
| `res.set(h, v)` / `res.setHeader(h, v)` | pass in `jsonResponse(..., { headers: { [h]: v } })` |
| `next(error)` / `catch (e) { next(e) }` | `throw error` / remove the try/catch that only forwarded to `next` |
| `express.json({ limit })` passed as a route argument | delete it; use `readJsonBody` maxBytes as above |
| `(req: Request, res: Response)` type imports from `express` | delete them |

**S3 middleware.** `(req, res, next) => { …; next(); }` → `const x: ServerMiddleware = async ({ request, locals, next }) => { …; return next(); };`. A refusal `res.status(s).json(b); return;` → `return jsonResponse({ status: s, body: b });`. `res.locals.k` → `locals.k`. `req.path` → `route.path` if the code compares it to a registered pattern, otherwise list the file under "Needs Opus" (a raw path and a pattern differ under a mount prefix). A function that registered the middleware with `app.use(mw)` now returns the `ServerMiddleware`, and its JSDoc says: "mount with `withServerMiddleware({ server, middleware: [x] })`; a host framework mounts it with its gate adapter at the same position the old `app.use` had". Never change which requests a gate refuses or the order of its checks.

**S4 helper over req/res.** A parameter `{ req }: { req: Request }` → `{ request }: { request: Request }` (web Request, no import), with the S2 mapping. `req.secure` → `new URL(request.url).protocol === 'https:'`. A helper that wrote to `res` (`res.setHeader`, `res.cookie`, `res.status`) now returns `Headers` (or a `Response` for a final answer), and its caller adds them to the response it returns.

**S6 rename** (only `cms/src/redirects/express`; settings, forms and comments are Opus stages). Move the folder `src/<area>/express/` to `src/<area>/http/` with `git mv`. Fix relative imports. In that package's `package.json`, rename the export key `./<area>/express` to `./<area>/http` in `exports` and in the `jini` metadata block, with matching `dist/<area>/http/...` paths. Add a line under "Unreleased → Breaking" in that package's `CHANGELOG.md`: "`./<area>/express` is now `./<area>/http`; it takes the framework-neutral `Server` contract."

## Rules
- Tests first, for every S2/S3/S4 file. Rewrite the file's existing tests to the contract the way `message-relay.test.ts` was rewritten: build a `new Request(url, { method, headers, body: JSON.stringify(b) })`, call the handler with `{ request, params }`, assert on `res.status` and `await res.json()`. Run that one test file and paste the red. Convert. Run it green. Then mutate one guard in the source (for example, delete one refusal `if`), run again, paste the red, and restore. Put red/green/mutant output in your report.
- Keep every refusal message, status code and response body exactly as it was. The only allowed difference is the one in `message-relay.test.ts`: a bare JSON `null`/string body is now refused by `readJsonBody`.
- For an S3 gate (a middleware that refuses), the mutant step deletes each refusal `if` in turn (one run per refusal), not just one.
- Never delete or move a "why" comment; when code moves, its comment moves with it. Update comments that say "Express" to say "the host adapter".
- No `eslint-disable`, no `as any`, no non-null `!`. Function args stay `(required, optional = {})`.
- Single test files only: `cd packages/<pkg> && npx vitest run --maxWorkers=2 --minWorkers=1 <file>`. Before running daemon tests, build the packages they import once: `(cd packages/protocol && npx tsc -p tsconfig.json) && (cd packages/core && npx tsc -p tsconfig.json) && (cd packages/platform && npx tsc -p tsconfig.json) && (cd packages/http-kit && npx tsc -p tsconfig.json)`. No suites, no root tsc. Leave nothing running.
- If a file needs something not in this prompt (streaming, `res.write`, uploads, a cookie serializer that does not exist, a non-JSON body, an identity read from `res.locals` that the file does not set itself), do NOT improvise. Leave it unchanged and list it under "Needs Opus" in your report.
- Never import `@jini-ai/http-kit` from `packages/core` (core is the bottom layer; a core file in your list is a mistake: stop and report it).

## Done check
`rg -n "from ['\"]express['\"]" <every file you changed>` → no hits. `npx eslint <changed files>` → no new errors. Commit per package: `git add -- <paths> && git commit -F msg -- <paths>`, message `refactor(<pkg>): route code takes the Server contract instead of Express`. Never push.

## Sites (yours: 26 rows; every other file is an Opus stage, leave it untouched)
Combined variants (`S1+S2`) mean the file has both shapes. Line = the first `express` import at design commit `83b0234b1`.

| # | file:line | variant |
|---|---|---|
| 1 | `packages/cms/src/redirects/express/index.ts`:2 | S3+S6 |
| 2 | `packages/cms/package.json` (export `./redirects/express`) | S6 |
| 3 | `packages/daemon/src/http/active-context.ts`:22 | S1 |
| 4 | `packages/daemon/src/http/agents.ts`:17 | S1 |
| 5 | `packages/daemon/src/http/attachment-lookup-routes.ts`:18 | S2 |
| 6 | `packages/daemon/src/http/component-catalog.ts`:18 | S1 |
| 7 | `packages/daemon/src/http/connectors.ts`:50 | S1 |
| 8 | `packages/daemon/src/http/daemon-status.ts`:14 | S1 |
| 9 | `packages/daemon/src/http/db-ops.ts`:42 | S1 |
| 10 | `packages/daemon/src/http/delegated-tools.ts`:31 | S1 |
| 11 | `packages/daemon/src/http/frontend-control.ts`:39 | S1 |
| 12 | `packages/daemon/src/http/frontend-guest-scope.ts`:4 | S4 |
| 13 | `packages/daemon/src/http/frontend-request-route.ts`:2 | S2 |
| 14 | `packages/daemon/src/http/health.ts`:55 | S1 |
| 15 | `packages/daemon/src/http/host-tools.ts`:23 | S1 |
| 16 | `packages/daemon/src/http/media.ts`:45 | S1 |
| 17 | `packages/daemon/src/http/memory.ts`:50 | S1+S2 |
| 18 | `packages/daemon/src/http/remote-run-events.ts`:28 | S1+S3 |
| 19 | `packages/daemon/src/http/research.ts`:100 | S1 |
| 20 | `packages/daemon/src/http/routines.ts`:66 | S1 |
| 21 | `packages/daemon/src/http/run-credentials.ts`:1 | S3 |
| 22 | `packages/daemon/src/http/runs.ts`:9 | S1+S2 |
| 23 | `packages/daemon/src/http/surface-callback.ts`:1 | S4 (returns a `Response` instead of writing `res`) |
| 24 | `packages/daemon/src/http/terminals.ts`:31 | S1+S2 |
| 25 | `packages/daemon/src/http/tool-catalog.ts`:22 | S1 |
| 26 | `packages/daemon/src/http/xai.ts`:122 | S1 (touch only the `Express` type; its model constant is another job) |

Already converted (the example): `packages/daemon/src/http/message-relay.ts`.

NOT yours (Opus stages; leave untouched even if they import `express`): everything under `packages/http-kit/src`, `packages/server/src`, `packages/core/src/settings/express`, `packages/cms/src/{settings,forms,comments}/express`, `packages/commerce/src/http/payments-webhook.ts`, and in `packages/daemon/src/http`: `attachments.ts`, `frontend-sessions.ts`, `model-proxy.ts`, `surface-restoration.ts`, `tool-execution-routes.ts`. `packages/core/package.json` and the other `cms/package.json` exports are also Opus.

Notes on specific rows:
- `frontend-control.ts` (S1): `FrontendHttpExtension`'s `app: Express` becomes `app: Server`.
- `memory.ts`, `runs.ts`, `terminals.ts` (S1+S2): the S1 swap plus the one hand-written route each. `runs.ts`/`terminals.ts` read `input.query` through `rawInput`, which O-kit already moved to `readQuery`: do not change those parsers.
- `remote-run-events.ts` (S1+S3): the `NextFunction` middleware becomes a `ServerMiddleware`.
- `run-credentials.ts` (S3): `typeof req.query.contextRef === 'string'` → `typeof query.contextRef === 'string'` with `readQuery`; the owned-list handler becomes a `ServerHandler`.
