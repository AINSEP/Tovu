Software Architect / Refactor(Review): **Verdict: needs rework.**

Reviewed INDEX, COMMON, and all seven sheets at plan commit `1bc534c87`. Source evidence uses Tovu `refactor/terra` (`80b00f5bb`) and Jini `refactor/terra` (`02edbb684`), with desktop-args and the plan’s merge-input SHAs checked where relevant. No files were edited; no builds or runtime tests were run.

Below, `P/` means `desktop-extraction/`, `D/` means Tovu `apps/desktop/`, `W/` means Tovu `apps/website/src/`, and `J/` means Jini `packages/`.

1. **Blocker — D1’s adoption table weakens existing sender gates.**

   **Evidence:** `P/D1-ipc-lifecycle.md:72–76` assigns policy `frame` to everything exposed only by `preload.mts`. However, `D/src/resources-ipc.ts:25–28` and `D/src/owner-store-ipc.ts:210–216` independently require a **main frame**, rejecting subframes even when their URL matches. The proposed default `frame` policy does not enforce that condition (`P/D1-ipc-lifecycle.md:54`).

   The telemetry row also calls the broad `isShellPage` predicate “unchanged,” overlooking the host’s additional `file:` restriction at `D/src/main/updates/product-telemetry-boot.ts:115–117`. Both restrictions remain present in the plan’s merge-a input.

   **Fix:** Inventory the complete predicates, including host wrappers. Preserve frame-only, main-frame-only, and main-frame-plus-page policies separately. Add same-URL subframe tests for resources/shared keys and a supervised-site telemetry test; each must fail when its specific restriction is removed.

2. **Blocker — D3b replaces identity-checked escalation with a weaker termination primitive.**

   **Evidence:** `P/D3-supervision.md:64–69` replaces the local termination sequence with `ProcessControlPort.stopProcesses`, comparing signals and grace periods. The existing `D/src/site-process-registry.ts:505–521` rechecks process identity immediately before escalation.

   Jini’s `J/platform/src/process.ts:577–583` waits after the first signal and then signals surviving PIDs without another identity check. Its port exposes no identity callback (`J/core/src/contracts/runtime/process.ts:47–50`).

   **Fix:** Preserve identity verification at escalation through an appropriate typed termination port. Add a test where identity changes during the grace interval and assert that escalation does not occur. Matching signal names and timeout lengths is insufficient.

3. **Blocker — D3b substitutes registry ownership for child parentage.**

   **Evidence:** `P/D3-supervision.md:73` defines orphanhood using the owner PID from the registry filename. The actual termination guard is `isOrphanedProcess`, which checks the child’s parent PID (`D/src/site-process-registry.ts:432–458,569–574`).

   Registry-owner liveness separately controls file deletion/quarantine (`:585–598`). The source explicitly explains that a recycled owner PID may retain a file while its orphaned children are still reconciled (`:538–542`). The nonce prevents adopting another instance’s filename; it does not prove a live PID’s identity.

   **Fix:** Keep child-parentage admission and registry-file cleanup as separate decisions. Characterize live owners, recycled owner PIDs, unknown parentage, and legacy registry rows independently.

4. **Major — D3b’s asynchronous process port has no migration through synchronous consumers.**

   **Evidence:** `ProcessControlPort.listProcessSnapshots` returns a promise (`J/core/src/contracts/runtime/process.ts:48`). Today, `isLiveServeRow` returns a synchronous boolean (`D/src/site-process-registry.ts:318–320`), consumed inside `Array.filter` by `liveForeignServers` (`D/src/project-ipc.ts:989–992`).

   Nevertheless, `P/D3-supervision.md:75` preserves exported names and leaves importers unchanged.

   **Fix:** Specify whether the host supplies a synchronous observation capability or the affected call chain becomes asynchronous. Include dependency types, deletion guards, callers, and tests in the same migration step. A promise cannot replace this predicate inside `filter`.

