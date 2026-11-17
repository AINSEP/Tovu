Software Architect / Refactor(Review): **Verdict: needs rework.**

Reviewed DESIGN, INDEX, shared rules, and all 18 sheets. Source evidence below uses Tovu `80b00f5bb` and Jini `02edbb684`, both at the requested `refs/remotes/github/refactor/terra`. `P` means `tool-call-fixes/`; `T` and `J` identify source repositories. No files were edited; no builds or tests were run.

1. **Blocker — Family routing happens after a host safety gate that must classify the resolved tool.**

   **Evidence:** DESIGN M1’s security trace omits Tovu’s durable guard. T `agent-daemon-scope.ts:1512–1519` mounts `registerDurableToolGuard` before Jini’s delegated route. T `durable-run-routes.ts:60` skips unregistered IDs; lines 77–84 reject stale attempts and guard mutations only after that check. S2 resolves an unregistered family ID inside the later Jini route (`P/sheets/S2-tool-families.md:22–25`).

   Consequently, a family call can bypass the stale-attempt check that its concrete member would encounter. The generic port also permits writable members, which would bypass mutation ledger admission.

   **Fix:** Resolve the target once before every tool-dependent host gate, and carry that resolved request through durable admission, read-only enforcement, principal resolution, execution, and result capture. Add paired family/concrete tests against a stale durable attempt and a writable fake member.

2. **Blocker — Re-reading after a write does not prove that the next version belongs to this batch.**

   **Evidence:** DESIGN M6 claims foreign changes remain protected; S11 implements re-pinning by reading whatever bytes currently exist (`S11:27`). A foreign writer between this batch’s successful write and that read becomes the newly accepted baseline. S10’s concurrency test inserts the foreign write **after** re-pinning (`S10:20`), missing this window.

   The current persistence owner deliberately checks the reviewed version immediately before revision capture and replacement, without an intervening await: T `theme-files.ts:625–629`.

   **Fix:** Carry the version committed by this batch’s own write into the successor’s precondition. Do not establish ownership through a later unrestricted read. Test foreign writes before re-pinning, after re-pinning, and during asynchronous preparation.

   S11 also supplies `targetKey: p => p.target`, although DESIGN M6 declares `targetKey({ prepared })`. That callback would read the wrong object. Correct it and test distinct target keys.

3. **Blocker — S9 explicitly introduces forbidden server-framework coupling.**

   **Evidence:** `S9:35` puts a four-argument **Express handler** in `J http-kit/src/json-error-boundary.ts`. The owner prohibits a specific server framework in Jini. The approved R7 destination also keeps Express middleware in Tovu: `untangle/daemon/R7-ROUTES.md:276`.

   **Fix:** Keep Express mounting and body-parser adaptation in Tovu. Put any reusable decision or response construction behind framework-neutral contracts. Specify the post-R7 location and dependency explicitly; “preferred after” does not resolve the boundary violation.

4. **Blocker — S8 discloses previously hidden response text without an operation-owned disclosure decision.**

   **Evidence:** DESIGN M5 and `S8:27,33,36` expose a sanitized first line of arbitrary HTML/non-JSON error bodies. Today, J `daemon-client.ts:168–173` exposes only recognized envelope fields. J `http-kit/src/internal-error.ts:20–23` expressly separates the operator’s original error from caller-visible words.

   The error-system design requires operation-owner approval for disclosed causes (`designs/error-system/DESIGN.md:290–303`). Testing bearer tokens and URL queries does not test ordinary private prose.

   **Fix:** Unknown bodies should produce fixed transport-failure words plus a recorded reference. Only expose diagnostic text through an approved disclosure contract. Add ordinary private-text canaries, including failures before principal resolution.

5. **Major — The shared executor contract permits red commits and lacks required STOP gates.**

   **Evidence:** `P/sheets/README.md:19` says “Never gate a commit on green,” contradicting the requirement that every intermediate commit compile and pass. Its STOP list, lines 30–34, does not catch failed checks, uninjected hooks, lazy dependency imports, foreign-package implementation mocks, lost why-comments, or stale inventories. Barrels are prohibited, but no verification is specified.

   Decisions are also inconsistently gated: S1 declares no prerequisites despite open OD-1; S12 explicitly assumes OD-8 is yes.

   **Fix:** Rewrite the shared rules and sheet prerequisites as one contract. Demonstrate red tests locally, then commit the passing test and implementation together. Require applicable decisions/exceptions before dependent work and executable checks for the requested STOP conditions. No UI-hook extraction was found here, but the requested `useT`/`useAdminLocale` guard is absent.

