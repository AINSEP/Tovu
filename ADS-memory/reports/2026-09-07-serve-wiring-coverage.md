# serve.ts wiring coverage — gap fill + sole-coverage audit

TDD agent, 2026-09-07. Bootstrap: `AI-Dev-Shop/agents/tdd/skills.md` loaded.

## Task 1 — closed: `pinServedSiteDirIntoEnv` unwired-call-site gap

**New file:** `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`
**Commit:** `ad18413d` — `test(cli/serve): prove runServeCommand still CALLS pinServedSiteDirIntoEnv`

### Seam investigation (why the preferred behavioral approach was unavailable)

Read `apps/website/src/cli/commands/serve.ts` in full. `runServeCommand(input: RunServeCommandInput)`
takes only `{ dir, port?, workspaceId?, emitBootToken? }` — no injectable deps, no injectable env.
`pinServedSiteDirIntoEnv(target)` is called at line 245 with **no** `env` argument, so it always
mutates the real `process.env` (its own `env` parameter defaults to `process.env`). Everything
around that call in `runServeCommand` — `bootSiteDir`, `runBootLifecycle`, `ensureAgentDaemonPortResolved`,
`app.listen(port)` — does real filesystem/DB/network work ending in an actually-bound TCP listener.
Calling `runServeCommand` "directly with a fake env" for real would mean booting a real site and
binding a real port — exactly what this dispatch prohibits. **No lighter seam exists**; the only
behavioral test of this call site would be the banned integration suite itself.