5. **Blocker — D0c is not a resolved package extraction graph.**

   **Evidence:** `P/D0-website-imports.md:89–96` schedules four module moves, one per green commit, while acknowledging unresolved closures.

   `W/server/runtime/composition/product-telemetry.ts` imports an additional `build-release` module at line 16 and dynamically imports host binding and provider contracts at lines 120–121. Those dependencies have no assigned move, injection contract, or prerequisite in D0c.

   The same file computes `INSTALL_ROOT` and `KEEP_ROOTS` from its own location (`:32–37`) and uses that root for provider lookup (`:123–125`). Moving it changes those facts. Injecting `resolvePackage` alone does not preserve them.

   **Fix:** Finish the closure and ownership decisions before dispatch. Keep host composition in Tovu and define the package’s exact required inputs, including artifact roots and provider bindings. Give every intermediate commit a complete import graph and test layout.

6. **Major — The prescribed packaged-closure proof cannot run as written.**

   **Evidence:** `P/COMMON.md:70` and `P/D0-website-imports.md:106` prescribe:

   `npm run stage && node scripts/verify-staged-closure.ts`

   The verifier requires `--asar <archive>` and throws without it (`D/scripts/verify-staged-closure.ts:32–34`). It audits an already-built archive, not just staging directories.

   D0c2 also removes the website resource, but the verifier unconditionally copies the archive’s sibling `website` directory (`:39–40`). D0c2’s specified search for `website-shared|Resources/website` does not identify that executable path expression.

   **Fix:** Specify stage → package → archive audit with actual macOS/Windows archive paths. Update the verifier’s resource model atomically with resource removal. Require closure verification for each runtime package-move step.

7. **Major — COMMON leaves installation-critical work outside green commits.**

   **Evidence:** `P/COMMON.md:60` requires unlinking Jini before packaging, but the sheets consume newly added Jini exports without scheduling publication or another reproducible installation mechanism. Unlinking restores registry packages; it does not install the new branch’s exports.

   `P/COMMON.md:62` also reserves lockfiles for the coordinator while D0 changes dependencies and D2 adds an example. The baseline uses `npm ci` (`:25`). A manifest change plus an unapplied coordinator lockfile change is not a green, reproducible commit.

   Finally, S1 says verify before committing (`:34`), while section 5 says commit, then verify, then commit fixes (`:61`).

   **Fix:** Define an atomic landing unit containing manifests, lockfiles, export metadata, and consumers. Schedule how the exact Jini artifact reaches unlinked packaging builds. Resolve the contradictory commit instructions.

8. **Major — D5 waits for an outcome daemon R7 does not promise.**

   **Evidence:** `P/D5-chat.md:8–10` says R7 removes Express from `desktop-agent.ts` and makes absence of Express a prerequisite.

   R7’s design instead mounts converted routes through a Node dispatcher while preserving host middleware and mount positions: `untangle/daemon/R7-ROUTES.md:331–350`. Route conversion is not removal of the host framework.

   The desktop host currently owns parsing and authorization around those routes (`D/src/desktop-agent.ts:360–380`).

   **Fix:** Depend on the converted route contracts and compatible host bindings. If eliminating desktop Express is required, schedule that separate host migration with its parser, authorization, error, and socket tests.

9. **Major — D5a assumes a renderer bridge capability that does not exist.**

   **Evidence:** `P/D5-chat.md:35–37` says `runner-api.ts` supplies `{ invoke, subscribe }`. It supplies operation-specific methods and `onChatEvent` instead (`D/src/renderer/runner-api.ts:37–163`). Raw `ipcRenderer.invoke` is confined to the preload (`D/src/preload/preload.mts:84–125`).

   The transport also contains Tovu-specific mirrored-tool suppression through `desktopVerbForAgentToolName` (`D/src/renderer/workspace-chat-transport.ts:139–156`). The proposed contract supplies channels, but no policy port for that behavior.

   **Fix:** Design a renderer-safe operation port that the existing bridge can implement. Specify the host tool-classification binding and preserve its suppression behavior. Do not expose unrestricted channel invocation merely to satisfy the proposed API.

