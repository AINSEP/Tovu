Programmer(Execution) + Refactor: loaded both canonical personas for bounded TypeScript fixes and desktop complexity assessment.

Inputs: the six assigned rows in `TRIAGE.md` (s2-37, s2-29, s1-35, s1-133, s1-45, s7-122), their original todo text, and the EXTRA sidebar finding. Todo numbers below are dispatch identifiers: another job changed `development/todos.md` during this session, so current line numbers differ. This job did not edit it.

ITEM 598: NOT DONE (depends on unassigned L-size integrations-port item 596 / s2-36 and hosted behavior decision 600 / s2-38).

- `apps/admin/src/features/providers/Providers.tsx:273` still intentionally wraps the fake-backed integrations UI in `ComingSoonPanel`; there is no live install-info port here.
- `apps/website/src/cli/program.ts:39` defines the actual CLI command registry and registers no `mcp` command. Merely replacing the fake path would still produce a nonfunctional command.
- The existing desktop launcher owner is `apps/desktop/src/sites-mcp-registration.ts` (`writeSitesMcpLauncher`, `buildSitesMcpRegistration`). Its `apps/desktop/bin/mcp-bridge.ts` serves desktop-owned capabilities, not the full site content/admin MCP server requested by the wider todo. Do not create another launcher resolver in the admin SPA or substitute a server filesystem path for a client's local executable.
- Coordinator next: land 596's live host port, then reuse the installed desktop launcher's command/argv (including its Windows contract) for 598. Keep the current inert presentation until that prerequisite lands.

ITEM 538: NOT DONE (source verification completed; Coordinator must reconcile the obsolete dev-link requirement).

- No dev-link installation mode/flag was found in Tovu's CLI, plugin runtime, install routes, or Jini's plugin implementation. No unsupported mode was added just to create a gate.
- `apps/website/src/features/plugin-runtime/install.ts:5` is the existing environment adapter. Local desktop/dev installs are allowed; hosted production requires the exact `TOVU_PLUGIN_LOCAL_INSTALL=1` opt-in. The old blanket claim that all local installs are env-gated is no longer true. Existing coverage documents this at `apps/website/src/features/plugin-runtime/__tests__/integration/source-runtime.integration.test.ts:223`.
- `apps/website/src/server/inbound/admin-http/routes/plugins/install.ts:20` consumes that policy before inspecting sources; its folder branch admits only `source.kind === "folder"`.
- Jini `packages/plugins/src/host/node/install.ts:82` snapshots bounded bytes, rejects symbolic/hard links, and checks the complete integrity map before publication (`:162`). `installSitePlugin` compares the reviewed digest before writing installed bytes. `loader.ts:138` checks integrity before SDK compatibility/import; `module-snapshot.ts:24` verifies the retained runtime snapshot again.
- Added a route unit test at `apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/install-route.unit.test.ts:108`: `dev-link`, `link`, and `symlink` sources are refused at preview AND install even with opt-in enabled, with no installer calls. This test was not run.
- Coordinator next: retire D5 as obsolete or explicitly scope a future dev-link mode and its policy. Preserve the current snapshot/integrity owner either way.

ITEM 87: NOT DONE (requires changes in the Jini diagnostics owner, outside writable roots).

- Tovu already delegates collection to `@jini-ai/diagnostics/web-evidence` in `apps/website/src/features/site-evidence/collect-page-evidence.ts:1`; `tool-registrations.ts` wires that existing browser port with authorization, verified origins, and bounded collection.
- Jini `packages/diagnostics/src/web-evidence/browser-port.ts` models document/network/cookie/accessibility observations, with no heap, DOM-total, hidden-panel, iframe-total or long-task report. Its on-demand `docs/ui-performance-check.md` is an operator recipe, not this assistant tool.
- The browser observation contract and adapter need extending in Jini before Tovu's thin registration adapter can expose the requested report. `/Users/la/Programming/Jini` is readable but outside this session's writable roots; approval escalation is disabled. No parallel collector or automatic capture was added to Tovu.

ITEM 300: NOT DONE (Electron notice packaging addressed; comprehensive dependency notices remain).

- Verified the installed electron-builder implementation removes `LICENSE` and `LICENSES.chromium.html` during macOS branding (`apps/desktop/node_modules/app-builder-lib/out/electron/electronMac.js:219`). Both originals exist in the installed Electron distribution.
- Added native `extraResources` entries in `apps/desktop/electron-builder.yml:63` to copy those originals into `licenses/` under the app's resources directory. This uses the same existing packager mechanism as Tovu/npm resources and avoids another copy script.
- Extended the existing production-matcher/copy test (`apps/desktop/src/electron-builder-files.test.ts:210`) to require both notice files and verify their copied contents. Updated the renderer notices document with their destination and its limited scope. No packaging or test command was run.
- A comprehensive shell/renderer/site-payload/bundled-npm dependency inventory is still absent. Searches of Tovu's packaging/scripts/manifests and Jini devops/desktop-host found no existing aggregate-notice owner to call. A generic generator belongs in Jini; that repo is not writable here. No generator or dependency was added, and existing font/kUInetic notices were retained.

