# ADR (advisory): Admin origin connection-pool exhaustion — SSE vs. HTTP/2

- **Date:** 2026-08-18
- **Status:** C1 BUILT + VERIFIED, then TEMPORARILY REVERTED TO HTTP by owner request (2026-08-18, same evening). Not abandoned — paused pending the open question below. Reason for the pause: the owner questioned whether "too many idle tabs" (this ADR's §1.2 accounting) is really the full story, since a live check found 14 established connections on `:5173` against a claimed 1-3 open tabs — more than either number predicts. Leading unverified hypothesis: heavy concurrent file-editing (a separate session doing unrelated refactor work in the same repo) drives Vite's file-watcher to trigger dev-server restarts / HMR reconnect bursts, which can spike connection usage from very few tabs. Not confirmed — nobody has caught it happening live yet.
  - **Current live state:** `apps/admin/vite.config.ts` still has the `httpsOptions`/fallback code from C1, unchanged. The cert files were moved from `apps/admin/.certs/` to `apps/admin/.certs.disabled/` — since the code does `existsSync` on the original path, this alone makes the dev server fall back to plain HTTP on next restart (Vite's own config-file-change watcher was used to force that restart; no code was touched). `http://localhost:5173` works, `https://` does not.
  - **To re-enable:** `mv apps/admin/.certs.disabled apps/admin/.certs` then touch `vite.config.ts` (or just restart the dev server) — no code change needed, this is designed to be reversible in one command.
  - **Still not committed.** Nothing from C1 has ever been committed.
- **Status (design):** Proposed (research-and-recommend only; no code written)
- **Author:** Software Architect agent
- **Scope:** `apps/admin/**` dev topology + Tovu deployment topology
- **Persona bootstrap:** `AI-Dev-Shop/agents/software-architect/skills.md` loaded in full.

## Workflow deviation (declared)

This is a Coordinator-directed research task, not a Speckit pipeline feature. There is no
`spec-manifest.md`, no Planning Preflight, no `system-blueprint.md`, and no `NNN-<feature>`
pipeline directory. Steps 0/1/5 of the Software Architect workflow are therefore N/A, and this
artifact is written in the reduced shape the directive asked for (context / options /
recommendation / consequences / open risks) rather than the full `adr-template.md`. Implementation
Outline: SKIP — no implementation is being authorized here. Critical Internal Constraints: NOT
TRIGGERED — no unit is being designated.

---

## 1. Context

### 1.1 The failure

Chrome enforces ~6 simultaneous TCP connections per origin under HTTP/1.1. Every persistent
`EventSource` holds one for its entire lifetime. Once enough of them accumulate on one origin,
every *other* request to that origin queues in the browser's socket pool with no error and no
server-side activity — it simply never starts.

`apps/admin/src/lib/api.ts` already converts that from a silent permanent hang into a visible
error at 60s (`DEFAULT_REQUEST_TIMEOUT_MS`, `fetchOrThrowUnreachable`, `REQUEST_TIMEOUT_CODE`).
That fix is shipped and is *not* under evaluation here. It makes the failure legible; it does not
reduce socket consumption by one byte.

### 1.2 Measured connection accounting (verified in-repo)

**`subscribeToSettingsChanges` has exactly ONE production call site.**

- `apps/admin/src/App.hooks.tsx:96`, inside `useAdminSession`, `useEffect` gated on `user`.
- Every other hit in the repo is `apps/admin/src/lib/__tests__/settings-events.unit.test.ts`.

So it is not N subscriptions per tab — it is **one per authenticated tab**, opened at app root and
held for the session. `App.hooks.tsx`'s own comment explains why it is mounted at the root rather
than in `SettingsUi`: a change can arrive while the operator is on any page.

There is a **second** `EventSource` in the admin, not mentioned in the original investigation:

- `apps/admin/src/lib/assistant-transport.ts:255` — `subscribeToRun`, on `/api/runs/:id/events`
  (`RUNS_URL = "/api/runs"`, same origin).
- This one **does** close itself: `finish()` calls `source.close()`, and an `abort` signal closes
  it too. It is transient — alive only while an assistant run is in flight.

Per-tab steady state, therefore:

| Consumer | Sockets | Lifetime | Origin |
|---|---|---|---|
| Settings change feed (`settings-events.ts`) | 1 | Whole authenticated session — never closed by design | dev `:5173`, prod `:3000` |
| Assistant run feed (`assistant-transport.ts`) | 1 | Only during an active run; closed on `done`/`abort` | same |
| Vite HMR WebSocket | 1 | Whole session | dev `:5173` only |
| Vite ESM module requests | burst (hundreds, short-lived) | cold load / HMR | dev `:5173` only |

**This arithmetic explains the live incident exactly.** Six admin tabs, or five tabs plus one
active assistant run, consumes the entire budget for that origin. The Themes screen's
`getPresentation()` then queues behind them forever. No bug is required — the design is simply
1 permanent socket × N tabs against a hard ceiling of 6.

React `StrictMode` **is** enabled (`apps/admin/src/main.tsx:19`), so effects double-invoke in dev.
The subscription's disposer (`() => source.close()`) runs on the intermediate cleanup, so this is
net-neutral rather than a leak — but it does mean a brief 2-socket transient on every mount.

### 1.3 Topology (verified, not assumed)

**Dev.** `apps/admin/vite.config.ts` — Vite on `:5173`, `base: "/admin/"`, `server.proxy`
forwarding `/api`, `/agent-icons`, `/theme-assets`, `/readyz` to `http://localhost:3000` with
`changeOrigin: false`. The browser's origin is therefore `http://localhost:5173`, and **every
admin request plus both SSE streams plus HMR share that one origin's 6-socket budget.**

There is also an opt-in dev-proxy mode (`TOVU_ADMIN_DEV_PROXY_URL`,
`src/server/middleware/admin-static.ts`). It issues a **302 redirect** to Vite rather than
proxying bytes, so the browser still lands on `:5173`. It does not change the origin analysis.

**Prod.** One container. `docker-compose.yml` publishes `${TOVU_PORT:-3000}:3000`; `Dockerfile`
`EXPOSE 3000`; `src/index.ts:291` is a plain `app.listen(port)` on an Express app. **There is no
TLS anywhere in this repo and no HTTP/2 anywhere in this repo** — I searched for `http2`,
`createSecureServer`, nginx/Caddy/Traefik configs and found none outside `node_modules`. The site
and the built admin SPA are served by the same server on the same origin, so in production the
6-socket budget is shared between the admin and the public site.

Two things worth flagging as implicit dependencies on a TLS terminator that the repo does not ship:

- `src/server/middleware/dev-auth.ts:77,82` sets the session cookie with `Secure`. On any
  non-localhost deployment served over plain HTTP, the browser **discards** that cookie. Something
  must already be terminating TLS in front for a real deploy to work at all.
- `src/server/routes/admin/settings/events.ts:138` sets `X-Accel-Buffering: no`, whose only
  consumer is nginx — evidence the design already anticipates a reverse proxy.

**I could not verify the owner's actual production TLS setup from this repo, because it is not in
this repo.** The container terminates nothing. Whatever fronts it is out-of-tree. That uncertainty
is material to option (c) and is called out again in §5.

---

## 2. Options considered

### (a) One shared SSE connection across tabs via `SharedWorker` + leader election

**What it solves.** N tabs collapse to 1 socket for the settings feed, regardless of visibility.
The strongest possible reduction and the only one that helps when many tabs are *simultaneously
visible* (side-by-side windows, multi-monitor).

**What it does not solve.** Nothing else on the origin. The run feed, the HMR socket, and the
several-hundred-request Vite module burst are all untouched. The 6-socket ceiling still stands;
this just leaves ~1 more socket free under it.

**Codebase-specific gotchas.**

1. **The fallback path is today's bug.** `SharedWorker` is absent in Firefox private browsing and
   in Safari before 16, so shipping (a) means shipping *both* the worker path and the current
   per-tab path — and the fallback still exhausts the pool. You add a coordination protocol and
   keep the defect.
2. **Module workers.** Vite's idiomatic form is
   `new SharedWorker(new URL("./x.ts", import.meta.url), { type: "module" })`. Firefox does not
   support **module** SharedWorkers at all, so a Firefox-correct build needs a classic-worker
   bundle — a real build-config detour in a repo whose Vite config is already carrying four
   hand-annotated workarounds.
3. **Fan-out to a bus.** The subscriber side is `publishSettingsRefresh` on
   `settings-refresh-bus.ts`, which is per-tab. The worker would need `BroadcastChannel` (or
   worker ports) to re-publish into every tab's bus — a second coordination surface on top of
   leader election.
4. `withCredentials: true` must keep working from worker scope. It should (same-origin cookie
   jar), but it is unverified here and would need a live check.

**Cost.** Highest. New module, leader election, liveness/failover when the leader tab closes,
fallback path, `BroadcastChannel` fan-out, and tests for all of it. Days, not hours.

### (b) Close the feed on `visibilitychange`, reopen on foreground

**What it solves.** Backgrounded tabs stop holding a socket. Since the realistic failure mode is
"I have six admin tabs open and I'm looking at one," this directly addresses the observed
incident.

**The gotcha that makes this much more expensive than it looks.**

`settings-events.ts`'s header comment leans on `Last-Event-ID` for correctness: *"a dropped
connection resumes at the revision it left off rather than silently skipping the writes that
happened in the gap."* That guarantee **does not survive an explicit close/reopen.**

`Last-Event-ID` is sent only by `EventSource`'s own automatic reconnect of the *same object*. A
freshly constructed `EventSource` sends no such header. And the server reads the header and
nothing else:

```
src/server/routes/admin/settings/events.ts:151
const resumeFrom = Number(req.headers["last-event-id"]);
const head = await deps.settingsRepo.maxRevisionSeq();
let cursor = Number.isFinite(resumeFrom) && resumeFrom >= 0 ? Math.min(resumeFrom, head) : head;
```

With no header, `cursor = head` — **every revision written while the tab was hidden is skipped.**
The tab comes back foregrounded, reconnected, looking healthy, and silently missing exactly the
changes it was hidden for. That is a worse failure than the one being fixed, because it is
invisible.

Making (b) correct therefore requires all of:

- client-side tracking of `event.lastEventId` (available on the `MessageEvent`, currently unread);
- a **server route change** to accept the cursor as a query parameter, since `EventSource` cannot
  set request headers — with the same clamp-into-ledger validation the header path already has;
- debounce on `visibilitychange` so alt-tabbing does not produce a reconnect storm (each reopen is
  a fresh auth + `authorize()` + `maxRevisionSeq()` round trip);
- a regression test proving a revision written while hidden is delivered on reopen.

So it is a client change *and* a server API change *and* a correctness test — not a small client
tweak.

**What it does not solve.** Many simultaneously-*visible* tabs. Single-tab dev contention. The run
feed. The module burst.

### (c) Move to HTTP/2

**What it solves.** Everything, at the root. HTTP/2 multiplexes all streams over a single TCP
connection, so the 6-per-origin cap ceases to exist for that origin: both SSE feeds, the HMR
socket, and the module burst all share one connection. It is a transport/config change with **zero
application code**, which means zero new failure modes in `settings-events.ts`, no leader
election, no cursor protocol, and no fallback path that still has the bug.

**Dev — two findings that make this much cheaper than the brief assumed.**

1. **The historical "proxy downgrades HTTP/2 to HTTP/1.1" caveat is gone in this repo's Vite.**
   That was a Vite 2/3-era limitation and it was my main worry, since this config has four proxy
   entries. Verified against the installed **Vite 7.3.6**: `resolveHttpServer`
   (`vite/dist/node/chunks/config.js:14966`) branches on `httpsOptions` **only** —
   `createSecureServer({ ..., allowHTTP1: true })` — and the sole call site
   (`config.js:25456`) passes `resolveHttpsConfig(config.server.https)`. `server.proxy` has no
   influence. Setting `server.https` gives HTTP/2 with the proxy intact.
2. **`mkcert` is already installed on this machine** (`/usr/local/bin/mkcert`). A *locally trusted*
   cert is `mkcert -install && mkcert localhost 127.0.0.1 ::1` — no browser warnings, no
   `@vitejs/plugin-basic-ssl` dependency, no `NODE_TLS_REJECT_UNAUTHORIZED` hacks.

**Dev — verified non-costs.**

- **The Playwright suite is unaffected.** `development/playwright.config.ts` boots its own server
  on `PORT=3999` (`node --import tsx src/index.ts`) with `BASE_URL = http://localhost:3999`. It
  tests the Express server and the *built* admin, never Vite's dev server. Changing `server.https`
  cannot touch it.
- **The 8 ad-hoc `development/e2e/*.mjs` driver scripts already read `TOVU_ADMIN_URL`** and only
  fall back to `http://localhost:5173`. Switching them is an env var, not a code edit.
- Proxying from an HTTPS/H2 dev server to an HTTP backend on `:3000` is normal and needs no
  backend change.
- `Secure` cookies get *better*, not worse: they currently work on `http://localhost` only because
  localhost is a privileged origin; on `https://localhost:5173` they work for the ordinary reason.

**Dev — residual costs.** `TOVU_ADMIN_DEV_PROXY_URL` must be set to `https://…` if used; the 503
fallback page in `src/server/middleware/admin-static.ts:109` has a cosmetic hardcoded
`http://localhost:5173` link; each contributor runs `mkcert -install` once.

**Prod — the honest part.** Every browser requires TLS for HTTP/2, and **the container terminates
no TLS**. But per §1.3 the deployment *already* needs a TLS terminator in front for the `Secure`
session cookie to survive at all. So the production half of (c) is not "add TLS" — it is
"**enable HTTP/2 on the terminator that must already exist**," which is a documentation change and
zero code. It cannot be verified from this repo because the terminator is not in this repo.

---

## 3. Recommendation

**Build (c), split into two independently-shippable pieces. Do not build (a) or (b) yet.**

### C1 — Dev HTTP/2 (do this first; it is the fix for the live pain)

Turn on `server.https` in `apps/admin/vite.config.ts` using an mkcert-issued localhost cert.

- **Scope:** ~6 lines of Vite config, one `.gitignore` entry for the cert files, one README/onboarding
  line documenting the one-time `mkcert -install`. **Zero application code. Zero test changes.**
- **Effect:** the `:5173` origin's connection ceiling goes from 6 to Node's default
  `SETTINGS_MAX_CONCURRENT_STREAMS` of 100 — a ~16× headroom increase that covers both SSE feeds,
  HMR, and the module burst simultaneously. Cold dev page loads should also get measurably faster,
  since the ESM module burst stops queueing six-at-a-time.
- **Guard:** make the cert path conditional (`existsSync`) so a contributor without a cert still
  gets a working HTTP/1.1 dev server rather than a boot failure.

### C2 — Document the production requirement (do this second; no code)

Record in the deployment docs that the container must be fronted by a TLS terminator with HTTP/2
enabled, and state why (the `Secure` cookie already requires the terminator; HTTP/2 removes the
shared site+admin connection cap). Confirm with the owner what actually fronts prod today — I
could not determine this from the repo.

### Why this wins

- **It is the only option that addresses the actual constraint** rather than rationing a scarce
  resource. (a) and (b) both accept "6 sockets" as immovable and negotiate within it; (c) removes
  the number.
- **It is the only option with no new application-code failure modes.** (a) adds leader election
  and a fallback that retains the bug. (b) adds a resume-cursor protocol whose failure mode is
  *silent missed settings changes* — strictly worse than the visible timeout we have now.
- **Its cost collapsed under inspection.** The two things that would have made it expensive — the
  Vite proxy/HTTP2 conflict and the e2e suite — are both verified non-issues here, and mkcert is
  already installed.
- **It fixes the run feed and the module burst for free**, which neither (a) nor (b) touches.

### What the owner trades off by picking it

1. **Dev now runs over HTTPS.** Bookmarks, `TOVU_ADMIN_URL`, and any hardcoded `http://localhost:5173`
   in personal scripts all need the scheme changed. Small, but it will bite once.
2. **A one-time per-machine setup step** (`mkcert -install`) enters onboarding. Every new
   contributor and every fresh CI-ish container hits it.
3. **Cross-tab socket cost is reduced, not eliminated.** Each tab still opens its own settings
   feed; there are just far more slots. If the product later needs many feeds per tab, (a) comes
   back.
4. **Production remains unfixed until C2 is acted on** by whoever operates the terminator. C1 is
   dev-only relief. If a *production* operator with many tabs hits this, the fix is outside this
   repo.

### If (c) turns out to be insufficient

Then do **(b)**, scoped honestly: client visibility handling **plus** the server-side query-param
resume cursor **plus** a regression test that a revision written while hidden is delivered on
reopen. Do not ship the visibility change without the cursor — it converts a loud failure into a
silent one.

Reach for **(a)** only if the product grows a requirement for many simultaneously-visible admin
tabs, or additional per-tab streams. It is the right pattern for a problem this codebase does not
have yet.

---

## 4. Consequences

**Positive**
- Removes the root constraint rather than managing it; all four socket consumers benefit at once.
- No change to `settings-events.ts`, so its `Last-Event-ID` resume guarantee stays intact and
  untested-by-modification.
- Likely faster cold dev loads (module burst stops queueing).
- Aligns dev transport with what production already implicitly requires (TLS).

**Negative**
- Introduces certificate management, however light, into local dev.
- Dev and prod transports diverge further until C2 lands (dev H2, prod H1 direct-to-container).
- Does not reduce per-tab connection count, so the underlying "one permanent socket per tab"
  design remains — it just stops mattering at realistic tab counts.

**Neutral**
- `apps/admin/src/lib/api.ts`'s 60s timeout stays exactly as-is. It remains the correct backstop
  for a genuinely unresponsive server, and its operator copy ("the browser may be out of free
  connections for this origin") stays accurate for any HTTP/1.1 topology — including production
  until C2 lands.

---

## 5. Open risks and unverified claims

Stated explicitly rather than guessed:

1. **Production TLS termination is UNVERIFIED.** Nothing in this repo terminates TLS. The `Secure`
   cookie and the nginx-specific `X-Accel-Buffering` header are strong evidence a terminator is
   expected, but I cannot confirm what actually fronts the owner's deployment, or whether it
   already speaks HTTP/2. **C2's real cost depends entirely on this answer.** Ask before scheduling
   it.
2. **Whether Chrome counts the Vite HMR WebSocket against the same 6-per-host HTTP/1.1 pool is
   UNVERIFIED.** Chromium tracks WebSockets with a separate per-host limit. If it is separate, my
   dev accounting in §1.2 overstates pressure by one socket. It does not change the conclusion —
   the settings feed alone reaches 6 at six tabs — but do not quote the HMR socket as load-bearing.
3. **I did not empirically confirm the exhaustion.** The arithmetic in §1.2 is derived from reading
   the code, not from observing Chrome's socket pool. Before or after C1, `chrome://net-export/`
   (or DevTools' "Queueing" timing on the stalled request) would confirm the diagnosis directly.
   Worth doing once, since C1 is cheap enough that it may ship before anyone measures.
4. **Node's `SETTINGS_MAX_CONCURRENT_STREAMS` default of 100 is a ceiling, not infinity.** Vite
   sets `maxSessionMemory: 1e3` and `streamResetRate: 33` but does not override
   `maxConcurrentStreams`. 100 is ~16× the current budget and far beyond any realistic tab count,
   but it is a number, and if a future feature opens streams per-component it is the one to watch.
5. **`withCredentials` from `SharedWorker` scope is UNVERIFIED.** Only matters if (a) is ever
   revisited; flagged so a future evaluation does not assume it works.
6. **`mkcert` being installed is a property of this machine, not of the repo.** CI and other
   contributors' machines have not been checked. The `existsSync` guard in C1 exists precisely so
   that absence degrades to today's behavior instead of breaking `npm run dev`.

---

## 6. Re-evaluation triggers

- Production is confirmed to be running without an HTTP/2-capable terminator → C2 becomes real
  infrastructure work; re-price (b) as the cheaper production mitigation.
- Any new per-tab persistent stream is added to the admin (a third `EventSource`, a WebSocket) →
  per-tab socket count rises and (a) gets materially more attractive.
- A requirement appears for many simultaneously-visible admin tabs → (a).
- Firefox or Safari become supported admin targets with stated version floors → re-check the
  `SharedWorker` availability matrix in §2(a) before assuming (a) is viable.
