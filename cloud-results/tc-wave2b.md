# tc-wave2b: tool-call fixes S5 (read wording) and S17 (one browser integration per daemon)

Run: 2026-11-17 23:01 to 00:30 UTC, unattended. Branch `wave2/tc-b` in both repos. Base `origin/refactor/terra`:
Jini `65d73b0d5a43`, Tovu `232764af535d` (both ancestor checks printed `ok`). BLOBS drift check (README 1.4): nothing printed.
Owner decisions read from `origin/plan/owner-decisions-2026-11-17`: BASE-RED, TC-OD1..OD11 = Rec (OD-4 = Chrome off by default,
stored choices kept, one lease per daemon). No subagents, no RemoteTrigger. No process left running.

## Result
S5 done. S17 done (Jini lease, Tovu wiring, OD-4 default). Nothing left on either sheet except the REL step below.

## Pushed commits
Tovu `wave2/tc-b` (all pushed; the desktop pre-push hook said "no apps/desktop changes", so no `--no-verify` was needed):
| SHA | what |
|---|---|
| 72c7a7fd | S5 characterization: approval class vs read-only flag, hand-built flag site inventory |
| 4ddcb8e0 | S5 change: the three grant-storing external MCP tools carry the clause; test + golden byte count |
| 0b2ab6ec | S17 characterization: Chrome launch for owner runs, default has two owners |
| 12fb4485 | S17 lease wiring: claim in the launch, release on every ending, busy guidance, server creates one lease |
| 25a2d59e | S17 OD-4: default off in all three places, stored choices kept |
| f6201a16 | S17 follow-up: one launch test still pinned the old default (see "Honest notes") + 2 claim-port unit cases |
| (this report) | cloud-results/tc-wave2b.md |

Jini `wave2/tc-b`: `f40bd7b9` exclusive-run-lease (source + unit test), `86cc7d25` its `package.json` entry (left unstaged by mistake in the first commit, see notes), then this report.

## Setup and baseline (recorded before any edit)
- Node 24.11.1 into `~/.local/node24`. Corepack could not download pnpm through the proxy, so `npm i -g pnpm@10.33.2` there.
- Jini: `pnpm install --frozen-lockfile` ok, `pnpm --no-bail -r build` 0 errors. Tovu: `npm ci` (root, apps/admin, apps/site-chat), `JINI_PACKAGES_DIR=/home/user/Jini/packages node development/scripts/link-jini.mjs` (77 links), contracts + sdk built.
- Jini base: `pnpm guard` rc=0, `pnpm typecheck` rc=0, `check:size` 0, `check:complexity` 0, `check:errors` 0, `check:hooks` rc=1 (BASE-RED, identical output with and without my change), daemon tests 4722 passed, 1 skipped.
- Tovu base: `npm run typecheck` rc=0; `check:size` rc=1 and `check:complexity` rc=1 with 40 violation lines in total (the known base red).
  `check:boundaries` rc=16, `check:architecture` rc=1, `check:jini-registry-drift` rc=1: base red too.
- Source-reading Tovu tests on the unmodified tree, 3 directories (server/inbound/assistant, assistant/__tests__, features/settings): 3728 tests, 16 failing. Plus external-mcp: 2 postgres test files fail (no database here).

## Gates run, exact command and result
BASE-RED rule: judged on "no new line beyond the base output".
- Tovu after every Tovu commit: `npm run typecheck && npm run check:size && npm run check:complexity` -> typecheck rc=0; size rc=1 and complexity rc=1 with **no line that is not in the base output**
  (the whole output of both ratchets is identical to base after the last commit: checked with `diff`, apart from my own `rc=` marker lines).
  `npx tsc -p tsconfig.tests.json --noEmit` (NODE_OPTIONS=--max-old-space-size=6144): no error in any touched test file (one `possibly undefined` was fixed before the commit).
