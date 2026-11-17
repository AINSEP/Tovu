# G1: notes-app adopts `@jini-ai/http-kit/node-bridge`; the example's own adapter is deleted

## Revision 3 (authoritative; the whole sheet was rewritten in place, no older step text remains)

Coordinator decision (`../INDEX.md` section 00, item 4): **no new adapter code anywhere.** Jini already ships the
`node:http` bridge: `@jini-ai/http-kit/node-bridge` (`packages/http-kit/src/node-bridge.ts:1-14`, export key
`./node-bridge` in `packages/http-kit/package.json`, `jini.entries` `node`). It matches on core's route table
(`createRouteTable`), so judge 21 (do not move route matching) is satisfied by construction. OD-N2 is **moot**.
`@jini-ai/node-adapters` is not involved (COMMON rule 5). Withdrawn from the old sheet: the "Owner: http-kit" line,
the three-line re-export step, the `packages/http-kit/src/node-server` target, the precedence change, the
`cookie-consent-standalone` README step and the http-kit changeset.

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g1-node-bridge`. Estimate: ~50k Sonnet (examples only).
Touches only `examples/notes-app/**`, plus one comment in `packages/core/src/contracts/server.ts` (step 4).
Prerequisites: N0 and N2 merged (N2 binds `serveAdminBundle` to N0's `onUnmatched`). Landed check (both print a line):

```bash
rg -n "onUnmatched" examples/notes-app/src
rg -n "serveAdminBundle" examples/notes-app/src
```

No hit: STOP (X2).

## Inventory (expected at the base; X3 on a mismatch)

```bash
wc -l examples/notes-app/src/node-server.ts examples/notes-app/src/node-server.test.ts   # ~182 (+N0 onUnmatched), ~163 (+N0 tests)
rg -n "node-server" examples packages -g '!**/node_modules/**'                           # main.ts, app.test.ts, node-server.test.ts, README.md:24, core server.ts:110
rg -n "^export (function|async function|interface)" packages/http-kit/src/node-bridge.ts # createNodeDispatcher, sendWebResponse, NodeDispatcher, NodeDispatchOptions, ...
sed -n 325,350p packages/http-kit/src/node-bridge.ts                                      # no `next` -> the bridge answers 404/405 itself
rg -n '"@jini-ai/http-kit"' examples/notes-app/package.json                                # already a dependency: nothing to add
```

## Design

`createNodeDispatcher({}, { onUnhandledError })` returns `{ server, handle }`. `server` is the `Server` that
`registerNotesApp({ app: server, ... })` already takes. `main.ts` keeps `listen` and `close` itself:

```
const dispatcher = createNodeDispatcher({}, { onUnhandledError: report });
await registerNotesApp({ app: dispatcher.server, kernel });
const http = createServer((incoming, out) => void routeRequest({ incoming, out, dispatcher }, { serveAdminBundle }));
http.listen(port, '127.0.0.1')  ...  close: http.close() + closeAllConnections()
```

`routeRequest` (new, `src/route-request.ts`, <= 40 lines): a `GET`/`HEAD` whose **raw** path (`incoming.url`, never a
parsed pathname: same reason as `node-bridge.ts:97-102`) starts with `/admin/` goes to `serveAdminBundle`;
everything else goes to `dispatcher.handle({ incoming, out })` **without** `next`.

Why not `handle(..., { next })` (the wording of the revision-3 remaining list): the bridge hands `next` every
unmatched request **and** the 405 case **and** every handler failure (`NodeDispatchOptions.next`, `node-bridge.ts:17`),
so a `next` hook would have to rebuild 404/405/500 that the bridge already answers. Routing `/admin/` before the
dispatcher keeps those answers in the bridge. N0's `onUnmatched` hook is deleted with the adapter.

## Tests first

1. **Characterization, green before any change:** the example's existing adapter tests
   (`node-server.test.ts`: dispatch with params, body, 404/405, HEAD, OPTIONS, `client.address`, two `Set-Cookie`,
   route list, duplicate registration, literal-over-param precedence in both orders) and N0's `onUnmatched` tests are
   re-pointed at the new composition (`createNodeDispatcher` + `routeRequest` + a test `createServer` on port 0) in a
   new `src/route-request.test.ts`. The `matchServerPath` describe block is **not** carried: core owns and tests it.
   **Any test that fails against the bridge is a behaviour gap: STOP and report it for http-kit's owner** (do not
   patch the bridge, do not weaken the test, do not keep the old adapter).
2. `route-request.test.ts` red-first: `GET /admin/x` reaches the bundle handler; `POST /admin/x` reaches the dispatcher
   (404); `GET /admin/../api/entities/note` and `%2e%2e` forms never reach the bundle handler outside `/admin/`; a
   bundle handler that throws answers 500 in plain words and is reported, never swallowed.

## Steps (commit each; each green alone)

1. Add `src/route-request.ts` + `src/route-request.test.ts` (tests above, green against the bridge).
2. `main.ts` and `app.test.ts` switch to `createNodeDispatcher` + `routeRequest`; **delete** `src/node-server.ts` and
   `src/node-server.test.ts` and the `src/node-server.ts` row in `GAPS.json` in the same commit. Test count before and
   after in the report (the carried tests must all be present).
3. README: the "Routes" row (`README.md:24`) names `@jini-ai/http-kit/node-bridge`.
4. `packages/core/src/contracts/server.ts:110`'s note names `@jini-ai/http-kit/node-bridge` instead of the deleted
   example path (comment only; core gates).

## Acceptance

Example-server gates; `gaps` (one row fewer); core gates for the comment; N5 e2e unchanged and green if it exists.
Deletion ledger: `node-server.ts` and its test leave the example (~180 + ~160 lines). No `package.json` change.

## Not verified by the planner

Whether the bridge sets `client.address` from the socket the way the example adapter does, and whether it closes
keep-alive sockets on `close()` (the composition owns `closeAllConnections()`): step 1 finds out; a gap is a STOP.
