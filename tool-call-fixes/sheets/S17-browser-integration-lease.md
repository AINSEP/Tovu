# S17. One browser integration at a time per daemon; the default follows the owner (C8, mechanism M10)

Repos: Jini (`daemon`, one small pure file), then Tovu. Estimate: 170k Sonnet.
Blocking decision: none.
Branching decision: **OD-4** (while OPEN: the lease only; red-first case 6 and change 5 wait for "yes" and are listed in the report as "waiting for OD-4").
Prerequisites: none in Jini (this sheet does not edit `agent-executor/launch.ts`; Tovu already computes `chromeIntegration` itself).
Tovu order: `agent-daemon-scope.ts` is on reconcile SEQUENCE H3; land after R7 P1 if that is in flight (INDEX §3).

## Where the one lease lives (judge finding 16)
One daemon process hosts **many** site scopes: `agent-daemon-server.ts` mounts `"/s/:scopeKey"` and creates each scope
through `createScopeControl({ createScope: input => createSiteScope(input, { idlePark }) })`. A lease created inside a
scope would be one per site. The lease is created **once in `agent-daemon-server.ts`**, beside `idlePark`, and the
same object is passed to every `createSiteScope` call as a typed port, exactly as `idlePark` is.

## Read first
`../DESIGN.md` §2.10, M10. Tovu: `rg -n "createSiteScope\(input|createAgentDaemonIdlePark" apps/website/src/server/inbound/assistant/agent-daemon-server.ts` ·
`rg -n "idlePark.hold|waitForTerminal|runtimeLaunch.runOptions|runWithCapabilities|if \(disposed\)" apps/website/src/server/inbound/assistant/agent-daemon-scope.ts` ·
`rg -n "resolveClaudeInChromeEffective|buildClaudeInChromeRunOptions" apps/website/src/server/inbound/assistant/assistant-runtime-guidance.ts` ·
`rg -n "useClaudeInChrome" apps/website/src/assistant/runtime-preferences.ts` · `rg -n "USE_CLAUDE_IN_CHROME_KEY" apps/website/src/features/settings/admin-interface.ts`.

## Characterization (passes today)
1. two owner runs back to back with the preference on → both get `chromeIntegration: true` and the allow-list entries;
   a non-owner run gets `false`; an unsupported runtime gets no flag.
2. the default has **two owners**: the registered definition (`admin-interface.ts`, `defaultValue: true`) and the
   fallback object (`DEFAULT_ASSISTANT_RUNTIME_PREFERENCES`). Through `readAssistantRuntimePreferences` over a **fresh
   settings repository** the effective value is `true`; pin which of the two produced it.

## Red-first
Lease (Jini, pure, `exclusive-run-lease.unit.test.ts`):
1. `acquire({ runId: "a" })` → granted; `acquire({ runId: "b" })` → refused with holder `"a"`; `acquire({ runId: "a" })` again → granted (same holder).
2. `release({ runId: "a" })` → `"b"` can acquire. Release is idempotent; releasing a non-holder is a no-op.
Tovu (`agent-daemon-server.browser-lease.integration.test.ts`, fake executor, fake lifecycle where needed):
3. **two different site scopes** in one daemon: the second concurrent owner run launches with `chromeIntegration: false`,
   no allow-list entries, and its guidance contains exactly `Another chat is using the browser integration. Use web_screenshot_page and page tools.`
4. release on every ending, each its own test, after which a new run acquires: completed; failed; cancelled; launch
   failure **after** acquiring (attachment claim or startup rejects); the executor's run promise settles (the child
   exited) but no terminal event was emitted; the scope is disposed while its run holds the lease.
5. a non-owner run and an unsupported runtime never call `acquire`.
6. OD-4 = off by default: over a fresh settings repository `readAssistantRuntimePreferences` returns
   `useClaudeInChrome: false`; an explicitly stored `true` stays `true`; an explicitly stored `false` stays `false`
   (no migration, no rewrite of stored choices). OD-4 = no: this case is not written and nothing about the default changes.

## Change (one gated commit per item)
1. Jini `daemon/src/exclusive-run-lease.ts` (pure, in-memory, ≤ 60 lines, no vendor or browser word), public entry
   `./exclusive-run-lease` (`universal`, README §4.9): `createExclusiveRunLease()` → `{ acquire, release, holder }`.
2. Tovu `agent-daemon-server.ts`: create one lease; pass it in the options of every `createSiteScope` call.
3. Tovu scope: acquire where `runtimeLaunch` is computed, only when the Chrome integration would be effective;
   `effective` becomes `effective && granted`. Release in **two** places, both idempotent: the existing
   `waitForTerminal({ runId }).…finally(...)` chain in `onStarted` (covers completed, failed, cancelled, launch failure,
   disposal, which all end in a terminal record), and a `finally` around the awaited `runWithCapabilities()` (covers a
   child that exited without a terminal event). The scope file is on the size ratchet: put the acquire/release pair in
   a new `assistant-browser-lease.ts` and keep net growth in the scope file ≤ 4 lines.
4. Guidance: keep "prefer it for checking pages the owner is logged into"; add that screenshots and page tools come
   first. The only tool id the new words name is `web_screenshot_page`; check it is registered
   (`rg -n '"web_screenshot_page"' apps/website/src/contracts/core/tool-metadata/web-screenshot.ts` has a hit) and assert
   the exact sentence in the case 3 test. Do **not** run `npm run check:tool-guides`: it does not exist until S4a
   (wave 3; Tovu merge-final `package.json` has no such script). S4a lists `assistant-runtime-guidance.ts` as a declared
   guide module (S4a "What is scanned", row C), so it scans this sentence when it lands (Opus review B1).
5. OD-4 = yes: change `defaultValue` in `admin-interface.ts` **and** the fallback object in the same commit.

## Acceptance
Cases green with exact text; argv for unsupported runtimes byte-identical; gate green in both repos; new export listed for REL.

## Out of reach (say so in the report, do not attempt)
Collisions with the owner's other, non-Tovu sessions and the browser extension's tab-group handling.
