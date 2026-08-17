# Jini daemon lifecycle: two defects, both fixed and pushed

**Repo:** `/Users/la/Programming/Jini`, branch `general-work`
**Commits:** `23f01c1e` (defect 1), `d62cecba` (defect 2) — both pushed to `origin/general-work`

---

# Part 2: Finding 2 — raw `fetch()` timeout migration (same session, same audit)

**Commits (all pushed to `origin/general-work`):** `734ed213`, `bc7b8807`, `16d254a0`, `d11acf6c`,
`67ae530b`, `31500c90`

## The corrected census — supersedes the audit's "67" figure

The audit's own figure, quoted in `fetch-with-timeout.ts`'s module doc, is **wrong as a blanket
claim** and should not be repeated in future handoffs. Independent count: **101 raw `fetch()` call
sites**, not 67, across the whole monorepo (excluding tests/dist). Of those:

- **~40 were genuinely unprotected** and are now fixed (this report's subject).
- **A meaningful share were already protected**, just not yet consolidated onto the shared helper —
  migrating them would have been a no-op refactor, not a bug fix, so they were deliberately left
  alone (see "Already protected, deliberately not touched" below).
- **~30 more are real, raw, unprotected `fetch()` calls this audit's 5 named categories never
  covered** — browser-bundled UI code and example apps. Explicitly out of scope this session (see
  below), not silently dropped.

## Fixed this session (verified RED before every migration, GREEN after)

| File | Sites | Timeout classes used | Tests added | Commit |
|---|---|---|---|---|
| `packages/integrations/src/media-providers/dispatch/*` + `packages/agent-runtime/src/providers/elevenlabs.ts` | 6 | UPLOAD, QUICK | — (recovered, pre-verified) | `734ed213` |
| `packages/registry/src/github-client.ts` | 10 (not 9 — corrected mid-task) | QUICK | 4 | `bc7b8807` |
| `packages/devops/src/deploy/vercel.ts` | 2 | UPLOAD, DEPLOY | 1 | `16d254a0` |
| `packages/devops/src/deploy/netlify.ts` | 5 | QUICK, DEPLOY, UPLOAD | 2 | `d11acf6c` |
| `packages/devops/src/deploy/github-pages.ts` | 9 | QUICK, DEPLOY | 2 | `67ae530b` |
| `packages/devops/src/deploy/cloudflare-pages.ts` | 15 | QUICK, DEPLOY, UPLOAD | 5 | `31500c90` |

**Total: 47 call sites now carry a real `AbortSignal`** (6 recovered + 41 migrated this session).
Every migration commit: confirmed RED (new tests fail against the pre-migration file with "expected
undefined to be an instance of AbortSignal"), then GREEN; full package test suite re-run after each
(registry 187/187, devops 251/251 after the last commit); `tsc --noEmit` clean per package touched.

None of the 41 sites migrated this session are streaming-shaped — verified per file by grepping for
`ReadableStream`/`getReader`/`event-stream`/`ndjson`/`chunked` before touching anything, not assumed
from the audit's own claim.

## The one genuinely important finding: do NOT migrate the streaming LLM providers

`packages/agent-runtime/src/providers/{anthropic-messages,openai-chat,google-messages,azure-chat,
ollama-chat}.ts` — the actual LLM streaming-completion callers reached via `model-proxy.ts` — **do
not call `fetch()` at all.** They call `pinnedFetch` (`connection-guard.ts`), a hand-rolled
`node:https`/`node:http` transport built because Node's global `fetch` has no DNS-pinning hook for
SSRF protection. `pinnedFetch` already has:
- a 300s **idle-socket** timeout (`PINNED_FETCH_IDLE_TIMEOUT_MS`), applied regardless of caller
  signal, explicitly built for exactly the "silent dead connection hangs forever" failure class;
- full caller-`AbortSignal` passthrough via each provider's own `options.signal`.

Pointing `fetchWithTimeout` at these would cause two regressions at once: it wraps global `fetch`,
not `pinnedFetch`, so using it here would **drop SSRF pinning** — a real security regression, not a
cosmetic one; and `AbortSignal.timeout` bounds the **whole call, body included**, so it would sever
a legitimately long-running streaming completion — the exact failure class this migration exists to
fix, self-inflicted instead of accidental. Excluded permanently. If a future pass wants these
protected further, the fix belongs inside `pinnedFetch` itself (e.g. a total-duration ceiling above
its existing idle timeout), never a `fetchWithTimeout` swap at the call site.

## Already protected, deliberately not touched (consolidation, not a fix — zero behavior change, so skipped to avoid adding diff/regression surface for nothing)

- `packages/agent-runtime/src/providers/connection-test.ts`, `model-catalog.ts` — each already
  builds its own `AbortController` + `setTimeout` composed with any caller signal.
- `packages/devops/src/deploy/reachability.ts` — same hand-rolled pattern.
- `packages/memory/src/llm-provider.ts` — already sets `signal: AbortSignal.timeout(resolved.timeoutMs)`
  unconditionally. **Do not migrate this one even later without a deliberate decision**: its own doc
  says a caller-supplied `requestInit.signal` is intentionally overridden by the module's own timeout
  signal ("so those always win") — swapping in `fetchWithTimeout`'s `AbortSignal.any` composition
  would silently change that documented contract, not just consolidate it.

## Explicitly out of scope, flagged not dropped

~30 raw `fetch()` sites in browser-bundled UI code and example apps (`packages/chat`'s frontend
bridges, `packages/ui`'s memory/integrations tabs, `examples/reference-web`,
`examples/minimal-host`). All same-origin calls to this app's own backend — a different risk profile
from a vendor that can silently blackhole a socket — and using `@jini-ai/platform`'s barrel in
browser code needs its own verification pass first (risk of pulling Node-only modules into a
browser bundle). Team-lead made this a hard boundary for this session; a future task should treat
the bundle-safety check as its own first step, not something to assume.

## `model-proxy.test.ts` baseline — before and after

Established **before** touching anything nearby, per instruction, since that file is known-red for
unrelated live-provider-API reasons and could mask a regression: **40 failed / 44 passed (84
total)**. Re-ran identically **after** every commit landed: **40 failed / 44 passed (84 total) —
unchanged.** Expected: this migration never touched anything in `model-proxy.ts`'s own dependency
chain (the pinnedFetch-based providers were deliberately excluded, see above).

## Everything run, for reference

- `packages/registry`: full suite 187/187 after `github-client.ts`.
- `packages/devops`: full suite (10 files) 251/251 after `cloudflare-pages.ts` (the last of the four
  deploy-provider commits).
- `packages/integrations` + `packages/agent-runtime`: dispatch `__tests__` 180/180,
  `openai-compatible.test.ts` 44/44, `elevenlabs.test.ts` 8/8, both packages' `tsc --noEmit` clean.
- `packages/http-kit`'s `model-proxy.test.ts`: 40/44 both before and after (pre-existing, unrelated,
  confirmed unchanged).
- `git push`: `d62cecba..31500c90 general-work -> general-work`.

## Persona bootstrap

Loaded `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.1) before any work, per the dispatch brief.

## Defect 1 — `runs` Map leak in `run-lifecycle.ts`

**Brief's claim: verified TRUE, and worse than described.**

Grepped every `runs.set`/`runs.delete` in `packages/daemon/src/run-lifecycle.ts`: exactly one
`runs.delete()` existed, in `appendStartOrRollback`'s failed-start rollback. No other path ever
removed a run. The file's own comment at (then-)line 540 already said as much.

Beyond what the brief described: `rehydrate()` makes it worse at boot. `EventLog.listRunIds()`
(`packages/daemon/src/event-log.ts:132`) returns literally every run id the durable log has ever
seen, unbounded. `rehydrateOne` loads every one of them into the same `runs` Map — so a daemon
restart re-populates the *entire* terminal-run history immediately, reproducing the leak on every
boot regardless of how long the process had been up before.

### Read-path check (why not delete-on-completion)

Traced real (non-test) callers before choosing a policy, per the brief's instruction:
`packages/http-kit/src/runs.ts` exposes `GET /runs` (`list()`), `GET /runs/:id` (`get()`), and
`GET /runs/:id/events` (`stream()`, SSE reconnect) — all read terminal runs after they end. `resume()`
has no real caller yet (tested only) but is a public contract method regardless. Immediate deletion
on completion would have broken all three read paths, so this had to be bounded retention, not
delete-on-terminal.

### The fix

- `terminalRetentionMs` (default 24h) — per-run eviction timer armed the instant a run goes
  terminal (in `finish()`), or on rehydration with the elapsed time already subtracted (via a new
  pure `computeRetentionDelayMs(terminalAt, retentionMs, now)` helper) so a restart doesn't grant a
  fresh 24h window to a run that was already terminal for 23 of those hours.
- `maxTerminalRuns` (default 1000) — hard LRU cap on retained terminal records, oldest evicted
  first, independent of the TTL. Reasoning: a TTL alone doesn't bound memory if runs complete faster
  than they age out; the cap gives a true worst-case bound regardless of arrival rate. Both are
  constructor options on `createRunLifecycle`, overridable per host.
- `resume()` now cancels a run's pending eviction (`untrackTerminalRun`) so a reclaimed run can't be
  evicted out from under its new non-terminal life.
- Eviction also clears the run's `idempotencyIndex` entry. This was a second latent bug I found
  while wiring the fix: without it, evicting a run while leaving its idempotency-key mapping behind
  would make a re-post with the same key throw (`requireRun`: "unknown run") instead of starting a
  fresh run — i.e., fixing the leak naively would have introduced a crash. Reused the existing
  `clearIdempotencyIndexEntryIfMatching` helper (same one the failed-start rollback already used).

New fields on `RunRecord`: `idempotencyKey` (needed for the cleanup above — the record didn't retain
it before) and `retentionTimer`.

### Tests

6 new tests in `packages/daemon/src/__tests__/run-lifecycle.test.ts` (`RunLifecycle — terminal run
retention` describe block): TTL eviction, read-up-to-the-boundary (retained at `retentionMs - 1`),
idempotency-index cleanup after eviction, LRU cap evicting oldest-first, `resume()` surviving past
the original window, and `rehydrate()` honoring elapsed terminal time.

**Proved RED properly**: `git stash push -- packages/daemon/src/run-lifecycle.ts` (kept the new test
file), reran — 4 of 6 new tests failed against the pre-fix code, 2 passed trivially (boundary-read
and resume-survival hold either way, they're regression guards for the fix itself, not
defect-detectors). `git stash pop` restored the fix; reran — 62/62 green.

**Regression sweep** (all green, no failures): `run-lifecycle.test.ts` (62), `agent-executor.test.ts`
(246), `characterization.test.ts` (1), `delegated-tool-bridge.test.ts` (14),
`run-scoped-context-store.test.ts` (8), http-kit's `runs.test.ts` + `run-stream.test.ts` +
`delegated-tools.test.ts` + `remote-run-events.test.ts` (139), server's
`create-local-node-daemon.test.ts` (84). `npx tsc --noEmit` clean in `packages/daemon`.

### What was false in the brief

Nothing — defect 1 was accurately described. I found it was also reachable via a second path
(rehydration) the brief didn't mention, and fixed that too since it's the same root cause and the
same fix mechanism covers it.

## Defect 2 — `installGracefulShutdown` had no caller

**Brief's claim: verified TRUE for the packages the source commit (`9817562c`) itself audited, but
the repo has one real caller site outside `packages/`, which I found and wired.**

`packages/server/src/index.ts`'s own diff from `9817562c` only *re-exports*
`installGracefulShutdown` alongside `closeHttpServer`/`normalizeDaemonBindHost` — same pattern as
every other library primitive in that barrel, meant for a consuming host to call. It is not itself
a caller. Confirmed with `rg -n "installGracefulShutdown"` across all non-dist, non-test `.ts` files
repo-wide: the only two hits were the export line and the (now-fixed) usage I added.

### Finding the real entry point (didn't guess)

Searched for every real (non-test, non-typecheck-fixture) caller of `createLocalNodeDaemon`:

- `packages/cli/src/main.ts` (the `jini` bin) — pure HTTP client. `daemon-command.ts`'s `stop`
  subcommand posts to `/api/daemon/shutdown` on an *already-running* daemon; this binary never
  boots one itself. Not a candidate.
- `examples/minimal-host/src/index.ts` — a "neutrality-proof" boot-and-verify smoke test
  (`scripts/health-boot.ts` runs it against packed tarballs). It calls `daemon.stop()` itself at the
  end of its own run and exits; it's not a long-lived process an operator would `kill`. Not a
  candidate.
- `examples/minimal-host/scratch-run-daemon.ts` — imports `@injini/node-host`, a package name that
  does not exist anywhere in this workspace (confirmed: no `packages/node-host`, no matching
  `"name"` in any `package.json`). Dead file, filename says "scratch". Not touched.
- `examples/reference-web/src/daemon.ts` (the Jini Playground) — the one real, long-lived host.
  **This already had its own hand-rolled `SIGINT`/`SIGTERM` pair** (a `stopping` flag guarding a
  `stop()` that closed a side resource and called `daemon.stop()`), predating or written
  independently of `installGracefulShutdown`. It had the same idempotent-on-a-second-signal
  behavior but **no timeout-forced-exit** — if `daemon.stop()` ever wedged, the process would hang
  forever instead of exiting. That's the exact gap `installGracefulShutdown`'s `timeoutMs` (default
  10s, Docker's grace period) exists to close.

### The fix

Replaced the hand-rolled pair in `examples/reference-web/src/daemon.ts` with:
```ts
installGracefulShutdown(async () => {
  a2uiActionRelay.close();
  await daemon.stop();
});
```
Preserves the exact prior teardown order (close the A2UI action relay synchronously, then await
`daemon.stop()`) and prior signal set (`SIGTERM`+`SIGINT`, `installGracefulShutdown`'s default).

### Verification

`packages/server`'s checked-in `dist/` predated `9817562c` (last built Aug 5; the commit landed
Aug 16) and didn't export the symbol yet, so `tsc --noEmit` in `examples/reference-web` initially
failed with "no exported member." Rebuilt `packages/server` (`npm run build`) — clean — then
`examples/reference-web`'s `tsc --noEmit` passed clean. `dist/` is gitignored; nothing from that
rebuild is in the commit. Also re-ran the library-level tests that prove the primitive itself is
correct: `host-bootstrap.test.ts` (20/20) and `graceful-shutdown.integration.test.ts` (4/4 — spawns
a real `createLocalNodeDaemon` child process and sends genuine `SIGTERM`/`SIGINT`).

**No new regression test for the wiring itself.** `daemon.ts` has no test harness by design — it
runs `void main().catch(...)` unconditionally at import (no `isMainModule` guard the way
`packages/cli/src/main.ts` has one specifically so importing it for tests is safe). Building a
child-process-spawn integration test for this specific example app's `main()` would need to boot
the full Playground (vite paths, sample-project dirs, MCP bridge resolution) — disproportionate for
an example file, and the mechanism it now calls is already proven correct at the library level.
Flagging this as a known, deliberate gap rather than silently skipping it.

### Scope note confirmed correct

Tovu's own `src/` has zero SIGTERM/SIGINT handlers, as the brief said. Did not touch the Tovu repo.

## What was false or needed correction in the brief

- Defect 1: nothing false; found one additional manifestation (rehydration) not mentioned, fixed
  under the same commit since it's the same root cause.
- Defect 2: the "only reference is its own export line" claim is accurate for everywhere the
  source commit's own audit looked (`packages/server/src`, `packages/daemon/src`,
  `packages/cli/src`) — but the repo has a real caller site in `examples/` that the audit's stated
  scope didn't cover. Found and fixed it rather than treating "packages/ has no caller" as "nothing
  in the repo needs wiring."

## Everything run, for reference

- `packages/daemon`: `npx vitest run src/__tests__/run-lifecycle.test.ts` (62/62), plus the
  regression sweep listed above; `npx tsc --noEmit` clean.
- `packages/server`: `npm run build`; `npx vitest run src/__tests__/host-bootstrap.test.ts` (20/20);
  `npx vitest run src/__tests__/graceful-shutdown.integration.test.ts` (4/4).
- `examples/reference-web`: `npx tsc --noEmit -p tsconfig.json` clean.
- `git push`: `8a37db9b..d62cecba general-work -> general-work`.
