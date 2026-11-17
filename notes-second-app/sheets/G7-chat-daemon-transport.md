# G7: `@jini-ai/chat/transports/daemon-runs` (move, do not rewrite)

## Revision 3 (authoritative; revision-2 corrections folded into the steps below, which were rewritten in place)

- **Judge 3: the request contract.** `POST /api/runs` requires a non-empty `contextRef`
  (`packages/daemon/src/http/runs.ts:44,117-133`) and reads neither `prompt` nor `attachments`, so the transport takes
  a **required** host port `resolveRunInput` (no default). The real-parser test uses the exact export
  **`runStartRoute`** from `@jini-ai/daemon/http` (`packages/daemon/src/http/index.ts:70`; defined at `runs.ts:215`
  with `defineJsonRoute`, so it carries `parse`). Revision 2's "`parseRunStart` or the exported route spec" is replaced:
  `parseRunCreate` is not exported.
- **Judge 4, 18: one atomic move**, no thin re-export files, and the `packages/chat/package.json` edit is part of
  this sheet's own commit (COMMON rule 3). The revision-2 text "if `package.json` is coordinator-only at dispatch,
  STOP" is withdrawn.
- **Collision (Opus review):** the desktop-extraction plan's D5a and D5b also edit `packages/chat/package.json`, and
  xpkg C-CHAT-DEPS edits `packages/chat`. One run at a time on that file (`../INDEX.md` section 4); check at dispatch
  with the commands in Inventory and STOP (X4) if any of them has an open branch on these paths.
- `api:check` and `check:cross-package` are not root scripts (COMMON gates); acceptance uses block G and the repo gates.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g7-chat-daemon-transport`. Estimate: ~100k Sonnet.
Owner: `@jini-ai/chat`. Prerequisite: integration base; no open desktop D5a/D5b or C-CHAT-DEPS run on `packages/chat`.

## Why

`ChatTransport` (`packages/chat/src/core/transport.ts:97`) has no packaged implementation for the daemon's own
run API. `examples/reference-web/src/daemon-transport.ts` (283 lines) + `run-event-frames.ts` (26) are the only
one; a second app would copy them. `@jini-ai/chat/transports/http` is a different, assistant-specific client.

## Inventory

```sh
wc -l examples/reference-web/src/{daemon-transport,run-event-frames,daemon-transport.test}.ts     # 283, 26, 185
rg -n "^import|PlaygroundContext|fetchWithTimeout|FETCH_TIMEOUT_MS|__JINI|import\.meta|window\." examples/reference-web/src/daemon-transport.ts
rg -n "daemon-transport|run-event-frames" examples/reference-web/src -l
sed -n 225,250p examples/reference-web/src/daemon-transport.ts                   # the existing run-body encoder (:232-243)
rg -n "runStartRoute" packages/daemon/src/http/index.ts packages/daemon/src/http/runs.ts
sed -n 1,60p packages/core/src/contracts/server/json-route.ts                    # JsonRouteSpec.parse: the argument shape the test feeds
git log --oneline -5 -- packages/chat/src/core packages/chat/package.json        # anything mid-flight on these paths?
git branch -r --list '*d5a*' '*d5b*' '*chat-deps*'                                # open desktop D5a/D5b or C-CHAT-DEPS branches: STOP (X4)
```

Expected: imports `@jini-ai/platform/fetch-with-timeout` and `@jini-ai/core/net` (chat may import core, **not**
platform), and a `PlaygroundContext` (`project`, `model`, `reasoning`) that is host vocabulary.

## Target

`packages/chat/src/core/daemon-runs/{transport.ts, frames.ts}` (no `index.ts`: the export-map entry points at
`transport.ts`); export `./transports/daemon-runs` (`jini.entries`: universal). Public surface:

```ts
export interface DaemonRunsTransportPorts {
  readonly baseUrl: string;                                  // '' = same origin
  readonly fetch: typeof fetch;                              // host injects; timeouts are the host's wrapper
  readonly resolveRunInput: (required: { message: ChatSendInput }) =>
    { contextRef: string; body?: Record<string, unknown> } | Promise<{ contextRef: string; body?: Record<string, unknown> }>;
}
export function createDaemonRunsTransport(required: DaemonRunsTransportPorts, optional?: { readonly headers?: Readonly<Record<string, string>> }): ChatTransport;
```

Everything playground-specific (`PlaygroundContext`, project/model/reasoning mapping, daemon-origin globals)
stays in reference-web and reaches the transport through `resolveRunInput` / `baseUrl`. reference-web passes its
existing encoder (`daemon-transport.ts:232-243`); N4 passes NOTES' own. The quick-timeout wrapper stays a host
concern: reference-web passes `fetch: (i, init) => fetchWithTimeout(i, init, { timeoutMs })` for non-stream calls
**only if** the moved code can keep one `fetch` port; if stream and non-stream calls need different timeouts, add a
second optional port `fetchQuick` rather than importing platform. Keep optional values, fallbacks and error mapping
exactly as they are (lesson 7).

## Tests first

1. **Move the existing tests with the code** (`daemon-transport.test.ts`, 185 lines) to
   `packages/chat/src/core/daemon-runs/__tests__/`, rewritten for the package's Vitest runner, adapting only
   construction. Assertions unchanged. Test count before/after reported.
2. Add (fake `fetch` implementing the signature; no network): reconnect sends `last-event-id`; `stopRun`
   posts to the cancel path; **abort**: pre-aborted, aborted mid-stream, normal end, each asserting handlers
   called and reader released; a frame split across two network chunks parses the same as one chunk
   (lesson 18); a rejected `fetch`, a thrown string, a non-OK status each produce the documented `onError`;
   a `resolveRunInput` that throws or rejects produces `onError` and sends no request.
3. **Real-parser test, in `examples/reference-web`** (not in `packages/chat`, which must not import daemon): the
   transport's serialized start-run request, fed to `runStartRoute.parse` from `@jini-ai/daemon/http`, parses `ok`
   with the same `contextRef`; an empty `contextRef` from `resolveRunInput` is refused by the same parser.

## Steps (commit each; each green alone)

1. **One atomic move:** `git mv` the two source files and the test into `packages/chat/src/core/daemon-runs/`,
   already without the `@jini-ai/platform` import and `PlaygroundContext` (ports above); `exports` + `jini.entries`
   (+ `typesVersions` if the package uses it) in `packages/chat/package.json`; reference-web re-pointed to
   `@jini-ai/chat/transports/daemon-runs` with a small host file that builds the ports; the moved tests; the old
   example files deleted. No re-export file at the old path.
2. The new tests (2) and the real-parser test (3).
3. Changeset: `@jini-ai/chat` minor (new subpath). Update `packages/chat/source-map.md` if the package keeps one.

## Acceptance

Chat package gates; Jini repo gates + block G + block L; new-export import check from a consumer;
`examples/reference-web` typecheck + tests unchanged in count and green; reference-web's port-building file is
<= 60 lines. Deletion ledger: lines removed from reference-web.

## Not verified by the planner

The full body of `daemon-transport.ts` (only its first 30 lines and the encoder were read); whether it reads globals
at module scope (if so, they become arguments read at call time, not at import: lesson 3); `JsonRouteSpec.parse`'s
exact argument shape (read it in the inventory).