10. **Major — D5b’s “generic conversation store” inventory omits persisted audit behavior.**

    **Evidence:** The equivalence test in `P/D5-chat.md:45` considers conversation list/rename/delete/save-message behavior. The real store additionally owns `appendToolGap`, `listToolGaps`, decoding, retention, and preservation of audit metadata on every conversation write (`D/src/workspace-conversation-store.ts:1–2,25–35,90–116`).

    Moving the file as proposed would also introduce a forbidden chat → daemon import. Replacing it based only on conversation methods can remove the audit surface used by `D/src/desktop-agent.ts:348–355,390–398`.

    **Fix:** Inventory the complete store contract and persisted document. Preserve both data families and their shared write lock. Resolve audit decoding through an approved owner or typed host port before selecting the store replacement.

11. **Major — D5b adds run ownership semantics without defining their lifecycle.**

    **Evidence:** `P/D5-chat.md:47` requires sender B to be unable to reattach or stop sender A’s run. Today, reattach and stop use run identifiers without that sender-ownership rule (`D/src/workspace-chat-ipc.ts:172–181`). This is additional hardening, unlike the characterized baseline.

    The renderer deliberately supports pane disposal and later reattachment (`D/src/renderer/workspace-chat-transport.ts:269–279,405–431`). No contract explains ownership after window destruction, renderer replacement, or loss of the originating sender.

    **Fix:** Route this behavioral change through an explicit decision. Define the authorization identity, ownership lifetime, recovery behavior, and treatment of status/detach as well as stop/reattach. Test the existing behavior before changing expectations.

12. **Major — D4a’s security characterization describes guards the source does not have.**

    **Evidence:** `P/D4-registry.md:40` requires refusal when a path escapes scan roots and when an open-external surface is outside an allowed set.

    The erase rule protects provenance, identity, and containment **inside the repository**, not containment within scan roots (`D/src/project-delete-guard.ts:177–181`). A non-erasable row normally becomes card removal rather than a thrown deletion refusal (`D/src/project-ipc.ts:1041–1074`).

    `handleOpenExternal` checks the open-site map, then selects `/` for `"site"` and `/admin/` otherwise (`:1278–1284`). It has no runtime surface allowlist. Desktop-args retains that behavior at `project-ipc.ts:1186–1192`.

    **Fix:** Characterize actual filesystem effects, card removal, refusals, and URL construction. Any stricter runtime admission belongs in a separately approved change.

13. **Major — D4b invents relocation contracts and omits a security-relevant transformation.**

    **Evidence:** `P/D4-registry.md:62` asks for a relocation gate that shares an in-flight promise. The real gate is synchronous `shouldRun`, using a change picture and elapsed time (`D/src/site-relocation.ts:230–245`).

    The claimed four-outcome return contract (`P/D4-registry.md:58`) also does not exist: ambiguous/missing targets return `null`, while reports contain moved/merged arrays (`site-relocation.ts:35–40,106–117`).

    More importantly, `movedRow` deliberately changes provenance to adopted and drops the erase identity (`:120–128`). The plan moves it into generic code without specifying the host transformation port. The identity marker is `.site-meta.json`, not the `config.json` described at `P/D4-registry.md:10`.

    **Fix:** Preserve the real gate and result contract. Keep the provenance downgrade explicit through a host-owned row transformation and test that relocated folders do not become erasable.

14. **Major — D0c1’s listener characterization requires a behavior change.**

    **Evidence:** `P/D0-website-imports.md:94` says installers are idempotent and specifies two installs followed by one dispose returning listener counts to baseline.

    `W/server/runtime/boot/process-error-guards.ts:59–71` explicitly documents independent installations and per-call disposal. Lines 75–85 add one listener per call; `installProcessErrorReporting` likewise installs and removes its own listeners at lines 139–141.

    **Fix:** Test independent registrations and independent disposal. If deduplication is desired, specify its ownership/reference-counting behavior as a separate change.

