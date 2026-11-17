# G1: a packaged `Server` adapter for `node:http`

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g1-node-server`. Estimate: ~70k Sonnet.
Owner: `@jini-ai/http-kit` (OD-N2 must be answered "http-kit"; otherwise do not run). Prerequisite: N0 merged.

## Inventory

```sh
wc -l examples/notes-app/src/node-server.ts examples/notes-app/src/node-server.test.ts          # 182 (+N0's cookie fix), 163 (+1 test)
sed -n 1,60p packages/core/src/contracts/server/conformance.ts                                  # what the conformance suite takes
rg -n "node-server" examples packages -l -g '!**/node_modules/**'
node -e 'const j=require("./packages/http-kit/package.json");console.log(Object.keys(j.exports), j.jini)'
rg -n "node:http" examples/cookie-consent-standalone/server.mjs | head -3
```

## Target

`packages/http-kit/src/node-server/{node-server.ts, index.ts}`; export `./node-server` (`jini.entries`: node).
Surface (unchanged from the example): `createNodeServer(required = {}, optional = {}): NodeServer` where
`NodeServer extends Server` adds `listen({ port }, { host? })` -> `{ port }` and `close()`.
Imports: `node:http`, `@jini-ai/core/contracts/server` only.

Contract points to state in the file header and test (they are decided here, before first publish):
- **Route precedence:** when a literal and a `:param` pattern both match, the literal wins at the first
  differing segment, regardless of registration order (notes-app-review finding 4). If today's adapter uses
  registration order, change it and keep notes-app's routes passing.
- Duplicate `method + path` registration throws at registration time.
- `HEAD` falls back to `GET` without a body; unknown path 404; known path, other method 405 with `allow`.
- Multiple `Set-Cookie` stay separate; response streaming awaits `drain` (finding 6's second half).
- Client disconnect aborts `request.signal`.

## Tests first

1. Run `@jini-ai/core/contracts/server/conformance` against `createNodeServer` (and keep its broken-adapter
   self-test, AP12: if the suite has none, add one deliberate defect per check in this package's test).
2. Move `node-server.test.ts` with the code; add: precedence (`/notes/new` vs `/notes/:slug`, both
   registration orders), duplicate registration throws, backpressure (a slow consumer does not buffer an
   unbounded body: write 10 MB, assert `drain` awaited via a counting fake socket or bounded `writableLength`),
   `listen` on port 0 returns the real port, `close` resolves with open keep-alive sockets.

## Steps (commit each)

1. `git mv` the adapter + test into http-kit; leave `examples/notes-app/src/node-server.ts` as a 3-line
   re-export; add `exports`/`jini.entries` in the same commit; notes-app gains nothing new (http-kit is
   already its dependency).
2. Precedence + drain changes with their tests. 3. Conformance wiring.
4. notes-app imports `@jini-ai/http-kit/node-server` directly; delete the re-export file and its `GAPS.json`
   row. 5. `cookie-consent-standalone`: leave as is, add one README line pointing at the adapter (it is
   `.mjs` with its own purpose). 6. Changeset: `@jini-ai/http-kit` minor. Update
   `core/src/contracts/server.ts`'s agent note to name the package subpath instead of an example path.

## Acceptance

http-kit gates; Jini repo gates; notes-app gates + `gaps` (one row fewer); N5 e2e unchanged and green if it
exists. Deletion ledger: 182+ lines leave the example.

## Not verified by the planner

Whether http-kit's root pulls Express types into every subpath's `.d.ts` (the new subpath must not: check the
emitted `dist/node-server/*.d.ts` for `express`); the conformance suite's exact entry signature.
