# Admin SSE connection-pool exhaustion — RECURRENCE of the 2026-08-18 ADR, not a new bug

- **Date:** 2026-09-03
- **Status:** Documentation only, per dispatch. No application code touched.
- **Author:** Software Architect agent
- **Persona bootstrap:** `AI-Dev-Shop/agents/software-architect/skills.md` (v2.3.0) loaded in full.
- **Prior art (read before writing this):** `ADS-memory/reports/2026-08-17-vite-proxy-pool-saturation-investigation.md`,
  `ADS-memory/reports/2026-08-18-connection-pool-architecture-recommendation.md`,
  `ADS-memory/reports/2026-08-17-themes-screen-hang-investigation.md` (the original 60s-timeout fix).

## Headline finding

**This is not a new incident.** It is the exact failure mode the 2026-08-18 ADR diagnosed, for
which a fix (dev HTTP/2 via mkcert) was **built and verified working**, then **paused by owner
request the same evening** pending one open question that nobody ever resolved. The fix has sat
inert for 16 days:

```
$ ls apps/admin/.certs.disabled/
localhost-key.pem   localhost.pem      # dated 2026-08-27 — the mkcert cert from C1

$ ls apps/admin/.certs/
No such file or directory              # vite.config.ts's existsSync guard is currently FALSE
```

`apps/admin/vite.config.ts:45-50` gates HTTP/2 on `.certs/localhost.pem` + `.certs/localhost-key.pem`
existing; they don't, so the dev server has been running the plain-HTTP/1.1 fallback path since the
2026-08-18 revert, and every session since (including today's) has been exposed to the 6-connection
cap the ADR already fully diagnosed. The fastest fix here is not new work — it's finishing a
decision that was left half-made.

## Symptom (verified live, this session, 2026-09-03)

Admin at `http://localhost:5173/admin/ai-assistant?tab=admin` hangs on "Loading execution
settings…" / "Checking status…", surfacing:

> "the Tovu API did not respond within 60s — the browser may be out of free connections for this
> origin (try closing other admin tabs) or the server is unresponsive."

A peer session separately hit the same underlying exhaustion as a ~7-minute "Thinking…" stall in
the assistant chat after a tool call completed, and misattributed it to chat-runtime flakiness —
see "Cost of the misleading symptom" below.

## Evidence it is not the server (re-measured this session)

```
$ curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://127.0.0.1:3000/healthz
200 0.002169s

$ curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/readyz
200

$ lsof -iTCP:5173 -sTCP:LISTEN -P -n
node 58815 la 18u IPv6 [::1]:5173 (LISTEN)     # dev.mjs / Vite up

$ lsof -iTCP:5173 -P -n | grep ESTABLISHED | wc -l
6                                               # AT the per-origin cap, right now
```

Backend answers in single-digit milliseconds; the Vite dev origin is sitting at exactly Chrome's
6-connection ceiling at the moment this was captured. That is the whole bug in one measurement:
the server has spare capacity, the browser has none left to reach it with.

## Root cause, with citations

Two permanent-or-semi-permanent `EventSource` connections per tab, both same-origin against
`:5173` in dev:

- `apps/admin/src/lib/settings-events.ts:50` — `new EventSource(eventsUrl(workspaceId), { withCredentials: true })`.
  Opened once per authenticated tab from `apps/admin/src/App.hooks.tsx:101-104` (`useEffect`
  gated on `user`), **never closed by design** — the module doc (`settings-events.ts:16-23`)
  explains this is deliberate: `EventSource`'s own reconnect + `Last-Event-ID` replay is what makes
  the settings feed resume correctly after a drop, and closing it defeats that.
- `apps/admin/src/lib/assistant-transport.ts:266` — `new EventSource(`${RUNS_URL}/${runId}/events`)`,
  opened per `startRun`/`reattachRun` call. Unlike the settings feed this one **does** close itself
  (`finish()` at `assistant-transport.ts:270-275` calls `source.close()`, and an abort signal at
  `assistant-transport.ts:277-282` closes it too) — it is transient, alive only while a run is
  in flight.

Verified this session (not assumed): grepped `apps/admin/src` for `visibilitychange`/`pagehide` —
zero hits against either EventSource call site. Nothing suspends or closes either stream when a tab
is backgrounded. `subscribeToSettingsChanges`'s only call site is the one above (confirmed via
grep); the effect is keyed on `[user]` with a proper cleanup return, so even under React
`StrictMode`'s double-invoke a remount closes the prior connection before opening the next one — it
churns, it does not accumulate. No leak beyond the documented "1 socket per authenticated tab."

