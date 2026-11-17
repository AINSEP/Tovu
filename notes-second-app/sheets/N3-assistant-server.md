# N3: the assistant backend, wired from the daemon preset and the entries tool registrations

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 11: prerequisite `G19-entry-tool-body.md`.** `collections_entry_update` forwards title, fields and expected
version only (`packages/cms/src/entries/tool-registrations.ts:177-191`), so the assistant cannot edit a note's body.
Landed check: `rg -n "body" packages/cms/src/entries/tool-registrations.ts` shows the update handler forwarding it.

**Judge 16: characterize, never invent (lesson 31).** Delete the expected "tool-permission denial code" and
"conflict result". First pin what happens today, through the real delegated route: the domain registrations use an
allow policy (`packages/core/src/registration-kit.ts:539`); a service failure thrown by `fromResult` is not a
`ToolInputError`, so the executor classes it internal and the route answers its internal-error envelope. Record the
exact status, code and text. A friendlier stale-write answer is gap **G21** (owner: cms entries tools: throw
`ToolInputError` for a version conflict), not part of this sheet. Authorization mutations use the evaluator's real
result shape `{ allowed, reason }`.

**Judge 15: PARTIAL in revision 2.** Remove "fall back to default security": strict mode is required, and a failure
to start in strict mode is a STOP. The MCP callback credential (issued per run through the executor's credential
resolver, `packages/daemon/src/agent-executor/contracts.ts:441-463`, never the host's inbound API token) is **not
designed yet**; this sheet may not be dispatched until `../INDEX.md` lists finding 15 as closed. The test it will
need: a real MCP callback from the spawned server authenticates with the run-scoped credential and is refused with the host token.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/notes-n3-assistant`. Touches only `examples/notes-app/**`.
Prerequisite: N1 merged (N2 not needed). Estimate: ~120k Sonnet.

## Goal

An agent run can list, create, update, publish and unpublish notes through tools. Nothing new is invented:
tools = `buildEntriesRegistrations` (`@jini-ai/cms/entries`), execution = the daemon's `ToolExecutor`
(`@jini-ai/server` `createLocalNodeDaemon({ toolRegistrations })`), agent access = the `jini-mcp` bin
(`@jini-ai/mcp`). The browser reaches the run API on the app's own origin.

## Inventory

```sh
sed -n 120,225p packages/server/src/create-local-node-daemon.ts     # config: dataDir, open, packs, security, agentExecutor, onRunStarted, resolveRunInput, toolRegistrations, resolveDelegatedPrincipal, discoveryFile, features
rg -n "function localSecurity" -A 25 packages/server/src/create-local-node-daemon.ts
rg -n "tokenEnvVar|authorization|bearer" -i packages/http-kit/src/api-security-middleware.ts | head -20
sed -n 30,75p packages/cms/src/entries/tool-registrations.ts         # EntriesToolDeps: authorize, workspaceId, clock, idGen, outbox, entryRepo, contentTypeRepo
sed -n 40,60p packages/daemon/src/http/delegated-tools.ts            # DelegatedToolExecuteRequest { runId, toolUseId, toolId, input }
sed -n 390,500p examples/reference-web/src/daemon.ts                 # how the preset, mcpJsonInjection and onRunStarted are wired
sed -n 40,115p examples/minimal-host/src/index.ts                    # scripted onRunStarted + createAgentExecutor pattern
node -e 'const j=require("./packages/mcp/package.json");console.log(j.bin, j.exports["./bin"])'
rg -no "/api/[A-Za-z0-9/_:\$\{\}.-]+" examples/reference-web/src/daemon-transport.ts | sort -u   # the run API paths a chat transport calls
```

Expected: `toolRegistrations?: readonly ToolRegistration[]`; `resolveDelegatedPrincipal?: (request) => Principal`;
the config doc names feature keys `terminal` and `daemonDb`; `@jini-ai/server` lists `express` as a peer.
Write the run-API path list into the report: it is the proxy allow-list below.

## Design

```
main.ts
  deps = createAppDeps({ kernel })                       (N0)
  assistant = await startAssistant({ dataDir, open, toolDeps, env }, { runDriver? })
  registerDaemonProxy({ app, upstream: assistant.url, token, allow: RUN_API_ROUTES })
```

| File | Content | Limit |
|---|---|---|
| `src/assistant.ts` | `startAssistant(required, optional = {}): Promise<{ url: string; stop(): Promise<void> }>`. Calls `createLocalNodeDaemon({ dataDir, open, packs: [], host: '127.0.0.1', port: 0, discoveryFile: false, features: { terminal: false, daemonDb: false }, security: <sidecar-strict with a token minted per boot via `crypto.randomUUID()`, if `localSecurity` supports passing it; else the default mode and say so>, toolRegistrations: buildEntriesRegistrations(toolDeps), resolveDelegatedPrincipal: () => OWNER_PRINCIPAL, agentExecutor: <as minimal-host>, onRunStarted: optional.runDriver ?? undefined, resolveRunInput: <prompt + cwd = a per-boot temp working dir> })`. | <= 120 |
| `src/gaps/mcp-bin.ts` | `// GAP: G8`. `resolveJiniMcpBin({ resolve = import.meta.resolve, exists = existsSync })` -> `{ ok: true, command: process.execPath, args: [path] } \| { ok: false, missingPath }` using the package's own `./bin` export (no repo-relative path). | <= 40 |
| `src/gaps/daemon-proxy.ts` | `// GAP: G9`. `registerDaemonProxy({ app, upstream, token, allow }, optional = {})`: for each `{ method, path }` in `allow`, a `Server` route that forwards to `new URL(<same path with params substituted>, upstream)`. | <= 90 |
| `src/assistant-policy.ts` | `OWNER_PRINCIPAL`, the `AuthorizeFn` adapter already in `ports.ts` reused for tools (one source of truth: do not write a second policy). | app policy |

### Proxy contract (lessons 13, 14, 18)

- **Target** is always `upstream` (a constant captured at boot) + the **route's own registered path**. Never
  build the target from `request.url`'s host, and never forward a path that is not in `allow`.
- **Request**: forward method, body stream (`duplex: 'half'`) and only these headers: `content-type`,
  `accept`, `last-event-id`. Add `authorization: Bearer <token>` server-side. Drop `cookie`, `origin`, `host`.
- **Response commitment**: status and headers are sent when the upstream responds; copy only `content-type`,
  `cache-control`, and SSE-related headers; never copy `set-cookie` or echo the token.
- **Production**: the upstream body is returned as the `Response` body (streamed by the Node adapter).
- **Cancellation**: pass `request.signal` to the upstream `fetch`; when the browser disconnects the upstream
  stream is aborted. No write happens after abort.
- **Not proxied**: `/api/delegated-tool-calls` (only the local `jini-mcp` child calls the daemon, directly on
  loopback), terminal, daemon-db, anything else.
- The origin guard from N0 wraps the proxy routes like every other route.

## Tests first (`node --test`; scripted run driver; no vendor CLI)

| # | Test | Must fail when |
|---|---|---|
| T1 | `assistant.tools.test.ts`: start with a `runDriver` that parks until cancel; `POST <daemon>/api/runs` -> run id; `POST <daemon>/api/delegated-tool-calls` `{ runId, toolUseId:'t1', toolId:'collections_entry_create', input:{ type:'note', slug:'from-agent', title:'From agent' } }` (+ bearer) -> success and the note exists in the repo with `version` 1; then `collections_entry_update` with the wrong `expectedVersion` -> a conflict result and the row unchanged. | tools are not registered, or bypass the service's version check |
| T2 | same file, deny tests first (AP7): `resolveDelegatedPrincipal` returning a non-owner -> the create call is denied with the tool-permission error code and **no row is written**; unknown `toolId` -> rejected; missing/wrong bearer in strict mode -> 401. | `authorize` is replaced by allow-all, or the principal is ignored |
| T3 | `assistant.contract.test.ts` (AP5): `buildEntriesRegistrations(deps).map(r => r.descriptor.id)` `toEqual` the inline literal of the 5 ids; `features` passed to the preset `toEqual({ terminal: false, daemonDb: false })` (capture via an injected `createDaemon` fake in `optional`). | a tool is added/removed silently or a disabled feature is re-enabled |
| T4 | `daemon-proxy.test.ts` with a fake upstream (`node:http` server in the test): allowed path forwards method/body and returns the upstream status; the upstream receives the bearer and **does not** receive `cookie`/`origin`; the client response has no `authorization`/`set-cookie`; a path not in `allow` -> 404 from the app without any upstream request; `GET /api/runs/..%2f..%2fapi%2fdelegated-tool-calls` -> 404; SSE: upstream writes 2 events 50 ms apart (fake timers or awaited writes), the client reads the first before the second is written (streaming, not buffered). | the allow-list, header filter or streaming is broken |
| T5 | same file: abort the client request mid-stream -> the fake upstream sees its socket closed and the proxy's listener count returns to 0; pre-aborted request -> no upstream call (AP10). | `request.signal` is not passed |
| T6 | `mcp-bin.test.ts`: `resolve` fake returning a file URL + `exists` true -> ok with that path; `exists` false -> `{ ok:false, missingPath }`; `resolve` throwing -> `{ ok:false }` (no throw). | the missing-build case throws at spawn time |

## Steps (commit each)

1. Add deps: `@jini-ai/server`, `@jini-ai/daemon`, `@jini-ai/agent-runtime`, `@jini-ai/mcp`, `express`
   (peer of the preset; never imported by the app; README notes it as G9). `pnpm install`. Typecheck green.
2. T3 + T1 + T2 red -> `assistant.ts`, `assistant-policy.ts`. 3. T6 red -> `mcp-bin.ts`; pass the injection to
   the agent executor exactly as `reference-web/src/daemon.ts` does (cite the lines you mirrored).
4. T4 + T5 red -> `daemon-proxy.ts`. 5. Wire into `main.ts` behind `--assistant` (default on); graceful stop
   order: app listener, then `assistant.stop()`, then the database. 6. `GAPS.json`, README.

## Acceptance

Example-server gates + `gaps`. `scripts/smoke.ts` still passes with the assistant on. `rg -n "from 'express'"
examples/notes-app/src` is empty. Report the daemon's `activeFeatures` at boot.

## Not verified by the planner

Whether `security` can carry a per-boot token (the config doc says the token comes from an env var name:
then set that variable in the `env` snapshot passed to the preset, not in `process.env`); the result shape of
a delegated tool call; the `Principal` type's fields; the `mcpJsonInjection` option names.