6. **Major — Cross-package publication and Tovu consumption are missing from the migration graph.**

   **Evidence:** S1, S3, S6, S9, and S14 introduce functions consumed outside their defining package without scheduling concrete public entries and export-map updates. Existing entries resolve concrete files—for example J `core/package.json:111` onward and `diagnostics/package.json:50–53`.

   The shared setup runs `npm ci`; Tovu consumes registry versions such as `@jini-ai/core: ^0.7.0` (`T package.json:142–148`). Building a sibling checkout does not make those installed packages contain the new APIs. S11 says “linked Jini,” but the shared setup never establishes that link.

   **Fix:** Include public entries, manifest metadata, consumer imports, package builds, and either an explicit development-link procedure or release/version/lockfile updates in the prerequisite graph. Validate universal entries through browser builds as separate composition boundaries. Leave no publication repair for a later coordinator commit.

7. **Major — S3 confuses registry IDs with published MCP names.**

   **Evidence:** `S3:20,24–26` returns the tool ID as the direct call and proposes checking `toolIndex` by that name. J `core/src/tool-exposure.ts:26–29` transforms dotted, hyphenated, or otherwise unsafe IDs into hashed wire names; lines 33–45 handle collisions. J `tool-server.ts:260–261,269–270` indexes tools by **wire name**.

   The proposed `third_tool` test exercises only an unchanged spelling. Real `content_read.*` and `page.*` IDs exercise the missing contract.

   **Fix:** Return the actual published wire name from the exposure owner. Use that mapping for `callAs`, call text, and callable-list assertions. Test dotted IDs, long IDs, and reserved-name collisions.

8. **Major — S5’s named example is correctly classified already.**

   **Evidence:** DESIGN §2.3 presents `external_mcp_get_admissions` as classification drift. Its metadata explicitly says `approval.class: 'edit'` and explains OAuth refreshes: T `contracts/core/tool-metadata/external-mcp.ts:17–18`. Its catalog and independently derived risk both declare durable mutation: T `operations-tools.ts:33–44`.

   J `registration-kit.ts:411,435–437,523–535` already checks declared versus derived risk and derives `readOnly` centrally. Thus “nothing compares” these declarations is inaccurate. The planned red test names this tool because its description starts with “Reads,” not because its authorization classification disagrees.

   **Fix:** Reclassify this example as wording, preserve its write classification, and distinguish the existing risk invariant from any additional approval-metadata invariant. Do not report this refusal as an unresolved read-gateway defect.

9. **Major — S6/S7 identify the wrong daemon redaction implementation.**

   **Evidence:** DESIGN §2.4 says daemon failures use `redactSecrets` and its opaque-token pass. Today J `tool-recovery/redaction.ts:182,215–222` calls an injected `redactSecretShapes` port. T `tool-recovery-preset.ts:18,74–77` binds the secret-only implementation; T `packages/contracts/src/secret-redaction.ts:42–45` explicitly preserves tool IDs and ordinary diagnostics.

   S6’s characterization test also lives in `mcp` but calls daemon’s real `redactFailedResult` (`S6:12–14`), violating the required package-test boundary. The xpkg G-TESTS plan routes genuine multi-package tests to `packages/integration-tests` (`G-TESTS.md:34`).

   **Fix:** Trace and characterize the actual injected production binding first. Test each redactor in its owning package with shared fixtures; put genuine cross-package verification in the integration-test owner. Remove S7 unless that real path demonstrates a defect.

10. **Major — The vocabulary cannot reach several paths it promises to repair.**

    **Evidence:** `S6:35` obtains schema names from the called MCP tool’s wire schema. For gateway calls, that schema describes `toolId` and unconstrained `input`, not the domain schema: J `tools/delegated-tool.ts:182–199`.

    Envelope-derived vocabulary also arrives too late under the proposed changes. J `daemon-client.ts:244` sanitizes before throwing; `handleToolCall` sanitizes again at `tool-protocol.ts:329–331`. S8 adds only `code` and `requestId`, not the `details.toolId`, `executionId`, or `jobId` required by S6. Already masked text cannot be restored.

    **Fix:** Specify trusted schema and envelope metadata propagation before the first lossy sanitizer, including gateway calls and dynamically registered tools. Keep vocabulary separate from registration identity: `delegated-tool.ts:223` currently uses `diagnosticToolIds` as an `isRegistered` predicate.

11. **Major — Declared repairs do not cover their advertised execution paths.**

    **Evidence:** `S12:33` adds `clamp` to `search_tools` but leaves that tool without `schemaInput`. J `tool-protocol.ts:261–263` therefore skips the core normalizer; `tool-catalog-tools.ts:112` declares only aliases.

    Likewise, adding `obtainFrom` only to MCP’s `namedFieldMessage` does not fix delegated missing-field errors. The gateway accepts arbitrary domain input, then T `theme/tool-registrations.ts:633–635` calls `requireString`; J `registration-kit.ts:185–188` has no schema or `obtainFrom` information.

    Finally, S12’s promised coercion note is lost first: `normalizeToolArguments` converts integer strings without notes (`tool-arguments.ts:72–76,139–140`).

    **Fix:** Define one repair contract across typed publication and delegated execution. Enable normalization where required, propagate its notes, and place missing-field guidance where both paths can obtain the domain schema. Test both gateways as well as direct tools.