ITEM 112: NOT DONE (confirmed defect in Jini, outside writable roots).

- Jini `packages/devops/src/deploy/reachability.ts:283` still returns immediately on the first protected candidate, before a later public candidate can be tried.
- Coordinator next: change that owner to retain a protected result, continue probing other candidates, prefer ready, and return protected only if none is ready. Add paired protected→ready and protected→unready cases beside its existing tests. No Tovu workaround was added.

ITEM 3027: NOT DONE (current scope exceeds ~M; no partial refactor or debt deletion).

- `apps/desktop/complexity-debt.json:3` records 18 violations across scripts, process lifecycle/stop logic, IPC, renderer, shared-site directories and site configuration. These are stored debt entries, not fresh measurements.
- Examples still in final source: `project-ipc.ts:317` `buildSiteRecord`, `:388` `handleList`; `renderer/SiteGrid.tsx:145` `SiteCard`; `renderer/App.tsx:613` `SiteWorkspace`; `shared-sites.ts:112` `shareSiteDirectories`. The debt list records values above ten for these; no new metric was run.
- This is broader than the old list of named 0.1.13 functions and requires multiple separately verified lifecycle/UI refactors. Coordinator should split by owner, run the existing metrics/gates when authorized, and remove entries only with fresh evidence. No threshold was relaxed.

ITEM EXTRA: DONE (implementation and regression tests added; execution intentionally deferred).

- Added `.cms-item` to the existing `SIDEBAR_CONTROL_SELECTOR` at `apps/admin/src/hooks/use-sidebar-empty-click-toggle.hooks.ts:17`. Native `Element.closest` already excludes descendants, including SVG paths. No listener/state/toggle lifecycle was duplicated.
- The adjacent hook unit test covers an inert row, SVG, SVG path, and text child, each followed by a real blank-space click to prove blank-space toggling still works. Existing drag/selection/mobile/control coverage was retained.

CHANGED FILES:

- `apps/admin/src/hooks/use-sidebar-empty-click-toggle.hooks.ts`
- `apps/admin/src/hooks/__tests__/use-sidebar-empty-click-toggle.hooks.test.tsx`
- `apps/desktop/electron-builder.yml`
- `apps/desktop/src/electron-builder-files.test.ts`
- `apps/desktop/src/renderer/public/THIRD_PARTY_NOTICES.md`
- `apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/install-route.unit.test.ts`
- This report.

Reuse: sidebar hit testing; searched Tovu sidebar hooks/tests and read the existing selector/listener contract; extended its selector and used native closest, with no new abstraction. Owner: the EXTRA brief names this hook.

Reuse: license preservation; searched Tovu desktop packaging/scripts/manifests and Jini devops/desktop-host for third-party notices and inspected installed electron-builder's branding/copy code; used native extraResources and extended the existing real-matcher/copy test. Owner record: todo 300's Electron packaging requirement.

Reuse: plugin link refusal verification; traced Tovu's CLI/HTTP install and policy adapter through Jini install/snapshot/loader owners; added only regression assertions against the existing source-kind boundary. No new installation behavior.

Architecture review: bounded changes preserve Jini ownership, dependency direction, existing public signatures, and hook placement. Architecture chapters 13/14 and the governance ADR index were consulted; no production gated-mutation, database, credential or plugin ownership boundary was changed. No new production functions, dependencies, or runtime I/O were introduced. Existing why comments were retained; the selector comment was corrected to include inert rows. Pattern followed the existing hook suite and packager copy fixture; the explicit dispatch to edit and report governs this bounded execution without a new approval checkpoint.

Function assessment: no production function body/signature changed. The existing sidebar predicate remains a pure decision over supplied click/context and native ancestor traversal (O(depth) time, O(1) auxiliary space); assertions cover each newly excluded target and the following allowed click. Native packager copy behavior is exercised through its existing fixture. Mechanical/runtime verification and coverage are INCONCLUSIVE because the dispatch forbids executing them; no passing results are claimed.

Pre-completion: reread the scoped diff and triage rows; `git diff --check -- <the six changed code/config/doc paths>` completed with no whitespace errors. Existing tests were extended without deleting or weakening assertions. The six paths were clean at the initial status check; this job's edits remain confined to them and this report. No behavior verification or packaged-output claim is implied by the whitespace check.

NOT DONE: items 598, 538, 87, 300 (partial), 112, 3027; all tests/typechecks/builds/package checks remain unrun by instruction. No dev server, benchmark, network command, flyctl, gh, commit or push was used. No changes made to protected paths or unrelated working-tree edits. Suggested next assignee: Coordinator for D5 reconciliation, 596 prerequisite and splitting 3027; Jini implementer for 87/112/comprehensive notices; authorized TestRunner for the three changed suites and package inspection.