**Fell back to the source-text pattern**, matching the shape already established in this repo by
`apps/website/src/contracts/core/__tests__/integration/child-process-coverage-env-wiring.test.ts`
(reads a file's source, asserts both an import and an actual call, not just presence of either).

### The test

Two assertions:
1. `runServeCommand`'s body (sliced from its `export async function runServeCommand(` signature to
   EOF — it's the last export in the file) contains the literal line `pinServedSiteDirIntoEnv(target)`,
   and that line is not commented out.
2. Sanity check: that literal string (`pinServedSiteDirIntoEnv(target)`, no type annotation) occurs
   **exactly once** in the whole file — proving the regex can't accidentally match the primitive's own
   declaration line (`export function pinServedSiteDirIntoEnv(target: string, ...)`, where the `:`
   right after `target` breaks the match). This guards against a check that looks like it works but
   actually just detects the function's existence.

### RED evidence (without touching `serve.ts` on disk — shared tree, other agents editing concurrently)

Wrote a scratch script (`red-proof-serve-wiring.mjs`, not committed) that reads the **real**
`serve.ts` source into a string, applies the same extraction/assertion logic the test uses, then
re-runs it against two **in-memory-only** mutated copies — never written back to disk:

```
GREEN (expected): real source passes -- call site present and wired.
RED (expected) on deletion: [mutated: call site deleted] runServeCommand no longer contains the literal call "pinServedSiteDirIntoEnv(target)"
RED (expected) on comment-out: [mutated: call site commented out] call site is commented out

RED PROOF OK: real source on disk was never modified.
```

Both mutation shapes (line deleted, line commented out) correctly go RED; the untouched real file
stays GREEN.

### GREEN evidence (real test file, real run, one file, no server spawn)

```
$ node --import tsx --test apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts
✔ runServeCommand's body actually CALLS pinServedSiteDirIntoEnv(target), not just imports/defines it (1.679337ms)
✔ sanity: the exact call-site text is not also the primitive's own declaration line (a regex that matched both would prove nothing) (0.342863ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
```

`pinServedSiteDirIntoEnv` is now CLOSED as a live unwired-call-site risk.

---

## Task 2 — what the banned `serve-command*.integration.test.ts` family is the SOLE protection for

Read all 20 `test(...)` blocks across the three files (645 + 241 + 276 lines) and, for each, searched
the rest of the repo for any other test — unit, integration, any command — that would catch the same
regression if the wiring silently broke. Also checked the untracked duplicate
`zzz-debug-cr-r04-2.test.ts` (byte-for-byte the same test bodies as `serve-command.integration.test.ts`)
— **it is not real redundancy**: it's an identical copy of the same process-spawning tests, so it is
presumably exactly as hang-prone; per the dispatch I did not run it and am not counting it as a second
net.

Ranked by how quietly a deletion would pass (no compile error, no other suite reacting, no
obviously-wrong code left behind), highest risk first:

### 1. `runProductionReadinessGateOrExit()` wiring in `runServeCommand` — WORSE than sole-covered, actually UNCOVERED
No test anywhere — banned or not — calls this out by name or exercises `TOVU_RUNTIME_MODE=production`
against a spawned `tovu serve`. `grep -rl "runProductionReadinessGateOrExit" **/*.test.ts` → zero hits,
including inside the three banned files themselves. Even a running, unbanned copy of the integration
suite would not catch this deletion today. This is not "protection that goes away while banned" — it's
a pre-existing gap the ban makes no difference to. Flagging because it's adjacent and higher severity
than everything below it: a self-hosted production deployment launched via `tovu serve` gets zero
unsafe-default containment (dev secret placeholders, default owner password, undurable
production-classified capabilities) and nothing fails.

### 2. `registerPluginSdkResolver()` wiring in `runServeCommand` (CIC U-002/ADR-005, ESCALATE_SECURITY)
Sole coverage: `serve-command-plugin-sdk-resolver.integration.test.ts`. The resolver primitive itself
is well-tested (`plugin-sdk-resolver.unit.test.ts`, `.../integration/plugin-sdk-resolver.integration.test.ts`),
and `export-command-plugin-sdk-resolver.integration.test.ts` proves `cli/commands/export.ts`'s
**separate** call site — it does not touch `serve.ts` at all. Deleting `serve.ts`'s call: no compile
error, every one of those other suites stays green. A site-installed plugin's `@tovu/sdk` import then
resolves via ordinary Node resolution again, defeating ADR-005's deep-import blocking — silently,
security-relevant, explicitly flagged ESCALATE_SECURITY in the original dispatch.

### 3. `runBootLifecycle(...)` wiring in `runServeCommand`
Sole coverage: `serve-command-boot-lifecycle.integration.test.ts` (both tests — "all show ready" and
"refuses to serve on critical failure"). `database-migration-reconciliation-boot.integration.test.ts`
and `boot-lifecycle-real-deps.integration.test.ts` both call `runBootLifecycle` directly at the
composition-root level, explicitly mirroring `index.ts`'s path in their own comments ("the exact path
index.ts uses") — neither goes through `cli/commands/serve.ts`. Deleting the call: no compile error,
those suites stay green, `boot-lifecycle.unit.test.ts` (the primitive) stays green. Result: a
`tovu serve`-booted site loses the crash-interrupted-migration scan and the critical-failure abort,
silently, exactly the gap this function was dispatched to close.

### 4. `ensureAgentDaemonToken()` wiring in `runServeCommand`
Sole coverage: the "2026-09-05 dispatch: tovu serve mints TOVU_AGENT_DAEMON_TOKEN..." test. The
primitive is separately proven by `assistant/__tests__/daemon-auth.test.ts`, which stays green if
this call is deleted. Result: every `tovu serve`-booted daemon answers 503
`AGENT_DAEMON_UNCONFIGURED` to its own proxy again — the exact incident this line fixed — with no
test noticing.

### 5. `installUnhandledRejectionGuard()` wiring as `runServeCommand`'s first statement
Sole coverage: the identity-re-seed unhandled-rejection test (reproduces a real
`UNIQUE constraint failed: roles.workspace_id, roles.name`). The primitive is proven by
`process-error-guards.unit.test.ts`; `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts`
covers a **different** file's (`agent-daemon-server.ts`) own separate call to the same guard, not
`serve.ts`'s. Deleting: no compile error, both of those stay green. Quiet until a genuinely
unhandled rejection reaches production and crashes the whole process — lower probability trigger
than #2–#4, but total blast radius (process death) when it fires.

### 6. Port validation/precedence: `parsePort` / `resolveServePort` (BR-02, AC-11, behavior.spec.md §4)
Both functions are **not exported** from `serve.ts` — reachable only through a real CLI spawn.
Sole coverage: the two `--port` boundary tests, the `--port` vs `config.json.port` precedence tests,
and the `PORT` env fallback tier (already separately disclosed as an untested gap in the file's own
docstring, independent of the ban). No unit test exists for these functions because there is currently
no way to reach them without spawning.

### 7. CR-R04/CR-R01: cwd-independence of `uploadsDir`/`themesDir`
Lower-moderate: the underlying override mechanism (`createSqliteRouteDeps` honoring explicit
`uploadsDir`/`themesDir`) is independently covered by
`create-sqlite-route-deps-overrides.integration.test.ts` and `stock-content-dirs.unit.test.ts`. What's
sole-covered is specifically that `serve.ts` keeps passing `path.join(target, "uploads")` /
`path.join(target, "themes")` rather than regressing to `siteDir()`'s cwd-relative default — the
test's own docstring notes the rest of the suite "always spawns from the repo root, which accidentally
made the process.cwd()-relative bug invisible," i.e. this specific regression shape is otherwise
undetectable by construction.

### 8. `ensureAgentDaemonPortResolved()` ordering (must resolve before `createApp()`)
No test, banned or not, asserts this ordering directly — the banned suite only incidentally exercises
`JINI_AGENT_DAEMON_PORT` as a spawn-env input for one daemon-related test. `agent-daemon-port.test.ts`
tests the underlying `createAgentDaemonOriginResolver()` construct directly, not this wrapper or its
call-site position in `runServeCommand`. A latent gap, not a "sole coverage" one — nothing tests this
property well even while the suite runs.

### 9. `agentDaemonWanted` / `logCriticalBootFailures` (2026-09-06 composition-root dedup)
No test file anywhere references either name directly (`grep` for both returns zero matches, including
in the banned files). Their *behavior* is incidentally exercised inside the banned suite's boot-failure
and daemon-spawn tests, but with no assertion naming them specifically — closer to accidental coverage
than a guard.

### 10. BR-07 graceful SIGINT/SIGTERM shutdown
Sole coverage, genuinely — requires a real bound listener and a real signal to a real child process,
which is inherently an integration-tier-only property. No lower-cost seam is plausible here.

### Lower risk (business logic covered elsewhere; banned suite adds only thin CLI-wiring value)
- **AC-05/06/09** (`SITE_DIR_INVALID`/`SITE_NEWER_THAN_RUNTIME`/`SITE_CORRUPT` → exit codes): the
  shared `mapErrorToCliOutcome` mapping for these same error classes is independently proven via
  `adopt-command.integration.test.ts` (a different command, same shared `errors.ts`). `serve.ts`'s own
  contract is "never map errors to exit codes itself — let them propagate uncaught," a structural
  no-try/catch property that a code reviewer would likely notice if broken.
- **B1 workspace selection** (2-row default to oldest, `--workspace` explicit, unknown-id rejection):
  the actual selection logic is unit-tested directly in
  `platform/site-dir/__tests__/unit/resolve-workspace.unit.test.ts`. The banned tests mostly re-prove
  that `serve.ts` threads `input.workspaceId` through, a thin pass-through.
- **AC-08** (real HTTP round trip against a spawned CLI): the underlying admin CRUD is already proven
  once at the `bootSiteDir` layer by `boot-site-dir.integration.test.ts` per this file's own docstring;
  sole-covered piece is just "the packaged CLI path also reaches it."
- **Constitution Article VIII** (OTEL span export): docstring says other tiers already prove the
  general export mechanism; sole-covered piece is "the real packaged-CLI boot path specifically."

## Summary for the owner

Two items are more urgent than "wait for the integration suite to be unbanned":
- `runProductionReadinessGateOrExit` has **no test coverage at all**, banned suite included.
- `registerPluginSdkResolver`'s wiring into `serve.ts` is security-flagged (ESCALATE_SECURITY) and its
  only guard is currently unrunnable.

Everything in ranks 1–6 shares the exact shape Task 1 just closed for `pinServedSiteDirIntoEnv`: a
well-tested primitive, one production call site, zero proof the call site still fires. Recommend the
same source-text wiring-check treatment for ranks 2–6 as a stopgap while the integration suite stays
banned, prioritized in the order above.