- Tovu `check:errors`, `check:hooks`, `check:inventory`, `check:error-rule-copies`: rc=0. `check:boundaries`, `check:architecture`, `check:jini-registry-drift`: red as at base, output identical apart from counts and line numbers.
- Jini: `pnpm guard` ok, `pnpm typecheck` rc=0, `pnpm check:size`, `check:complexity`, `check:errors` rc=0, `check:hooks` rc=1 as at base (same output). Daemon: `npx vitest run --poolOptions.threads.maxThreads=2 --poolOptions.threads.minThreads=1 --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1` -> 4726 passed, 1 skipped (base 4722, +4 = the new lease tests). Jini's vitest 2.1.9 refuses `--maxWorkers` ("minThreads and maxThreads must not conflict"), hence the poolOptions flags. Tovu admin (vitest 4): `npx vitest run --maxWorkers=2 src/components/AssistantDock` -> 67 files, 796 tests passed.
- Tovu tests run with the exact runner of the `test` script (`TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 <files>`).
  Final run (before `f6201a16`) over server/inbound/assistant/**, assistant/__tests__/*, features/settings/**, features/external-mcp/**, tool-catalog-manifest*: 4317 tests, 4291 pass, 21 fail, 5 skipped. After removing the one failure that was mine (the launch test fixed in `f6201a16`, which now passes: 25 tests in its file), the failing names are byte-identical to the base failing names (`diff` of the two lists printed nothing): AssistantDock iframe test, the no-value-import boundary test, 2 postgres files + their 2 cases, the typed-tools / delegated-confirmation fixture failures (`executorDefinitionPolicies is not defined`), the component-catalog HTTP test. The golden test that my S5 change moved was fixed in the same commit and passes.
- Section 4 blocks (4.3 to 4.7, 4.15, 4.16, 4.17, the S5 sideEffects check): all print nothing on the whole branch diff against the base, in both repos.
  Block 4.8 printed four lines (all four are rewritten because the default changed, see "Why-comments").
  S5 acceptance check `git diff "$BASE...HEAD" -U0 | rg -n '^[-+].*sideEffects'`: prints nothing (empty output).
  Block 4.9: after `pnpm --filter @jini-ai/daemon build`, `await import('@jini-ai/daemon/exclusive-run-lease')` from packages/daemon and packages/server prints `[ 'createExclusiveRunLease' ]`; `rg "from 'node:"` on the entry prints nothing (rc=1), so it is `universal`.

## S5 details
Inventory: 328 registered tools (`realToolCatalog()`). Writes whose description starts with one of the six words: exactly 3.
Red-first (`tool-read-wording.integration.test.ts`) failed naming all three, whole list:
`external_mcp_test_connection`, `external_mcp_probe_connection`, `external_mcp_get_admissions`.
Approval invariant (`approval.class === 'read'` iff read-only): **no mismatch exists**; kept as a gate (mutation: set get_admissions to `read` -> red naming it).
Non-kit registrations, each listed in the test with evidence and a completeness scan (mutation: a new file with `readOnly:` -> red): frontend-control-capabilities (3 ids, DOM/screenshot/pane reads), mcp-federation/registrations (only ever forces `false`), visitor-executor (default true for the four published-content reads), visitor-page-tools (`risk === 'read'`), list-pending-chat-attachments (store filter only), agent-daemon-site-tools (passes the site's own derived flag), durable-run-routes (local variable). No tool declared a write that only reads was found, so nothing to report to the owner.
Changed descriptions, old -> new (first sentence only changes):
- `external_mcp_get_admissions`: "Reads the server's current external MCP tool admissions: the tools" -> "Shows the server's current external MCP tool admissions (needs the full gateway: it can store data): the tools"
- `external_mcp_probe_connection`: "Tests a saved, enabled hosted external MCP connection by connecting once," -> "Tests a saved, enabled hosted external MCP connection (needs the full gateway: it can store data) by connecting once,"
- `external_mcp_test_connection`: "...configuration resolves cleanly: its stored credentials" -> "...configuration resolves cleanly (needs the full gateway: it can store data): its stored credentials"
Search-eval fixtures embedding these descriptions: none. The `moved-tools.golden.json` catalog byte count 755108 -> 755240 (+132 = 3 x 44), edited by hand, not regenerated.
No `sideEffects`, `readOnly` or approval line changed.

## S17 details
Jini `@jini-ai/daemon/exclusive-run-lease` (new export for REL): `createExclusiveRunLease({}) -> { acquire, release, holder }`, 30 lines, in memory. Called with `({})` instead of the sheet's `()` to follow the owner rule (required, optional). 4 unit cases: grant/refuse naming holder/re-grant; release then another acquires; release idempotent and non-holder no-op; independent leases.
Tovu (all in the 12 + 3 cases of `agent-daemon-server.browser-lease.integration.test.ts`, 14 tests in the file now):
- Red first: 9 of 12 failed before the wiring (holder `undefined`, `true !== false`, entry has 0 lease calls), then all green. Mutation proofs: no release on the terminal chain -> the three ending tests + launch-failure test red; no release when the executor settles -> the "settles without terminal" and "dispose" tests red; standalone mount without the lease -> the entry test red.
- One lease: `agent-daemon-server.ts` creates it once beside `idlePark` and passes it to **both** `createSiteScope` calls (the sheet named one; the standalone `mountStandaloneScope` is a second creator, pinned by the entry test).
- Claim: `resolveAssistantRuntimeLaunch` got a `claimBrowser` port, asked only when owner + supported + probed + preference on; refused -> `--no-chrome`, no allow-list, guidance exactly `Another chat is using the browser integration. Use web_screenshot_page and page tools.` Check: `web_screenshot_page` is registered (`rg` hit in tool-metadata/web-screenshot.ts:8). `npm run check:tool-guides` not run (does not exist until S4a).
- Release: the run's existing terminal-wait release now also gives the browser back (`releasingBrowserToo`), and the executor's run promise releases when it settles (child exited without a terminal event). Cases: completed, failed, cancelled, launch failure after the claim (real `failRunBeforeStart` + real in-memory lifecycle), settled without terminal, dispose cancelling a live run, and "a non-owner, an unsupported runtime and a preference that is off never ask".
- Changed model-facing sentence `CLAUDE_IN_CHROME_GUIDANCE`, old -> new:
  "Claude in Chrome is available: prefer it for checking pages the owner is logged into; otherwise use the existing screenshot/Playwright tools."
  -> "Claude in Chrome is available: use web_screenshot_page and page tools first; prefer it for checking pages the owner is logged into; otherwise use the existing screenshot/Playwright tools."
  New sentence: `BROWSER_BUSY_GUIDANCE` (above). Argv for unsupported runtimes unchanged (`"chromeIntegration" in launched === false`, characterization test).
- OD-4: default off in **three** places, not two as the sheet says: `admin-interface.ts` definition, `runtime-preferences.ts` fallback, and the admin dock mirror `apps/admin/.../assistant-runtime-preferences.ts` (it would have shown the switch on while the server ran it off; plain `.ts`, no component or hook touched). Stored true stays true, stored false stays false (tests). A site that already booted with the old default flips on its next boot through the settings ledger's default reconciliation, with its stored choices untouched (test simulates the first-boot state).
- Scope size ratchets: the sheet's "net growth <= 4 lines" cannot hold, the ratchet fails on +1 (`Worsened violation`). I made the growth zero for all three counted values (`<file>` 945, `createSiteScope` 828, `onStarted` 440): the claim is appended to an existing call line, the two releases reuse existing lines, and three duplicate imports of the same module (`@jini-ai/core`, `@jini-ai/daemon`, `@jini-ai/daemon/http`) were merged to pay for the two new imports and the one new interface field. Another early draft renumbered the `<anonymous>#4` debt entry; avoided by not adding an arrow function before it.
- Test harness: `helpers/daemon-source.ts` gained `runId` and `executorSettles` options and three bindings; `agent-daemon-server.session-binding-wiring.unit.test.ts` binds the same helpers (its 6 cases otherwise failed with `releasingBrowserToo is not defined`).

## Why-comments (block 4.8, every printed line)
1. `admin-interface.ts`: "Default `true` (owner, 2026-10-22: it should just work)" rewritten: behaviour changed by OD-4; the new text names the old decision it replaces.
2. `AssistantDock/assistant-runtime-preferences.ts`: "Default on (owner-only, probe-gated server-side)" -> "Default off (OD-4; ...)".
3. and 4. `runtime-preferences.ts` two comment lines about "a default `true` here grants nothing alone": rewritten, the default is no longer `true`; the owner-only, probe-gated reason is kept.

## Honest notes
- `f40bd7b9` landed the Jini source without its `package.json` entry (unstaged); `86cc7d25` follows. That commit pair violates "export in the same commit" (4.9) for one push.
- `25a2d59e` did not pass alone: one existing launch test pinned the old default and I only found it in the final full run. `f6201a16` fixes it. Not squashed (no force-push).
- One path of the sheet is not unit-reachable: the `if (disposed)` branch between the claim and the executor (`disposed` is a captured boolean in the harness). It ends in `lifecycle.finish(cancelled)`, so it is released by the same terminal chain as the "cancelled" test.
- Not verified: no real Claude in Chrome run, no browser; the lease is proven through the real `onStarted` source with fake executor/lifecycle ports, as the sheet asks.
- S5 observation, not changed (outside the sheet's six words): other write-class tools open with read-like verbs (`Polls`, `Waits`, `Fetches`, `Opens`, `Reloads`, `Rescans`, `Validates`). Worth a look by the owner; no one-word check can tell if those really only read.

## Overlaps with tc-wave2a (wave2/tc-a: S1, S12a, S13, S6)
Files I touched that another sheet may also touch: `apps/website/src/server/inbound/assistant/__tests__/helpers/daemon-source.ts` (shared test harness, 3 small edits), `agent-daemon-scope.ts` (S17 is on reconcile sequence H3; imports merged, 3 lines edited), `assistant-runtime-guidance.ts`, `contracts/.../external-mcp` is untouched, `features/external-mcp/{operations-tools,agent-tools}.ts` (descriptions), `assistant/__tests__/fixtures/moved-tools.golden.json` (byte count; any run that changes a description will move it too). Rebase conflicts, if any, are in those files.

## REL (release step, not done here)
Tovu now imports `@jini-ai/daemon/exclusive-run-lease` (3 files). It exists only in the linked Jini build: publish `@jini-ai/daemon` with the new entry and bump Tovu's range before `npm run build` against the registry. `check:jini-registry-drift` is red at base and did not change.

## Next step
Merge `wave2/tc-b` (Jini first, then Tovu after REL), then S4a/S4b can scan the new guidance sentence.
