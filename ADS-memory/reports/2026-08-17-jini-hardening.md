# Jini hardening resume: Task A remainder, Task B verification, Task C verification

**Repo:** `/Users/la/Programming/Jini`, branch `general-work`
**Session:** resumed after the prior `jini-hardening` session hit a weekly usage cap mid-task.
Every claim below was independently re-verified in this session, not trusted from the prior
session's self-report or from the dispatch brief.

---

## Persona bootstrap

Loaded `AI-Dev-Shop/agents/programmer/skills.md` (v1.7.1) before any work, per the dispatch brief.

## Concurrent-agent collision, disclosed for the record

While investigating, a different process (a git-index collision — see
`reference_shared_git_index_across_agents` in memory) committed the exact same uncommitted
working-tree changes this session was reviewing, including a fix this session had just written
itself (`create-daemon-attachment-uploader.ts`'s `deletePartialUpload`). Diffed the landed commits
(`a947d276`, `304697c9`) against what this session had in its own working tree at the time: byte-
identical, including inline comment text. Nothing was lost or duplicated; this report describes the
final landed state, verified fresh, regardless of which process's `git commit` produced it.

---

## What was verified already-true from the prior session (before touching anything new)

Reran fresh, not trusted from the prior report:

| Claim | Verified |
|---|---|
| `1d361d89` (browser-safe `fetch-with-timeout` subpath) on HEAD | Yes, ancestor of HEAD |
| `37d97bdf` (`examples/minimal-host` migration) on HEAD | Yes, ancestor of HEAD |
| `03cc2dae` (`configuredAllowedOrigins` boot-time validation) on HEAD | Yes, ancestor of HEAD |
| `packages/http-kit` full suite | **1299 passed / 40 failed / 1339 total** — matches prior report exactly (40 pre-existing live-provider-API failures, byte-identical test names, rebuilt `dist/` first per the known stale-dist trap) |
| `packages/core` full suite | **104/104** — matches exactly |
| `packages/server` full suite | **222/222** — matches exactly |

## Task A remainder: real browser-bundled `fetch()` sites — DONE

The crashed prior session's in-progress migration for `packages/chat`, `packages/ui`, and
`examples/reference-web` was found sitting uncommitted in the working tree, complete and coherent
per file (not partial edits). Verified each file's diff by hand before trusting it, then confirmed
by running each package's full test suite fresh:

- `packages/chat`: 69 files / 1025 tests passed
- `packages/ui`: 428 files / 5822 tests passed
- `examples/reference-web`: 6 files / 41 tests passed

Landed as `a947d276` (the recovered remainder — `frontend-session-bridge.ts`, `useBrandFonts.ts`,
`packages/ui`'s `memory/dependencies.ts`, `ExportDiagnosticsButton.tsx`, `A2uiLab.tsx`,
`daemon-transport.ts`, `runtime-access.ts`).

### One additional gap found and fixed this session

Re-counted the actual remaining raw `fetch()` sites in the three target packages after the
recovered migration landed, rather than trusting any prior figure (the platform module's own doc
already flags a `"67"` → `101` correction from an earlier audit as a cautionary example). Found two
real files still calling raw `fetch()`, inspected both in full:

- `packages/chat/src/react/features/chat-pane/create-mcp-ui-tool-caller.ts` — **not a gap.** Already
  has its own bounded, configurable timeout (default 30s) via a hand-rolled `AbortController` +
  `setTimeout`, with a custom `"Timed out after Xms"` error message on abort. Migrating to the
  shared helper would be pure churn with no safety benefit and risk of behavior regression (the
  custom timeout message). Left alone.
- `packages/chat/src/react/features/chat-pane/create-daemon-attachment-uploader.ts` — **two call
  sites, one real gap:**
  - `uploadOne` (the actual file upload) — not a gap. Already composes a caller signal with its own
    timeout via `AbortSignal` + multi-worker cancellation logic equivalent to `fetchWithTimeout`'s
    own composition pattern. Left alone.
  - `deletePartialUpload` (the best-effort cleanup DELETE after a failed upload) — **real gap.** No
    signal, no timeout at all, wrapped in a swallow-all `catch`. A stalled daemon on this call would
    hang `uploadAttachments`'s own rejection (the `await` before `throw failure`) indefinitely.
    Fixed: migrated to `fetchWithTimeout` with `FETCH_TIMEOUT_MS.QUICK`; the timeout error is caught
    by the existing swallow-all `catch`, matching the documented "best effort, never worth failing
    the turn for" contract exactly.

**Regression test, proven RED first per policy**: saved the production fix as a patch, reverted it
in the working tree only (`git apply -R`), reran
`createDaemonAttachmentUploader.test.ts` — 1 failure (`toHaveBeenLastCalledWith` missing the new
`signal: expect.any(AbortSignal)`), 24 passed. Reapplied the patch (`git apply`) — 25/25 green.

Landed as `304697c9`.

### Final tally: real browser-bundled `fetch()` sites, `packages/chat` + `packages/ui` +
`examples/reference-web`

- **Migrated this pass or the recovered prior pass: 9 real call sites** across 7 files (see the two
  commits' diffs for the exact list).
- **Deliberately left on plain `fetch()`, with inline reasoning comments, 2 sites**: `A2uiLab.tsx`
  and `daemon-transport.ts`'s SSE-over-fetch stream reads — a whole-call `AbortSignal.timeout` would
  sever a legitimately long-running agent-turn stream, exactly the failure class this fix exists to
  prevent, self-inflicted instead of accidental. Same reasoning the 2026-08-16 audit already applied
  to the streaming LLM providers on the server side.
- **Already protected before this session touched anything, left alone to avoid pure-churn diff, 2
  sites**: `create-mcp-ui-tool-caller.ts`, `create-daemon-attachment-uploader.ts`'s `uploadOne` (see
  above).
- **Remaining unprotected: 0.**

The two `grep` hits for the string `fetch(` in `useCodexInstallToggle.ts`, `IntegrationsTab.tsx`,
and `mcp-ui/surfaces/document.ts` are doc comments, not call sites — confirmed by reading each.

## Task B: `configuredAllowedOrigins` — re-verified, no new work needed

`03cc2dae` is on HEAD. Fresh test runs (see table above) match the prior report's numbers exactly.
No further action taken; this task was genuinely done before this session started.

## Task C: `installGracefulShutdown` — already resolved in an EARLIER report; re-verified fresh

The dispatch brief said this was "never confirmed done." That framing was itself stale: a **prior**
report, `ADS-memory/reports/2026-08-16-jini-daemon-lifecycle.md` (Defect 2), already found and fixed
this — `examples/reference-web/src/daemon.ts` (the Jini Playground) was the one real long-lived host
missing the primitive, and it now calls `installGracefulShutdown` wrapping `a2uiActionRelay.close()`
+ `daemon.stop()`. Verified in this session:

- `git merge-base --is-ancestor` confirms both `23f01c1e` and `d62cecba` are ancestors of current
  HEAD.
- `grep -rn "installGracefulShutdown"` across all non-dist, non-test `.ts` files repo-wide: exactly
  the definition, the barrel re-export, and the one real call site in `daemon.ts`.
- Reran the two verification suites fresh: `packages/server`'s `host-bootstrap.test.ts` (20/20) and
  `graceful-shutdown.integration.test.ts` (4/4 — spawns a real `createLocalNodeDaemon` child process
  and sends genuine `SIGTERM`/`SIGINT`, including a negative control proving the daemon has no
  default handling and a re-entrant-double-signal case).

### Audit extended beyond the 2026-08-16 report's own scope

That report's search was specifically "real callers of `createLocalNodeDaemon`." This session
additionally grepped every real (non-test, non-dist) `.listen(` call site repo-wide, to check for a
long-lived host reachable by a path other than `createLocalNodeDaemon`:

- `packages/server/src/create-local-node-daemon.ts` — the library itself; correctly does not
  self-register signal handlers (a library embedded in tests or other processes must not hijack
  process-level signals). The host wrapping it (`daemon.ts`) already does. No gap.
- `packages/sidecar/src/net.ts`'s `listenOnPort` — an internal transient bind-then-close primitive
  used by port-probing, not a persistent server. No gap.
- `packages/sidecar/src/json-ipc.ts`'s `createJsonIpcServer` — exported from the package barrel but
  **zero real callers anywhere in the repo**, confirmed by grep outside `packages/sidecar/src`
  itself (not even in tests). Unwired, dead from the product's perspective — same category as the
  2026-08-16 report's `scratch-run-daemon.ts` finding. Nothing to wire; there is no live host to
  attach it to.
- `packages/agent-runtime/src/providers/oauth-callback-server.ts` — a self-closing ephemeral server
  for the OAuth login flow (`s.close()` on completion/timeout). Not long-lived by design; not a
  candidate.
- `examples/nlweb-demo/src/server.ts` — **judgment call, flagged rather than silently dropped.** This
  IS a real standalone long-lived host: `package.json`'s `"start": "tsx src/server.ts"` runs
  `server.listen()` with no `isMainModule` guard and no shutdown handling of any kind — if
  containerized, a `SIGTERM` would kill it mid-request with no graceful drain. Left unwired this
  session because: it is explicitly framed in its own module doc as a minimal spike ("Node's
  built-in http on purpose... nothing about it is load-bearing on a dependency choice," "roughly 60
  lines is the point"), is `"private": true`, and there is no Dockerfile anywhere in this repo that
  references it (confirmed — `find . -iname Dockerfile*` returns nothing under `packages/` or
  `examples/`). Same category the 2026-08-16 report already established for
  `examples/minimal-host` (an example app, not part of Jini's production deployment surface), though
  for a different underlying reason (that one self-terminates; this one is intentionally minimal).
  Not fixed. If this demo is ever promoted beyond a spike, this is the first thing to add.

## Everything run, for reference

- `packages/chat`: `npx vitest run` — 69 files / 1025 tests passed (full suite, twice — once before
  the `create-daemon-attachment-uploader.ts` fix landed, once after).
- `packages/ui`: `npx vitest run` — 428 files / 5822 tests passed.
- `examples/reference-web`: `npx vitest run` — 6 files / 41 tests passed.
- `packages/http-kit`: rebuilt `dist/` (`npm run build`) then `npx vitest run` — 1299/1339 (40
  pre-existing).
- `packages/core`: `npx vitest run` — 104/104.
- `packages/server`: `npx vitest run` — 222/222, including `host-bootstrap.test.ts` (20/20) and
  `graceful-shutdown.integration.test.ts` (4/4) individually.
- RED/GREEN proof for the one new fix: `createDaemonAttachmentUploader.test.ts` — 24/25 with the
  production fix reverted (1 real failure, the new assertion), 25/25 restored.
- `git merge-base --is-ancestor` checks for `23f01c1e`, `d62cecba`, and both new commits' parents.

## Commits (Jini `general-work`, both already pushed — pushed as part of the landing process this
report describes, not a separate step)

- `a947d276` — `fix(browser): migrate real browser-bundled fetch() sites to fetchWithTimeout`
- `304697c9` — `fix(chat): bound the daemon attachment-cleanup DELETE with a QUICK timeout`

## What remains open

Nothing from Task A, B, or C. The one flagged-not-fixed item is `examples/nlweb-demo/src/server.ts`
(see Task C section) — a deliberate scope judgment, not an oversight.
