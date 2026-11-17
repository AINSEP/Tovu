# G7: `@jini-ai/chat/transports/daemon-runs` (move, do not rewrite)

## Revision 2 corrections (authoritative; they replace the steps they name)

**Judge 3 (blocker): the request contract.** `POST` run start requires a non-empty `contextRef`
(`packages/daemon/src/http/runs.ts:44,117-133`) and reads neither `prompt` nor `attachments`. "Prompt + attachments
only" cannot start a run. The transport therefore takes a **required** host port:
`resolveRunInput(required: { message: ChatSendInput }): { contextRef: string; body?: Record<string, unknown> } | Promise<…>`.
There is no default. `reference-web` passes its existing encoder (`examples/reference-web/src/daemon-transport.ts:232-243`);
N4 passes NOTES' own. Add a test that feeds the transport's serialized request into the **real** daemon parser
(`parseRunStart` or the exported route spec; import it from `@jini-ai/daemon/http` in a test of the example, not of
`packages/chat`) and gets a started run.

**Judge 4, 18 (blocker): one atomic move.** Replace steps "move", "remove platform import", "re-export files" with a
single commit that contains: the new file in `packages/chat` already **without** the `@jini-ai/platform` import (its
needs arrive as ports), the `exports` entry and `jini.entries` line in `packages/chat/package.json`, `reference-web`
re-pointed to the package entry, the moved tests, and the deletion of the example file. No thin re-export file. The
manifest edit is part of this sheet (COMMON rule 3); if lane rules still forbid it at dispatch, STOP before step 1.

---

Inherits `COMMON.md`. Repo: Jini. Branch: `feat/gap-g7-chat-daemon-transport`. Estimate: ~100k Sonnet.
Owner: `@jini-ai/chat`. Prerequisite: integration base; check C-CHAT-DEPS overlap (below).

## Why

`ChatTransport` (`packages/chat/src/core/transport.ts:97`) has no packaged implementation for the daemon's own
run API. `examples/reference-web/src/daemon-transport.ts` (283 lines) + `run-event-frames.ts` (26) are the only
one; a second app would copy them. `@jini-ai/chat/transports/http` is a different, assistant-specific client.

## Inventory

```sh
wc -l examples/reference-web/src/{daemon-transport,run-event-frames,daemon-transport.test}.ts     # 283, 26, 185
rg -n "^import|PlaygroundContext|fetchWithTimeout|FETCH_TIMEOUT_MS|__JINI|import\.meta|window\." examples/reference-web/src/daemon-transport.ts
rg -n "daemon-transport|run-event-frames" examples/reference-web/src -l
git log --oneline -5 -- packages/chat/src/core packages/chat/package.json      # is C-CHAT-DEPS mid-flight on these paths?
```

Expected: imports `@jini-ai/platform/fetch-with-timeout` and `@jini-ai/core/net` (chat may import core, **not**
platform), and a `PlaygroundContext` (`project`, `model`, `reasoning`) that is host vocabulary.

## Target

`packages/chat/src/core/daemon-runs/{transport.ts, frames.ts, index.ts}`; export `./transports/daemon-runs`
(`jini.entries`: universal). Public surface:

```ts
export interface DaemonRunsTransportPorts {
  readonly baseUrl: string;                                  // '' = same origin
  readonly fetch: typeof fetch;                              // host injects; timeouts are the host's wrapper
  readonly buildRunBody?: (required: { input: StartRunInput }, optional?: Record<string, never>) => Record<string, unknown>; // host context -> request body; default: prompt + attachments only
}
export function createDaemonRunsTransport(required: DaemonRunsTransportPorts, optional?: { readonly headers?: Readonly<Record<string, string>> }): ChatTransport;
```

Everything playground-specific (`PlaygroundContext`, project/model/reasoning mapping, daemon-origin globals)
stays in reference-web and is passed through `buildRunBody`/`baseUrl`. The quick-timeout wrapper stays a host
concern: reference-web passes `fetch: (i, init) => fetchWithTimeout(i, init, { timeoutMs })` for non-stream
calls **only if** the moved code can keep one `fetch` port; if stream and non-stream calls need different
timeouts, add a second optional port `fetchQuick` rather than importing platform. Keep optional values,
fallbacks and error mapping exactly as they are (lesson 7).

## Tests first

1. **Move the existing tests with the code** (`daemon-transport.test.ts`, 185 lines) to
   `packages/chat/src/core/daemon-runs/__tests__/`, adapting only construction. They must pass unchanged in
   assertions. Test count before/after reported.
2. Add (fake `fetch` implementing the signature; no network): reconnect sends `last-event-id`; `stopRun`
   posts to the cancel path; **abort**: pre-aborted, aborted mid-stream, normal end, each asserting handlers
   called and reader released; a frame split across two network chunks parses the same as one chunk
   (lesson 18); a rejected `fetch`, a thrown string, a non-OK status each produce the documented `onError`.
3. `buildRunBody` default: body `toEqual` an inline literal (AP5).

## Steps (commit each; each green alone)

1. Copy-free move: `git mv` the two source files and the test into `packages/chat/src/core/daemon-runs/`;
   leave **thin re-export files** at the old reference-web paths so reference-web still compiles. Add the
   `exports` + `jini.entries` + `typesVersions` (if the package uses it) entries in this same commit. If
   `package.json` is coordinator-only at dispatch, STOP after preparing the diff and report it.
2. Replace platform/core-net imports and `PlaygroundContext` with the ports above; reference-web's re-export
   file becomes the place that builds the ports (its behaviour unchanged; its own tests still green).
3. Add the new tests. 4. Changeset: `@jini-ai/chat` minor (new subpath). 5. Update `packages/chat/source-map.md`
   if the package keeps one.

## Acceptance

Chat package gates; Jini repo gates (`check:cross-package`: no new edge; `api:check`: one intended addition);
`examples/reference-web` typecheck + tests unchanged in count and green; reference-web's `daemon-transport.ts`
is now <= 60 lines of port construction. Deletion ledger: lines removed from reference-web.

## Not verified by the planner

The full body of `daemon-transport.ts` (only its first 30 lines were read); whether it reads globals at module
scope (if so, they become arguments read at call time, not at import: lesson 3).
