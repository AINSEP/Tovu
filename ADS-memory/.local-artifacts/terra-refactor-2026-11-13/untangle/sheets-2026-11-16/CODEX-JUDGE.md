Software Architect(Review): **Verdict: needs rework.**

Read-only review completed. No files were edited, checked out, built, or tested.

References below use:

- **S/**: the supplied `sheets-2026-11-16/` directory at `plan/xpkg-lane-sheets-2026-11-16`.
- **J/** and **T/**: Jini and Tovu at their supplied `refactor/terra` refs.
- **C6/** and **DP/**: Jini’s supplied `refactor/c6` and `refactor/daemon-prereqs` refs.

### Findings

1. **Blocker — Coordinator-only edits make the promised green commits impossible.**

   **Evidence:** `S/COMMON.md:17` requires every commit to pass independently, but `:33` reserves `scripts/injection-debt.json`, core’s manifest, and several host bindings for later coordinator edits.

   The existing gate rejects stale allowances: `J/scripts/lib/injection-debt.ts:56` produces `injection-debt-stale`, and `:89` includes it in failures. For example, deleting commerce’s imports leaves the allowances at `J/scripts/injection-debt.json:79` and `:80` stale. G-STALE-DEPS encounters the same problem immediately when deleting admin’s declarations.

   New core entries have the corresponding problem: G-TESTS consumers cannot import `core/contracts/runtime/testing` until the coordinator adds its export.

   **Fix:** Define coordinator changes as part of each atomic commit and validation unit. A report containing pending lines cannot substitute for the changes needed to make that commit pass.

2. **Blocker — The specified Tovu base is incompatible with the specified Jini base.**

   **Evidence:** `S/COMMON.md:4` selects Jini with C6 merged, while `:5` selects Tovu `refactor/terra`. That Tovu source still imports the removed entry:

   - `T/apps/website/src/server/inbound/assistant/agent-daemon-core-client.ts:9`
   - `T/apps/website/src/server/runtime/composition/provider-plugins.ts:10`

   Both import `@jini-ai/agent-runtime/ai-trace`. Desktop also imports moved types from the old root at `T/apps/desktop/src/desktop-agent-inventory.ts:12`.

   `C6/cloud-results/c6.md:20` explicitly says the desktop repoint remains a held patch and desktop does not typecheck without it.

   **Fix:** Pin compatible SHAs in both repositories, including the Tovu C6/prerequisite changes and an explicit disposition for the desktop patch. Establish that paired baseline before dispatch.

3. **Blocker — The commerce migration replacement loses its ledger contract and has the wrong executable call shape.**

   **Evidence:** `S/R6-R9-storage-consumers.md:44` proposes calling:

   ```ts
   runMigrations({ kernel, steps: COMMERCE_PAYMENTS_MIGRATIONS }, optional)
   ```

   The real function takes three positional arguments at `J/packages/db/src/migrate/runner.ts:217`: kernel, steps, and required options.

   More seriously, the existing wrapper forces `ledgerTable: COMMERCE_PAYMENTS_LEDGER_TABLE` at `J/packages/commerce/src/payments/ledger/migrations/index.ts:51`. The dedicated ledger and migration-lock identity are documented at `:12` and `:20`. The proposed replacement omits them.

   The proposed test at `S/R6-R9-storage-consumers.md:23` checks step IDs and order; it cannot detect losing the ledger table, lock identity, or forwarded backup options.

   **Fix:** Specify the exact host wrapper using the real three-argument API and preserving the forced ledger table. Characterize ledger selection, option forwarding, rerun behavior, and coexistence with the host’s other migrations.

4. **Blocker — R10b’s state-binding design cannot reach several functions it claims to cover.**

   **Evidence:** `S/R10-agent-runtime.md:74` says adding ports to `AgentRuntimeState` preserves every existing signature. However:

   - `C6/packages/agent-runtime/src/env.ts:95` has no state argument.
   - `C6/packages/agent-runtime/src/claude-filesystem-policy.ts:12` has no state argument.
   - `C6/packages/agent-runtime/src/providers/pkce.ts:101` has no state argument.
   - PKCE constructs `guard` at module initialization at `:135`.

   The existing C6 binding also calls `validateFilesystemLaunch(required)` without state at `C6/packages/agent-runtime/src/runtime-port-bindings.ts:68`.

   Binding ports into a host’s private state therefore does not make these calls use that state. Falling back to a shared instance would defeat host isolation; reading injected OAuth factories during module initialization would precede the proposed bind call.

   **Fix:** Resolve OD-4 before dispatch. Specify the complete dependency path through the existing native-runtime/binding owner, including PKCE initialization. Test two independent hosts with different ports.

5. **Blocker — The proposed search descriptor drops security-sensitive validation and does not match the receiving API.**

   **Evidence:** `S/R11-platform-consumers.md:160` proposes:

   ```ts
   { contract: SEARCH_CONTRACT, manifestSchemaVersion, validate: validateSearchProvider }
   ```

   The receiver requires `filename`, `parse`, and a validator returning the provider or a refusal string: `J/packages/agent-plugins/src/lifecycle/provider-contribution.ts:44`.

   `validateSearchProvider` instead accepts `{ provider }` and returns `string | undefined`: `J/packages/search/src/registry.ts:61`.

   The existing contribution layer additionally:

   - refuses restricted-content vendors at `J/packages/search/src/contribution.ts:95`;
   - checks manifest/provider ID equality at `:120`;
   - preserves loader recovery options at `:108`.

   None is represented by the proposed descriptor. Existing refusal assertions are explicit at `J/packages/search/src/__tests__/contribution.test.ts:55`.

   **Fix:** Preserve the existing parser and contributed-provider validator, and explicitly retain the post-load ID check and recovery policy. Specify a descriptor/host assembly contract that actually fits `defineProviderContribution`.

6. **Blocker — R12’s server-provider wiring bypasses the real packaged-provider initialization path.**

   **Evidence:** `S/R12-providers.md:24`–`:27` proposes helper injection plus a new Tovu `stripeProvider satisfies PaymentProvider` binding. The deployed entry registers `createStripeProvider`, which calls `createStripePaymentProvider({})` at `J/packages/provider-plugins/src/payments-stripe/index.ts:13`.

   Tovu initializes registered factories through `host.initialize`, passing saved settings and `factoryOptions` at `T/apps/website/src/server/runtime/composition/provider-plugins.ts:383`. The sheet does not update that existing owner.

   These providers are distributed as built artifacts, not ordinary exported source factories: see `J/packages/provider-plugins/package.json:58` and `scripts/build.ts:159`.

   OTel has the same omission: `observability-opentelemetry/index.ts:131` constructs its adapter without the proposed required helpers.

   **Fix:** Extend the existing provider-host initialization path. Name the factory ABI, contract-specific helper bindings, entrypoint updates, and packed-artifact tests. Do not introduce a second provider assembly path.

7. **Major — R12b puts browser cleanup injection in server composition and tests the wrong lifecycle event.**

   **Evidence:** `S/R12-providers.md:30` says the host binds `purgeStorage`, with the INDEX assigning R12 bindings to server composition.

   The consumer is a separately delivered browser module. It exports an already-created adapter at `J/packages/provider-plugins/src/analytics-posthog/consent-adapter.ts:202`; the builder emits that module separately at `scripts/build.ts:104`; `consent.ts:83` gives the browser its URL and serializable configuration.

   A function bound in server composition does not reach that module. Also, the existing direct purge occurs in `onState` at `consent-adapter.ts:159`, while `revoke` delegates subsequent storage purging to the consent client at `:182`. A revoke-only test misses off/anonymous-state cleanup.

   **Fix:** Define injection at the browser consent-loader boundary. Test off-mode initialization, full-to-anonymous changes, and revocation using the built browser artifact.

8. **Major — R11a’s first commit breaks existing lifecycle constructors before their scheduled repair.**

   **Evidence:** `S/R11-platform-consumers.md:74` adds required lifecycle ports in step 1. Moving/extending `createNodeAgentPluginEffects` and repointing its consumers happens in step 2 at `:75`.

   The existing effects factory returns no `fileLock` or `atomicWriter`: `J/packages/agent-plugins/src/lifecycle/node.ts:13`.

   Consumers construct the required lifecycle object from those effects:

   - `J/examples/neutral-host/src/neutral-host/support/host.ts:68`
   - `J/packages/agent-plugins/tests/plugin-uninstall-message.unit.test.ts:29`

   Updating only the shared test support in step 1 does not repair these constructors.

   **Fix:** Put required-port introduction, adapter changes, and every constructor update in the same commit. Include the Tovu consumer binding in its paired change.

9. **Major — The file-disjointness claim fails beyond the census’s edge-bearing files.**

   **Evidence:** `S/INDEX.md:82` derives disjointness from assigning each importing file one R lane. That excludes callers and shared manifests.

   Three conflicts remain:

   - **R11a/R11b:** `R11-platform-consumers.md:141` permits R11b to create R11a’s `jini-file-ports.ts` when it has not landed. Both run in wave 2.
   - **R1c/R2b:** both can edit `packages/admin/package.json` in wave 2 (`R1-R2-admin.md:24`, `:76`). The INDEX does not serialize these sub-sheet edits.
   - **R12b/R12c:** R12c changes shared `telemetry-reporter.ts`, whose PostHog caller is `J/packages/provider-plugins/src/analytics-posthog/posthog.ts:45`, owned by R12b. Required-helper propagation crosses their claimed folder boundary.

   **Fix:** Compute ownership from complete write sets, including transitive caller changes. Schedule shared telemetry preparation first, serialize admin manifest cleanup, and remove R11b’s alternative ownership of R11a’s file.

10. **Major — The plan applies a stricter owner rule than Option C authorizes.**

    **Evidence:** `S/COMMON.md:44` states only the base-package rule, omitting the permitted React dependency on `@jini-ai/ui-kit/react`.

    The census’s `bad` filter at `S/scripts/census.mjs:109` likewise excludes only core/protocol. It labels **23 existing `ui-kit/react` sites** as work.

    Consequently, `S/R3-user-management.md:41` replaces permitted imports, including `J/packages/user-management/src/admin/react/pages/UsersPage.tsx:2`, with new kit machinery. R3a’s inventory consists of those 23 sites plus the separate root `needs` import.

    **Fix:** Encode Option C explicitly in the census, guards, COMMON, and sheets. Keep permitted React primitive imports. Re-scope the kit to forbidden domain dependencies. On the current raw inventory, subtracting those 23 sites reduces the claimed 176 actionable sites to **153**.

11. **Major — MCP’s proposed permission test has no corresponding injection seam.**

    **Evidence:** `S/R11-platform-consumers.md:119` removes `defaultMcpSecretFilesystem` and requires `filesystem`, while `:120` requires MCP itself to continue passing mode/ownership options to a writer.

    The real `McpConfigFilesystemPort` has only:

    ```ts
    writeSecretText({ filePath, contents }): Promise<void>
    ```

    at `J/packages/mcp/src/core/config.ts:62`. The security options currently exist inside the default implementation at `:94`; `doWrite` passes no options at `:280`.

    Removing that implementation and injecting the existing interface moves enforcement to the host—the outcome the sheet expressly prohibits. T2 cannot observe the claimed writer options through the specified interface.

    **Fix:** Specify the revised writer dependency and MCP-owned secret-writing operation. Retain tests of actual creation-time permissions alongside argument-recording tests.

12. **Major — C9c’s acceptance tests depend on the later migrations it is supposed to precede.**

    **Evidence:** `S/R3-user-management.md:36` requires C9c to prove that existing pages throw without the new provider and render every kit slot with the fake. But C9c’s declared files at `:14` are new kit/test files plus the manifest. Existing pages do not consume the kit yet; R3a/R3b perform that work later.

    For example, `J/packages/user-management/src/admin/react/pages/UsersPage.tsx:2` still directly imports its components, and `src/react/users/Users.tsx:3` imports admin components.

    Adding a provider cannot redirect those imports. The proposed C9c commit cannot pass its own page-level acceptance tests.

    **Fix:** Test the kit contract with a dedicated consumer in C9c. Attach page/slot coverage to each migration commit, with real loading and error states that exercise conditional slots.

13. **Major — R6/R9 omits the real host caller of the new retention dependency.**

    **Evidence:** `S/R6-R9-storage-consumers.md:26` adds required `columns: ColumnCatalogPort`, but neither defines that contract nor schedules a Tovu pair for this step (`:49`).

    Tovu imports the factory under an alias at `T/apps/website/src/features/forms/repo.sqlite.ts:6` and invokes it without the new dependency at `:34`.

    The sheet permits only its new composition file; it does not assign this existing adapter update. Its new wiring example contains only commerce migration wiring.

    **Fix:** Define the typed column-catalog contract, preserve the SQL handle type, and include `repo.sqlite.ts` and its tests in the same cross-repository pair.

14. **Major — “Use the daemon designs as they are” ignores known blocking discoveries on the prerequisite branch.**

    **Evidence:** `S/INDEX.md:55`–`:60` directs execution from the existing daemon designs. However, `DP/cloud-results/daemon-prereqs.md:238` records that route conversion stopped because its premises failed.

    Concrete differences are recorded at `:279`–`:289`: path matching, OPTIONS, Content-Length, ETag, and conditional 304 behavior. Decisions remain required at `:291`, and characterization work remains outstanding at `:310`.

    C6 is also explicitly partial (`C6/cloud-results/c6.md:6`); the HTTP sub-ports are missing at `:67`.

    **Fix:** Reconcile the sheets with both execution reports. Distinguish completed prerequisites from held decisions and missing contracts, and schedule those obligations before the affected conversions.

15. **Major — COMMON’s claimed checks do not enforce several named STOP conditions or the owner’s limits.**

    **Evidence:** `S/INDEX.md:115` claims a command for every failure class. In COMMON:

    - `:19` checks only single-line re-exports directly naming another package; relative shells and forwarding functions evade it.
    - `:20`–`:22` provide no executable check for lazy imports, uninjected hooks, or cross-package mocks.
    - Comment-line counts at `:23` cannot establish preservation of particular why-comments.
    - `:25` relies on size ratchets for a 50-line function limit, but `J/scripts/check-size.mjs:15` gates at **80**, with 50 only a warning configuration at `:39`.
    - The proposed test-edge counting excludes core at `S/scripts/census.mjs:122`, while `J/packages/sidecar/src/supervision/__tests__/supervisor-node.test.ts:11` mocks another package’s core implementation.

    **Fix:** Specify exact existing commands and their coverage. Add explicit review obligations where tooling does not enforce a rule, and measure the owner’s 50-line limit independently of the 80-line ratchet.

16. **Minor — Inventory and run-count claims contain reproducible errors.**

    **Evidence:**

    - `S/R1-R2-admin.md:73` claims **84 importers** of `createMemoryCommentsApi`. Git search finds four importing source files: `comments-api.conformance.test.ts`, `memory.unit.test.ts`, `comments-states.unit.test.tsx`, and `support.ts`. Several call directly.
    - `S/R12-providers.md:50` schedules deletion of optional peers from provider-plugins. Its actual manifest has those packages in `devDependencies`, not optional peers (`J/packages/provider-plugins/package.json:95`).
    - `S/INDEX.md:53` says **24 runs**; its listed sub-sheets total **27** before conditional splits.
    - R11b’s “split if more than 12 call sites” condition is already exceeded by the existing MCP config tests alone.

    **Fix:** Correct the inventories and schedule known splits before dispatch. The one-Sonnet-run claim is not established; actual context/runtime consumption was not verifiable in this read-only review.

### Sampling record

I replayed the census logic against the merged blobs named in GUARDS and compared the corresponding Git searches. These ten files supplied **26 rows**, exceeding the requested 15-row sample:

| Sample file | Non-base sites |
|---|---:|
| admin `forms/field-settings.ts` | 1 |
| admin `forms/html-rules.ts` | 1 |
| agent-runtime `model-discovery-adapters.ts` | 4 |
| commerce `payments/ledger/migrations/index.ts` | 2 |
| cms-forms `ports.ts` | 1 |
| mcp `federation/adapter.http.ts` | 1 |
| provider-plugins `charts-echarts/mount.ts` | 1 |
| sqlite `index.ts` | 11 |
| infra `db/driver/index.ts` | 2 |
| sidecar `supervision/supervisor-node.ts` | 2 |

No literal-site counting mismatch emerged in that sample. This does not verify whole-repository completeness, alias resolution, or executable strings inside subprocess tests. The Option C classification error is finding 10.

The ten parallel-sheet pair checks were:

| Pair | Result |
|---|---|
| G-TESTS setup / R6-R9 | No overlap observed in sampled core files |
| R6-R9 / R12a | Migration and provider-contract files differ |
| R10a / R12d | Sampled source/payload files differ |
| R13a / R13c | Sampled freeze-test/index files differ |
| C9c / R13c | Sampled package files differ |
| R11a / R11b | Wiring-file ownership conflict |
| R11a / R11c | Sampled implementation files differ |
| R1c / R2b | Shared admin manifest |
| R2a / R2b | Sampled implementation files differ |
| R12b / R12c | Shared reporter change requires PostHog caller updates |

## Recurring mistake classes

- **Separate extraction from compliance classification:** retain raw import counts, but apply the approved exceptions before generating cleanup work.
- **Treat separately delivered browser assets as separate composition boundaries:** server-side function bindings cannot cross an asset/configuration boundary without an explicit browser-side injection mechanism.