Chrome caps HTTP/1.1 at 6 concurrent connections per origin. `localhost:5173` is one origin, so N
admin tabs (or 2N with an active run) permanently occupy N of those 6 slots. Every other request —
including the Themes screen's `getPresentation()`, the execution-settings probe, the daemon status
check — then queues in the browser's own socket scheduler with no server-side symptom at all, and
times out at the existing 60s bound (`apps/admin/src/lib/api.ts`'s `DEFAULT_REQUEST_TIMEOUT_MS` /
`fetchOrThrowUnreachable`, shipped by the original `2026-08-17-themes-screen-hang-investigation.md`
fix — that fix made the failure *visible*, it never touched socket consumption).

## Is HTTP/2 actually blocked by this repo's proxy config? (re-verified against the installed package, not the docs)

The brief asked me to determine whether Vite's `server.proxy` (four entries: `/api`,
`/agent-icons`, `/theme-assets`, `/readyz`, plus `/mcp-ui` added since) forces a downgrade from
HTTP/2 to HTTP/1.1-over-TLS. Generic Vite documentation carries exactly that caveat ("this
downgrades to TLS only when the proxy option is also used" — Vite's own `server/node/http.ts`
JSDoc, current `main` branch). That caveat does **not** hold for what is actually installed here.
Read the real, installed code rather than trusting the doc comment:

```
$ cat apps/admin/node_modules/vite/package.json | grep version
  "version": "7.3.6",

apps/admin/node_modules/vite/dist/node/chunks/config.js:14966
async function resolveHttpServer(app, httpsOptions) {
  if (!httpsOptions) { ... return createServer(app); }        // plain HTTP
  const { createSecureServer } = await import("node:http2");
  return createSecureServer({ ...httpsOptions, allowHTTP1: true }, app);  // HTTP/2, h1 also allowed
}
```

`httpsOptions` (config.js:25447 area) is derived from `config.server.https` alone
(`resolveHttpsConfig(config.server.https)`) — `config.server.proxy` never enters this function or
its caller. So on Vite 7.3.6, turning on `server.https` gives a real HTTP/2 secure server with the
proxy fully intact. This matches — and is the same primary-source verification — the 2026-08-18
ADR's §2(c) finding ("the historical 'proxy downgrades HTTP/2' caveat is gone in this repo's
Vite"). I confirmed it independently rather than taking that report's word for it, since it
directly contradicts generic library documentation. **Contradiction to flag explicitly: if you
searched Vite's docs/JSDoc in isolation you would conclude HTTP/2 can't coexist with this repo's
proxy setup. That conclusion is wrong for the actual installed version.**

## Blast radius

- Every same-origin admin request queues once the 6-slot budget is consumed: execution settings,
  daemon readyz status, Themes screen `getPresentation()`, dashboard stat tiles, and any assistant
  turn's own status/run-start calls.
- Degrades **silently and progressively** with tab count — no error, no server log, nothing to grep
  for, until the 60s client-side timeout fires and prints a message that (correctly, but
  unhelpfully under pressure) blames both the network and the server.