15. **Major — D0’s export and consumer instructions leave incomplete intermediate states.**

    **Evidence:** D0a explicitly updates only line 14 of `contracts/headless/index.ts` (`P/D0-website-imports.md:54`), but line 13 also references the file being deleted. Following that instruction literally leaves a missing type-export target.

    D0b conditionally moves `log-buffer.ts` and deletes its original (`:71–75`), but lists export keys only for local-text and console-tee. The buffer’s direct consumers need an accessible defining module too.

    **Fix:** Enumerate both type and value consumers. Put the complete export-map and importer changes in the commit that removes each defining file.

16. **Major — The plan grants itself owner-rule exceptions and moves host policy into Jini.**

    **Evidence:** `P/COMMON.md:43`, `P/D4-registry.md:67`, and `P/D6-renderer.md:28` permit `@jini-ai/ui-kit/react`, contrary to the supplied package-import rule. D0a declares its own allowed re-export exception (`P/D0-website-imports.md:54`) without recording approval.

    D1c2 moves `desktopUpdaterSkipReason` into Jini (`P/D1-ipc-lifecycle.md:125`), although its source reads the Tovu installation switch directly (`D/src/main/updates/desktop-updater.ts:62–71`). The moved manual-check functions also contain Tovu copy (`D/src/update-check-now.ts:53–56,128–130`).

    **Fix:** Apply approved exceptions before planning dependent work. Otherwise obey the import rule, repoint moved-symbol consumers directly, and retain product env interpretation and product copy in host bindings.

17. **Major — S9 does not enforce the limits it claims, and literal moves exceed them.**

    **Evidence:** `P/COMMON.md:42` names `pnpm guard` for Jini function/file limits. Its actual check list is boundary, neutrality, isolation, and related guards (`Jini scripts/guard.ts:88–109`), not size/complexity checks. Jini exposes separate `check:size`, `check:complexity`, and `complexity:strict` commands (`Jini package.json:24–27`).

    D1c1 says everything else moves verbatim (`P/D1-ipc-lifecycle.md:104`), but `createLastWindowQuitPrompt` spans `D/src/main/windows/last-window-quit.ts:107–170`. `createDesktopUpdater` spans `desktop-updater.ts:81–193`. Both exceed 50 lines before extraction.

    **Fix:** Specify the actual required checks and split these functions during design, including state ownership and handoffs. Do not leave compliance to a later executor encountering a red gate.

18. **Major — The STOP checks miss required cases and use stale starting inventories.**

    **Evidence:** S2 scans only added single-line imports in `.tsx` (`P/COMMON.md:35`), missing multiline imports, `.ts` hook modules, and retained imports whose usage becomes uninjected. S6 compares comment counts (`:39`); equal counts do not establish that why-comments survived.

    D0 declares an exact sixteen-module starting inventory (`P/D0-website-imports.md:5–31`), then requires later runs to start after earlier runs delete/repoint several of those modules. It provides no post-D0a inventory for D0b. Most other sheets lack the executable Inventory block COMMON requires.

    S3 checks added lines only, while INDEX explicitly leaves existing lazy imports to OD-7, which blocks nothing and has no executable sheet (`P/INDEX.md:150`). D0c itself moves literal dynamic imports (`W/server/runtime/composition/product-telemetry.ts:120–121`).

    **Fix:** Supply per-run starting inventories and tested detection commands. Check hook bindings across all relevant source forms, track comment content, and schedule declared-dependency lazy-import removal as an actual prerequisite rather than an unscheduled recommendation.

19. **Major — The wave schedule contradicts its file-serialization contract.**

    **Evidence:** W1 contains D0a, D3a, and D1c1 (`P/INDEX.md:81`). All touch `main/index.ts`; D0a and D3a also touch `project-ipc.ts` and `tovu-server.ts`. Section 6 acknowledges only the D0a/D1c1 W1 collision (`:127–129`).

    W2 similarly includes D1b1 and D1c2, both editing `main/index.ts`, while section 6 says never to run two such sheets on unmerged bases. `desktop-host/package.json` is shared by multiple same-wave runs despite the “never two in flight unmerged” rule (`:135`).

    **Fix:** Produce one consistent execution graph with explicit serial landing dependencies for source files and manifests. Rebase-before-push does not establish the prerequisites needed by concurrent executors.

