# Live model discovery — state at handoff, and the ONE thing still open

Date: 2026-08-05
Prior agent: `Prog-LiveModelDiscovery` (Programmer persona, Sonnet 5) — **STOPPED by user request**, work complete except the item below.
Design: `ADS-memory/reports/local-cli-live-model-discovery-design-2026-08-05.md` (`da87d76`, revised `81b645f`)

## Start here

**Everything is committed. Nothing is half-applied.** One test is missing — that is the entire
remaining scope. Do not redesign, do not re-verify what is listed as done below.

## THE ONE OPEN ITEM

**Write a regression test for the MCP-UI tool-call fall-through in
`src/server/modules/assistant.ts`** (the route ending around line 403-409).

The bug it must guard was real, was shipped, and is now fixed in **`7b5ae83`**. It was found by
auditing call sites during review, **not** by a failing test — the suite was green at 33/33 because
nothing drives this path.

- **Path to drive:** an MCP-UI tool call whose `exchangeId` is NOT present in `byokSurfaceExchanges`,
  so `deliver()` returns `unknown-or-closed` and control falls through to the daemon. The comment at
  `:398-400` documents this as legitimate — the exchange belongs to a **Local CLI run's** daemon-side
  store this process cannot see.
- **Assert:** the stand-in daemon's status AND body actually reach the client.
- **Harness:** mirror `src/server/__tests__/assistant-proxy-routes.test.ts`'s stand-in-daemon setup.
- **Negative-verify it:** revert the fix in `7b5ae83`, confirm THAT test fails. Critical detail —
  the pre-fix behavior is a **hang**, not an assertion mismatch, so give the test an explicit timeout
  that FAILS rather than hanging the whole run.
- Runner is `node:test` + `node:assert/strict` (`src/**` uses `node --import tsx --test`; only
  `apps/admin` runs vitest). Scoped runs only — never the full suite.

### Optional, non-blocking
A `console.warn` when the daemon answers 2xx without an `agents` array already landed in `8e32c51`.
Nothing else is outstanding. The `useStoredAdminCredential` flag (design §3.2) is deliberately
deferred per the design doc's own task item 5 ("optional… not required for §3.1 to work").

## What is DONE and must not be redone

| Commit | Content |
|---|---|
| `5e322f1` | `src/assistant/live-model-cache.ts` (new) + `src/server/modules/assistant.ts` — `getLiveClaudeModels`, `unionModels`, `respondWithEnrichedAgentList`; `forwardToAgentDaemon` refactored to return `Response \| null` |
| `52cb2c2` | 10 unit tests — never-a-gate and union invariants |
| `33b0bea` | 3 route-level tests for the enriched `GET /api/agents` |
| `8e32c51` | Cache-key collision fixed structurally (nested `Map`s, not string concat) + silent-failure `console.warn` on both paths |
| `66dc910` | SSE incremental-streaming test + mutation proof |
| `7b5ae83` | **The fall-through relay fix** (Coordinator-applied — see below) |

**Behavior:** `GET /api/agents` and `POST /api/agents/rescan` enrich only the `claude` entry, from the
admin's own `admin_execution_credentials` row (558d6a3's keystore) via `listProviderModels`, behind a
5-minute TTL cache. Zero Jini changes, zero new dependencies, **zero `npm install`**.

**Invariants verified as holding — do not weaken:**
- **Union, never replace.** `def.fallbackModels` (the `'default'` sentinel + the bare
  `sonnet`/`opus`/`haiku` aliases) is always kept and always first; live ids are appended, deduped by
  `id`. A live `GET /v1/models` returns ONLY pinned ids and would otherwise delete those four.
- **Never a gate.** No credential ⇒ zero network calls, byte-identical fallback, no added latency.
  Proven by a `fetch` call-count spy, not by return value — `listProviderModels` swallows fetch
  failures and returns the same `null` either way, so a return-value assertion passed under a broken
  guard. That trap is real; don't reintroduce it.
- **No UI badge** — user's explicit decision. `modelsSource` is populated on the wire only.
- **SEC-001 untouched** — server-to-`api.anthropic.com`, never `process.env`, never the spawned CLI's
  env. Verified against the primary finding, not just cited.

## Two process facts worth knowing

1. **An SSE coverage gap predating this work was found and closed** (`66dc910`). No prior assertion
   distinguished "streamed incrementally" from "buffered whole then flushed" — the stand-in daemon
   `res.end()`s its entire `/events` body in one shot. The new test writes two chunks 200ms apart and
   asserts a real gap; a deliberate buffer-then-flush mutation failed **only** that test while all 13
   pre-existing ones stayed green.
2. **The fix in `7b5ae83` was written by the prior agent, then LOST.** It existed uncommitted in the
   working tree; when the agent was stopped, the edit did not survive and `HEAD` still carried the
   hang. The Coordinator re-applied it from the verified diff, typechecked, ran the scoped proxy
   suite (14/14 green), and committed. **Lesson: uncommitted work does not survive a `TaskStop`.**
   Require incremental commits in the brief; never let a verified fix sit only in the working tree.

## Handoff Contract

- **Inputs used:** the approved design doc; the prior agent's five commits and its reports;
  Coordinator audit of all four `forwardToAgentDaemon` call sites; scoped test + typecheck runs.
- **Output summary:** live model discovery shipped behind a union-preserving, never-gating enrichment
  path, with the refactor's one unmigrated call site found and fixed.
- **Risks:** the fall-through path has no test yet — that is the open item above.
- **Suggested next assignee:** Programmer, scoped to the single regression test.