12. **Major — S14’s fallback reserve is outside multiple hard deadlines.**

    **Evidence:** `S14:29–30` creates a fresh reserve after budget exhaustion while giving the outer race the same total deadline. T `playwright-page-capture.ts:165–175` aborts at that deadline. Independently, J `render-page.ts:294–295` creates a hard timeout signal, and lines 311–313 close the context on abort. A fresh inner budget cannot revive that signal or closed context.

    **Fix:** Define the work deadline, fallback reserve, and hard cleanup deadline together across all three owners. End ordinary work early enough to retain the reserve. Test their simultaneous boundary behavior with one controlled clock and assert that cancellation never triggers fallback work.

13. **Major — The plan overlooks today’s independent human-approval deadline.**

    **Evidence:** INDEX OD-6 describes human waiting as bounded only by the run. Today J `core/src/approval.ts:14` defines `APPROVAL_WAIT_TIMEOUT_MS = 120_000`. J `daemon/src/tool-executor.ts:403–411` arms it independently and expressly prevents progress from extending it.

    **Fix:** Reconcile OD-6 with this current safety contract before claiming that progress fixes long approval waits. Characterize expiry and late confirmation, preserving zero effects after expiry/cancellation. Any change to that bound needs its own approved behavior decision.

14. **Major — S16 cannot satisfy the required CLI coverage.**

    **Evidence:** S16 probes only definitions with `externalMcpInjection` and allows unknown CLIs to remain unchanged (`S16:12,21,25`). J `defs/aider.ts:8,80–86` declares no MCP client. Gemini is absent from the selectable registry; its test explicitly asserts retirement (`defs/__tests__/gemini.test.ts:5–10`).

    S16 also leaves the actual Tovu timeout binding to an unscheduled “later one-line change” (`S16:30`).

    **Fix:** Provide an explicit Claude/Codex/Gemini/Aider/OpenCode support matrix, naming each real transport and approved unsupported case. Schedule the host binding and tests. Resolve the requested Gemini/Aider scope before marking the plan complete; neither an unknown probe nor a config-only change supplies working behavior.

15. **Major — S17 changes a fallback default while missing the registered default.**

    **Evidence:** S17 names `assistant/runtime-preferences.ts`, but T `features/settings/admin-interface.ts:81` separately registers `useClaudeInChrome` with `defaultValue: true`. The runtime reader asks the settings owner for its effective value before using its fallback.

    **Fix:** If OD-4 approves disabling the default, update the registered definition and fallback together. Test a fresh settings repository through `readAssistantRuntimePreferences`, plus an explicitly stored `true`. Testing only the exported fallback object misses the deployed behavior.

16. **Major — S17 does not define the host-wide lease instance or a sufficient release path.**

    **Evidence:** DESIGN M10 promises one lease per host, but `S17:25–26` supplies a factory and acquires inside site launch wiring without specifying where the shared instance is created and injected. T `agent-daemon-server.ts:194–201` hosts multiple independently created site scopes.

    Its proposed release hook awaits lifecycle termination (`agent-daemon-scope.ts:751–789`). That alone does not implement S17’s required “process exit without a terminal event” case.

    **Fix:** Create the lease at the shared daemon composition root and inject the same typed port into every scope. Specify release for acquisition followed by launch failure, child exit without terminal emission, cancellation, normal completion, and scope disposal. Test two different site scopes competing for the same instance.

17. **Major — Theme ownership overlaps are omitted from the landing order.**

    **Evidence:** The plan’s overlap section names R7/R8/ACP/error-system, but S11 edits `file-mutation-tools.ts` and `theme-files.ts`; S13 edits theme catalogs and `duplicate-theme-tool.ts`.

    On `plan/lanes-k-t-2026-11-16`, `T/T-TH-theme.md:29–31,40–41` assigns these to T-TH-05 and T-TH-08; `T-TH-08.files.tsv:3–4` explicitly lists duplicate-theme and file-mutation tools. `left-out-areas/INDEX.md:25` confirms lane T’s ownership.

    **Fix:** Add explicit landing edges and apply the fixes at the resulting destinations. Refresh affected blobs, imports, tests, and wording inventories after those moves. The broad S4b/S5/S13 sweeps also need their eventual file sets checked against the other lane inventories before dispatch.