20. **Minor — D2’s test command invokes the shell predicate, not a test runner.**

    **Evidence:** `P/D2-notes-desktop.md:52` prescribes:

    `pnpm --filter @jini-example/notes-desktop... build && test`

    The final `test` is the shell builtin with no operands, which returns failure.

    **Fix:** Give the example a concrete test script and invoke it through pnpm, naming the intended package.

The requested classification sampling covered all sixteen D0 inventory rows, plus supervision and relocation rows. Selected source checks:

| Inventory row | Source checked | Result relevant to classification |
|---|---|---|
| Daemon exit codes | `W/assistant/daemon-exit-codes.ts:14–20` | Constants; no imports |
| Hosted sign-in paths | `W/contracts/core/hosted-sign-in-links.ts:4–9` | Pure path recognizers; caller owns URL admission |
| Host signals | `W/contracts/core/host-signals.ts:37–43,62–93` | Pure rules with security fallback |
| Native fallbacks | `W/contracts/core/assistant-native-fallbacks.ts:1–2,30–38` | Depends on both policy and host-signal definitions |
| Subagents shell | `W/assistant/assistant-subagents-policy.ts:1` | Re-exports native-fallback behavior |
| Headless barrel | `W/contracts/headless/index.ts:13–14` | Both type and value edges need handling |
| Local-text redaction | `W/platform/server-logs/redact-local-text.ts:1–3,19–26` | Node adapter around existing diagnostics redaction |
| Console tee | `W/platform/server-logs/console-tee.ts:1–5,27–38` | Node streams plus framed redaction |
| Process guards | `W/server/runtime/boot/process-error-guards.ts:59–85` | Independent listener installations |
| Export eligibility | `W/server/runtime/composition/observability-export.ts:35–46` | Host/root-dependent composition |
| Product telemetry | `W/server/runtime/composition/product-telemetry.ts:16,32–37,120–125` | Additional closure and location-sensitive roots |
| Product events | `W/server/runtime/composition/product-events.ts:1–8` | Product vocabulary; daemon audit dependency |
| Startup secrets | `W/server/runtime/boot/startup-secrets.ts:8–33` | Shared process state and cached initialization promise |
| Daemon connection | `W/server/runtime/lifecycle/assistant-daemon-connection.ts:9–45` | Schemas plus separate mutable connection state |
| Bundled host signals | `W/features/agent-plugins/host-signals.ts:35–50,75–83` | Filesystem reader with baseline fallback |
| Site paths | `W/server/runtime/composition/site-paths.ts:1–7` | Broad host path module; bundled-root owner is elsewhere |
| Keyed serializer | `D/src/keyed-serializer.ts` | Import-free per-key mechanism |
| Transitions | `D/src/site-transitions.ts` | Import-free keyed state |
| Fleet supervisor | `D/src/site-supervisor.ts` | Import-free lifecycle holder |
| Relocation | `D/src/site-relocation.ts:120–128,230–245` | Product provenance transformation and synchronous gate |

I checked the specified xpkg, S/U, K/T, and left-out plan surfaces for overlapping ownership. No additional concrete overlap was established beyond the acknowledged R11 and daemon coordination surfaces; finding 8 concerns an incorrect dependency outcome, not duplicate ownership.

The unpublished composite reading tree and its aggregate counts were not reproduced. Windows runtime behavior, packaged closure, visual parity, and test results remain unverified. INDEX’s token estimates therefore remain unsupported delivery bounds, especially where executors are assigned unresolved architecture and compatibility decisions.

## Recurring mistake classes

- Module location can be an input to behavior. Inventory `import.meta.url`/directory-derived roots separately from import resolution before relocating a module.
- Registry-file ownership and child-process lineage authorize different actions. Preserve separate evidence for file cleanup and process termination.