- Not tab-count-alone: `2026-08-17-vite-proxy-pool-saturation-investigation.md` found a *second*,
  now-fixed contributor (`AssistantDock`'s unbounded 5s `/api/agents` poll with no abort/dedup) that
  made the same ceiling bite at 3-4 tabs instead of 6 — that fix is shipped and unrelated to the
  root cause here, which remains open.

### Cost of the misleading symptom

This is not just an inconvenience — the failure signature actively misdirects debugging effort.
Confirmed twice independently: today's live incident inspired an "is the daemon down?" check
(it wasn't — see the healthz/readyz measurements above), and a separate peer session's agent
attributed the identical exhaustion to "chat-runtime flakiness" after watching a run stall for
~7 minutes post-tool-call. Both investigations spent time on the wrong layer because the visible
error — a timeout with a plausible-sounding server-side explanation — does not point at the browser
socket pool that is actually responsible.

## Recommended fix

**Primary recommendation: re-enable the already-built, already-verified C1 fix from the 2026-08-18
ADR, and separately resolve the one open question that paused it — do not re-derive a new fix.**

Immediate action (already-tested, per that ADR's "Status" line: "C1 BUILT + VERIFIED"):

```
mv apps/admin/.certs.disabled apps/admin/.certs
# restart the dev server (SIGTERM the dev.mjs orchestrator, per reference_tovu_dev_server_restart —
# never kill child PIDs directly)
```

This is zero new application code — `vite.config.ts`'s `existsSync`-gated `httpsOptions` logic
(lines 38-50) is already committed and unchanged since it was written for C1. Effect (per the
prior ADR, and re-confirmed against the installed Vite source above): the origin's connection
ceiling goes from 6 to HTTP/2's per-connection stream limit (Node's default
`SETTINGS_MAX_CONCURRENT_STREAMS` = 100), which covers both SSE feeds, HMR, and the ESM module
burst simultaneously, with the proxy config fully intact.

**Before flipping it back on for good**, resolve the reason it was paused: the 2026-08-18 ADR
records an unexplained anomaly — 14 established `:5173` connections observed against a claimed
1-3 open tabs, more than either "N tabs" model predicts — and a live hypothesis (a concurrent
file-editing session driving Vite HMR reconnect bursts) that was never confirmed. Re-enabling
without at least a `chrome://net-export/` capture or a DevTools "Queueing" check risks shipping a
fix that appears to work and then mysteriously degrades again under whatever produced the 14-count
reading. Given the dev server is *currently* broken (sitting at the 6-connection cap as measured
above), the honest tradeoff is: re-enabling now is strictly better than the status quo even if the
anomaly is unresolved, but the anomaly should be chased down this time rather than left open a
second time.

**Production (C2, still unresolved as of 2026-08-18, unchanged by this session):** the container
terminates no TLS itself (`app.listen(port)` on a plain Express app); whatever fronts
`tovu.fly.dev` is out-of-tree per `fly.toml`'s own header (deploys come from a separate public
mirror repo). `fly.toml`'s `[http_service] force_https = true` means *something* — Fly's edge
proxy — already terminates TLS in front of this container, which is a strong prior that a
HTTP/2-capable terminator already exists (Fly Proxy is documented to terminate TLS for public apps
by default), but I could not confirm HTTP/2 negotiation specifically from Fly's public docs in this
session, and did not have live access to hit `tovu.fly.dev` and inspect the negotiated protocol.
**Recommend a five-minute live check** (`curl -so /dev/null -w '%{http_version}\n' --http2
https://tovu.fly.dev/healthz`, or the Protocol column in Chrome DevTools' Network panel against the
production admin) before assuming production either has or lacks this problem — do not guess
either direction.

### Alternatives considered (per the dispatch brief's list; (a)-(c) are the 2026-08-18 ADR's
### existing evaluation, summarized rather than re-litigated; (d)-(e) are new to this document)

| Option | What it solves | Cost / risk in this codebase | Verdict |
|---|---|---|---|
| **(a) `SharedWorker` + leader election, `BroadcastChannel` fan-out** | N tabs → 1 socket for the settings feed | Days: Firefox/Safari lack module-`SharedWorker` support, so the *fallback path is today's bug* — you'd ship the defect and a coordination layer on top of it. Full teardown in the 2026-08-18 ADR §2(a). | Reject for now — right pattern for a "many simultaneously visible tabs" requirement this product doesn't have yet. |
| **(b) Close on `visibilitychange`, reopen on focus** | Backgrounded tabs stop holding a socket | Silently breaks `settings-events.ts`'s own documented correctness guarantee: `Last-Event-ID` is only sent by `EventSource`'s *own* auto-reconnect, not a fresh instance, so a naive close/reopen means the server treats every reopen as `cursor = head` — revisions written while hidden are dropped with no error. Fixing that needs a **server route change** (accept the cursor as a query param, `EventSource` can't set headers) plus debounce plus a new regression test. Full teardown in ADR §2(b). | Reject as a first move — trades a loud failure for a silent one unless done fully. |
| **(c) HTTP/2 for the dev origin** (recommended) | Everything, at the transport layer — zero application code | Already built, already verified, already reverted; residual cost is only the unresolved 14-connection anomaly above. Prod half (C2) needs an owner confirmation of what fronts prod, not new code. | **Primary recommendation — see above.** |
| **(d) Replace SSE with WebSocket** | One connection, not subject to HTTP/1.1's *request* concurrency cap the same way (WS upgrades use their own socket, and Chromium's WS-specific per-host ceiling is materially higher than 6) | Real cost: both `settings-events.ts` and `assistant-transport.ts` are built directly on `EventSource`'s free reconnect-with-backoff and `Last-Event-ID` resume — a WebSocket gives you neither for free, so this is a from-scratch reconnect/resume protocol on the client *and* a server-side upgrade handler next to the existing SSE routes, for both streams. It also does not fix the *other* consumer of the same 6-slot budget in dev — HMR's own WebSocket and the ESM module burst are unaffected because they aren't the thing being replaced. | Reject — replaces a working, well-documented reconnect story with a hand-rolled one, to fix a problem (c) already fixes for free. Worth revisiting only if a future requirement needs true bidirectional push SSE can't do. |
| **(e) Long-poll with backoff** | Avoids holding a socket open between events | Turns a push model into a request-per-tick model — worse for `assistant-transport.ts`'s use case specifically, which streams `text_delta`/`thinking_delta` chunks at sub-second granularity; long-polling that would mean either high latency (slow poll) or *reintroducing* the same connection pressure at a different multiplier (fast poll). Also throws away `Last-Event-ID` resume for the settings feed, same correctness cost as (b), for no compensating benefit. | Reject — strictly worse than (b) on the one axis (b) was already rejected for, with none of (b)'s advantages. |

## What I could not verify

- The 2026-08-18 ADR's own open item — the 14-connections-vs-3-tabs anomaly — is still unresolved.
  I did not attempt to reproduce it (would require deliberately generating the concurrent-editing
  load hypothesized as the cause, which is out of scope for a documentation-only task).
- Production's actual TLS/HTTP-version posture (see C2 above) — flagged, not guessed.
- Whether Chromium counts the Vite HMR WebSocket against the same 6-socket HTTP/1.1 pool or a
  separate one — the 2026-08-18 ADR flags this as unverified too (§5.2); it doesn't change this
  document's conclusion since the two SSE streams alone reach the cap.

## Corrections to the dispatching brief

The brief's diagnosis (symptom, both file:line citations, the "not the server" measurements, and
the "6-connection cap" mechanism) all checked out — re-measured fresh this session, nothing
contradicted there. The one place worth flagging: the brief asked me to "determine whether the dev
server is HTTP/1.1 or HTTP/2" and treat that as open — it isn't open. This exact question was
already answered by the 2026-08-18 ADR (HTTP/2 is compatible with this repo's proxy setup, verified
against the installed Vite source), a fix was built and verified working, and the *only* reason
today's incident happened at all is that the fix was switched back off 16 days ago and never
revisited. The actionable next step is re-enabling existing work, not evaluating a new option.