18. **Major — The guide lint treats non-guide languages as tool instructions.**

    **Evidence:** `S4a:12–17` scans every string/template chunk and classifies an unknown snake-case call as an invented tool. T `platform/db/migrations/0003_coercion_json_as_json.ts:21` contains SQL calls `json_quote(...)` and `json_valid(...)`; T `features/project-keys/attachments.ts:24` contains `json_each(...)` and `json_extract(...)`. These are legitimate strings inside the proposed scan scope.

    **Fix:** Establish model-facing text provenance or contextual extraction before enforcing the grammar. Add negative fixtures for SQL, templates, identifiers, and schema syntax. Do not make S4b repair application code to satisfy this detector.

19. **Major — S8/S9 do not wire the promised single reporting path.**

    **Evidence:** S8 adds optional `ids`/`log` to `DaemonRequestOptions`, but does not schedule their propagation through `McpToolServerOptions`, `McpToolContext`, `daemonCallOptions`, and `assembleRunToolHost`. The current mapper forwards only fetch, diagnostic IDs, headers, and signal (`J tool-protocol.ts:102–108`).

    S9 says to reuse the delegated route’s existing incident sink. Its Tovu dependency object has no `onInternalError` (`agent-daemon-scope.ts:1492–1511`); `delegatedToolErrorDisclosure` returns only two disclosure callbacks (`J redaction.ts:156–162`).

    **Fix:** Make the error-system reporter wiring an explicit prerequisite or fully specify an interim injected adapter and its replacement. Test through the assembled MCP host that one failure produces one recorded incident with the displayed reference. Optional ports tested only through direct client calls do not prove production wiring.

20. **Minor — INDEX gives contradictory parallel-dispatch instructions.**

    **Evidence:** `INDEX.md:83` calls the first wave file-disjoint, then lines 88–90 identify S1/S3/S6 sharing `tool-protocol.ts` and S3/S15 sharing `tool-server.ts`.

    **Fix:** Publish one authoritative dependency/serialization graph. Recompute fit accounting too: `tool-exposure.ts:161–163` caps exposed descriptors; local tools occupy reserved names but are not counted by that 64-descriptor check.

The requested spot-check covered these 18 claim/inventory rows:

| Claimed behavior | Source checked | Result |
|---|---|---|
| Unknown constrained tool → denial | J `delegated-tools.ts:156–161` | Present |
| Unconstrained input error → 400 | J `delegated-tools.ts:381–382` | Present |
| Describe unknown → 404 | J `tool-catalog.ts:89–96` | Present |
| MCP-local unknown wording | J `tool-protocol.ts:304–305` | Present |
| Exposure limit 64 / 256 KiB | J `tool-exposure.ts:210–211` | Present; accounting differs |
| Publication can skip at capacity | J `tool-exposure.ts:180–182` | Present |
| Admissions classification drift | T `external-mcp.ts:17–18`; `operations-tools.ts:33–44` | Named mismatch disproved |
| Central risk/read-only owner absent | J `registration-kit.ts:509,523–535` | Claim disproved |
| Opaque-token threshold is 20 | J `redact.ts:338` | Present |
| Slug exemption excludes mixed segments | J `sanitize-untrusted-text.ts:103–109` | Present |
| Daemon uses aggressive opaque redaction | J `redaction.ts:182,218,222`; T preset `:75` | Claim disproved |
| Client recognizes nested envelope only | J `daemon-client.ts:168–173` | Present |
| Auth precedes 6 MB parser | T `agent-daemon-scope.ts:1398–1407` | Present |
| Batch prepares all items before effects | J `approval.ts:226,243–245` | Present |
| Theme stale checks exist twice | T `file-mutation-tools.ts:56–58`; `theme-files.ts:674–676` | Present |
| Saved-result limit is 8000 | J `tool-result-pages.ts:46–48` | Present |
| Duplicate-theme lacks `sourceId` alias | T `duplicate-theme-tool.ts:48–54` | Present |
| Chrome defaults on | T runtime preferences `:25`; settings definition `:81` | Present in two owners |

Actual CLI timeout/reset behavior, Node’s deployed header-timeout behavior, booted registry counts, pin-fit counts, and observed characterization outputs remain unverified. The estimates therefore lack verified inventories for the broad sweeps.

## Recurring mistake classes

- Carry diagnostic metadata through the transport **before** its first lossy transformation; downstream sanitizers cannot reconstruct erased information.
- Reserve fallback time inside every enclosing hard deadline, including abort signals and resource-close handlers.
- Derive callable instructions from the publisher’s actual wire-name mapping; registry identity alone does not establish callable spelling.
- Scope source-text lints by the language and audience of the string. SQL and other embedded languages need negative fixtures before enforcement.
